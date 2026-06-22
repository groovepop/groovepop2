// netlify/functions/spotify-callback.js
//
// Spotify redirects here after the GROOVE POP account approves access.
// Exchanges the auth code for tokens and stores them server-side only,
// in system/spotifyToken — never readable by client code or guests.

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;

// Lazy, defensive init — runs inside the handler's try/catch instead of at
// module load time, so any failure here gets logged with its real message
// instead of crashing with an opaque "Cannot read properties of undefined" error.
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

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const authError = params.error;

  if (authError) {
    return { statusCode: 400, body: `Spotify authorization failed: ${authError}` };
  }
  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code.' };
  }

  let db;
  try {
    db = getDb();
  } catch (initErr) {
    console.error('Firebase Admin init failed:', initErr);
    return { statusCode: 500, body: `Firebase Admin init failed: ${initErr.message}` };
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Spotify token exchange failed:', tokenData);
      return {
        statusCode: 500,
        body: `Token exchange failed: ${tokenData.error_description || tokenData.error}`
      };
    }

    await db.collection('system').doc('spotifyToken').set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      scope: tokenData.scope,
      connectedAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h1>GROOVE POP DJ Connected</h1>
        <p>The Spotify account is linked. You can close this tab.</p>
      </body></html>`
    };
  } catch (err) {
    console.error('Callback error:', err);
    return { statusCode: 500, body: 'Something went wrong connecting Spotify.' };
  }
};
