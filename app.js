// Inkify - Spotify Remote Control App

// ============================================
// CONFIGURATION
// ============================================

// You need to create a Spotify App at https://developer.spotify.com/dashboard
// and set these values:
const CLIENT_ID = '2ef0cd4d7b11458f921b55b83649949c';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing'
].join(' ');

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const POLLING_INTERVAL = 1500; // ms

// ============================================
// STATE
// ============================================

let accessToken = null;
let pollingTimer = null;
let currentTrackId = null;

// ============================================
// DOM ELEMENTS
// ============================================

const loginScreen = document.getElementById('login-screen');
const playerScreen = document.getElementById('player-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const albumArt = document.getElementById('album-art');
const noPlayback = document.getElementById('no-playback');
const trackName = document.getElementById('track-name');
const artistName = document.getElementById('artist-name');
const albumName = document.getElementById('album-name');
const currentTime = document.getElementById('current-time');
const totalTime = document.getElementById('total-time');
const progressFill = document.getElementById('progress-fill');
const prevBtn = document.getElementById('prev-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const nextBtn = document.getElementById('next-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const deviceName = document.getElementById('device-name');
const errorToast = document.getElementById('error-toast');
const errorMessage = document.getElementById('error-message');
const themeBtn = document.getElementById('theme-btn');
const moonIcon = document.getElementById('moon-icon');
const sunIcon = document.getElementById('sun-icon');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const expandIcon = document.getElementById('expand-icon');
const compressIcon = document.getElementById('compress-icon');

// ============================================
// SPOTIFY AUTH (PKCE Flow)
// ============================================

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function generateCodeChallenge(codeVerifier) {
    const hashed = await sha256(codeVerifier);
    return base64encode(hashed);
}

async function redirectToSpotifyAuth() {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store verifier for token exchange
    localStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        scope: SCOPES
    });

    window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
    const codeVerifier = localStorage.getItem('code_verifier');

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        })
    });

    if (!response.ok) {
        throw new Error('Failed to exchange code for token');
    }

    const data = await response.json();
    return data;
}

async function refreshAccessToken(refreshToken) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    if (!response.ok) {
        throw new Error('Failed to refresh token');
    }

    return await response.json();
}

function saveTokens(tokenData) {
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    localStorage.setItem('access_token', tokenData.access_token);
    localStorage.setItem('refresh_token', tokenData.refresh_token || localStorage.getItem('refresh_token'));
    localStorage.setItem('token_expires_at', expiresAt.toString());
}

function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('code_verifier');
}

async function getValidAccessToken() {
    const token = localStorage.getItem('access_token');
    const expiresAt = parseInt(localStorage.getItem('token_expires_at') || '0');
    const refreshToken = localStorage.getItem('refresh_token');

    if (!token) return null;

    // Check if token expires in less than 5 minutes
    if (Date.now() > expiresAt - 300000) {
        if (refreshToken) {
            try {
                const tokenData = await refreshAccessToken(refreshToken);
                saveTokens(tokenData);
                return tokenData.access_token;
            } catch (e) {
                console.error('Failed to refresh token:', e);
                clearTokens();
                return null;
            }
        }
        return null;
    }

    return token;
}

// ============================================
// SPOTIFY API CALLS
// ============================================

async function spotifyFetch(endpoint, options = {}) {
    const token = await getValidAccessToken();
    if (!token) {
        throw new Error('No valid access token');
    }

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    if (response.status === 401) {
        clearTokens();
        showLogin();
        throw new Error('Token expired');
    }

    return response;
}

async function getPlaybackState() {
    const response = await spotifyFetch('/me/player/currently-playing');

    if (response.status === 204) {
        return null; // No active playback
    }

    if (!response.ok) {
        throw new Error('Failed to get playback state');
    }

    return await response.json();
}

async function pausePlayback() {
    const response = await spotifyFetch('/me/player/pause', { method: 'PUT' });
    if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Failed to pause');
    }
}

async function resumePlayback() {
    const response = await spotifyFetch('/me/player/play', { method: 'PUT' });
    if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Failed to play');
    }
}

async function skipToNext() {
    const response = await spotifyFetch('/me/player/next', { method: 'POST' });
    if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Failed to skip');
    }
}

async function skipToPrevious() {
    const response = await spotifyFetch('/me/player/previous', { method: 'POST' });
    if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Failed to go back');
    }
}

