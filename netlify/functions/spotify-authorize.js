// netlify/functions/spotify-authorize.js
//
// One-time setup endpoint. Visit this URL once, logged into the dedicated
// GROOVE POP Spotify Premium account, to grant playback control.
// https://groovepop.netlify.app/.netlify/functions/spotify-authorize

exports.handler = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI env vars.'
    };
  }

  const scope = [
    'user-modify-playback-state',
    'user-read-playback-state',
    'user-read-currently-playing'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scope,
    show_dialog: 'true'
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://accounts.spotify.com/authorize?${params.toString()}`
    },
    body: ''
  };
};
