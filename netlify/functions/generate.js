const https = require('https');

function httpsRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'POST',
      headers: options.headers
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        text: () => Promise.resolve(Buffer.concat(chunks).toString()),
        json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString()))
      }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { prompt, base64Image, mimeType, size, quality } = JSON.parse(event.body);

    if (!prompt || !base64Image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt or image' }) };
    }

    const apiKey = process.env.AZURE_OPENAI_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const endpoint   = process.env.AZURE_OPENAI_ENDPOINT || 'https://green-mos1tune-eastus2.openai.azure.com';
    const deployment = process.env.AZURE_IMAGE_DEPLOYMENT || 'gpt-image-2';
    const url = `${endpoint}/openai/deployments/${deployment}/images/edits?api-version=2025-04-01-preview`;

    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const ext = (mimeType || 'image/jpeg').split('/')[1];

    function part(name, value) {
      return Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`),
        Buffer.from(String(value)),
        Buffer.from('\r\n')
      ]);
    }

    function filePart(name, filename, mime, data) {
      return Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
        data,
        Buffer.from('\r\n')
      ]);
    }

    const body = Buffer.concat([
      filePart('image[]', `photo.${ext}`, mimeType || 'image/jpeg', imageBuffer),
      part('prompt', prompt),
      part('n', '1'),
      part('size', size || '1024x1024'),
      part('quality', quality || 'medium'),
      part('output_format', 'jpeg'),
      part('output_compression', '80'),
      Buffer.from(`--${boundary}--\r\n`)
    ]);

    const response = await httpsRequest(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, body);

    if (response.status !== 200) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Azure error ${response.status}: ${errText}` })
      };
    }

    const data = await response.json();
    const b64  = data.data[0].b64_json;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: `data:image/jpeg;base64,${b64}` })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal error' })
    };
  }
};
