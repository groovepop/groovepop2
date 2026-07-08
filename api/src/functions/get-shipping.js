const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');

app.http('get-shipping', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'get-shipping',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const apiKey  = process.env.PRINTFUL_API_KEY;
    const storeId = process.env.PRINTFUL_STORE_ID;

    if (!apiKey) {
      return jsonResponse(500, { error: 'Printful API key not configured' }, request);
    }

    try {
      const body = await request.json();
      const { variantId, recipient } = body;

      if (!variantId || !recipient) {
        return jsonResponse(400, { error: 'Missing variantId or recipient' }, request);
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

      const res = await fetch('https://api.printful.com/shipping/rates', {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || data.code !== 200) {
        return jsonResponse(res.status, {
          error: data.error?.message || data.result || 'Failed to get shipping rates'
        }, request);
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
        return jsonResponse(400, { error: 'No shipping rates available for this address' }, request);
      }

      return jsonResponse(200, { rates }, request);

    } catch (err) {
      context.error('get-shipping error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  }
});
