# GROOVE POP — Netlify Deployment

## Folder structure
```
groovepop-netlify/
├── index.html                    ← The app
├── netlify.toml                  ← Netlify config
└── netlify/
    └── functions/
        ├── caption.js            ← Proxies caption call to Azure
        └── generate.js           ← Proxies image generation to Azure
```

## Deploy steps

1. Go to netlify.com and log in
2. Click "Add new site" → "Deploy manually"
3. Drag the entire groovepop-netlify FOLDER onto the deploy box
4. Wait ~30 seconds for it to go live

## Add your Azure credentials (required for real generations)

After deploying:

1. In Netlify dashboard → your site → Site configuration → Environment variables
2. Add these three variables:

| Key | Value |
|-----|-------|
| AZURE_OPENAI_ENDPOINT | https://groovepop.openai.azure.com |
| AZURE_OPENAI_KEY | (your Azure key) |
| AZURE_CAPTION_DEPLOYMENT | groovepop |
| AZURE_IMAGE_DEPLOYMENT | groovepop |

3. Go to Deploys → "Trigger deploy" → "Deploy site" to pick up the new env vars

## That's it
The app will be live at your-site-name.netlify.app
