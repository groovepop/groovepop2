// Live Firebase configuration for Groove Pop Weddings
// NOTE: reusing the same Firebase project / "parties" collection / party_logos storage
// path as the original Party engine, on purpose — this keeps party_booth_template.html
// (the guest-facing PWA) working unmodified while we figure out the Weddings-specific
// PWA config in the next phase. Rename collection/paths then if it makes sense to.
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

    // Design
    bgColor: document.getElementById('bg-color'),
    primaryColor: document.getElementById('primary-color'),
    accentColor: document.getElementById('accent-color'),

    // Music & DJ
    djMode: document.getElementById('dj-mode'),
    spotifyPlaylist: document.getElementById('spotify-playlist'),

    // Output Modal
    outputOverlay: document.getElementById('output-overlay'),
    shareUrl: document.getElementById('share-url'),
    qrcode: document.getElementById('qrcode'),
    btnGenerate: document.getElementById('btn-generate'),
    btnReset: document.getElementById('btn-reset'),
    btnCopy: document.getElementById('copy-btn')
};

// ---------------------------------------------------------------------------
// Backing playlist
// ---------------------------------------------------------------------------
// TODO: swap this for a real GROOVE POP-curated wedding playlist ID once
// you've built one. This plays as the ambient soundtrack; guest requests
// (Live or Auto DJ mode) interleave into it automatically via Spotify's
// own queue mechanic — no fallback/filler logic needed on our end.
const DEFAULT_WEDDING_PLAYLIST_ID = 'https://open.spotify.com/playlist/4K7mNtRMRsAugsRx0quoqj';

