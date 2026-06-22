// Live Firebase configuration for Groove Pop Weddings (WhiteRose)
// NOTE: reusing the same Firebase project / "parties" collection / party_logos storage
// path as the original Party engine, on purpose — this keeps party_booth_template.html
// (the guest-facing PWA) working unmodified while the Weddings-specific PWA config
// gets built out. Rename collection/paths then if it makes sense to.
const firebaseConfig = {
  apiKey: "AIzaSyCdHuNkf8kdfvPjjYvt-p4te13UnJiCW1U",
  authDomain: "groovepopparty.firebaseapp.com",
  projectId: "groovepopparty",
  storageBucket: "groovepopparty.firebasestorage.app",
  messagingSenderId: "12398739529",
  appId: "1:12398739529:web:9480eedb11ec1219ea3f98"
};

const API_BASE = 'https://groovepop-engine-f7ged0hndrbucafm.eastus2-01.azurewebsites.net/api';

// Initialize Firebase
let app, db, storage;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    console.log("Firebase initialized successfully.");
} catch (error) {
    console.warn("Firebase failed to initialize.", error);
}

// UI Elements
const els = {
    // The Couple
    partner1Name: document.getElementById('partner1-name'),
    partner2Name: document.getElementById('partner2-name'),
    weddingHashtag: document.getElementById('wedding-hashtag'),

    // Style
    weddingStyle: document.getElementById('wedding-style'),
    palettePreview: document.getElementById('palette-preview'),

    // Date & Locations
    weddingDate: document.getElementById('wedding-date'),
    ceremonyTime: document.getElementById('ceremony-time'),
    ceremonyVenue: document.getElementById('ceremony-venue'),
    receptionTime: document.getElementById('reception-time'),
    receptionVenue: document.getElementById('reception-venue'),

    // Guest Info
    welcomeMessage: document.getElementById('welcome-message'),
    websiteLink: document.getElementById('website-link'),
    registryLink: document.getElementById('registry-link'),
    dressCode: document.getElementById('dress-code'),

    // Music & DJ
    djMode: document.getElementById('dj-mode'),
    spotifyPlaylist: document.getElementById('spotify-playlist'),

    // Photo Gallery
    moderationEnabled: document.getElementById('moderation-enabled'),

    // Output Modal
    outputOverlay: document.getElementById('output-overlay'),
    shareUrl: document.getElementById('share-url'),
    qrcode: document.getElementById('qrcode'),
    btnGenerate: document.getElementById('btn-generate'),
    btnReset: document.getElementById('btn-reset'),
    btnCopy: document.getElementById('copy-btn')
};

// ---------------------------------------------------------------------------
// Locked wedding-style color palettes
// ---------------------------------------------------------------------------
// Replaces the old free-form color picker. Each Wedding Style carries one
// curated, fixed {bg, text, accent} set — chosen so AI-generated frames and
// logos always pair with colors that were actually designed to go together.
// No override field; this IS the design control now.
const WEDDING_STYLE_PALETTES = {
    classic: { bg: '#FAF6F0', text: '#2B2420', accent: '#C9A66B' }, // ivory / espresso / antique gold
    modern:  { bg: '#FFFFFF', text: '#22252A', accent: '#B6657A' }, // white / charcoal / dusty rose
    boho:    { bg: '#F5F0E1', text: '#3E4A33', accent: '#C1684A' }, // cream / olive / terracotta
    vintage: { bg: '#15120F', text: '#EFE3C8', accent: '#C9A227' }, // near-black / champagne / gold
    rustic:  { bg: '#EDE3D3', text: '#4A372A', accent: '#7C8C66' }  // kraft / walnut / sage
};

function getPaletteFor(styleKey) {
    return WEDDING_STYLE_PALETTES[styleKey] || WEDDING_STYLE_PALETTES.classic;
}

// Updates the live swatch preview the instant a Wedding Style is picked —
// this is the fix for "color choices weren't carrying through": there's no
// separate picker to fall out of sync with anymore, just this preview.
function updatePalettePreview() {
    if (!els.palettePreview) return;
    const palette = getPaletteFor(els.weddingStyle.value);
    els.palettePreview.innerHTML = '';
    [palette.bg, palette.text, palette.accent].forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.background = color;
        swatch.title = color;
        els.palettePreview.appendChild(swatch);
    });

    // Update root color variables for instant page demo
    document.documentElement.style.setProperty('--paper', palette.bg);
    document.documentElement.style.setProperty('--ink', palette.text);
    document.documentElement.style.setProperty('--rose', palette.accent);
    document.documentElement.style.setProperty('--gold', palette.accent);
    document.documentElement.style.setProperty('--paper-deep', palette.bg === '#FFFFFF' ? '#F3EEE5' : palette.bg);
}
if (els.weddingStyle) {
    els.weddingStyle.addEventListener('change', updatePalettePreview);
}

