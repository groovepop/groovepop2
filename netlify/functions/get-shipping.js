// netlify/functions/get-shipping.js
// Calls Printful shipping rates API with recipient address + variant ID.
// Returns the cheapest available shipping rate in CAD.
//
// Expected POST body:
// {
//   variantId: 1349,
//   recipient: { name, address1, city, state_code, country_code, zip }
// }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey  = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Printful API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { variantId, recipient } = body;

  if (!variantId || !recipient) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing variantId or recipient' }) };
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(storeId ? { 'X-PF-Store-Id': storeId } : {})
  };

  const payload = {
    recipient: {
      address1:     recipient.address1,
      city:         recipient.city,
      state_code:   recipient.state_code,
      country_code: recipient.country_code,
      zip:          recipient.zip
    },
    items: [
      { variant_id: variantId, quantity: 1 }
    ],
    currency: 'CAD'
  };

  let res;
  try {
    res = await fetch('https://api.printful.com/shipping/rates', {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload)
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Printful fetch failed: ${err.message}` }) };
  }

  const data = await res.json();

  if (!res.ok || data.code !== 200) {
    return {
      statusCode: res.status,
      body: JSON.stringify({
        error: data.error?.message || data.result || 'Failed to get shipping rates'
      })
    };
  }

  // Return all rates, sorted cheapest first
  const rates = (data.result || []).map(r => ({
    id:    r.id,
    name:  r.name,
    rate:  parseFloat(r.rate),
    minDeliveryDays: r.minDeliveryDays,
    maxDeliveryDays: r.maxDeliveryDays
  })).sort((a, b) => a.rate - b.rate);

  if (!rates.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No shipping rates available for this address' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rates })
  };
};
