// Live Firebase configuration for Groove Pop Party
const firebaseConfig = {
  apiKey: "AIzaSyCdHuNkf8kdfvPjjYvt-p4te13UnJiCW1U",
  authDomain: "groovepopparty.firebaseapp.com",
  projectId: "groovepopparty",
  storageBucket: "groovepopparty.firebasestorage.app",
  messagingSenderId: "12398739529",
  appId: "1:12398739529:web:9480eedb11ec1219ea3f98"
};

// DOM Elements
const loader = document.getElementById('loader');
const errorState = document.getElementById('error-state');
const appContent = document.getElementById('app-content');

const els = {
    title: document.getElementById('app-title'),
    host: document.getElementById('app-host'),
    type: document.getElementById('app-type'),
    date: document.getElementById('app-date'),
    venue: document.getElementById('app-venue'),
    dress: document.getElementById('app-dress'),
    dressContainer: document.getElementById('app-dress-container'),
    welcome: document.getElementById('app-welcome'),
    logo: document.getElementById('app-logo'),
    rsvp: document.getElementById('app-rsvp'),
    rsvpContainer: document.getElementById('app-rsvp-container')
};

// Initialize App
async function initApp() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const partyId = urlParams.get('partyId');

        if (!partyId) {
            throw new Error("No Party ID provided in URL.");
        }

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // Fetch Data
        const docRef = db.collection("parties").doc(partyId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            // Local Test Check
            if (partyId.startsWith('local-test-')) {
                throw new Error("This is a local test ID that wasn't saved to the database. Make sure your Firebase credentials are correct and test mode is on.");
            }
            throw new Error("Event not found.");
        }

        const data = docSnap.data();
        applyConfig(data);

    } catch (err) {
        console.error("Initialization Error:", err);
        loader.style.display = 'none';
        errorState.style.display = 'flex';
        // Optionally show specific error
        if (err.message.includes('local-test-')) {
            errorState.querySelector('p').textContent = err.message;
        }
    }
}

// Apply Config to DOM
function applyConfig(data) {
    // 1. Apply Colors to CSS Variables
    if (data.colors) {
        const root = document.documentElement;
        root.style.setProperty('--bg-color', data.colors.bg || '#ffffff');
        root.style.setProperty('--text-color', data.colors.text || '#000000');
        root.style.setProperty('--accent-color', data.colors.accent || '#cccccc');
    }

    // 2. Map Event Type string to readable label
    const typeMap = {
        'wedding': 'Wedding / Romance',
        'corporate': 'Corporate / Brand',
        'birthday': 'Birthday / Celebration',
        'festival': 'Festival / Outdoor',
        'nightlife': 'Nightlife / Party'
    };
    els.type.textContent = typeMap[data.eventType] || 'Special Event';

    // 3. Apply Text Fields
    els.title.textContent = data.eventName;
    els.host.textContent = data.eventHost;
    
    // Format Date (assuming YYYY-MM-DD input)
    if (data.eventDate) {
        const dateObj = new Date(data.eventDate + 'T12:00:00'); // Force noon to avoid timezone shift
        els.date.textContent = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    els.venue.textContent = data.eventVenue;
    
    if (data.welcomeMessage) {
        els.welcome.textContent = `"${data.welcomeMessage}"`;
    }

    // 4. Handle Optionals
    if (data.dressCode) {
        els.dress.textContent = data.dressCode;
        els.dressContainer.style.display = 'block';
    }

    if (data.rsvpLink) {
        els.rsvp.href = data.rsvpLink;
        els.rsvpContainer.style.display = 'block';
    }

    if (data.logoUrl) {
        els.logo.style.backgroundImage = `url(${data.logoUrl})`;
        els.logo.style.display = 'block';
    }

    // Update Page Title
    document.title = `${data.eventName} | Prototype`;

    // 5. Reveal App
    loader.style.display = 'none';
    appContent.style.display = 'flex';
}

// Boot
window.addEventListener('DOMContentLoaded', initApp);
