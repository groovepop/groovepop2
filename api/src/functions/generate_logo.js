const { app } = require('@azure/functions');
const { jsonResponse, handleOptions, getAzureConfig } = require('../lib/http');

app.http('generate-logo', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate-logo',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const azure = getAzureConfig(request);
    if (azure.error) return azure.error;

    try {
      const { prompt, size } = await request.json();

      if (!prompt) {
        return jsonResponse(400, { error: 'Missing prompt' }, request);
      }

      context.log(`generate-logo: creating event logo with prompt: "${prompt.slice(0, 80)}..."`);

      const url = `${azure.endpoint}/openai/deployments/${azure.imageDeployment}/images/generations?api-version=2024-02-01`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azure.apiKey,
        },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: size || '1024x1024',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        context.error(`generate-logo: Azure OpenAI error response: ${errText}`);
        return jsonResponse(response.status, { error: `Azure error ${response.status}: ${errText}` }, request);
      }

      const data = await response.json();
      if (!data.data || !data.data[0]) {
        throw new Error('Invalid response format from Azure OpenAI images service');
      }

      let b64 = '';
      if (data.data[0].b64_json) {
        b64 = data.data[0].b64_json;
      } else if (data.data[0].url) {
        // Fetch the image from URL and convert to base64
        const imgRes = await fetch(data.data[0].url);
        if (!imgRes.ok) {
          throw new Error(`Failed to download generated image from URL: ${data.data[0].url}`);
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        b64 = Buffer.from(arrayBuffer).toString('base64');
      } else {
        throw new Error('No b64_json or url in Azure OpenAI response');
      }

      return jsonResponse(200, { base64: b64 }, request);
    } catch (err) {
      context.error('generate-logo error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  },
});
