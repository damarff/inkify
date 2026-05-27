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
var loginBtn = getEl('login-btn');
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

// ============================================
// SPOTIFY AUTH (Implicit Grant - no PKCE needed)
// ============================================

function buildAuthUrl() {
    var params = [
        'client_id=' + encodeURIComponent(CLIENT_ID),
        'response_type=token',
        'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
        'scope=' + encodeURIComponent(SCOPES)
    ];
    return SPOTIFY_AUTH_URL + '?' + params.join('&');
}

function saveTokenFromHash() {
    var hash = window.location.hash.substring(1);
    if (!hash) return false;

    var params = {};
    var pairs = hash.split('&');
    for (var i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split('=');
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    }

    if (params.access_token) {
        var expiresAt = Date.now() + (parseInt(params.expires_in || '3600') * 1000);
        localStorage.setItem('access_token', params.access_token);
        localStorage.setItem('token_expires_at', expiresAt.toString());
        // Also try to save the token in a way that survives navigation
        // (Implicit Grant doesn't give refresh_token)
        accessToken = params.access_token;
        window.location.hash = '';
        return true;
    }
    return false;
}

function getSavedToken() {
    var token = localStorage.getItem('access_token');
    var expiresAt = parseInt(localStorage.getItem('token_expires_at') || '0');
    if (token && Date.now() < expiresAt) {
        return token;
    }
    // Token expired, clear it
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_expires_at');
    return null;
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

function safeGet(obj, path) {
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
        if (!current || typeof current !== 'object') return undefined;
        // Handle array index in path like images[0]
        var match = parts[i].match(/^(\w+)\[(\d+)\]$/);
        if (match) {
            current = current[match[1]];
            if (!current || !current[parseInt(match[2])]) return undefined;
            current = current[parseInt(match[2])];
        } else {
            current = current[parts[i]];
        }
    }
    return current;
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
    stopPolling();
}

function showPlayer() {
    loginScreen.className = loginScreen.className.indexOf('hidden') >= 0 ? loginScreen.className : (loginScreen.className + ' hidden');
    playerScreen.className = playerScreen.className.replace(/hidden/g, '');
    startPolling();
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

function handleConnect() {
    // Set the href and navigate
    window.location.href = buildAuthUrl();
}

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
// EVENT HANDLERS
// ============================================

loginBtn.onclick = handleConnect;
logoutBtn.onclick = handleLogout;
themeBtn.onclick = toggleTheme;
playPauseBtn.onclick = handlePlayPause;
prevBtn.onclick = handlePrev;
nextBtn.onclick = handleNext;

// ============================================
// THEME LISTENER
// ============================================

// Fullscreen (keep only if supported)
if (fullscreenBtn) {
    fullscreenBtn.onclick = function() {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    };
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    loadTheme();

    // Check for OAuth callback in URL hash (Implicit Grant)
    var tokenFromHash = saveTokenFromHash();

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
