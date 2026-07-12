const { app } = require('@azure/functions');
const { GoogleAuth } = require('google-auth-library');
const { jsonResponse, handleOptions, getGcpConfig, getAzureConfig } = require('../lib/http');

app.http('generate-music', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate-music',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const gcp = getGcpConfig(request);
    const azure = getAzureConfig(request);
    
    if (gcp.error) return gcp.error;
    if (azure.error) return azure.error;

    try {
      const { prompt, imageBase64, imageMimeType } = await request.json();

      if (!prompt) {
        return jsonResponse(400, { error: 'Missing prompt' }, request);
      }

      // Step 1: Call Azure OpenAI to write lyrics based on the poster prompt
      context.log('generate-music: Generating lyrics via Azure OpenAI...');
      const azureUrl = `${azure.endpoint}/openai/deployments/${azure.captionDeployment}/chat/completions?api-version=2025-03-01-preview`;
      
      const lyricPrompt = `Based on the following track description and visual story, write short, catchy lyrics for a song (1 short verse and 1 chorus). The lyrics must match the mood and style.

Track description:
${prompt}

Do not include any explanations, introductions, or extra text. Respond ONLY with the lyrics formatted with clear headers like this:
[Verse]
<lyric lines>

[Chorus]
<lyric lines>`;

      const azureRes = await fetch(azureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': azure.apiKey },
        body: JSON.stringify({
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [{ type: 'text', text: lyricPrompt }]
          }]
        })
      });

      let lyrics = '';
      if (azureRes.ok) {
        const azureData = await azureRes.json();
        lyrics = azureData.choices[0]?.message?.content?.trim() || '';
        context.log('generate-music: Successfully generated lyrics:\n', lyrics);
      } else {
        const azureErr = await azureRes.text();
        context.error('Failed to generate lyrics via Azure:', azureErr);
        // Fallback to simple generic lyrics if GPT fails
        lyrics = `[Verse]\nWe are here together now\nLet the rhythm show you how\n\n[Chorus]\nGroovePop vibes are in the air\nSinging music everywhere`;
      }

      // Step 2: Build fused Lyria 3 prompt (direction + lyrics)
      // Extract genre/mood from original prompt to construct direction
      const lines = prompt.split('\n');
      const genreLine = lines.find(l => l.startsWith('Genre:')) || 'Genre: pop';
      const energyLine = lines.find(l => l.startsWith('Energy:')) || 'Energy: upbeat';
      const instrumentsLine = lines.find(l => l.startsWith('Instruments:')) || 'Instruments: synthesizer';
      const moodLine = lines.find(l => l.startsWith('Visual mood descriptors:')) || 'Visual mood descriptors: energetic';
      
      const direction = `An expressively sung full song. ${genreLine}, ${energyLine}, instruments: ${instrumentsLine}, mood: ${moodLine}. Vocal profile: a clear, emotive lead vocalist.`;
      const fusedPrompt = `${direction}\n\nLyrics:\n${lyrics}`;

      context.log('generate-music: Authenticating to Google Cloud...');
      const auth = new GoogleAuth({
        credentials: gcp.credentials,
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const accessToken = tokenResponse.token || tokenResponse;

      // Step 3: Call Lyria 3 Pro (full song composition) on the 'global' Vertex AI location
      const url = `https://aiplatform.googleapis.com/v1/projects/${gcp.projectId}/locations/global/publishers/google/models/lyria-3-pro-preview:generateContent`;

      // Build multimodal parts: text prompt + optional image input
      const parts = [{ text: fusedPrompt }];
      if (imageBase64 && imageMimeType) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        });
      }

      const payload = {
        contents: [{
          role: 'user',
          parts,
        }],
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
        },
      };

      context.log('generate-music: Calling Lyria 3 Pro generateContent API...');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        context.error('Vertex AI Lyria Pro Error:', errText);
        return jsonResponse(res.status, { error: `Vertex AI Lyria error ${res.status}: ${errText}` }, request);
      }

      const data = await res.json();
      
      // Walk parts in response to extract audio
      const candidates = data.candidates || [];
      const responseParts = candidates[0]?.content?.parts || [];
      let audioBase64 = null;
      let audioMimeType = null;

      for (const part of responseParts) {
        const inline = part.inlineData || part.inline_data;
        if (inline && typeof inline.data === 'string') {
          audioBase64 = inline.data;
          audioMimeType = inline.mimeType || inline.mime_type || 'audio/mpeg';
        }
      }

      if (!audioBase64) {
        context.error('No audio found in Lyria Pro response parts:', JSON.stringify(data));
        return jsonResponse(500, { error: 'No audio generated by the model.' }, request);
      }

      return jsonResponse(200, {
        audio: audioBase64,
        mimeType: audioMimeType,
        lyrics: lyrics,
      }, request);

    } catch (err) {
      context.error('generate-music error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  },
});
