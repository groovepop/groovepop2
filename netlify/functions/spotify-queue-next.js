// netlify/functions/spotify-queue-next.js
//
// The heart of Auto DJ. Call this periodically (e.g. polled every ~20s from
// the admin panel while Auto DJ mode is on) for a given partyId. It does ONE
// thing: find the top-voted pending request and push it to the GROOVE POP
// account's Spotify queue. No "nothing to play" fallback logic needed — the
// backing playlist (started separately via spotify-start-playback) keeps
// playing on its own, and Spotify interleaves queued tracks into it naturally.

const { getDb, getValidAccessToken } = require('./lib/spotify-token');

exports.handler = async (event) => {
  const partyId = event.queryStringParameters && event.queryStringParameters.partyId;
  if (!partyId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing partyId' }) };
  }

  let db;
  try {
    db = getDb();
  } catch (e) {
    console.error('getDb failed:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }

  try {
    const accessToken = await getValidAccessToken(db);

    const requestsRef = db.collection('parties').doc(partyId).collection('requests');
    const snapshot = await requestsRef
      .where('status', '==', 'pending')
      .orderBy('votes', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No pending requests.' }) };
    }

    const topDoc = snapshot.docs[0];
    const topRequest = topDoc.data();

    if (!topRequest.trackUri) {
      console.error('Request missing trackUri:', topDoc.id, topRequest);
      await topDoc.ref.update({ status: 'rejected', rejectedReason: 'missing trackUri' });
      return { statusCode: 500, body: JSON.stringify({ error: 'Top request had no trackUri, marked rejected.' }) };
    }

    const queueRes = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(topRequest.trackUri)}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!queueRes.ok) {
      const errBody = await queueRes.text();
      console.error('Spotify queue error:', queueRes.status, errBody);

      // 404 here almost always means no active device — surface that plainly.
      if (queueRes.status === 404) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            error: 'No active Spotify device. Start playback on the GROOVE POP account first.'
          })
        };
      }

      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to queue track', detail: errBody }) };
    }

    await topDoc.ref.update({ status: 'queued', queuedAt: new Date().toISOString() });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Queued', track: topRequest.trackName, artist: topRequest.artist })
    };
  } catch (err) {
    console.error('queue-next error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
