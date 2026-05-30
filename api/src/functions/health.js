const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');

app.http('health', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (request) => {
    const options = handleOptions(request);
    if (options) return options;

    return jsonResponse(200, {
      ok: true,
      service: 'groovepop-api',
      functions: ['health', 'caption', 'generate'],
    }, request);
  },
});
