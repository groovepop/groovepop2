// Live Firebase configuration for Groove Pop Weddings
const firebaseConfig = {
  apiKey: "AIzaSyCdHuNkf8kdfvPjjYvt-p4te13UnJiCW1U",
  authDomain: "groovepopparty.firebaseapp.com",
  projectId: "groovepopparty",
  storageBucket: "groovepopparty.firebasestorage.app",
  messagingSenderId: "12398739529",
  appId: "1:12398739529:web:9480eedb11ec1219ea3f98"
};

// Initialize Firebase
let app, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized successfully in Admin Panel.");
} catch (error) {
    console.warn("Firebase failed to initialize in Admin Panel.", error);
}

// Global state
let currentPartyId = null;
let currentPartyData = null;
let unsubscribeParty = null;
let unsubscribeRequests = null;
let autoDjPollInterval = null;
let allPhotos = [];
let activeFilter = 'all';

// Auto-run on page load
window.addEventListener('DOMContentLoaded', () => {
    checkExistingAuth();
});

// Authentication checks
async function checkExistingAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryKey = urlParams.get('key');
    
    if (queryKey) {
        // Clean key parameter from URL so it doesn't leak or sit in the address bar
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        const authError = document.getElementById('auth-error');
        const gateKeyInput = document.getElementById('gate-admin-key');
        if (gateKeyInput) gateKeyInput.value = queryKey;

        try {
            const snap = await db.collection("parties").where("adminKey", "==", queryKey.toUpperCase()).limit(1).get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                const partyId = doc.id;
                
                sessionStorage.setItem('groovepop_admin_partyId', partyId);
                sessionStorage.setItem('groovepop_admin_key', queryKey.toUpperCase());
                
                document.getElementById('auth-gate').style.display = 'none';
                await loadAdminPanel(partyId);
                return;
            } else {
                if (authError) {
                    authError.textContent = "Invalid access key from URL link.";
                    authError.style.display = 'block';
                }
            }
        } catch (err) {
            console.error("URL authentication query failed:", err);
            if (authError) {
                authError.textContent = `URL verification error: ${err.message}`;
                authError.style.display = 'block';
            }
        }
    }

    const savedPartyId = sessionStorage.getItem('groovepop_admin_partyId');
    const savedKey = sessionStorage.getItem('groovepop_admin_key');
    
    if (savedPartyId && savedKey) {
        document.getElementById('auth-gate').style.display = 'none';
        await loadAdminPanel(savedPartyId);
    }
}

