const { app } = require('@azure/functions');
const { jsonResponse, handleOptions, getAzureConfig } = require('../lib/http');

app.http('generate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const azure = getAzureConfig(request);
    if (azure.error) return azure.error;

    try {
      const { prompt, base64Image, mimeType, size, quality } = await request.json();

      if (!prompt || !base64Image) {
        return jsonResponse(400, { error: 'Missing prompt or base64Image' }, request);
      }

      const url = `${azure.endpoint}/openai/deployments/${azure.imageDeployment}/images/edits?api-version=2025-04-01-preview`;
      const ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
      const imageBuffer = Buffer.from(base64Image, 'base64');
      const blob = new Blob([imageBuffer], { type: mimeType || 'image/jpeg' });

      const formData = new FormData();
      formData.append('image[]', blob, `photo.${ext}`);
      formData.append('prompt', prompt);
      formData.append('n', '1');
      formData.append('size', size || '1024x1024');
      formData.append('quality', quality || 'medium');
      formData.append('output_format', 'jpeg');
      formData.append('output_compression', '80');

      context.log('generate: calling Azure image edits (this may take up to ~90s)');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': azure.apiKey },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        return jsonResponse(response.status, { error: `Azure error ${response.status}: ${errText}` }, request);
      }

      const data = await response.json();
      const b64 = data.data[0].b64_json;

      return jsonResponse(200, { imageUrl: `data:image/jpeg;base64,${b64}` }, request);
    } catch (err) {
      context.error('generate error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  },
});
