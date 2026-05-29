// netlify/functions/create-order.js
// Printful API v2 — creates a draft order using image URL directly in the order item layers.
// No separate file registration needed in v2.
//
// Required env vars: PRINTFUL_API_KEY, PRINTFUL_STORE_ID
//
// Expected POST body:
// {
//   imageUrl:   "https://res.cloudinary.com/...",
//   variantId:  1349,
//   quantity:   1,
//   recipient: {
//     name, email, address1, address2 (optional),
//     city, state_code, country_code, zip
//   }
// }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey  = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!apiKey || !storeId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Printful env vars not set' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { imageUrl, variantId, quantity = 1, recipient } = body;

  if (!imageUrl || !variantId || !recipient) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: imageUrl, variantId, recipient' })
    };
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-PF-Store-Id': storeId
  };

  // Printful v2 order — image URL goes directly into layers, no /files pre-registration needed
  const orderPayload = {
    recipient,
    items: [
      {
        catalog_variant_id: variantId,
        source: 'catalog',
        quantity,
        placements: [
          {
            placement: 'default',
            technique: 'digital',
            layers: [
              {
                type: 'file',
                url: imageUrl
              }
            ]
          }
        ]
      }
    ]
  };

  let orderRes;
  try {
    orderRes = await fetch('https://api.printful.com/v2/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(orderPayload)
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Printful fetch failed: ${err.message}` }) };
  }

  const orderData = await orderRes.json();

  if (!orderRes.ok) {
    return {
      statusCode: orderRes.status,
      body: JSON.stringify({
        error: orderData.detail || orderData.title || 'Printful order creation failed',
        raw: orderData
      })
    };
  }

  const order = orderData.data;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId:   order.id,
      status:    order.status,       // 'draft' — won't charge or produce until confirmed
      costs:     order.costs,
      recipient: order.recipient
    })
  };
};
