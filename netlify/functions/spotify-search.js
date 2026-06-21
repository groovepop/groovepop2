// netlify/functions/spotify-search.js
//
// Proxies Spotify track search for the guest request UI. Uses the
// Client Credentials flow (app-only token) since search doesn't need
// the GROOVE POP account's user authorization — keeps the user token
// reserved for queue/playback actions only.

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAppToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
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
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || 'Failed to get Spotify app token');
  }

  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // refresh a minute early
  return cachedToken;
}

exports.handler = async (event) => {
  const query = event.queryStringParameters && event.queryStringParameters.q;
  if (!query || !query.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing search query' }) };
  }

  try {
    const token = await getAppToken();
    const params = new URLSearchParams({ q: query, type: 'track', limit: '10' });

    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error }) };
    }

    const tracks = (data.tracks?.items || []).map(t => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      albumArt: (t.album.images && (t.album.images[2] || t.album.images[0])?.url) || null,
      explicit: t.explicit
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks })
    };
  } catch (err) {
    console.error('Search error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Search failed' }) };
  }
};
