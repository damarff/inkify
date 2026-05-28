// Inkify - Spotify Remote Control (ES5 Kindle Compatible)
// ============================================
// CONFIGURATION
// ============================================

var CLIENT_ID = '2ef0cd4d7b11458f921b55b83649949c';
var REDIRECT_URI = window.location.origin + window.location.pathname;
var SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing'
].join(' ');

var SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
var SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
var POLLING_INTERVAL = 1500;

// ============================================
// POLYFILL: fetch + Promise for old browsers
// ============================================

// Minimal Promise polyfill (subset)
if (typeof Promise === 'undefined') {
    window.Promise = function(executor) {
        this._callbacks = [];
        var self = this;
        function resolve(value) { self._value = value; self._resolved = true; self._callbacks.forEach(function(cb) { cb(value); }); }
        executor(resolve, function() {});
    };
    Promise.prototype.then = function(onFulfilled) {
        if (this._resolved) onFulfilled(this._value);
        else this._callbacks.push(onFulfilled);
        return this;
    };
    Promise.resolve = function(v) { return new Promise(function(r) { r(v); }); };
}

// Minimal fetch polyfill (subset)
if (typeof fetch === 'undefined') {
    window.fetch = function(url, opts) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            opts = opts || {};
            xhr.open((opts.method || 'GET'), url, true);
            if (opts.headers) {
                for (var k in opts.headers) {
                    if (opts.headers.hasOwnProperty(k)) xhr.setRequestHeader(k, opts.headers[k]);
                }
            }
            xhr.onload = function() {
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: function() { return new Promise(function(r) { r(JSON.parse(xhr.responseText)); }); }, text: function() { return new Promise(function(r) { r(xhr.responseText); }); } });
            };
            xhr.onerror = function() { reject(new Error('Network error')); };
            if (opts.body) xhr.send(opts.body);
            else xhr.send();
        });
    };
}

// ============================================
// DOM ELEMENTS
// ============================================

function getEl(id) { return document.getElementById(id); }

var loginScreen = getEl('login-screen');
var playerScreen = getEl('player-screen');
var manualScreen = getEl('manual-screen');
var codeDisplayScreen = getEl('code-display-screen');
var loginBtn = getEl('login-btn');
var manualUrl = getEl('manual-url');
var manualCode = getEl('manual-code');
var manualConnectBtn = getEl('manual-connect-btn');
var authCodeDisplay = getEl('auth-code-display');
var logoutBtn = getEl('logout-btn');
var albumArt = getEl('album-art');
var noPlayback = getEl('no-playback');
var trackName = getEl('track-name');
var artistName = getEl('artist-name');
var albumName = getEl('album-name');
var currentTime = getEl('current-time');
var totalTime = getEl('total-time');
var progressFill = getEl('progress-fill');
var prevBtn = getEl('prev-btn');
var playPauseBtn = getEl('play-pause-btn');
var nextBtn = getEl('next-btn');
var playIcon = getEl('play-icon');
var pauseIcon = getEl('pause-icon');
var deviceName = getEl('device-name');
var errorToast = getEl('error-toast');
var errorMessage = getEl('error-message');
var themeBtn = getEl('theme-btn');
var moonIcon = getEl('moon-icon');
var sunIcon = getEl('sun-icon');
var fullscreenBtn = getEl('fullscreen-btn');
var expandIcon = getEl('expand-icon');
var compressIcon = getEl('compress-icon');

// ============================================
// STATE
// ============================================

var accessToken = null;
var pollingTimer = null;
var currentTrackId = null;
var manualAuthUrl = '';  // Pre-computed manual auth URL

// ============================================
// SPOTIFY AUTH (PKCE with pure JS SHA-256)
// ============================================

// Pure JS SHA-256 for Kindle (no Web Crypto needed)
function sha256(s) {
    var chrsz = 8;
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
        return bytes;
    }
    return binb2bytes(core_sha256(str2binb(s), s.length * chrsz));
}