// Accepts a full Spotify playlist URL, a spotify:playlist:ID URI, or a bare ID.
// Falls back to the GROOVE POP default if the field is blank or unparseable.
function extractSpotifyPlaylistId(input) {
    if (!input || !input.trim()) return DEFAULT_WEDDING_PLAYLIST_ID;
    const trimmed = input.trim();

    const urlMatch = trimmed.match(/playlist[/:]([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];

    // Bare ID (Spotify IDs are 22 base62 characters)
    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;

    console.warn('[GP] Could not parse Spotify playlist input, falling back to default:', trimmed);
    return DEFAULT_WEDDING_PLAYLIST_ID;
}


// Replaces the old eventType branching (wedding/corporate/birthday/festival/
// nightlife) with 5 wedding aesthetics, each driving its own decorative frame,
// typographic frame, and logo prompt. Same two-list structure as the original
// engine: list1 = decorative frame, list2 = typographic frame.
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

    // Generate 6 frames: 3 decorative (List 1) and 3 typographic (List 2)
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

    // Upload each base64 to Firebase Storage as image/png
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

    // Generate 6 logos in parallel (gpt-image-2 allows up to 10 concurrent runs)
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

    // Upload each base64 to Firebase Storage
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

// Helper to extract the actual background color of the generated logo from its corner pixel
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
    // Validation
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
            // Reusing the "parties" collection so the existing booth template keeps working.
            docRef = db.collection("parties").doc();
            docId = docRef.id;
        }

        const coupleNames = `${els.partner1Name.value} & ${els.partner2Name.value}`;
        const venue = els.receptionVenue.value;

        // 1. Generate 6 Wedding Logos
        let logoUrls = [];
        let frameUrls = [];
        let finalBgColor = els.bgColor.value;
        if (db && storage) {
            els.btnGenerate.textContent = "Designing Wedding Logos...";
            try {
                const results = await generateWeddingLogos(
                    coupleNames,
                    venue,
                    els.weddingDate.value,
                    els.bgColor.value,
                    els.primaryColor.value,
                    els.accentColor.value,
                    els.weddingStyle.value,
                    docId
                );
                logoUrls = results.urls;

                // Extract actual corner color of the first generated logo
                if (results.base64s && results.base64s.length > 0) {
                    const corner = await getCornerColor(results.base64s[0]);
                    if (corner) {
                        finalBgColor = corner;
                        console.log("Extracted logo background color:", finalBgColor);
                    }
                }
            } catch (logoErr) {
                console.error("AI Logo Generation failed, proceeding without custom logos:", logoErr);
            }

            // 1b. Generate 6 Wedding Frames (after logos complete, to respect concurrency limit)
            els.btnGenerate.textContent = "Designing Wedding Frames...";
            try {
                frameUrls = await generateWeddingFrames(
                    coupleNames,
                    venue,
                    els.weddingDate.value,
                    finalBgColor,
                    els.primaryColor.value,
                    els.accentColor.value,
                    els.weddingStyle.value,
                    docId
                );
                console.log("Generated frame URLs:", frameUrls);
            } catch (frameErr) {
                console.error("AI Frame Generation failed:", frameErr);
            }
        }

        // Generate random activation key + a separate, permanent admin key.
        // The activation key is meant to be consumed once (pendingKey -> isActive).
        // The admin key never gets cleared — it's the durable way back into the
        // DJ fine-tuning panel for the life of the event.
        const generateKey = (prefix) => {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // readable chars
            const r = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `${prefix}-${r(4)}-${r(4)}`;
        };
        const randomKey = generateKey('WED');
        const adminKey = generateKey('ADMIN');

        // 2. Gather Configuration
        const weddingConfig = {
            partner1Name: els.partner1Name.value,
            partner2Name: els.partner2Name.value,
            coupleNames: coupleNames,
            weddingHashtag: els.weddingHashtag.value,
            weddingStyle: els.weddingStyle.value,
            weddingDate: els.weddingDate.value,
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
                text: els.primaryColor.value,
                accent: els.accentColor.value
            },
            logoUrls: logoUrls,
            frameUrls: frameUrls,
            djMode: els.djMode.value,
            spotifyPlaylistId: extractSpotifyPlaylistId(els.spotifyPlaylist.value),
            bannedTracks: [],
            adminKey: adminKey,
            pendingKey: randomKey,
            isActive: false,
            createdAt: new Date()
        };

        // 3. Save to Firestore
        if (docRef) {
            try {
                await docRef.set(weddingConfig);
            } catch (fbError) {
                console.warn("Firebase save failed, using local dummy ID.", fbError);
            }
        }

        // 4. Generate Output URL
        // Still pointing at the original booth template — that's the "how the event PWA
        // is configured" question we're tackling next, not yet rebuilt for weddings.
        const baseUrl = window.location.href.replace('wedding.html', 'party_booth_template.html');
        const finalUrl = `${baseUrl}?partyId=${docId}`;

        els.shareUrl.value = finalUrl;
        document.getElementById('activation-key').value = randomKey;
        document.getElementById('admin-key').value = adminKey;

        const shareLink = document.getElementById('share-link');
        if (shareLink) {
            shareLink.href = finalUrl;
            shareLink.textContent = finalUrl;
            shareLink.style.display = 'inline-block';
        }

        // 5. Generate QR Code
        els.qrcode.innerHTML = "";
        new QRCode(els.qrcode, {
            text: finalUrl,
            width: 160,
            height: 160,
            colorDark : "#111111",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        // Show Output Modal
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

// Copy Admin Key
document.getElementById('copy-admin-key-btn').addEventListener('click', () => {
    const keyInput = document.getElementById('admin-key');
    keyInput.select();
    document.execCommand('copy');
    document.getElementById('copy-admin-key-btn').textContent = "✅";
    setTimeout(() => { document.getElementById('copy-admin-key-btn').textContent = "📋"; }, 2000);
});

// Reset & Close Modal
els.btnReset.addEventListener('click', () => {
    document.getElementById('wedding-form').reset();
    els.outputOverlay.style.display = 'none';
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

    // Set date to one year from now
    if (els.weddingDate) {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const yyyy = nextYear.getFullYear();
        const mm = String(nextYear.getMonth() + 1).padStart(2, '0');
        const dd = String(nextYear.getDate()).padStart(2, '0');
        els.weddingDate.value = `${yyyy}-${mm}-${dd}`;
    }

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
}

// Run prefill on load
document.addEventListener('DOMContentLoaded', () => {
    prefillForm();
});
