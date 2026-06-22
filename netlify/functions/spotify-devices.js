// netlify/functions/spotify-devices.js
//
// Lists Spotify Connect devices currently visible to the GROOVE POP account
// (e.g. a phone or speaker with Spotify open at the venue). The admin panel
// uses this to let the couple/host pick which device the backing playlist
// and queued requests should play through.

const { getDb, getValidAccessToken } = require('./lib/spotify-token');

exports.handler = async () => {
  let db;
  try {
    db = getDb();
  } catch (e) {
    console.error('getDb failed:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }

  try {
    const accessToken = await getValidAccessToken(db);

    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error || data }) };
    }

    const devices = (data.devices || []).map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      isActive: d.is_active,
      volumePercent: d.volume_percent
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices })
    };
  } catch (err) {
    console.error('spotify-devices error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