function base64url(input) {
    var str = '';
    for (var i = 0; i < input.length; i++) {
        str += String.fromCharCode(input[i]);
    }
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateRandomString(length) {
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return result;
}

function handleConnect() {
    var codeVerifier = generateRandomString(64);
    var codeChallenge = base64url(sha256(codeVerifier));

    try { localStorage.setItem('code_verifier', codeVerifier); } catch(e) {}

    var params = [
        'client_id=' + encodeURIComponent(CLIENT_ID),
        'response_type=code',
        'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
        'code_challenge_method=S256',
        'code_challenge=' + encodeURIComponent(codeChallenge),
        'scope=' + encodeURIComponent(SCOPES)
    ];

    window.location.href = SPOTIFY_AUTH_URL + '?' + params.join('&');
}

function exchangeCodeForToken(code, callback) {
    var codeVerifier = '';
    try { codeVerifier = localStorage.getItem('code_verifier') || ''; } catch(e) {}

    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://accounts.spotify.com/api/token', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var data = JSON.parse(xhr.responseText);
                if (callback) callback(null, data);
            } catch(e) {
                if (callback) callback(e);
            }
        } else {
            if (callback) callback(new Error('Token exchange failed: ' + xhr.status));
        }
    };

    xhr.onerror = function() {
        if (callback) callback(new Error('Network error'));
    };

    var body = [
        'client_id=' + encodeURIComponent(CLIENT_ID),
        'grant_type=authorization_code',
        'code=' + encodeURIComponent(code),
        'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
        'code_verifier=' + encodeURIComponent(codeVerifier)
    ];

    xhr.send(body.join('&'));
}

function saveTokens(tokenData) {
    var expiresAt = Date.now() + ((tokenData.expires_in || 3600) * 1000);
    try {
        localStorage.setItem('access_token', tokenData.access_token);
        if (tokenData.refresh_token) localStorage.setItem('refresh_token', tokenData.refresh_token);
        localStorage.setItem('token_expires_at', expiresAt.toString());
    } catch(e) {}
}

function clearTokens() {
    try {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('token_expires_at');
        localStorage.removeItem('code_verifier');
    } catch(e) {}
}

function getSavedToken() {
    var token = '', expiresAt = 0, refreshToken = '';
    try {
        token = localStorage.getItem('access_token') || '';
        expiresAt = parseInt(localStorage.getItem('token_expires_at') || '0');
        refreshToken = localStorage.getItem('refresh_token') || '';
    } catch(e) {}

    if (!token) return null;

    // Check if expired (within 5 min)
    if (token && Date.now() > expiresAt - 300000) {
        if (refreshToken) {
            // Try to refresh via sync XHR (simplified for Kindle)
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://accounts.spotify.com/api/token', false); // sync
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            var body = [
                'client_id=' + encodeURIComponent(CLIENT_ID),
                'grant_type=refresh_token',
                'refresh_token=' + encodeURIComponent(refreshToken)
            ];
            xhr.send(body.join('&'));
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var refreshed = JSON.parse(xhr.responseText);
                    saveTokens(refreshed);
                    return refreshed.access_token;
                } catch(e) {}
            }
            clearTokens();
            return null;
        }
        clearTokens();
        return null;
    }
    return token;
}

// ============================================
// SPOTIFY API CALLS (XMLHttpRequest based)
// ============================================

