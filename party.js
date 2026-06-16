// Live Firebase configuration for Groove Pop Party
const firebaseConfig = {
  apiKey: "AIzaSyCdHuNkf8kdfvPjjYvt-p4te13UnJiCW1U",
  authDomain: "groovepopparty.firebaseapp.com",
  projectId: "groovepopparty",
  storageBucket: "groovepopparty.firebasestorage.app",
  messagingSenderId: "12398739529",
  appId: "1:12398739529:web:9480eedb11ec1219ea3f98"
};

const API_BASE = 'https://groovepop-engine-f7ged0hndrbucafm.eastus2-01.azurewebsites.net/api';

// State
let uploadedImageFile = null;
let uploadedImageUrl = null;

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
    // Details
    eventName: document.getElementById('event-name'),
    eventDate: document.getElementById('event-date'),
    eventTime: document.getElementById('event-time'),
    eventHost: document.getElementById('event-host'),
    eventVenue: document.getElementById('event-venue'),
    
    // Type
    eventType: document.getElementById('event-type'),
    
    // Information
    welcomeMessage: document.getElementById('welcome-message'),
    rsvpLink: document.getElementById('rsvp-link'),
    dressCode: document.getElementById('dress-code'),
    
    // Design
    bgColor: document.getElementById('bg-color'),
    primaryColor: document.getElementById('primary-color'),
    accentColor: document.getElementById('accent-color'),
    
    // Output Modal
    outputOverlay: document.getElementById('output-overlay'),
    shareUrl: document.getElementById('share-url'),
    qrcode: document.getElementById('qrcode'),
    btnGenerate: document.getElementById('btn-generate'),
    btnReset: document.getElementById('btn-reset'),
    btnCopy: document.getElementById('copy-btn')
};

