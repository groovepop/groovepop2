const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.http('create-checkout', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'create-checkout',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: 'Stripe key not configured' }, request);
    }

    try {
      const body = await request.json();
      const {
        productName,
        productPrice,
        shippingName,
        shippingRate,
        variantId,
        imageUrl,
        recipient
      } = body;

      if (!productName || !productPrice || !shippingRate || !variantId || !imageUrl || !recipient) {
        return jsonResponse(400, { error: 'Missing required fields' }, request);
      }

      // Convert CAD dollars to cents for Stripe
      const productCents  = Math.round(productPrice * 100);
      const shippingCents = Math.round(shippingRate * 100);

      // Determine frontend origin dynamically to allow local dev and production custom domains
      const origin = request.headers.get('origin') || request.headers.get('referer');
      const baseUrl = origin ? origin.replace(/\/$/, '') : 'https://groovepop.ca';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        currency: 'cad',
        line_items: [
          {
            price_data: {
              currency: 'cad',
              product_data: {
                name: productName,
                description: 'GROOVE POP — Printed art from your generated image',
                images: [imageUrl]
              },
              unit_amount: productCents
            },
            quantity: 1
          },
          {
            price_data: {
              currency: 'cad',
              product_data: {
                name: `Shipping — ${shippingName}`
              },
              unit_amount: shippingCents
            },
            quantity: 1
          }
        ],
        customer_email: recipient.email,
        metadata: {
          variantId:    String(variantId),
          imageUrl:     imageUrl,
          productName:  productName,
          recipient:    JSON.stringify(recipient),
          shippingId:   body.shippingId || '',
          shippingName: shippingName
        },
        mode: 'payment',
        success_url: `${baseUrl}/app.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/app.html?print=cancelled`
      });

      return jsonResponse(200, { url: session.url, sessionId: session.id }, request);

    } catch (err) {
      context.error('create-checkout error:', err);
      return jsonResponse(500, { error: err.message || 'Failed to create checkout session' }, request);
    }
  }
});
