function corsHeaders(request, extra = {}) {
  const configured = (process.env.CORS_ORIGIN || '*').trim();
  const origin = request?.headers?.get('origin');
  let allowOrigin = '*';

  if (configured === '*') {
    allowOrigin = origin || '*';
  } else {
    const allowed = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) {
      allowOrigin = origin;
    } else if (allowed.length === 1) {
      allowOrigin = allowed[0];
    } else {
      allowOrigin = origin || allowed[0] || '*';
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function jsonResponse(status, body, request, extraHeaders = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, extraHeaders),
    },
    jsonBody: body,
  };
}

function handleOptions(request) {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders(request) };
  }
  return null;
}

function getAzureConfig(request) {
  const apiKey = process.env.AZURE_OPENAI_KEY;
  if (!apiKey) {
    return { error: jsonResponse(500, { error: 'Azure API key not configured' }, request) };
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
