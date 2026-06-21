// netlify/functions/caption.js
// Two-call architecture:
// Call 1 — Classification: single vs multiple subjects
// Call 2 — Targeted caption instruction based on classification
//
// Required env vars: AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, AZURE_CAPTION_DEPLOYMENT

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.AZURE_OPENAI_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Azure API key not configured' }) };
  }

  try {
    const { base64, mimeType, fofMode } = JSON.parse(event.body);
    const isFof = !!fofMode;

    const endpoint   = process.env.AZURE_OPENAI_ENDPOINT || 'https://green-mos1tune-eastus2.openai.azure.com';
    const deployment = process.env.AZURE_CAPTION_DEPLOYMENT || 'groovepop-vision';
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2025-03-01-preview`;

    const imageContent = {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: 'auto'
      }
    };

    // ── CALL 1: CLASSIFICATION ──────────────────────────────────────────────
    const classifyRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: `Look at this image and respond with exactly one word — either SINGLE or MULTIPLE.

SINGLE: one clear primary subject. A person alone, an animal alone, one object. Background figures or crowds do not count.
MULTIPLE: two or more subjects of equal visual importance. A person with a pet, two people together, two animals together, a group where all members matter equally.

Respond with only the single word. Nothing else.`
            }
          ]
        }]
      })
    });

    if (!classifyRes.ok) {
      const err = await classifyRes.json();
      return {
        statusCode: classifyRes.status,
        body: JSON.stringify({ error: `Classification failed: ${JSON.stringify(err)}` })
      };
    }

    const classifyData = await classifyRes.json();
    const classifyRaw = classifyData.choices[0].message.content.trim().toUpperCase();
    const subjectCount = classifyRaw === 'MULTIPLE' ? 'multiple' : 'single';

    // ── CALL 2: TARGETED CAPTION ────────────────────────────────────────────
    const captionInstruction = isFof
      ? (subjectCount === 'multiple'
        ? `Write a brief poetic story (3-5 sentences) describing what is happening in this photo at Festival of Friends. All subjects are of equal importance — identify them clearly and give each one genuine presence throughout. Focus on: the energy and dynamic between them, how they connect or contrast with each other, the way they share the space, the setting and atmosphere that frames them, and the mood of the moment. It is Gage Park, Hamilton, ON, Toronto on August 1, 2026, State the date and write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of what exists between them, not just the facts.`
        : `Write a brief poetic story (3-5 sentences) describing what is happening in this photo at Festival of Friends. Focus on: the subject's presence and energy, their outfit and accessories, the setting and atmosphere, and the mood or feeling of the moment. It is Gage Park, Hamilton,  on August 1, 2026. State the date and write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of the moment, not just the facts.`)
      : (subjectCount === 'multiple'
        ? `Write a brief poetic story (3-5 sentences) describing what is happening in this photo. All subjects are of equal importance — identify them clearly and give each one genuine presence throughout. Focus on: the energy and dynamic between them, how they connect or contrast with each other, the way they share the space, the setting and atmosphere that frames them, and the mood of the moment. Write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of what exists between them, not just the facts.`
        : `Write a brief poetic story (3-5 sentences) describing what is happening in this photo. Focus on: the subject's presence and energy, their outfit and accessories, the setting and atmosphere, and the mood or feeling of the moment. Write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of the moment, not just the facts.`);

    const captionRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: [
            imageContent,
            { type: 'text', text: captionInstruction }
          ]
        }]
      })
    });

    if (!captionRes.ok) {
      const err = await captionRes.json();
      return {
        statusCode: captionRes.status,
        body: JSON.stringify({ error: `Caption failed: ${JSON.stringify(err)}` })
      };
    }

    const captionData = await captionRes.json();
    const caption = captionData.choices[0].message.content.trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, subjectCount })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal error' })
    };
  }
};