// ---------------------------------------------------------------------------
// Backing playlist
// ---------------------------------------------------------------------------
// TODO: swap this for a real GROOVE POP-curated wedding playlist ID once
// you've built one. This plays as the ambient soundtrack; guest requests
// (Live or Auto DJ mode) interleave into it automatically via Spotify's
// own queue mechanic — no fallback/filler logic needed on our end.
const DEFAULT_WEDDING_PLAYLIST_ID = '37i9dQZF1DX1u5V1v4yQdf';

// Accepts a full Spotify playlist URL, a spotify:playlist:ID URI, or a bare ID.
// Falls back to the GROOVE POP default if the field is blank or unparseable.
function extractSpotifyPlaylistId(input) {
    if (!input || !input.trim()) return DEFAULT_WEDDING_PLAYLIST_ID;
    const trimmed = input.trim();

    const urlMatch = trimmed.match(/playlist[/:]([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];

    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;

    console.warn('[GP] Could not parse Spotify playlist input, falling back to default:', trimmed);
    return DEFAULT_WEDDING_PLAYLIST_ID;
}

// ---------------------------------------------------------------------------
// Wedding style prompt library
// ---------------------------------------------------------------------------

function buildFramePrompts(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor) {
    const list1Prompts = {
        classic: `A decorative photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Bold graphic border design with ornamental corners and floral garland side tiles — the center is fully transparent. Romantic arch composition, delicate ornamental flourishes, elegant serif typography. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${coupleNames}" at the top and "${venue} · ${weddingDate}" at the bottom.`,
        modern: `A decorative photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Bold graphic border design with clean geometric corners and thin minimal line side tiles — the center is fully transparent. Restrained contemporary composition, single-weight sans-serif typography, generous negative space. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${coupleNames}" at the top and "${venue} · ${weddingDate}" at the bottom.`,
        boho: `A decorative photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Bold graphic border design with wildflower sprig corners and botanical vine side tiles — the center is fully transparent. Organic hand-drawn composition, loose hand-lettered script, sun-washed garden feel. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${coupleNames}" at the top and "${venue} · ${weddingDate}" at the bottom.`,
        vintage: `A decorative photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Bold graphic border design with art deco fan corners and geometric sunburst side tiles — the center is fully transparent. Glamorous 1920s-inspired composition, elegant condensed display typography, gold-foil-style linework. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${coupleNames}" at the top and "${venue} · ${weddingDate}" at the bottom.`,
        rustic: `A decorative photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Bold graphic border design with carved-wood-style corners and wheat-sprig side tiles — the center is fully transparent. Warm hand-crafted composition, rustic serif typography, kraft-paper texture cues. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${coupleNames}" at the top and "${venue} · ${weddingDate}" at the bottom.`
    };

    const list2Prompts = {
        classic: `A typographic photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Thin elegant ruled lines forming the border, couple names in large refined serif lettering across the top, venue and date in spaced small caps at the bottom, delicate corner monogram details — the center is fully transparent. Minimal and editorial, like a luxury invitation. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        modern: `A typographic photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Thin single-weight ruled lines forming the border, couple names in clean modern sans-serif lettering across the top, venue and date in small tracked caps at the bottom, no ornamentation — the center is fully transparent. Minimal and architectural, like a contemporary invitation suite. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        boho: `A typographic photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Loose hand-lettered script for the couple names across the top, venue and date in light serif caps at the bottom, thin botanical sprigs tracing the side borders — the center is fully transparent. Relaxed and earthy, like a garden wedding place card. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        vintage: `A typographic photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Tall condensed art deco lettering for the couple names across the top, venue and date in spaced small caps at the bottom, thin stepped geometric side borders — the center is fully transparent. Glamorous and graphic, like a vintage supper-club invitation. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        rustic: `A typographic photo frame border for "${coupleNames}" at ${venue}. ${weddingDate}. Stamped rustic serif lettering for the couple names across the top, venue and date in a simple footer band, thin twine-style side borders — the center is fully transparent. Warm and homespun, like a barn wedding place card. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`
    };

    return { list1Prompts, list2Prompts };
}

function buildLogoPrompts(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor) {
    return {
        classic: `An elegant wedding logo for "${coupleNames}" at ${venue}. ${weddingDate}. Refined serif typography with a delicate ornamental flourish, arch or wreath composition. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on printed wedding stationery or a venue screen.`,
        modern: `A clean, minimal wedding logo for "${coupleNames}" at ${venue}. ${weddingDate}. Modern sans-serif typography with generous letter spacing, a simple geometric monogram or line-art accent. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on printed wedding stationery or a venue screen.`,
        boho: `An organic, hand-crafted wedding logo for "${coupleNames}" at ${venue}. ${weddingDate}. Loose hand-lettered script, a small wildflower or botanical sprig accent. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a wooden welcome sign or printed favor tag.`,
        vintage: `A glamorous art-deco-inspired wedding logo for "${coupleNames}" at ${venue}. ${weddingDate}. Tall condensed display typography, a geometric sunburst or fan accent mark. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a foiled invitation or venue marquee.`,
        rustic: `A warm, hand-crafted wedding logo for "${coupleNames}" at ${venue}. ${weddingDate}. Rustic stamped serif typography, a simple wheat sprig or wood-grain accent. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a wooden welcome sign or kraft paper favor tag.`
    };
}

// Helper to generate 6 custom wedding frames (3 decorative and 3 typographic)
async function generateWeddingFrames(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor, weddingStyle, docId) {
    const { list1Prompts, list2Prompts } = buildFramePrompts(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor);

    const basePrompt1 = list1Prompts[weddingStyle] || list1Prompts.classic;
    const basePrompt2 = list2Prompts[weddingStyle] || list2Prompts.classic;

    const framePrompts = [
        basePrompt1 + ", design variation A",
        basePrompt1 + ", design variation B",
        basePrompt1 + ", design variation C",
        basePrompt2 + ", design variation A",
        basePrompt2 + ", design variation B",
        basePrompt2 + ", design variation C"
    ];

    const framePromises = framePrompts.map(async (promptText, i) => {
        const res = await fetch(`${API_BASE}/generate-logo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptText, size: '1024x1024' })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Failed generating frame ${i + 1}`);
        }
        const data = await res.json();
        return data.base64;
    });

    const results = await Promise.all(framePromises);

    const uploadBase64ToStorage = async (base64Str, filename) => {
        const ref = storage.ref().child(`party_logos/${docId}/${filename}`);
        const snapshot = await ref.putString(base64Str, 'base64', { contentType: 'image/png' });
        return await snapshot.ref.getDownloadURL();
    };

    const urls = [];
    for (let i = 0; i < results.length; i++) {
        const url = await uploadBase64ToStorage(results[i], `frame_${i + 1}.png`);
        urls.push(url);
    }
    return urls;
}

// Helper to generate 6 custom wedding logos using gpt-image-2 deployment
async function generateWeddingLogos(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor, weddingStyle, docId) {
    const prompts = buildLogoPrompts(coupleNames, venue, weddingDate, bgColor, primaryColor, accentColor);
    const basePrompt = prompts[weddingStyle] || prompts.classic;

    const logoPromises = Array.from({ length: 6 }).map(async (_, i) => {
        const res = await fetch(`${API_BASE}/generate-logo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: basePrompt, size: '1792x1024' })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Failed generating logo ${i + 1}`);
        }
        const data = await res.json();
        return data.base64;
    });

    const results = await Promise.all(logoPromises);

    const uploadBase64ToStorage = async (base64Str, filename) => {
        const ref = storage.ref().child(`party_logos/${docId}/${filename}`);
        const snapshot = await ref.putString(base64Str, 'base64', { contentType: 'image/jpeg' });
        return await snapshot.ref.getDownloadURL();
    };

    const urls = [];
    for (let i = 0; i < results.length; i++) {
        const url = await uploadBase64ToStorage(results[i], `logo_${i + 1}.jpg`);
        urls.push(url);
    }
    return { urls, base64s: results };
}

