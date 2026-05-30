# GROOVE POP — Azure Function App setup

This is the **engine only**: `caption` + `generate` (+ `health` for smoke tests).

Use a **standalone Azure Function App** — not Static Web Apps. SWA is great for hosting HTML, but its managed API layer is what blocked your 90-second image runs. A Function App on the Consumption plan can run up to **10 minutes** per request (`host.json` is already set).

```
Browser / Netlify app
        │
        ▼
  Azure Function App  ──►  Azure OpenAI (groovepop-vision, gpt-image-2)
  (key in app settings)
```

---

## Part 1 — Create the Function App (Azure Portal)

Do this once. ~15 minutes.

### 1. Storage account (required)

1. [portal.azure.com](https://portal.azure.com) → **Create a resource**
2. Search **Storage account** → Create
3. Pick the same region as your OpenAI resource (e.g. **East US 2**)
4. Performance: Standard, Redundancy: LRS is fine for dev
5. Create

### 2. Function App (NOT Static Web App)

1. **Create a resource** → **Function App**
2. Basics:
   - **Runtime stack**: Node.js
   - **Version**: 20 LTS
   - **Plan**: Consumption (Serverless)
   - Same region as OpenAI
   - Link the storage account from step 1
3. Create and wait for deployment

### 3. Environment variables

Function App → **Settings** → **Environment variables** → **App settings** → add:

| Name | Value |
|------|-------|
| `AZURE_OPENAI_KEY` | Your Azure OpenAI key (rotate if it was ever in client code) |
| `AZURE_OPENAI_ENDPOINT` | `https://green-mos1tune-eastus2.openai.azure.com` |
| `AZURE_CAPTION_DEPLOYMENT` | `groovepop-vision` |
| `AZURE_IMAGE_DEPLOYMENT` | `gpt-image-2` |
| `CORS_ORIGIN` | Your Netlify URL, e.g. `https://yoursite.netlify.app` (or `*` while testing) |

Save → allow the app to restart.

### 4. CORS (portal)

Function App → **API** → **CORS**:

- Add your Netlify origin (and `http://localhost:8888` if you test locally)
- Remove `*` in production if you can

---

## Part 2 — GitHub deploy

### 1. Put this repo on GitHub

If the project is not on GitHub yet:

1. Create a new repo on github.com (empty, no README)
2. On your PC, install [Git for Windows](https://git-scm.com/download/win) if needed
3. In this folder:

```powershell
cd c:\Users\tobin\Pictures\v2
git init
git add .
git commit -m "Add Azure Function App engine"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### 2. GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Where to get it |
|--------|-----------------|
| `AZURE_FUNCTIONAPP_NAME` | Function App name exactly as shown in Azure (e.g. `groovepop-engine`) |
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Function App → **Overview** → **Get publish profile** → copy entire XML file contents |

### 3. Deploy

Push to `main` (or **Actions** → **Deploy Azure Functions** → **Run workflow**).

After green checkmark, your URLs are:

```
https://YOUR-APP-NAME-<hash>.<region>-01.azurewebsites.net/api/health
https://YOUR-APP-NAME-<hash>.<region>-01.azurewebsites.net/api/caption
https://YOUR-APP-NAME-<hash>.<region>-01.azurewebsites.net/api/generate
```

**Flex Consumption note:** The live URL is **not** `https://your-app-name.azurewebsites.net`. Copy the full **Default domain** from Function App → **Overview** (e.g. `groovepop-engine-f7ged0hndrbucafm.eastus2-01.azurewebsites.net`).

Groove Pop engine (live):

```
https://groovepop-engine-f7ged0hndrbucafm.eastus2-01.azurewebsites.net/api/health
```

---

## Part 3 — Test it

### Health (browser)

Open: `https://YOUR-APP-NAME.azurewebsites.net/api/health`

You should see JSON with `"ok": true`.

### Caption (PowerShell)

Replace paths and URL:

```powershell
$bytes = [IO.File]::ReadAllBytes("C:\path\to\photo.jpg")
$b64 = [Convert]::ToBase64String($bytes)
$body = @{ base64 = $b64; mimeType = "image/jpeg" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "https://YOUR-APP-NAME.azurewebsites.net/api/caption" -ContentType "application/json" -Body $body
```

### Generate

Uses the caption text + same photo base64. Expect **30–90 seconds** — that is normal; the Function App will wait.

```powershell
$body = @{
  prompt = "YOUR CAPTION TEXT HERE"
  base64Image = $b64
  mimeType = "image/jpeg"
  size = "1024x1536"
  quality = "medium"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "https://YOUR-APP-NAME.azurewebsites.net/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600
```

---

## Part 4 — Wire the Netlify app (when ready)

In `app.html`, point the two calls at Azure instead of Netlify / direct Azure:

```javascript
const API_BASE = 'https://YOUR-APP-NAME.azurewebsites.net/api';

// caption:
await fetch(`${API_BASE}/caption`, { ... });

// generate (replace the direct Azure block with):
await fetch(`${API_BASE}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: fullPrompt,
    base64Image: uploadedDataUrl.split(',')[1],
    mimeType: 'image/jpeg',
    size: chosen.size || '1024x1536',
    quality: 'medium',
  }),
});
```

Then **delete the hardcoded API key** from `app.html` and rotate the key in Azure.

---

## Local dev (optional)

```powershell
cd api
copy local.settings.json.example local.settings.json
# edit local.settings.json with your real key
npm install
npx azure-functions-core-tools@4 -- func start
```

Functions run at `http://localhost:7071/api/...`

---

## Why SWA failed you (short version)

| | Static Web Apps | Function App |
|--|-----------------|--------------|
| Good for | HTML/CSS/JS hosting | Long-running APIs |
| Your 90s image job | Timeout / coupling issues | Up to 10 min on Consumption |
| API key | Temptation to put in browser | Stays in app settings |

Keep Netlify (or any host) for the frontend. Run the **engine** on Azure Function App. That is the split that works.

---

## Troubleshooting

**502 / timeout on generate** — Confirm plan is Consumption (not SWA-linked). Check `host.json` has `"functionTimeout": "00:10:00"`.

**401 from Azure OpenAI** — Wrong key or wrong endpoint region vs deployment.

**CORS error in browser** — Add your site origin in Function App CORS + set `CORS_ORIGIN` app setting.

**GitHub Action fails** — Publish profile must be the full XML. App name must match exactly (no `.azurewebsites.net` suffix in the secret).