// Helper to generate 6 custom event frames (3 decorative and 3 typographic)
async function generateEventFrames(eventName, eventVenue, eventDate, bgColor, primaryColor, accentColor, eventType, docId) {
    const list1Prompts = {
        wedding: `A decorative photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold graphic border design with ornamental corners and floral garland side tiles — the center is fully transparent. Romantic arch composition, delicate ornamental flourishes, elegant serif typography. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${eventName}" at the top and "${eventVenue} · ${eventDate}" at the bottom.`,
        corporate: `A decorative photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold graphic border design with geometric grid corners and minimal repeating side tiles — the center is fully transparent. Architectural grid composition, clean sans-serif typography, forward-looking precision. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${eventName}" at the top and "${eventVenue} · ${eventDate}" at the bottom.`,
        birthday: `A decorative photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold graphic border design with confetti burst corners and star pattern side tiles — the center is fully transparent. Playful expressive composition, festive bold typography, celebratory energy. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${eventName}" at the top and "${eventVenue} · ${eventDate}" at the bottom.`,
        festival: `A decorative photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold graphic border design with folk art geometric corners and screen-print pattern side tiles — the center is fully transparent. Hand-crafted poster aesthetic, bold stacked typography, sun and landscape accent motifs. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${eventName}" at the top and "${eventVenue} · ${eventDate}" at the bottom.`,
        nightlife: `A decorative photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold graphic border design with high contrast geometric corners and neon accent side tiles — the center is fully transparent. Cinematic bold composition, neon glow treatment, condensed typography with electric energy. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces. The frame text reads "${eventName}" at the top and "${eventVenue} · ${eventDate}" at the bottom.`
    };

    const list2Prompts = {
        wedding: `A typographic photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Thin elegant ruled lines forming the border, event name in large refined serif lettering across the top, venue and date in spaced small caps at the bottom, delicate corner monogram details — the center is fully transparent. Minimal and editorial, like a luxury invitation. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        corporate: `A typographic photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold sans-serif event name as a thick header bar across the top, venue and date as a footer bar at the bottom, vertical ruled side borders with subtle tick marks — the center is fully transparent. Clean and architectural, like a conference credential. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        birthday: `A typographic photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Bold playful oversized lettering repeated as a pattern along the side borders, event name as a thick celebratory header at the top, venue and date at the bottom — the center is fully transparent. Fun and loud, like a party banner. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        festival: `A typographic photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Stacked bold condensed festival lettering as a header bar across the top, repeating event name text running vertically along both sides, venue and date as a footer bar — the center is fully transparent. Raw screen-print energy, like a festival wristband or backstage pass. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`,
        nightlife: `A typographic photo frame border for "${eventName}" at ${eventVenue}. ${eventDate}. Glowing neon-style event name as a header bar across the top, repeating event name text running vertically along both sides in condensed bold type, venue and date at the bottom — the center is fully transparent. Electric and cinematic, like a club wristband or VIP pass. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as accent colors. No photography, no faces.`
    };

    const basePrompt1 = list1Prompts[eventType] || list1Prompts.wedding;
    const basePrompt2 = list2Prompts[eventType] || list2Prompts.wedding;

    // Generate 6 frames: 3 decorative (List 1) and 3 typographic (List 2)
    const framePrompts = [
        basePrompt1 + ", design variation A",
        basePrompt1 + ", design variation B",
        basePrompt1 + ", design variation C",
        basePrompt2 + ", design variation A",
        basePrompt2 + ", design variation B",
        basePrompt2 + ", design variation C"
    ];

    // Generate 6 frames in parallel
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

    // Upload each base64 to Firebase Storage
    const uploadBase64ToStorage = async (base64Str, filename) => {
        const ref = storage.ref().child(`party_logos/${docId}/${filename}`);
        const snapshot = await ref.putString(base64Str, 'base64', { contentType: 'image/jpeg' });
        return await snapshot.ref.getDownloadURL();
    };

    const urls = [];
    for (let i = 0; i < results.length; i++) {
        const url = await uploadBase64ToStorage(results[i], `frame_${i + 1}.jpg`);
        urls.push(url);
    }
    return urls;
}

// Helper to generate 6 custom event logos using gpt-image-2 deployment
async function generateEventLogos(eventName, eventVenue, eventDate, eventTime, bgColor, primaryColor, accentColor, eventType, docId) {
    const prompts = {
        wedding: `An elegant event logo for "${eventName}" at ${eventVenue}. ${eventDate}. Refined serif typography with a delicate ornamental flourish, arch or wreath composition. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on printed wedding stationery or a venue screen.`,
        corporate: `A clean, minimal event logo for "${eventName}" at ${eventVenue}. ${eventDate}. Professional typographic design, bold sans-serif lettering, geometric accent mark or monogram. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a printed badge or event backdrop.`,
        birthday: `A bold, celebratory event logo for "${eventName}" at ${eventVenue}. ${eventDate}. Playful expressive lettering, festive graphic accent — star, confetti burst, or balloon motif. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a party banner or phone screen.`,
        festival: `A hand-crafted event logo for "${eventName}" at ${eventVenue}. ${eventDate}. Bold stacked typography, screen-print poster aesthetic, sun or landscape graphic accent. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work on a festival wristband or wooden sign.`,
        nightlife: `A striking event logo for "${eventName}" at ${eventVenue}. ${eventDate}. Bold condensed typography, neon glow treatment or high-contrast graphic accent. Color palette: ${bgColor} background, ${primaryColor} and ${accentColor} as primary brand colors. No photography, no illustration. Flat vector aesthetic, would work projected on a club wall or printed on a wristband.`
    };
    
    const basePrompt = prompts[eventType] || prompts.wedding;
    
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
            docRef = db.collection("parties").doc();
            docId = docRef.id;
        }

        // 1. Upload custom logo if manually uploaded
        if (uploadedImageFile && storage) {
            try {
                const fileRef = storage.ref().child(`party_logos/${docId}/custom_logo_${Date.now()}`);
                const snapshot = await fileRef.put(uploadedImageFile);
                uploadedImageUrl = await snapshot.ref.getDownloadURL();
            } catch (err) {
                console.warn("Storage upload failed, skipping image.", err);
            }
        }

        // 2. Generate 6 Event Logos
        let logoUrls = [];
        let frameUrls = [];
        let finalBgColor = els.bgColor.value;
        if (db && storage) {
            els.btnGenerate.textContent = "Designing Event Logos...";
            try {
                const results = await generateEventLogos(
                    els.eventName.value,
                    els.eventVenue.value,
                    els.eventDate.value,
                    els.eventTime.value,
                    els.bgColor.value,
                    els.primaryColor.value,
                    els.accentColor.value,
                    els.eventType.value,
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

            // 2b. Generate 6 Event Frames (after logos complete, to respect concurrency limit)
            els.btnGenerate.textContent = "Designing Event Frames...";
            try {
                frameUrls = await generateEventFrames(
                    els.eventName.value,
                    els.eventVenue.value,
                    els.eventDate.value,
                    finalBgColor,
                    els.primaryColor.value,
                    els.accentColor.value,
                    els.eventType.value,
                    docId
                );
                console.log("Generated frame URLs:", frameUrls);
            } catch (frameErr) {
                console.error("AI Frame Generation failed:", frameErr);
            }
        }

        // Generate random activation key
        const generateKey = () => {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // readable chars
            const r = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `PARTY-${r(4)}-${r(4)}`;
        };
        const randomKey = generateKey();

        // 3. Gather Configuration
        const partyConfig = {
            eventName: els.eventName.value,
            eventDate: els.eventDate.value,
            eventTime: els.eventTime.value || '',
            eventHost: els.eventHost.value,
            eventVenue: els.eventVenue.value,
            eventType: els.eventType.value,
            welcomeMessage: els.welcomeMessage.value,
            rsvpLink: els.rsvpLink.value,
            dressCode: els.dressCode.value,
            colors: {
                bg: finalBgColor,
                text: els.primaryColor.value,
                accent: els.accentColor.value
            },
            logoUrl: uploadedImageUrl,
            logoUrls: logoUrls,
            frameUrls: frameUrls,
            pendingKey: randomKey,
            isActive: false,
            createdAt: new Date()
        };

        // 4. Save to Firestore
        if (docRef) {
            try {
                await docRef.set(partyConfig);
            } catch (fbError) {
                console.warn("Firebase save failed, using local dummy ID.", fbError);
            }
        }

        // 5. Generate Output URL
        const baseUrl = window.location.href.replace('party.html', 'party_booth_template.html');
        const finalUrl = `${baseUrl}?partyId=${docId}`;
        
        els.shareUrl.value = finalUrl;
        document.getElementById('activation-key').value = randomKey;

        const shareLink = document.getElementById('share-link');
        if (shareLink) {
            shareLink.href = finalUrl;
            shareLink.textContent = finalUrl;
            shareLink.style.display = 'inline-block';
        }
        
        // 6. Generate QR Code
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

// Reset & Close Modal
els.btnReset.addEventListener('click', () => {
    document.getElementById('party-form').reset();
    uploadedImageFile = null;
    uploadedImageUrl = null;
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
    if (els.eventName) els.eventName.value = "Marcus's 40th Bash";
    if (els.eventHost) els.eventHost.value = "Marcus & Friends";
    
    // Set date to tomorrow
    if (els.eventDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        els.eventDate.value = `${yyyy}-${mm}-${dd}`;
    }
    
    if (els.eventTime) els.eventTime.value = "20:00";
    if (els.eventVenue) els.eventVenue.value = "The Penthouse Lounge, 555 Skyline Blvd";
    if (els.eventType) els.eventType.value = "birthday";
    if (els.welcomeMessage) els.welcomeMessage.value = "Welcome to Marcus's 40th! Let's make it unforgettable!";
    if (els.rsvpLink) els.rsvpLink.value = "https://groovepop.com/marcus40";
    if (els.dressCode) els.dressCode.value = "Festive & Colorful";
}

// Run prefill on load
document.addEventListener('DOMContentLoaded', () => {
    prefillForm();
});
