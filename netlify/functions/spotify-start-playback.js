// netlify/functions/spotify-start-playback.js
//
// One-shot "start the music" action — call this once at the top of the
// night (from the admin panel) to begin playing the wedding's backing
// playlist (couple-provided override, or the GROOVE POP default) on a
// chosen device. After this, spotify-queue-next just interleaves guest
// requests into whatever's already playing.

const { getDb, getValidAccessToken } = require('./lib/spotify-token');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { partyId, deviceId } = body;
  if (!partyId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing partyId' }) };
  }
  if (!deviceId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing deviceId — call spotify-devices first to pick one.' }) };
  }

  let db;
  try {
    db = getDb();
  } catch (e) {
    console.error('getDb failed:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }

  try {
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Party not found' }) };
    }
    const playlistId = partyDoc.data().spotifyPlaylistId;
    if (!playlistId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No spotifyPlaylistId set on this party config.' }) };
    }

    const accessToken = await getValidAccessToken(db);

    const playRes = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlistId}`
      })
    });

    if (!playRes.ok && playRes.status !== 204) {
      const errBody = await playRes.text();
      console.error('Spotify play error:', playRes.status, errBody);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to start playback', detail: errBody }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Playback started', playlistId, deviceId }) };
  } catch (err) {
    console.error('spotify-start-playback error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