async function submitGateKey() {
    const keyInput = document.getElementById('gate-admin-key');
    const authError = document.getElementById('auth-error');
    const btn = document.getElementById('btn-auth-submit');
    
    if (!keyInput || !authError || !btn) return;
    
    const key = keyInput.value.trim().toUpperCase();
    authError.style.display = 'none';
    
    if (!key) {
        authError.textContent = "Please enter an access key.";
        authError.style.display = 'block';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = "VERIFYING...";
    
    try {
        const snap = await db.collection("parties").where("adminKey", "==", key).limit(1).get();
        if (snap.empty) {
            authError.textContent = "Invalid access key. Please check the key and try again.";
            authError.style.display = 'block';
            btn.disabled = false;
            btn.textContent = "ACCESS PANEL";
            return;
        }
        
        const doc = snap.docs[0];
        const partyId = doc.id;
        
        sessionStorage.setItem('groovepop_admin_partyId', partyId);
        sessionStorage.setItem('groovepop_admin_key', key);
        
        document.getElementById('auth-gate').style.display = 'none';
        btn.disabled = false;
        btn.textContent = "ACCESS PANEL";
        
        await loadAdminPanel(partyId);
    } catch (err) {
        console.error("Auth query failed:", err);
        authError.textContent = `Verification error: ${err.message}`;
        authError.style.display = 'block';
        btn.disabled = false;
        btn.textContent = "ACCESS PANEL";
    }
}

// Load Panel Data & Setup Listeners
async function loadAdminPanel(partyId) {
    currentPartyId = partyId;
    document.getElementById('admin-main').style.display = 'block';
    
    // 1. Real-time listener for the Party Config Document
    if (unsubscribeParty) unsubscribeParty();
    unsubscribeParty = db.collection("parties").doc(partyId).onSnapshot((docSnap) => {
        if (!docSnap.exists) {
            console.error("Party document not found!");
            return;
        }
        
        const data = docSnap.data();
        currentPartyData = data;
        
        // Apply theme colors dynamically to the Admin Panel
        if (data.colors) {
            const root = document.documentElement;
            if (data.colors.bg) {
                root.style.setProperty('--bg-color', data.colors.bg);
                document.body.style.background = data.colors.bg;
            }
            if (data.colors.text) {
                root.style.setProperty('--text-main', data.colors.text);
            }
            if (data.colors.accent) {
                root.style.setProperty('--secondary', data.colors.accent);
                root.style.setProperty('--accent', data.colors.accent);
                
                // Update Admin header branding/logos colors
                const logoSpan = document.querySelector('.admin-logo span');
                if (logoSpan) {
                    logoSpan.style.color = data.colors.accent;
                }
            }
        }
        
        // Update header info
        const coupleNames = (data.partner1Name && data.partner2Name) ? 
            `${data.partner1Name} & ${data.partner2Name}` : (data.eventName || "Wedding Event");
        document.getElementById('header-couple-names').textContent = coupleNames.toUpperCase();
        document.getElementById('header-event-date').textContent = data.weddingDate || '';
        
        // Populate config form inputs (only if not currently active/focused by user to avoid overwrite)
        prefillConfigForm(data);
        
        // Update Live Toggles
        updateLiveTogglesUI(data);
        
        // Update DJ settings
        updateDJSettingsUI(data);
        
        // Trigger Auto DJ polling status if needed
        manageAutoDjPolling(data.djMode);
    }, (err) => {
        console.error("Party snap listener error:", err);
    });
    
    // 2. Real-time listener for Request Queue subcollection
    if (unsubscribeRequests) unsubscribeRequests();
    unsubscribeRequests = db.collection("parties").doc(partyId).collection("requests")
        .where("status", "==", "pending")
        .orderBy("votes", "desc")
        .onSnapshot((snap) => {
            renderRequestQueue(snap);
        }, (err) => {
            console.error("Request snap listener error:", err);
        });

    // 3. Initial load of Gallery
    await refreshGallery();
}

// Prefill form inputs with database values
function prefillConfigForm(data) {
    const fields = {
        'config-partner1-name': data.partner1Name || '',
        'config-partner2-name': data.partner2Name || '',
        'config-wedding-hashtag': data.weddingHashtag || '',
        'config-wedding-date': data.weddingDate || '',
        'config-ceremony-time': data.ceremonyTime || '',
        'config-ceremony-venue': data.ceremonyVenue || '',
        'config-reception-time': data.receptionTime || '',
        'config-reception-venue': data.receptionVenue || '',
        'config-welcome-message': data.welcomeMessage || '',
        'config-website-link': data.websiteLink || '',
        'config-registry-link': data.registryLink || '',
        'config-dress-code': data.dressCode || '',
        'config-bg-color': data.colors?.bg || '#111111',
        'config-text-color': data.colors?.text || '#f5f2ec',
        'config-accent-color': data.colors?.accent || '#a00ae6',
        'config-moderation': (data.moderationEnabled !== false).toString()
    };
    
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = val;
        }
    }
}

// Update Live tab toggles
function updateLiveTogglesUI(data) {
    const camBtn = document.getElementById('toggle-camera');
    const djBtn = document.getElementById('toggle-dj');
    
    if (camBtn) {
        const paused = data.cameraPaused === true;
        camBtn.classList.toggle('active', paused);
        camBtn.innerHTML = paused ? '<span>⏸</span> Camera: Paused' : '<span>📷</span> Camera: Active';
    }
    
    if (djBtn) {
        const paused = data.djPaused === true;
        djBtn.classList.toggle('active', paused);
        djBtn.innerHTML = paused ? '<span>⏸</span> Requests: Paused' : '<span>🎵</span> Requests: Active';
    }
}

// Update DJ status & elements
function updateDJSettingsUI(data) {
    // Override playlist input
    const playlistInput = document.getElementById('dj-playlist-override');
    if (playlistInput && document.activeElement !== playlistInput) {
        playlistInput.value = data.spotifyPlaylistId || '';
    }
    
    // DJ Mode dropdown select
    const djModeSelect = document.getElementById('dj-mode-select');
    if (djModeSelect && document.activeElement !== djModeSelect) {
        djModeSelect.value = data.djMode || 'off';
    }
    
    // Banned song chips
    const bannedContainer = document.getElementById('banned-chips-container');
    if (bannedContainer) {
        bannedContainer.innerHTML = '';
        const banned = data.bannedTracks || [];
        if (banned.length === 0) {
            bannedContainer.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; font-style:italic;">No banned songs.</div>';
            return;
        }
        banned.forEach((track, idx) => {
            const chip = document.createElement('div');
            chip.className = 'banned-chip';
            
            // Handle both string URIs and object descriptors
            const trackName = typeof track === 'object' ? `${track.name} - ${track.artist}` : track;
            const trackUri = typeof track === 'object' ? track.uri : track;
            
            chip.innerHTML = `
                <span>${trackName}</span>
                <span class="banned-chip-remove" onclick="removeBannedTrack('${trackUri}')">×</span>
            `;
            bannedContainer.appendChild(chip);
        });
    }
}

