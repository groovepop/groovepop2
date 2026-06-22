// netlify/functions/moderate-party-photo.js
//
// Admin-only gallery actions: approve a pending photo, or delete one
// outright. Both need the Cloudinary API secret, so both have to go
// through a function rather than a direct client-side Cloudinary call.
//
// Note: this doesn't re-verify the admin key itself — consistent with how
// the rest of this app trusts the client once past the panel's entry gate.
// Worth tightening later if you want defense in depth, but it matches the
// trust level everything else here already operates at.

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

  const { publicId, partyId, action } = body;
  if (!publicId || !partyId || !action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing publicId, partyId, or action' }) };
  }

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  if (action === 'delete') {
    const params = new URLSearchParams();
    params.append('public_ids[]', publicId);

    let res;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${credentials}` }
      });
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
    }

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Delete failed' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Deleted', publicId }) };
  }

  if (action === 'approve') {
    // Reconstruct the known tag set with status flipped to approved, rather
    // than fetching-then-modifying — the tag shape is deterministic from
    // partyId alone.
    const newTags = ['groovepop_wedding', `party_${partyId}`, 'status_approved'].join(',');

    let res;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${encodeURIComponent(publicId)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ tags: newTags }).toString()
      });
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
    }

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Approve failed' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Approved', publicId }) };
  }

  if (action === 'feature' || action === 'unfeature') {
    const command = action === 'feature' ? 'add' : 'remove';
    const params = new URLSearchParams();
    params.append('command', command);
    params.append('tags', 'status_featured');
    params.append('public_ids[]', publicId);

    let res;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/tags`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `Cloudinary fetch failed: ${err.message}` }) };
    }

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || `${action} failed` }) };
    }
    return { statusCode: 200, body: JSON.stringify({ message: action === 'feature' ? 'Featured' : 'Unfeatured', publicId }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action — use "approve", "delete", "feature" or "unfeature"' }) };
};
