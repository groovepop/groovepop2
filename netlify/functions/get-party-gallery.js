// netlify/functions/get-party-gallery.js
//
// Fetches photos for ONE wedding event, filtered by partyId tag.
// `status` controls what comes back:
//   'approved' (default) — what guests/the public gallery should see
//   'pending'             — the moderation queue, admin only
//   'all'                 — everything, admin only (status flag included per item)

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

  const { partyId, status = 'approved', sortOrder = 'desc' } = body;
  if (!partyId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing partyId' }) };
  }

  let expression = `tags=party_${partyId}`;
  if (status === 'approved') expression += ' AND tags=status_approved';
  if (status === 'pending')  expression += ' AND tags=status_pending';
  // status === 'all' — no extra filter, everything for this party comes back

  const searchPayload = {
    expression,
    sort_by: [{ created_at: sortOrder === 'asc' ? 'asc' : 'desc' }],
    max_results: 200,
    with_field: ['context', 'tags']
  };

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
    return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'Gallery fetch failed' }) };
  }

  const images = (data.resources || []).map(r => {
    const ctx = r.context?.custom || {};
    const tags = r.tags || [];
    return {
      publicId:  r.public_id,
      url:       r.secure_url,
      thumbUrl:  r.secure_url.replace('/upload/', '/upload/w_400,c_fill,q_auto,f_auto/'),
      width:     r.width,
      height:    r.height,
      createdAt: r.created_at,
      status:    tags.includes('status_pending') ? 'pending' : 'approved',
      guestName: ctx.guestName || '',
      styleName: ctx.styleName || '',
      caption:   ctx.caption   || ''
    };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  };
};
