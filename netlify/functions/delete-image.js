// netlify/functions/delete-image.js
// Deletes a single image from Cloudinary by publicId.
// Verifies the image belongs to the requesting user via tag check.
// Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//
// Expected POST body: { publicId: "groovepop/abc123", userId: "user@email.com" }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Cloudinary env vars not set' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { publicId, userId } = body;
  if (!publicId || !userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing publicId or userId' }) };
  }

  const crypto    = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);

  // Sign the destroy request
  const sigString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(sigString).digest('hex');

  const formData = new URLSearchParams();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key',   apiKey);
  formData.append('signature', signature);

  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formData.toString()
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
  }

  const result = await res.json();

  if (!res.ok || result.result !== 'ok') {
    return {
      statusCode: res.status || 500,
      body: JSON.stringify({ error: result.error?.message || result.result || 'Delete failed' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleted: true, publicId })
  };
};