// Manage Auto DJ Polling
function manageAutoDjPolling(mode) {
    const statusEl = document.getElementById('auto-dj-poller-status');
    const isAutoDj = mode === 'auto_dj';
    
    if (statusEl) {
        statusEl.style.display = isAutoDj ? 'block' : 'none';
    }
    
    if (isAutoDj) {
        if (!autoDjPollInterval) {
            console.log("Starting Auto DJ queue polling...");
            // Poll immediately once, then set interval
            pollAutoDjQueue();
            autoDjPollInterval = setInterval(pollAutoDjQueue, 20000);
        }
    } else {
        if (autoDjPollInterval) {
            console.log("Stopping Auto DJ queue polling...");
            clearInterval(autoDjPollInterval);
            autoDjPollInterval = null;
        }
    }
}

// Poll spotify-queue-next function
async function pollAutoDjQueue() {
    if (!currentPartyId) return;
    const statusEl = document.getElementById('auto-dj-poller-status');
    if (statusEl) statusEl.textContent = "Auto DJ Status: Polling queue...";
    
    try {
        const res = await fetch(`/.netlify/functions/spotify-queue-next?partyId=${currentPartyId}`);
        const data = await res.json();
        
        if (statusEl) {
            if (res.ok && data.track) {
                statusEl.textContent = `Auto DJ Status: Queued "${data.track}" by ${data.artist}`;
            } else if (data.message) {
                statusEl.textContent = `Auto DJ Status: ${data.message}`;
            } else if (data.error) {
                statusEl.textContent = `Auto DJ Status: Error - ${data.error}`;
            }
        }
    } catch (err) {
        console.error("Auto DJ poll failed:", err);
        if (statusEl) statusEl.textContent = "Auto DJ Status: Poll failed.";
    }
}

// Render request queue list
function renderRequestQueue(snap) {
    const container = document.getElementById('dj-request-list');
    if (!container) return;
    
    container.innerHTML = '';
    if (snap.empty) {
        container.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; font-style:italic;">No pending song requests.</div>';
        return;
    }
    
    snap.forEach(doc => {
        const req = doc.data();
        const item = document.createElement('div');
        item.className = 'request-item';
        item.innerHTML = `
            <div class="request-item-details">
                <div class="request-item-title">${req.trackName}</div>
                <div class="request-item-artist">${req.artist}</div>
            </div>
            <div class="request-item-votes">${req.votes || 1} vote${req.votes !== 1 ? 's': ''}</div>
            <button class="btn-card btn-card-delete" onclick="banRequestedTrack('${doc.id}', '${req.trackUri}', '${escapeHtml(req.trackName)}', '${escapeHtml(req.artist)}')">Ban</button>
        `;
        container.appendChild(item);
    });
}

// Toggles for Live tab
async function toggleField(field) {
    if (!currentPartyId || !currentPartyData) return;
    const newVal = !(currentPartyData[field] === true);
    
    try {
        await db.collection("parties").doc(currentPartyId).update({
            [field]: newVal
        });
        showToast("Status updated!");
    } catch (err) {
        console.error(`Toggle ${field} failed:`, err);
        showToast("Update failed!");
    }
}

// Send Broadcast notification
async function sendBroadcast() {
    const msgInput = document.getElementById('broadcast-message');
    const durInput = document.getElementById('broadcast-duration');
    
    if (!msgInput || !currentPartyId) return;
    
    const message = msgInput.value.trim();
    const duration = parseInt(durInput?.value || '30', 10);
    
    if (!message) {
        showToast("Please enter a message!");
        return;
    }
    
    try {
        await db.collection("parties").doc(currentPartyId).collection("notifications").add({
            message: message,
            displaySeconds: duration,
            sentAt: firebase.firestore.Timestamp.now(),
            type: "announcement"
        });
        msgInput.value = '';
        showToast("Broadcast Sent! 📢");
    } catch (err) {
        console.error("Broadcast failed:", err);
        showToast("Broadcast failed.");
    }
}

