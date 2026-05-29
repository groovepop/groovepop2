function corsOrigin() {
  return process.env.CORS_ORIGIN || '*';
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': corsOrigin(),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function jsonResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(extraHeaders),
    },
    jsonBody: body,
  };
}

function handleOptions(request) {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders() };
  }
  return null;
}

function getAzureConfig() {
  const apiKey = process.env.AZURE_OPENAI_KEY;
  if (!apiKey) {
    return { error: jsonResponse(500, { error: 'Azure API key not configured' }) };
  }

  return {
    apiKey,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'https://green-mos1tune-eastus2.openai.azure.com',
    captionDeployment: process.env.AZURE_CAPTION_DEPLOYMENT || 'groovepop-vision',
    imageDeployment: process.env.AZURE_IMAGE_DEPLOYMENT || 'gpt-image-2',
  };
}

module.exports = {
  corsHeaders,
  jsonResponse,
  handleOptions,
  getAzureConfig,
};
