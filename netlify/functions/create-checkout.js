// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session with product price + shipping as line items.
// All amounts in CAD cents.
//
// Expected POST body:
// {
//   productName:  "Matte Poster · 12″ × 16″",
//   productPrice: 16,        (CAD dollars)
//   shippingName: "USPS First Class",
//   shippingRate: 5.50,      (CAD dollars)
//   variantId:    1349,
//   imageUrl:     "https://res.cloudinary.com/...",
//   recipient: { name, email, address1, address2, city, state_code, country_code, zip }
// }

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
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // Convert CAD dollars to cents for Stripe
  const productCents  = Math.round(productPrice * 100);
  const shippingCents = Math.round(shippingRate * 100);

  const baseUrl = process.env.URL || 'https://groovepop2.netlify.app';

  try {
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
      // Pre-fill customer details from address form
      customer_email: recipient.email,
      // Store order data in metadata so confirm-order.js can retrieve it
      metadata: {
        variantId:    String(variantId),
        imageUrl:     imageUrl,
        productName:  productName,
        // Recipient stored as JSON string (Stripe metadata values must be strings)
        recipient:    JSON.stringify(recipient),
        shippingId:   body.shippingId || '',
        shippingName: shippingName
      },
      mode: 'payment',
      success_url: `${baseUrl}/app.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/app.html?print=cancelled`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to create checkout session' })
    };
  }
};