// DJ Settings Actions
async function savePlaylistOverride() {
    const input = document.getElementById('dj-playlist-override');
    if (!input || !currentPartyId) return;
    
    const playlistId = extractSpotifyPlaylistId(input.value);
    
    try {
        await db.collection("parties").doc(currentPartyId).update({
            spotifyPlaylistId: playlistId
        });
        showToast("Playlist updated!");
    } catch (err) {
        console.error("Playlist save failed:", err);
        showToast("Save failed.");
    }
}

async function changeDJMode(mode) {
    if (!currentPartyId) return;
    try {
        await db.collection("parties").doc(currentPartyId).update({
            djMode: mode
        });
        showToast("DJ Mode updated!");
    } catch (err) {
        console.error("DJ mode change failed:", err);
        showToast("Save failed.");
    }
}

async function banRequestedTrack(docId, trackUri, trackName, artist) {
    if (!currentPartyId) return;
    
    try {
        // 1. Mark request as banned in Firestore requests subcollection
        await db.collection("parties").doc(currentPartyId).collection("requests").doc(docId).update({
            status: 'banned',
            bannedAt: new Date().toISOString()
        });
        
        // 2. Add track to bannedTracks array on the party config doc
        const banObj = { uri: trackUri, name: trackName, artist: artist };
        await db.collection("parties").doc(currentPartyId).update({
            bannedTracks: firebase.firestore.FieldValue.arrayUnion(banObj)
        });
        
        showToast(`Banned "${trackName}"`);
    } catch (err) {
        console.error("Banning track failed:", err);
        showToast("Ban failed.");
    }
}

async function removeBannedTrack(trackUri) {
    if (!currentPartyId || !currentPartyData) return;
    
    // Find the track object matching the URI in the banned list
    const banned = currentPartyData.bannedTracks || [];
    const banObj = banned.find(item => (typeof item === 'object' ? item.uri === trackUri : item === trackUri));
    
    if (!banObj) return;
    
    try {
        await db.collection("parties").doc(currentPartyId).update({
            bannedTracks: firebase.firestore.FieldValue.arrayRemove(banObj)
        });
        showToast("Removed from ban list");
    } catch (err) {
        console.error("Remove ban failed:", err);
        showToast("Removal failed.");
    }
}

// Spotify playback trigger
async function startSpotifyPlayback() {
    const devicePicker = document.getElementById('dj-device-picker');
    if (!devicePicker || !devicePicker.value) {
        showToast("Select a playback device first!");
        return;
    }
    
    const deviceId = devicePicker.value;
    showToast("Starting Spotify playback...");
    
    try {
        const res = await fetch('/.netlify/functions/spotify-start-playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partyId: currentPartyId, deviceId: deviceId })
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast("Music started successfully! 🎵");
        } else {
            showToast(`Playback fail: ${data.error || 'Unknown error'}`);
        }
    } catch (err) {
        console.error("Playback start request failed:", err);
        showToast("Network request failed.");
    }
}

// Load Spotify Devices on DJ Tab Open
async function refreshDevices() {
    const picker = document.getElementById('dj-device-picker');
    const banner = document.getElementById('spotify-status-banner');
    
    if (!picker || !banner) return;
    
    picker.innerHTML = '<option value="">Loading devices...</option>';
    banner.className = "spotify-device-status spotify-disconnected";
    banner.textContent = "Searching for active Spotify devices...";
    
    try {
        const res = await fetch('/.netlify/functions/spotify-devices');
        const data = await res.json();
        
        picker.innerHTML = '';
        
        if (!res.ok || !data.devices || data.devices.length === 0) {
            picker.innerHTML = '<option value="">No Active Devices Found</option>';
            banner.className = "spotify-device-status spotify-disconnected";
            banner.textContent = "No active Spotify device — open Spotify on the venue device and try again.";
            return;
        }
        
        let activeDevice = null;
        data.devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `${d.name} (${d.type})`;
            if (d.isActive) {
                opt.selected = true;
                activeDevice = d;
            }
            picker.appendChild(opt);
        });
        
        banner.className = "spotify-device-status spotify-connected";
        if (activeDevice) {
            banner.textContent = `Connected: Listening on ${activeDevice.name} (${activeDevice.type})`;
        } else {
            banner.textContent = `${data.devices.length} device(s) found. Select one and click Start Music.`;
        }
    } catch (err) {
        console.error("Devices fetch failed:", err);
        picker.innerHTML = '<option value="">Failed to load devices</option>';
        banner.className = "spotify-device-status spotify-disconnected";
        banner.textContent = "Error communicating with Spotify services.";
    }
}