function spotifyApi(endpoint, method, body, callback) {
    var token = getSavedToken();
    if (!token) {
        showLogin();
        if (callback) callback(new Error('No token'));
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open(method || 'GET', SPOTIFY_API_BASE + endpoint, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function() {
        var resp = { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText };

        if (xhr.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('token_expires_at');
            showLogin();
            if (callback) callback(new Error('Token expired'));
            return;
        }

        if (callback) callback(null, resp);
    };

    xhr.onerror = function() {
        if (callback) callback(new Error('Network error'));
    };

    if (body) xhr.send(JSON.stringify(body));
    else xhr.send();
}

function getPlaybackState(callback) {
    spotifyApi('/me/player/currently-playing', 'GET', null, function(err, resp) {
        if (err) { if (callback) callback(err); return; }
        if (resp.status === 204) { if (callback) callback(null, null); return; }
        if (!resp.ok) { if (callback) callback(new Error('Failed to get state')); return; }
        try { var data = JSON.parse(resp.body); if (callback) callback(null, data); }
        catch (e) { if (callback) callback(e); }
    });
}

function spotifyAction(endpoint, method, callback) {
    spotifyApi(endpoint, method || 'PUT', null, function(err, resp) {
        if (err) { if (callback) callback(err); return; }
        if (!resp.ok && resp.status !== 204) { if (callback) callback(new Error('Action failed')); return; }
        if (callback) callback(null);
    });
}

// ============================================
// UI UPDATES
// ============================================

function formatTime(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    if (seconds < 10) seconds = '0' + seconds;
    return minutes + ':' + seconds;
}

function updatePlayerUI(state) {
    if (!state || !state.item) {
        albumArt.className = albumArt.className.indexOf('hidden') >= 0 ? albumArt.className : (albumArt.className + ' hidden');
        noPlayback.className = noPlayback.className.replace(/hidden/g, '');
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

    var track = state.item;

    // Show/hide album art
    albumArt.className = albumArt.className.replace(/hidden/g, '');
    noPlayback.className = noPlayback.className.indexOf('hidden') >= 0 ? noPlayback.className : (noPlayback.className + ' hidden');

    // Album art URL
    var images = track.album ? track.album.images : null;
    if (images && images.length > 0 && images[0].url) {
        if (albumArt.src !== images[0].url) albumArt.src = images[0].url;
    }

    // Track info
    trackName.textContent = track.name || '---';

    var artists = track.artists || [];
    var artistNames = [];
    for (var i = 0; i < artists.length; i++) {
        artistNames.push(artists[i].name);
    }
    artistName.textContent = artistNames.join(', ') || '---';

    albumName.textContent = (track.album && track.album.name) || '---';

    // Progress
    var progress = state.progress_ms || 0;
    var duration = track.duration_ms || 0;
    currentTime.textContent = formatTime(progress);
    totalTime.textContent = formatTime(duration);
    progressFill.style.width = duration > 0 ? ((progress / duration) * 100) + '%' : '0%';

    // Play/pause icon
    if (state.is_playing) showPauseIcon();
    else showPlayIcon();

    // Device name
    deviceName.textContent = (state.device && state.device.name) || '---';

    currentTrackId = track.id;
}

function showPlayIcon() {
    playIcon.className = playIcon.className.replace(/hidden/g, '');
    pauseIcon.className = pauseIcon.className.indexOf('hidden') >= 0 ? pauseIcon.className : (pauseIcon.className + ' hidden');
}

function showPauseIcon() {
    playIcon.className = playIcon.className.indexOf('hidden') >= 0 ? playIcon.className : (playIcon.className + ' hidden');
    pauseIcon.className = pauseIcon.className.replace(/hidden/g, '');
}

function showLogin() {
    loginScreen.className = loginScreen.className.replace(/hidden/g, '');
    playerScreen.className = playerScreen.className.indexOf('hidden') >= 0 ? playerScreen.className : (playerScreen.className + ' hidden');
    manualScreen.className = manualScreen.className.indexOf('hidden') >= 0 ? manualScreen.className : (manualScreen.className + ' hidden');
    codeDisplayScreen.className = codeDisplayScreen.className.indexOf('hidden') >= 0 ? codeDisplayScreen.className : (codeDisplayScreen.className + ' hidden');
    stopPolling();
}

function showPlayer() {
    loginScreen.className = loginScreen.className.indexOf('hidden') >= 0 ? loginScreen.className : (loginScreen.className + ' hidden');
    manualScreen.className = manualScreen.className.indexOf('hidden') >= 0 ? manualScreen.className : (manualScreen.className + ' hidden');
    codeDisplayScreen.className = codeDisplayScreen.className.indexOf('hidden') >= 0 ? codeDisplayScreen.className : (codeDisplayScreen.className + ' hidden');
    playerScreen.className = playerScreen.className.replace(/hidden/g, '');
    startPolling();
}

function showManualAuth() {
    // Use pre-computed URL from init()
    manualUrl.textContent = manualAuthUrl;
    manualCode.value = '';

    loginScreen.className = loginScreen.className.indexOf('hidden') >= 0 ? loginScreen.className : (loginScreen.className + ' hidden');
    manualScreen.className = manualScreen.className.replace(/hidden/g, '');
    codeDisplayScreen.className = codeDisplayScreen.className.indexOf('hidden') >= 0 ? codeDisplayScreen.className : (codeDisplayScreen.className + ' hidden');
    playerScreen.className = playerScreen.className.indexOf('hidden') >= 0 ? playerScreen.className : (playerScreen.className + ' hidden');
}

function regenerateManualAuth() {
    // Generate fresh PKCE and update the displayed URL
    var codeVerifier = generateRandomString(64);
    var codeChallenge = base64url(sha256(codeVerifier));
    try { localStorage.setItem('code_verifier', codeVerifier); } catch(e) {}

    var params = [
        'client_id=' + encodeURIComponent(CLIENT_ID),
        'response_type=code',
        'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
        'code_challenge_method=S256',
        'code_challenge=' + encodeURIComponent(codeChallenge),
        'scope=' + encodeURIComponent(SCOPES)
    ];

    manualAuthUrl = SPOTIFY_AUTH_URL + '?' + params.join('&');

    // If manual screen is visible, update the URL text
    if (manualScreen.className.indexOf('hidden') < 0) {
        manualUrl.textContent = manualAuthUrl;
    }
}

function showManualCode(code) {
    authCodeDisplay.textContent = code;

    loginScreen.className = loginScreen.className.indexOf('hidden') >= 0 ? loginScreen.className : (loginScreen.className + ' hidden');
    manualScreen.className = manualScreen.className.indexOf('hidden') >= 0 ? manualScreen.className : (manualScreen.className + ' hidden');
    codeDisplayScreen.className = codeDisplayScreen.className.replace(/hidden/g, '');
    playerScreen.className = playerScreen.className.indexOf('hidden') >= 0 ? playerScreen.className : (playerScreen.className + ' hidden');
}

function handleManualConnect() {
    var code = manualCode.value ? manualCode.value.trim() : '';
    if (!code) {
        showError('Paste the code from your phone first');
        return;
    }

    showError('Connecting...');
    exchangeCodeForToken(code, function(err, tokenData) {
        if (err) {
            showError('Failed: ' + err.message);
            return;
        }
        saveTokens(tokenData);
        try { localStorage.removeItem('code_verifier'); } catch(e) {}
        showPlayer();
    });
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorToast.className = errorToast.className.replace(/hidden/g, '');
    setTimeout(function() {
        errorToast.className = errorToast.className.indexOf('hidden') >= 0 ? errorToast.className : (errorToast.className + ' hidden');
    }, 3000);
}

function toggleTheme() {
    var isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
    var newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('theme', newTheme); } catch(e) {}

    if (newTheme === 'dark') {
        moonIcon.className = moonIcon.className.indexOf('hidden') >= 0 ? moonIcon.className : (moonIcon.className + ' hidden');
        sunIcon.className = sunIcon.className.replace(/hidden/g, '');
    } else {
        moonIcon.className = moonIcon.className.replace(/hidden/g, '');
        sunIcon.className = sunIcon.className.indexOf('hidden') >= 0 ? sunIcon.className : (sunIcon.className + ' hidden');
    }
}

function loadTheme() {
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('theme') || 'light'; } catch(e) {}
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (savedTheme === 'dark') {
        moonIcon.className = moonIcon.className.indexOf('hidden') >= 0 ? moonIcon.className : (moonIcon.className + ' hidden');
        sunIcon.className = sunIcon.className.replace(/hidden/g, '');
    }
}

function setControlsLoading(loading) {
    var controls = [prevBtn, playPauseBtn, nextBtn];
    for (var i = 0; i < controls.length; i++) {
        controls[i].disabled = loading;
        var classStr = controls[i].className;
        if (loading) {
            if (classStr.indexOf('loading') < 0) controls[i].className = classStr + ' loading';
        } else {
            controls[i].className = classStr.replace(/loading/g, '');
        }
    }
}

// ============================================
// POLLING
// ============================================

function pollPlaybackState() {
    getPlaybackState(function(err, state) {
        if (err) return;
        updatePlayerUI(state);
    });
}

function startPolling() {
    pollPlaybackState();
    pollingTimer = setInterval(pollPlaybackState, POLLING_INTERVAL);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
}

// ============================================
// ACTIONS
// ============================================

function handleLogout() {
    try {
        localStorage.removeItem('access_token');
        localStorage.removeItem('token_expires_at');
    } catch(e) {}
    accessToken = null;
    showLogin();
}

function handlePlayPause() {
    setControlsLoading(true);
    getPlaybackState(function(err, state) {
        if (err) { setControlsLoading(false); return; }
        var isPlaying = state && state.is_playing;
        var endpoint = isPlaying ? '/me/player/pause' : '/me/player/play';
        var method = isPlaying ? 'PUT' : 'PUT';

        spotifyApi(endpoint, method, null, function(err2, resp) {
            setControlsLoading(false);
            if (err2) return;
            // Refresh state after action
            setTimeout(pollPlaybackState, 300);
        });
    });
}

function handlePrev() {
    setControlsLoading(true);
    spotifyAction('/me/player/previous', 'POST', function(err) {
        setControlsLoading(false);
        if (!err) setTimeout(pollPlaybackState, 300);
    });
}

function handleNext() {
    setControlsLoading(true);
    spotifyAction('/me/player/next', 'POST', function(err) {
        setControlsLoading(false);
        if (!err) setTimeout(pollPlaybackState, 300);
    });
}

// ============================================
// EVENT BINDING (click + touchstart for Kindle e-ink)
// ============================================

function bindClick(el, handler) {
    if (!el) return;
    el.onclick = handler;
    // Kindle e-ink browser sometimes doesn't fire click on touch
    try { el.addEventListener('touchstart', function(e) { handler(e); }, {passive: true}); } catch(e) {}
}

function bindButtons() {
    bindClick(loginBtn, handleConnect);
    bindClick(logoutBtn, handleLogout);
    bindClick(themeBtn, toggleTheme);
    bindClick(playPauseBtn, handlePlayPause);
    bindClick(prevBtn, handlePrev);
    bindClick(nextBtn, handleNext);

    // Manual auth buttons (no JS variable, use getElementById)
    var manualBtn = getEl('manual-btn');
    bindClick(manualBtn, showManualAuth);

    var manualConnBtn = getEl('manual-connect-btn');
    bindClick(manualConnBtn, handleManualConnect);

    var regenerateBtn = getEl('regenerate-btn');
    bindClick(regenerateBtn, regenerateManualAuth);

    var backFromManualBtn = getEl('back-from-manual-btn');
    bindClick(backFromManualBtn, showLogin);

    var doneBtn = getEl('done-btn');
    bindClick(doneBtn, showLogin);

    // Fullscreen
    if (fullscreenBtn) {
        bindClick(fullscreenBtn, function() {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            }
        });
    }
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    loadTheme();

    // Bind all buttons (click + touchstart for Kindle)
    bindButtons();

    // Pre-compute PKCE for manual auth (moves SHA-256 to page load)
    regenerateManualAuth();

    // Check for OAuth callback (?code=...)
    var urlParams = {};
    var search = window.location.search.substring(1);
    if (search) {
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var kv = pairs[i].split('=');
            if (kv.length === 2) urlParams[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        }
    }

    if (urlParams.code) {
        // Check if we have the code_verifier (Kindle) or not (phone relay)
        var codeVerifier = '';
        try { codeVerifier = localStorage.getItem('code_verifier') || ''; } catch(e) {}

        if (codeVerifier) {
            // Kindle: we generated the PKCE, do the exchange
            showError('Authenticating...');
            exchangeCodeForToken(urlParams.code, function(err, tokenData) {
                if (err) {
                    showError('Auth failed: ' + err.message);
                    showLogin();
                    return;
                }
                saveTokens(tokenData);
                try { localStorage.removeItem('code_verifier'); } catch(e) {}
                try { window.history.replaceState({}, document.title, REDIRECT_URI); } catch(e) {}
                showPlayer();
            });
        } else {
            // Phone: just relay — show the code for user to copy to Kindle
            try { window.history.replaceState({}, document.title, REDIRECT_URI); } catch(e) {}
            showManualCode(urlParams.code);
        }
        return;
    }

    // Check for existing token
    var saved = getSavedToken();
    if (saved) {
        accessToken = saved;
        showPlayer();
    } else {
        showLogin();
    }
}

// Start
init();
