// netlify/functions/confirm-order.js
// Called after Stripe redirects back with session_id.
// 1. Verifies payment succeeded with Stripe
// 2. Creates and confirms Printful order using metadata from the session
//
// Expected POST body:
// { sessionId: "cs_live_xxx" }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { sessionId } = body;
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing sessionId' }) };
  }

  // ── STEP 1: Verify payment with Stripe ──
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid session: ${err.message}` }) };
  }

  if (session.payment_status !== 'paid') {
    return { statusCode: 402, body: JSON.stringify({ error: 'Payment not completed' }) };
  }

  // Extract order data from session metadata
  const { variantId, imageUrl, productName, recipient: recipientJson, shippingId, shippingName } = session.metadata;

  let recipient;
  try {
    recipient = JSON.parse(recipientJson);
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Invalid recipient data in session' }) };
  }

  // ── STEP 2: Create Printful order (v1 API, auto-confirm) ──
  const apiKey  = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Printful API key not configured' }) };
  }

  const printfulHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(storeId ? { 'X-PF-Store-Id': storeId } : {})
  };

  // Build Printful v1 order payload
  const orderPayload = {
    recipient: {
      name:         recipient.name,
      email:        recipient.email,
      address1:     recipient.address1,
      address2:     recipient.address2 || '',
      city:         recipient.city,
      state_code:   recipient.state_code,
      country_code: recipient.country_code,
      zip:          recipient.zip
    },
    items: [
      {
        variant_id: parseInt(variantId),
        quantity:   1,
        files: [
          {
            url: imageUrl
          }
        ]
      }
    ],
    // confirm: true submits for production immediately (charges your Printful wallet)
    confirm: true,
    retail_costs: {
      currency: 'CAD'
    }
  };

  // Add shipping method if we have it
  if (shippingId) {
    orderPayload.shipping = shippingId;
  }

  let printfulRes;
  try {
    printfulRes = await fetch('https://api.printful.com/orders', {
      method:  'POST',
      headers: printfulHeaders,
      body:    JSON.stringify(orderPayload)
    });
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Printful request failed: ${err.message}` }) };
  }

  const printfulData = await printfulRes.json();

  if (!printfulRes.ok || printfulData.code !== 200) {
    console.error('Printful order failed:', JSON.stringify(printfulData));
    return {
      statusCode: printfulRes.status,
      body: JSON.stringify({
        error: printfulData.error?.message || printfulData.result || 'Printful order creation failed',
        // Payment succeeded — log this so you can manually create the order if needed
        note: 'Payment was collected successfully. Contact support with your session ID.',
        sessionId
      })
    };
  }

  const order = printfulData.result;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId:     order.id,
      status:      order.status,
      productName,
      recipient:   order.recipient
    })
  };
};
