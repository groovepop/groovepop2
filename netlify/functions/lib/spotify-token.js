// netlify/functions/lib/spotify-token.js
//
// Shared by every Spotify-related function that needs the GROOVE POP
// account's access token or a Firestore handle. Kept in one place so the
// refresh logic — the trickiest part to get right — only has to work once.

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;

  const apps = admin.getApps();
  if (!apps || apps.length === 0) {
    let serviceAccount;

    // Check for individual variables first (much smaller environment footprint)
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines if they are present in the environment variable
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else {
      // Fallback to the original base64 or raw JSON variables
      const rawOrB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!rawOrB64) {
        throw new Error('Missing Firebase credentials. Please configure FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID, or configure FIREBASE_SERVICE_ACCOUNT_B64.');
      }

      try {
        const trimmed = rawOrB64.trim();
        const decoded = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      } catch (e) {
        throw new Error('Firebase credentials could not be parsed: ' + e.message);
      }
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  dbInstance = getFirestore();
  return dbInstance;
}

// Returns a valid GROOVE POP access token, transparently refreshing it via
// the stored refresh_token if the cached one has expired.
async function getValidAccessToken(db) {
  const tokenDoc = await db.collection('system').doc('spotifyToken').get();
  if (!tokenDoc.exists) {
    throw new Error('GROOVE POP Spotify account is not connected yet. Run spotify-authorize first.');
  }
  const data = tokenDoc.data();

  // 60s safety buffer before expiry
  if (Date.now() < data.expiresAt - 60000) {
    return data.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refreshToken
    })
  });

  const refreshed = await res.json();
  if (!res.ok) {
    throw new Error('Failed to refresh Spotify token: ' + (refreshed.error_description || refreshed.error));
  }

  const newExpiresAt = Date.now() + (refreshed.expires_in * 1000);
  // Spotify doesn't always return a new refresh_token on refresh — keep the
  // old one if it doesn't.
  const newRefreshToken = refreshed.refresh_token || data.refreshToken;

  await db.collection('system').doc('spotifyToken').set({
    accessToken: refreshed.access_token,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt,
    scope: refreshed.scope || data.scope,
    connectedAt: data.connectedAt
  }, { merge: true });

  return refreshed.access_token;
}

module.exports = { getDb, getValidAccessToken };
