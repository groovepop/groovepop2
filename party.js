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
    logoUpload: document.getElementById('logo-upload'),
    uploadArea: document.getElementById('upload-area'),
    
    // Output Modal
    outputOverlay: document.getElementById('output-overlay'),
    shareUrl: document.getElementById('share-url'),
    qrcode: document.getElementById('qrcode'),
    btnGenerate: document.getElementById('btn-generate'),
    btnReset: document.getElementById('btn-reset'),
    btnCopy: document.getElementById('copy-btn')
};

// Image Upload Handling
els.uploadArea.addEventListener('click', () => els.logoUpload.click());
els.logoUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        uploadedImageFile = e.target.files[0];
        els.uploadArea.querySelector('span').textContent = uploadedImageFile.name;
    }
});

// Drag and drop support
els.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.uploadArea.style.borderColor = "var(--secondary)";
});
els.uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    els.uploadArea.style.borderColor = "var(--glass-border)";
});
els.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    els.uploadArea.style.borderColor = "var(--glass-border)";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        els.logoUpload.files = e.dataTransfer.files;
        els.logoUpload.dispatchEvent(new Event('change'));
    }
});

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
            body: JSON.stringify({ prompt: basePrompt })
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
    return urls;
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
        if (db && storage) {
            els.btnGenerate.textContent = "Designing Event Logos...";
            try {
                logoUrls = await generateEventLogos(
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
            } catch (logoErr) {
                console.error("AI Logo Generation failed, proceeding without custom logos:", logoErr);
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
                bg: els.bgColor.value,
                text: els.primaryColor.value,
                accent: els.accentColor.value
            },
            logoUrl: uploadedImageUrl,
            logoUrls: logoUrls,
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
    els.uploadArea.querySelector('span').textContent = "Drag & Drop or Click to Upload";
    els.outputOverlay.style.display = 'none';
});
