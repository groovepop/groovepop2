const { app } = require('@azure/functions');
const { jsonResponse, handleOptions, getAzureConfig } = require('../lib/http');

app.http('caption', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const azure = getAzureConfig();
    if (azure.error) return azure.error;

    try {
      const { base64, mimeType } = await request.json();
      if (!base64 || !mimeType) {
        return jsonResponse(400, { error: 'Missing base64 or mimeType' });
      }

      const url = `${azure.endpoint}/openai/deployments/${azure.captionDeployment}/chat/completions?api-version=2025-03-01-preview`;
      const imageContent = {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: 'low',
        },
      };

      const classifyRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': azure.apiKey },
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

Respond with only the single word. Nothing else.`,
              },
            ],
          }],
        }),
      });

      if (!classifyRes.ok) {
        const err = await classifyRes.text();
        return jsonResponse(classifyRes.status, { error: `Classification failed: ${err}` });
      }

      const classifyData = await classifyRes.json();
      const classifyRaw = classifyData.choices[0].message.content.trim().toUpperCase();
      const subjectCount = classifyRaw === 'MULTIPLE' ? 'multiple' : 'single';

      const captionInstruction = subjectCount === 'multiple'
        ? `Write a brief poetic story (3-5 sentences) describing what is happening in this photo. All subjects are of equal importance — identify them clearly and give each one genuine presence throughout. Focus on: the energy and dynamic between them, how they connect or contrast with each other, the way they share the space, the setting and atmosphere that frames them, and the mood of the moment. Write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of what exists between them, not just the facts.`
        : `Write a brief poetic story (3-5 sentences) describing what is happening in this photo. Focus on: the subject's presence and energy, their outfit and accessories, the setting and atmosphere, and the mood or feeling of the moment. Write in present tense, third person. Be specific and sensory — describe what you see with evocative, grounded language. This story will guide an artistic transformation of the image, so capture the soul of the moment, not just the facts.`;

      const captionRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': azure.apiKey },
        body: JSON.stringify({
          max_tokens: 250,
          messages: [{
            role: 'user',
            content: [
              imageContent,
              { type: 'text', text: captionInstruction },
            ],
          }],
        }),
      });

      if (!captionRes.ok) {
        const err = await captionRes.text();
        return jsonResponse(captionRes.status, { error: `Caption failed: ${err}` });
      }

      const captionData = await captionRes.json();
      const caption = captionData.choices[0].message.content.trim();

      return jsonResponse(200, { caption, subjectCount });
    } catch (err) {
      context.error('caption error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' });
    }
  },
});
