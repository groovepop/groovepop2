// netlify/functions/get-gallery.js
// Fetches all images for a user from Cloudinary using tag search.
// Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//
// Expected POST body: { userId: "abc123" }

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

  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId' }) };
  }

  // Sanitise userId to match tag format used at upload time
  const userTag = `user_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Cloudinary Search API — finds all images with this user's tag
  const searchPayload = {
    expression: `tags=${userTag} AND folder=groovepop`,
    sort_by: [{ created_at: 'desc' }],
    max_results: 100,
    with_field: ['context', 'tags']
  };

  const crypto    = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);

  // Search API uses basic auth (api_key:api_secret)
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(searchPayload)
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
  }

  const data = await res.json();

  if (!res.ok) {
    return {
      statusCode: res.status,
      body: JSON.stringify({ error: data.error?.message || 'Gallery fetch failed' })
    };
  }

  // Map to lightweight gallery items
  const images = (data.resources || []).map(r => {
    const ctx = r.context?.custom || {};
    return {
      publicId:   r.public_id,
      url:        r.secure_url,
      // Cloudinary thumbnail — 400px wide, auto-cropped
      thumbUrl:   r.secure_url.replace('/upload/', '/upload/w_400,c_fill,q_auto,f_auto/'),
      width:      r.width,
      height:     r.height,
      createdAt:  r.created_at,
      styleName:  ctx.styleName  || '',
      styleKey:   ctx.styleKey   || '',
      subtheme:   ctx.subtheme   || '',
      descriptor: ctx.descriptor || ''
    };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  };
};
