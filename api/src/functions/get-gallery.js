const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');
const { BlobServiceClient } = require('@azure/storage-blob');

app.http('get-gallery', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'get-gallery',
  handler: async (request, context) => {
    const options = handleOptions(request);
    if (options) return options;

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const containerName = process.env.AZURE_STORAGE_CONTAINER || 'groovepop-gallery';

    if (!connectionString) {
      return jsonResponse(500, { error: 'Azure Storage connection string not configured' }, request);
    }

    try {
      const body = await request.json();
      const { userId } = body;
      if (!userId) {
        return jsonResponse(400, { error: 'Missing userId' }, request);
      }

      const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');

      // ── Search blobs by Tag query ──
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      const query = `@container = '${containerName}' AND "userId" = '${safeUserId}'`;
      const searchResult = containerClient.findBlobsByTags(query);

      const images = [];
      for await (const blob of searchResult) {
        const tags = blob.tags || {};
        const uuid = tags.uuid || blob.name.split('/').pop().split('.')[0];
        
        // Decode Base64 values
        const decodedStyleName = tags.styleName && tags.styleName !== 'none'
          ? Buffer.from(tags.styleName, 'base64').toString('utf8')
          : '';
        const decodedCaption = tags.caption && tags.caption !== 'none'
          ? Buffer.from(tags.caption, 'base64').toString('utf8')
          : '';

        images.push({
          publicId:   uuid,
          url:        `${containerClient.url}/originals/${uuid}.jpg`,
          thumbUrl:   `${containerClient.url}/thumbnails/${uuid}.jpg`,
          width:      1024,
          height:     1536,
          createdAt:  tags.createdAt ? new Date(parseInt(tags.createdAt) * 1000).toISOString() : new Date().toISOString(),
          styleName:  decodedStyleName,
          styleKey:   tags.styleKey === 'none' ? '' : tags.styleKey,
          subtheme:   tags.subtheme === 'none' ? '' : tags.subtheme,
          descriptor: decodedCaption
        });
      }

      // Sort by createdAt descending
      images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return jsonResponse(200, { images }, request);

    } catch (err) {
      context.error('get-gallery error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  }
});