// Config Tab Save
async function saveConfigChanges(event) {
    event.preventDefault();
    if (!currentPartyId) return;
    
    const p1 = document.getElementById('config-partner1-name').value;
    const p2 = document.getElementById('config-partner2-name').value;
    const hashtag = document.getElementById('config-wedding-hashtag').value;
    const date = document.getElementById('config-wedding-date').value;
    const cerTime = document.getElementById('config-ceremony-time').value;
    const cerVenue = document.getElementById('config-ceremony-venue').value;
    const recTime = document.getElementById('config-reception-time').value;
    const recVenue = document.getElementById('config-reception-venue').value;
    const welcome = document.getElementById('config-welcome-message').value;
    const website = document.getElementById('config-website-link').value;
    const registry = document.getElementById('config-registry-link').value;
    const dress = document.getElementById('config-dress-code').value;
    const bgCol = document.getElementById('config-bg-color').value;
    const txtCol = document.getElementById('config-text-color').value;
    const accCol = document.getElementById('config-accent-color').value;
    const mod = document.getElementById('config-moderation').value === 'true';
    
    try {
        await db.collection("parties").doc(currentPartyId).update({
            partner1Name: p1,
            partner2Name: p2,
            weddingHashtag: hashtag,
            weddingDate: date,
            ceremonyTime: cerTime,
            ceremonyVenue: cerVenue,
            receptionTime: recTime,
            receptionVenue: recVenue,
            welcomeMessage: welcome,
            websiteLink: website,
            registryLink: registry,
            dressCode: dress,
            colors: {
                bg: bgCol,
                text: txtCol,
                accent: accCol
            },
            moderationEnabled: mod
        });
        showToast("Settings Saved! 💾");
    } catch (err) {
        console.error("Config save failed:", err);
        showToast("Save failed.");
    }
}

