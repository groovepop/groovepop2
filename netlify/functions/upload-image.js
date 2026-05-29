// netlify/functions/upload-image.js
// Receives base64 JPEG from client, uploads to Cloudinary.
// Metadata stored in both tags (reliable, searchable) and context (rich data).
// Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

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
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const {
    base64,
    mimeType = 'image/jpeg',
    userId,
    styleKey,
    styleName,
    subtheme,
    variantKey,
    caption
  } = body;

  if (!base64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing base64 field' }) };
  }

  const crypto    = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder    = 'groovepop';

  // ── TAGS — primary metadata store, always reliable on all Cloudinary plans ──
  const tags = ['groovepop'];
  if (userId)     tags.push(`user_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`);
  if (styleKey)   tags.push(`style_${styleKey.replace(/[^a-zA-Z0-9_]/g, '_')}`);
  if (subtheme)   tags.push(`subtheme_${subtheme.replace(/[^a-zA-Z0-9]/g, '_')}`);
  if (variantKey) tags.push(`variant_${variantKey.replace(/[^a-zA-Z0-9_]/g, '_')}`);
  const tagsStr = tags.join(',');

  // ── CONTEXT — rich metadata including caption ──
  const contextParts = [];
  if (userId)     contextParts.push(`userId=${userId.replace(/[|=]/g, '_')}`);
  if (styleKey)   contextParts.push(`styleKey=${styleKey.replace(/[|=]/g, '_')}`);
  if (styleName)  contextParts.push(`styleName=${styleName.replace(/[|=]/g, '_')}`);
  if (subtheme)   contextParts.push(`subtheme=${subtheme.replace(/[|=]/g, '_')}`);
  if (variantKey) contextParts.push(`variantKey=${variantKey.replace(/[|=]/g, '_')}`);
  if (caption)    contextParts.push(`caption=${caption.replace(/[|=\n\r]/g, ' ').trim().slice(0, 200)}`);
  contextParts.push(`createdAt=${timestamp}`);
  const context = contextParts.join('|');

  // ── SIGNATURE — all signed params alphabetically ──
  const sigParams = [
    `context=${context}`,
    `folder=${folder}`,
    `tags=${tagsStr}`,
    `timestamp=${timestamp}`
  ].sort().join('&');
  const signature = crypto.createHash('sha256').update(sigParams + apiSecret).digest('hex');

  const dataUri = `data:${mimeType};base64,${base64}`;
  const formData = new URLSearchParams();
  formData.append('file',      dataUri);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key',   apiKey);
  formData.append('signature', signature);
  formData.append('folder',    folder);
  formData.append('context',   context);
  formData.append('tags',      tagsStr);

  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formData.toString()
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
  }

  const result = await res.json();

  if (!res.ok) {
    return {
      statusCode: res.status,
      body: JSON.stringify({ error: result.error?.message || 'Cloudinary upload failed' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:      result.secure_url,
      publicId: result.public_id,
      width:    result.width,
      height:   result.height
    })
  };
};
