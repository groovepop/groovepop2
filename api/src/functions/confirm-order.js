const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.http('confirm-order', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'confirm-order',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: 'Stripe key not configured' }, request);
    }

    try {
      const body = await request.json();
      const { sessionId } = body;
      if (!sessionId) {
        return jsonResponse(400, { error: 'Missing sessionId' }, request);
      }

      // ── STEP 1: Verify payment with Stripe ──
      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (err) {
        return jsonResponse(400, { error: `Invalid session: ${err.message}` }, request);
      }

      if (session.payment_status !== 'paid') {
        return jsonResponse(402, { error: 'Payment not completed' }, request);
      }

      // Extract order data from session metadata
      const { variantId, imageUrl, productName, recipient: recipientJson, shippingId, shippingName } = session.metadata;

      let recipient;
      try {
        recipient = JSON.parse(recipientJson);
      } catch {
        return jsonResponse(500, { error: 'Invalid recipient data in session' }, request);
      }

      // ── STEP 2: Create Printful order (v1 API, auto-confirm) ──
      const apiKey  = process.env.PRINTFUL_API_KEY;
      const storeId = process.env.PRINTFUL_STORE_ID;

      if (!apiKey) {
        return jsonResponse(500, {
          error: 'Printful API key not configured',
          note: 'Payment was collected successfully. Contact support with your session ID.',
          sessionId
        }, request);
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
        confirm: true, // submits for production immediately (charges Printful wallet)
        retail_costs: {
          currency: 'CAD'
        }
      };

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
        return jsonResponse(502, {
          error: `Printful request failed: ${err.message}`,
          note: 'Payment was collected successfully. Contact support with your session ID.',
          sessionId
        }, request);
      }

      const printfulData = await printfulRes.json();

      if (!printfulRes.ok || printfulData.code !== 200) {
        context.error('Printful order failed:', JSON.stringify(printfulData));
        return jsonResponse(printfulRes.status || 500, {
          error: printfulData.error?.message || printfulData.result || 'Printful order creation failed',
          note: 'Payment was collected successfully. Contact support with your session ID.',
          sessionId
        }, request);
      }

      const order = printfulData.result;

      return jsonResponse(200, {
        orderId:     order.id,
        status:      order.status,
        productName,
        recipient:   order.recipient
      }, request);

    } catch (err) {
      context.error('confirm-order error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  }
});
