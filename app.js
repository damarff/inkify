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
    try {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    } catch (e) {
        // Fallback for Kindle: Math.random
        var result = '', possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < length; i++) result += possible.charAt(Math.floor(Math.random() * possible.length));
        return result;
    }
}

async function sha256(plain) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        var encoder = new TextEncoder();
        var data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    }
    // Fallback for Kindle/old browsers: pure JS SHA-256
    return Promise.resolve(sha256JS(plain));
}

function sha256JS(s) {
    var chrsz = 8, hexcase = 0;
    function safe_add(x, y) { var lsw = (x & 0xFFFF) + (y & 0xFFFF); return (x >> 16) + (y >> 16) + (lsw >> 16) << 16 | lsw & 0xFFFF; }
    function S(X, n) { return X >>> n | X << (32 - n); }
    function R(X, n) { return X >>> n; }
    function Ch(x, y, z) { return x & y ^ ~x & z; }
    function Maj(x, y, z) { return x & y ^ x & z ^ y & z; }
    function Sigma0256(x) { return S(x, 2) ^ S(x, 13) ^ S(x, 22); }
    function Sigma1256(x) { return S(x, 6) ^ S(x, 11) ^ S(x, 25); }
    function Gamma0256(x) { return S(x, 7) ^ S(x, 18) ^ R(x, 3); }
    function Gamma1256(x) { return S(x, 17) ^ S(x, 19) ^ R(x, 10); }
    function core_sha256(m, l) {
        var K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
        var HASH = [1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
        var W = new Array(64), a, b, c, d, e, f, g, h, i, j, T1, T2;
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[(l + 64 >> 9 << 4) + 15] = l;
        for (i = 0; i < m.length; i += 16) {
            a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3];
            e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
            for (j = 0; j < 64; j++) {
                if (j < 16) W[j] = m[j + i]; else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
                T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
                T2 = safe_add(Sigma0256(a), Maj(a, b, c));
                h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
            }
            HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
            HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
        }
        return HASH;
    }
    function str2binb(str) {
        var bin = [], mask = (1 << chrsz) - 1, i;
        for (i = 0; i < str.length * chrsz; i += chrsz) bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
        return bin;
    }
    function binb2bytes(binarray) {
        var bytes = [], i;
        for (i = 0; i < binarray.length * 4; i++) bytes.push(binarray[i >> 2] >> (3 - i % 4) * 8 & 0xFF);
        return new Uint8Array(bytes);
    }
    return binb2bytes(core_sha256(str2binb(s), s.length * chrsz));
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

function handleConnect() {
    redirectToSpotifyAuth();
}
loginBtn.addEventListener('click', handleConnect);
loginBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handleConnect();
});

function handleLogout() {
    clearTokens();
    showLogin();
}
logoutBtn.addEventListener('click', handleLogout);
logoutBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handleLogout();
});

themeBtn.addEventListener('click', toggleTheme);
themeBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    toggleTheme();
});

fullscreenBtn.addEventListener('click', toggleFullscreen);
fullscreenBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    toggleFullscreen();
});

document.addEventListener('fullscreenchange', updateFullscreenIcon);

async function handlePlayPause() {
    setControlsLoading(true);
    try {
        const state = await getPlaybackState();
        if (state?.is_playing) {
            await pausePlayback();
        } else {
            await resumePlayback();
        }
        await pollPlaybackState();
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
}
playPauseBtn.addEventListener('click', handlePlayPause);
playPauseBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handlePlayPause();
});

async function handlePrev() {
    setControlsLoading(true);
    try {
        await skipToPrevious();
        setTimeout(pollPlaybackState, 300);
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
}
prevBtn.addEventListener('click', handlePrev);
prevBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handlePrev();
});

async function handleNext() {
    setControlsLoading(true);
    try {
        await skipToNext();
        setTimeout(pollPlaybackState, 300);
    } catch (error) {
        showError(error.message);
    } finally {
        setControlsLoading(false);
    }
}
nextBtn.addEventListener('click', handleNext);
nextBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handleNext();
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