// Gallery fetch & actions
async function refreshGallery() {
    const grid = document.getElementById('gallery-grid-container');
    const counter = document.getElementById('live-photos-count');
    
    if (!grid || !currentPartyId) return;
    
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#94a3b8;">Loading photos...</div>';
    
    try {
        const res = await fetch('/.netlify/functions/get-party-gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partyId: currentPartyId, status: 'all' })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        
        allPhotos = data.images || [];
        
        // Update Live Tab photo count
        if (counter) counter.textContent = allPhotos.length;
        
        renderGallery();
    } catch (err) {
        console.error("Gallery load failed:", err);
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#ef4444;">Failed to load photos: ${err.message}</div>`;
    }
}

function renderGallery() {
    const grid = document.getElementById('gallery-grid-container');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const filtered = allPhotos.filter(img => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'pending') return img.status === 'pending';
        if (activeFilter === 'approved') return img.status === 'approved';
        if (activeFilter === 'featured') return img.featured === true;
        return true;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#94a3b8; font-style:italic;">No photos in this filter segment.</div>';
        return;
    }
    
    filtered.forEach(img => {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        
        let statusBadge = '';
        if (img.featured) {
            statusBadge = '<span class="card-badge badge-featured">★ Featured</span>';
        } else if (img.status === 'pending') {
            statusBadge = '<span class="card-badge badge-pending">Pending</span>';
        } else {
            statusBadge = '<span class="card-badge badge-approved">Approved</span>';
        }
        
        card.innerHTML = `
            <div class="gallery-img-wrap">
                ${statusBadge}
                <img class="gallery-img" src="${img.thumbUrl}" alt="Photo" loading="lazy">
            </div>
            <div class="card-info">
                <div>
                    <div class="card-guest">${escapeHtml(img.guestName) || 'Anonymous Guest'}</div>
                    <div class="card-style">${escapeHtml(img.styleName) || 'Standard Style'}</div>
                    ${img.caption ? `<div class="card-caption">"${escapeHtml(img.caption)}"</div>` : ''}
                </div>
                <div class="card-actions">
                    ${img.status === 'pending' ? `<button class="btn-card btn-card-approve" onclick="moderatePhoto('${img.publicId}', 'approve')">Approve</button>` : ''}
                    <button class="btn-card btn-card-feature ${img.featured ? 'active' : ''}" onclick="moderatePhoto('${img.publicId}', '${img.featured ? 'unfeature' : 'feature'}')">
                        ${img.featured ? '★ Featured' : '☆ Feature'}
                    </button>
                    <button class="btn-card btn-card-delete" onclick="moderatePhoto('${img.publicId}', 'delete')">Delete</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function filterGallery(filterType) {
    activeFilter = filterType;
    
    // Toggle active pill styling
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(p => {
        const type = p.getAttribute('onclick').match(/'([^']+)'/)[1];
        p.classList.toggle('active', type === filterType);
    });
    
    renderGallery();
}

async function moderatePhoto(publicId, action) {
    if (!currentPartyId) return;
    
    if (action === 'delete') {
        if (!confirm("Are you sure you want to delete this photo forever? This cannot be undone.")) return;
    }
    
    showToast(`${action.charAt(0).toUpperCase() + action.slice(1)}ing photo...`);
    
    try {
        const res = await fetch('//.netlify/functions/moderate-party-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicId: publicId, partyId: currentPartyId, action: action })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showToast("Gallery updated!");
            
            // Local state updates to avoid full page refresh
            if (action === 'delete') {
                allPhotos = allPhotos.filter(img => img.publicId !== publicId);
            } else if (action === 'approve') {
                const img = allPhotos.find(img => img.publicId === publicId);
                if (img) img.status = 'approved';
            } else if (action === 'feature') {
                const img = allPhotos.find(img => img.publicId === publicId);
                if (img) img.featured = true;
            } else if (action === 'unfeature') {
                const img = allPhotos.find(img => img.publicId === publicId);
                if (img) img.featured = false;
            }
            
            renderGallery();
        } else {
            showToast(`Moderation failed: ${data.error || 'Unknown error'}`);
        }
    } catch (err) {
        console.error("Moderation request failed:", err);
        showToast("Moderation request failed.");
    }
}

// Download gallery as ZIP
async function downloadGalleryZip() {
    // Choose what images to download based on the current filter
    let targets = [];
    if (activeFilter === 'featured') {
        targets = allPhotos.filter(img => img.featured === true);
    } else {
        targets = allPhotos.filter(img => img.status === 'approved');
    }
    
    if (targets.length === 0) {
        showToast("No approved images to download.");
        return;
    }
    
    showToast(`Preparing ZIP with ${targets.length} photo(s)...`);
    
    try {
        const zip = new JSZip();
        const imgFolder = zip.folder("groovepop-wedding-photos");
        
        const downloadPromises = targets.map(async (img, idx) => {
            try {
                const response = await fetch(img.url);
                const blob = await response.blob();
                
                // Formulate filename: GuestName_StyleName_Index.jpg
                const cleanGuest = (img.guestName || 'Guest').replace(/[^a-zA-Z0-9]/g, '');
                const cleanStyle = (img.styleName || 'Style').replace(/[^a-zA-Z0-9]/g, '');
                const filename = `${cleanGuest}_${cleanStyle}_${idx + 1}.jpg`;
                
                imgFolder.file(filename, blob);
            } catch (err) {
                console.error(`Failed to download image ${img.url}:`, err);
            }
        });
        
        await Promise.all(downloadPromises);
        
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `wedding_photos_${currentPartyId || 'gallery'}.zip`);
        showToast("Download started!");
    } catch (err) {
        console.error("Zip generation failed:", err);
        showToast("Zip generation failed.");
    }
}

// UI Tabs Swapping
function switchTab(tabId) {
    const tabs = document.querySelectorAll('.admin-tab');
    const contents = document.querySelectorAll('.admin-tab-content');
    
    tabs.forEach(t => {
        const tid = t.getAttribute('onclick').match(/'([^']+)'/)[1];
        t.classList.toggle('active', tid === tabId);
    });
    
    contents.forEach(c => {
        c.classList.toggle('active', c.id === `tab-${tabId}`);
    });
    
    if (tabId === 'dj') {
        refreshDevices();
    } else if (tabId === 'gallery') {
        refreshGallery();
    } else if (tabId === 'live') {
        // Refresh usage count
        const counter = document.getElementById('live-photos-count');
        if (counter) counter.textContent = allPhotos.length;
    }
}

// Utility Helpers
function extractSpotifyPlaylistId(input) {
    if (!input || !input.trim()) return '';
    const trimmed = input.trim();

    const urlMatch = trimmed.match(/playlist[/:]([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];

    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;

    return trimmed;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
