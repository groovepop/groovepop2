const { app } = require('@azure/functions');
const { jsonResponse, handleOptions } = require('../lib/http');
const { BlobServiceClient } = require('@azure/storage-blob');
const sharp = require('sharp');
const crypto = require('crypto');

app.http('upload-image', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'upload-image',
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
      const {
        base64,
        userId,
        styleKey,
        styleName,
        subtheme,
        variantKey,
        caption
      } = body;

      if (!base64) {
        return jsonResponse(400, { error: 'Missing base64 field' }, request);
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const uuid = crypto.randomUUID();
      const blobName = `originals/${uuid}.jpg`;
      const thumbBlobName = `thumbnails/${uuid}.jpg`;

      // ── Process Images ──
      const imageBuffer = Buffer.from(base64, 'base64');
      const thumbBuffer = await sharp(imageBuffer)
        .resize({ width: 400 })
        .jpeg({ quality: 85 })
        .toBuffer();

      // ── Initialize Storage Container ──
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists({ access: 'blob' });

      // ── Build Index Tags (Base64-encoded for safe characters) ──
      const safeUserId = userId ? userId.replace(/[^a-zA-Z0-9]/g, '_') : 'anonymous';
      const tags = {
        userId: safeUserId,
        styleKey: styleKey || 'none',
        styleName: styleName ? Buffer.from(styleName).toString('base64') : 'none',
        subtheme: subtheme || 'none',
        variantKey: variantKey || 'none',
        caption: caption ? Buffer.from(caption).toString('base64') : 'none',
        createdAt: String(timestamp),
        uuid: uuid
      };

      // ── Upload Original Image ──
      const originalBlobClient = containerClient.getBlockBlobClient(blobName);
      await originalBlobClient.uploadData(imageBuffer, {
        blobHTTPHeaders: { blobContentType: 'image/jpeg' },
        tags
      });

      // ── Upload Thumbnail Image ──
      const thumbBlobClient = containerClient.getBlockBlobClient(thumbBlobName);
      await thumbBlobClient.uploadData(thumbBuffer, {
        blobHTTPHeaders: { blobContentType: 'image/jpeg' }
      });

      return jsonResponse(200, {
        url:      originalBlobClient.url,
        thumbUrl: thumbBlobClient.url,
        publicId: uuid,
        width:    1024,
        height:   1536
      }, request);

    } catch (err) {
      context.error('upload-image error:', err);
      return jsonResponse(500, { error: err.message || 'Internal error' }, request);
    }
  }
});
