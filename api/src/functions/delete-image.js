const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');
const { BlobServiceClient } = require('@azure/storage-blob');

app.http('delete-image', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'delete-image',
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
      const { publicId, userId } = body;
      if (!publicId || !userId) {
        return jsonResponse(400, { error: 'Missing publicId or userId' }, request);
      }

      // Initialize Blob Storage Client
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);

      // Construct blob clients for original and thumbnail
      const originalBlobClient = containerClient.getBlockBlobClient(`originals/${publicId}.jpg`);
      const thumbBlobClient = containerClient.getBlockBlobClient(`thumbnails/${publicId}.jpg`);

      // Delete both blobs if they exist
      const deleteOrig = await originalBlobClient.deleteIfExists();
      const deleteThumb = await thumbBlobClient.deleteIfExists();

      return jsonResponse(200, {
        deleted: deleteOrig.succeeded || deleteThumb.succeeded,
        publicId
      }, request);

    } catch (err) {
      context.error('delete-image error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  }
});
