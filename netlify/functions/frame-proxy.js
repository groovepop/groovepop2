const https = require('https');

exports.handler = async function(event) {
  const urlParam = event.queryStringParameters.url;
  if (!urlParam) {
    return { 
      statusCode: 400, 
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing url parameter' }) 
    };
  }

  try {
    return new Promise((resolve) => {
      https.get(urlParam, (res) => {
        // Redirect follow if necessary
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (redirectRes) => {
            handleResponse(redirectRes, resolve);
          }).on('error', (err) => {
            resolve({ 
              statusCode: 500, 
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: err.message }) 
            });
          });
        } else {
          handleResponse(res, resolve);
        }
      }).on('error', (err) => {
        resolve({ 
          statusCode: 500, 
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: err.message }) 
        });
      });
    });
  } catch (err) {
    return { 
      statusCode: 500, 
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }) 
    };
  }
};

function handleResponse(res, resolve) {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    resolve({
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': res.headers['content-type'] || 'image/png',
        'Cache-Control': 'public, max-age=86400'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    });
  });
}