// ============================================
// UI UPDATES
// ============================================

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updatePlayerUI(playbackState) {
    if (!playbackState || !playbackState.item) {
        // No active playback
        albumArt.classList.add('hidden');
        noPlayback.classList.remove('hidden');
        trackName.textContent = '---';
        artistName.textContent = '---';
        albumName.textContent = '---';
        currentTime.textContent = '0:00';
        totalTime.textContent = '0:00';
        progressFill.style.width = '0%';
        deviceName.textContent = '---';
        showPlayIcon();
        currentTrackId = null;
        return;
    }

    const track = playbackState.item;

    // Update album art
    albumArt.classList.remove('hidden');
    noPlayback.classList.add('hidden');

    const imageUrl = track.album?.images?.[0]?.url;
    if (imageUrl && albumArt.src !== imageUrl) {
        albumArt.src = imageUrl;
    }

    // Update track info
    trackName.textContent = track.name || '---';
    artistName.textContent = track.artists?.map(a => a.name).join(', ') || '---';
    albumName.textContent = track.album?.name || '---';

    // Update progress
    const progress = playbackState.progress_ms || 0;
    const duration = track.duration_ms || 0;
    currentTime.textContent = formatTime(progress);
    totalTime.textContent = formatTime(duration);
    progressFill.style.width = duration > 0 ? `${(progress / duration) * 100}%` : '0%';

    // Update play/pause icon
    if (playbackState.is_playing) {
        showPauseIcon();
    } else {
        showPlayIcon();
    }

    // Update device info
    deviceName.textContent = playbackState.device?.name || '---';

    // Track current track ID
    currentTrackId = track.id;
}

function showPlayIcon() {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
}

function showPauseIcon() {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    playerScreen.classList.add('hidden');
    stopPolling();
}

function showPlayer() {
    loginScreen.classList.add('hidden');
    playerScreen.classList.remove('hidden');
    startPolling();
}

function showError(message) {
    errorMessage.textContent = message;
    errorToast.classList.remove('hidden');

    setTimeout(() => {
        errorToast.classList.add('hidden');
    }, 3000);
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Update icon
    if (newTheme === 'dark') {
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    } else {
        moonIcon.classList.remove('hidden');
        sunIcon.classList.add('hidden');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (savedTheme === 'dark') {
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            showError('Fullscreen not supported');
        });
    } else {
        document.exitFullscreen();
    }
}

function updateFullscreenIcon() {
    if (document.fullscreenElement) {
        expandIcon.classList.add('hidden');
        compressIcon.classList.remove('hidden');
    } else {
        expandIcon.classList.remove('hidden');
        compressIcon.classList.add('hidden');
    }
}

function setControlsLoading(loading) {
    const controls = [prevBtn, playPauseBtn, nextBtn];
    controls.forEach(btn => {
        btn.disabled = loading;
        if (loading) {
            btn.classList.add('loading');
        } else {
            btn.classList.remove('loading');
        }
    });
}

// ============================================
// POLLING
// ============================================

async function pollPlaybackState() {
    try {
        const state = await getPlaybackState();
        updatePlayerUI(state);
    } catch (error) {
        if (error.message !== 'Token expired') {
            console.error('Polling error:', error);
        }
    }
}

function startPolling() {
    // Initial fetch
    pollPlaybackState();

    // Start interval
    pollingTimer = setInterval(pollPlaybackState, POLLING_INTERVAL);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

loginBtn.addEventListener('click', () => {
    redirectToSpotifyAuth();
});

logoutBtn.addEventListener('click', () => {
    clearTokens();
    showLogin();
});

themeBtn.addEventListener('click', toggleTheme);

fullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', updateFullscreenIcon);

playPauseBtn.addEventListener('click', async () => {
    setControlsLoading(true);
    try {
        const state = await getPlaybackState();
        if (state?.is_playing) {
            await pausePlayback();
        } else {
            await resumePlayback();
        }
        // Fetch updated state
        await pollPlaybackState();
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
});

prevBtn.addEventListener('click', async () => {
    setControlsLoading(true);
    try {
        await skipToPrevious();
        // Small delay for Spotify to update
        setTimeout(pollPlaybackState, 300);
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
});

nextBtn.addEventListener('click', async () => {
    setControlsLoading(true);
    try {
        await skipToNext();
        // Small delay for Spotify to update
        setTimeout(pollPlaybackState, 300);
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    // Load saved theme
    loadTheme();

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        showError('Authorization denied');
        showLogin();
        // Clean URL
        window.history.replaceState({}, document.title, REDIRECT_URI);
        return;
    }

    if (code) {
        try {
            const tokenData = await exchangeCodeForToken(code);
            saveTokens(tokenData);
            // Clean URL
            window.history.replaceState({}, document.title, REDIRECT_URI);
        } catch (e) {
            console.error('Token exchange failed:', e);
            showError('Authentication failed');
            showLogin();
            return;
        }
    }

    // Check for existing token
    const token = await getValidAccessToken();
    if (token) {
        accessToken = token;
        showPlayer();
    } else {
        showLogin();
    }
}

// Start the app
init();
