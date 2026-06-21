// netlify/functions/spotify-callback.js
//
// Spotify redirects here after the GROOVE POP account approves access.
// Exchanges the auth code for tokens and stores them server-side only,
// in system/spotifyToken — never readable by client code or guests.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

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
