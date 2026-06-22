// netlify/functions/upload-party-photo.js
//
// Fresh upload function for GROOVE POP Weddings — separate from the
// original upload-image.js, which is scoped to one user's own photos for
// print ordering. This one handles many guests uploading into ONE shared
// event gallery, tagged by partyId, with optional moderation.
//
// The moderationEnabled flag is passed by the client (the booth template
// already has the party config loaded, including this setting) rather than
// looked up server-side — consistent with how the rest of this app trusts
// the client (e.g. DJ requests write straight to Firestore). Worst case of
// a tampered flag is a photo appearing live a little early; an admin can
// still delete it after the fact.

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
    partyId,
    moderationEnabled = false,
    guestName,
    styleKey,
    styleName,
    caption
  } = body;

  if (!base64)  return { statusCode: 400, body: JSON.stringify({ error: 'Missing base64 field' }) };
  if (!partyId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing partyId' }) };

  const crypto    = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder    = `groovepop-weddings/${partyId}`;
  const statusTag = moderationEnabled ? 'status_pending' : 'status_approved';

  // ── TAGS — primary metadata store ──
  const tags = ['groovepop_wedding', `party_${partyId}`, statusTag];
  if (styleKey) tags.push(`style_${styleKey.replace(/[^a-zA-Z0-9_]/g, '_')}`);
  const tagsStr = tags.join(',');

  // ── CONTEXT — rich display metadata ──
  const contextParts = [`partyId=${partyId}`, `status=${moderationEnabled ? 'pending' : 'approved'}`];
  if (guestName)  contextParts.push(`guestName=${guestName.replace(/[|=]/g, '_').slice(0, 60)}`);
  if (styleKey)   contextParts.push(`styleKey=${styleKey.replace(/[|=]/g, '_')}`);
  if (styleName)  contextParts.push(`styleName=${styleName.replace(/[|=]/g, '_')}`);
  if (caption)    contextParts.push(`caption=${caption.replace(/[|=\n\r]/g, ' ').trim().slice(0, 200)}`);
  contextParts.push(`createdAt=${timestamp}`);
  const context = contextParts.join('|');

  // ── SIGNATURE — same scheme as the original upload-image.js ──
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
    return { statusCode: res.status, body: JSON.stringify({ error: result.error?.message || 'Cloudinary upload failed' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:      result.secure_url,
      publicId: result.public_id,
      width:    result.width,
      height:   result.height,
      status:   moderationEnabled ? 'pending' : 'approved'
    })
  };
};