// Helper to extract the actual background color of the generated logo from its corner pixel.
// Kept even with locked palettes — it's a safety net in case the AI doesn't land precisely
// on the requested hex; if it's close, this keeps the app's own chrome matching the asset.
function getCornerColor(base64Str) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 10;
                canvas.height = 10;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 10, 10);
                const data = ctx.getImageData(1, 1, 1, 1).data;
                const r = data[0];
                const g = data[1];
                const b = data[2];
                const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                resolve(hex);
            } catch (e) {
                console.warn("[GP] Canvas extraction failed:", e);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = "data:image/jpeg;base64," + base64Str;
    });
}

// Generate PWA Prototype
els.btnGenerate.addEventListener('click', async () => {
    const requiredFields = document.querySelectorAll('.req-field');
    for (let field of requiredFields) {
        if (!field.value.trim()) {
            alert("Please complete all required fields (*) before generating the prototype.");
            return;
        }
    }

    els.btnGenerate.textContent = "Uploading assets...";
    els.btnGenerate.disabled = true;

    try {
        let docId = "local-test-" + Date.now();
        let docRef = null;
        if (db) {
            docRef = db.collection("parties").doc();
            docId = docRef.id;
        }

        const coupleNames = `${els.partner1Name.value} & ${els.partner2Name.value}`;
        const venue = els.receptionVenue.value;
        const palette = getPaletteFor(els.weddingStyle.value);

        let logoUrls = [];
        let frameUrls = [];
        let finalBgColor = palette.bg;

        if (db && storage) {
            els.btnGenerate.textContent = "Designing Wedding Logos...";
            try {
                const results = await generateWeddingLogos(
                    coupleNames,
                    venue,
                    els.weddingDate.value,
                    palette.bg,
                    palette.text,
                    palette.accent,
                    els.weddingStyle.value,
                    docId
                );
                logoUrls = results.urls;

                if (results.base64s && results.base64s.length > 0) {
                    const corner = await getCornerColor(results.base64s[0]);
                    if (corner) {
                        finalBgColor = corner;
                        console.log("Extracted logo background color:", finalBgColor);
                    }
                }
            } catch (logoErr) {
                console.error("AI Logo Generation failed, proceeding without custom logos:", logoErr);
                alert("AI Logo Generation failed: " + logoErr.message);
            }

            els.btnGenerate.textContent = "Designing Wedding Frames...";
            try {
                frameUrls = await generateWeddingFrames(
                    coupleNames,
                    venue,
                    els.weddingDate.value,
                    finalBgColor,
                    palette.text,
                    palette.accent,
                    els.weddingStyle.value,
                    docId
                );
                console.log("Generated frame URLs:", frameUrls);
            } catch (frameErr) {
                console.error("AI Frame Generation failed:", frameErr);
                alert("AI Frame Generation failed: " + frameErr.message);
            }
        }

        const generateKey = (prefix) => {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            const r = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `${prefix}-${r(4)}-${r(4)}`;
        };
        const randomKey = generateKey('WED');
        const adminKey = randomKey;

        const weddingConfig = {
            partner1Name: els.partner1Name.value,
            partner2Name: els.partner2Name.value,
            coupleNames: coupleNames,
            weddingHashtag: els.weddingHashtag.value,
            weddingStyle: els.weddingStyle.value,
            weddingDate: els.weddingDate.value,
            eventType: 'wedding',
            ceremonyTime: els.ceremonyTime.value || '',
            ceremonyVenue: els.ceremonyVenue.value || '',
            receptionTime: els.receptionTime.value,
            receptionVenue: els.receptionVenue.value,
            welcomeMessage: els.welcomeMessage.value,
            websiteLink: els.websiteLink.value,
            registryLink: els.registryLink.value,
            dressCode: els.dressCode.value,
            colors: {
                bg: finalBgColor,
                text: palette.text,
                accent: palette.accent
            },
            logoUrls: logoUrls,
            frameUrls: frameUrls,
            djMode: els.djMode.value,
            spotifyPlaylistId: extractSpotifyPlaylistId(els.spotifyPlaylist.value),
            bannedTracks: [],
            moderationEnabled: els.moderationEnabled.value === 'true',
            adminKey: adminKey,
            pendingKey: randomKey,
            isActive: false,
            createdAt: new Date()
        };

        if (docRef) {
            try {
                await docRef.set(weddingConfig);
            } catch (fbError) {
                console.warn("Firebase save failed, using local dummy ID.", fbError);
            }
        }

        const baseUrl = window.location.href.replace('wedding.html', 'party_booth_template.html');
        const finalUrl = `${baseUrl}?partyId=${docId}`;

        els.shareUrl.value = finalUrl;
        document.getElementById('activation-key').value = randomKey;

        const adminUrl = window.location.href.replace('wedding.html', `wedding-admin.html?key=${randomKey}`);
        document.getElementById('admin-url').value = adminUrl;

        const shareLink = document.getElementById('share-link');
        if (shareLink) {
            shareLink.href = finalUrl;
            shareLink.textContent = finalUrl;
            shareLink.style.display = 'inline-block';
        }

        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            adminLink.href = adminUrl;
            adminLink.style.display = 'inline-block';
        }

        els.qrcode.innerHTML = "";
        new QRCode(els.qrcode, {
            text: finalUrl,
            width: 160,
            height: 160,
            colorDark : "#2B2A28",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        els.outputOverlay.style.display = 'flex';

    } catch (error) {
        console.error("Error generating prototype:", error);
        alert("Failed to generate the PWA. Check console for details.");
    } finally {
        els.btnGenerate.textContent = "Generate Prototype PWA";
        els.btnGenerate.disabled = false;
    }
});

// Copy URL
els.btnCopy.addEventListener('click', () => {
    els.shareUrl.select();
    document.execCommand('copy');
    els.btnCopy.textContent = "✅";
    setTimeout(() => { els.btnCopy.textContent = "📋"; }, 2000);
});

// Copy Key
document.getElementById('copy-key-btn').addEventListener('click', () => {
    const keyInput = document.getElementById('activation-key');
    keyInput.select();
    document.execCommand('copy');
    document.getElementById('copy-key-btn').textContent = "✅";
    setTimeout(() => { document.getElementById('copy-key-btn').textContent = "📋"; }, 2000);
});

// Copy Admin URL
document.getElementById('copy-admin-url-btn').addEventListener('click', () => {
    const keyInput = document.getElementById('admin-url');
    keyInput.select();
    document.execCommand('copy');
    document.getElementById('copy-admin-url-btn').textContent = "✅";
    setTimeout(() => { document.getElementById('copy-admin-url-btn').textContent = "📋"; }, 2000);
});

// Reset & Close Modal
els.btnReset.addEventListener('click', () => {
    document.getElementById('wedding-form').reset();
    els.outputOverlay.style.display = 'none';
    updatePalettePreview();
    const shareLink = document.getElementById('share-link');
    if (shareLink) {
        shareLink.href = "#";
        shareLink.textContent = "";
        shareLink.style.display = 'none';
    }
});

// Pre-fill form fields for easy developer testing
function prefillForm() {
    if (els.partner1Name) els.partner1Name.value = "Sarah";
    if (els.partner2Name) els.partner2Name.value = "John";
    if (els.weddingHashtag) els.weddingHashtag.value = "#SarahAndJohn2026";
    if (els.weddingStyle) els.weddingStyle.value = "classic";

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const yyyy = nextYear.getFullYear();
    const mm = String(nextYear.getMonth() + 1).padStart(2, '0');
    const dd = String(nextYear.getDate()).padStart(2, '0');
    if (els.weddingDate) els.weddingDate.value = `${yyyy}-${mm}-${dd}`;

    if (els.ceremonyTime) els.ceremonyTime.value = "15:00";
    if (els.ceremonyVenue) els.ceremonyVenue.value = "St. Andrew's Church, 88 Chapel St";
    if (els.receptionTime) els.receptionTime.value = "18:00";
    if (els.receptionVenue) els.receptionVenue.value = "The Grand Hotel, 123 Main St";
    if (els.welcomeMessage) els.welcomeMessage.value = "Thank you for celebrating with us!";
    if (els.websiteLink) els.websiteLink.value = "https://groovepop.com/sarahandjohn";
    if (els.registryLink) els.registryLink.value = "https://registry.example.com/sarahandjohn";
    if (els.dressCode) els.dressCode.value = "Black Tie Optional";
    if (els.djMode) els.djMode.value = "live";
    if (els.spotifyPlaylist) els.spotifyPlaylist.value = "";

    updatePalettePreview();
}

document.addEventListener('DOMContentLoaded', () => {
    prefillForm();
});
