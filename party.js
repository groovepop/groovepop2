// Live Firebase configuration for Groove Pop Party
const firebaseConfig = {
  apiKey: "AIzaSyCdHuNkf8kdfvPjjYvt-p4te13UnJiCW1U",
  authDomain: "groovepopparty.firebaseapp.com",
  projectId: "groovepopparty",
  storageBucket: "groovepopparty.firebasestorage.app",
  messagingSenderId: "12398739529",
  appId: "1:12398739529:web:9480eedb11ec1219ea3f98"
};

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

    els.btnGenerate.textContent = "Generating Prototype...";
    els.btnGenerate.disabled = true;

    try {
        // 1. Upload Image to Firebase Storage
        if (uploadedImageFile && storage) {
            try {
                const fileRef = storage.ref().child(`party_logos/${Date.now()}_${uploadedImageFile.name}`);
                const snapshot = await fileRef.put(uploadedImageFile);
                uploadedImageUrl = await snapshot.ref.getDownloadURL();
            } catch (err) {
                console.warn("Storage upload failed, skipping image.", err);
            }
        }

        // Generate random activation key
        const generateKey = () => {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // readable chars
            const r = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `PARTY-${r(4)}-${r(4)}`;
        };
        const randomKey = generateKey();

        // 2. Gather Configuration
        const partyConfig = {
            eventName: els.eventName.value,
            eventDate: els.eventDate.value,
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
            pendingKey: randomKey,
            isActive: false,
            createdAt: new Date()
        };

        // 3. Save to Firestore
        let docId = "local-test-" + Date.now();
        if (db) {
            try {
                const docRef = await db.collection("parties").add(partyConfig);
                docId = docRef.id;
            } catch (fbError) {
                console.warn("Firebase save failed, using local dummy ID.", fbError);
            }
        }

        // 4. Generate Output URL
        const baseUrl = window.location.href.replace('party.html', 'party_booth_template.html');
        const finalUrl = `${baseUrl}?partyId=${docId}`;
        
        els.shareUrl.value = finalUrl;
        document.getElementById('activation-key').value = randomKey;
        
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

// Reset & Close Modal
els.btnReset.addEventListener('click', () => {
    document.getElementById('party-form').reset();
    uploadedImageFile = null;
    uploadedImageUrl = null;
    els.uploadArea.querySelector('span').textContent = "Drag & Drop or Click to Upload";
    els.outputOverlay.style.display = 'none';
});
