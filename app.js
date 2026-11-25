const STORAGE_KEY = 'reelflow.queue.v1';
const supportedHosts = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch'];

const form = document.querySelector('#reel-form');
const input = document.querySelector('#reel-url');
const formMessage = document.querySelector('#form-message');
const queueList = document.querySelector('#queue-list');
const queueCount = document.querySelector('#queue-count');
const queueTotal = document.querySelector('#queue-total');
const clearButton = document.querySelector('#clear-button');
const player = document.querySelector('#facebook-player');
const playerEmpty = document.querySelector('#player-empty');
const playerLoading = document.querySelector('#player-loading');
const playerStatus = document.querySelector('#player-status');
const nowPlayingLabel = document.querySelector('#now-playing-label');
const previousButton = document.querySelector('#previous-button');
const nextButton = document.querySelector('#next-button');
const playButton = document.querySelector('#play-button');
const stopButton = document.querySelector('#stop-button');
const screenPlayOverlay = document.querySelector('#screen-play-overlay');
const playLabel = document.querySelector('#play-label');
const helpDialog = document.querySelector('#help-dialog');
const resolverUrl = window.REELFLOW_CONFIG?.resolverUrl?.trim() || '';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

let queue = readQueue();
let activeIndex = queue.length ? 0 : -1;
let facebookSdkPromise = null;
let facebookSdkInitialized = false;
let facebookPlayerInstance = null;
let activePlayerId = '';
let playerSequence = 0;
let autoplayRequested = true;

function readQueue() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((item) => item && item.url) : [];
  } catch {
    return [];
  }
}

function persistQueue() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isShortLink = host === 'fb.watch' || host === 'www.fb.watch';
    return ['http:', 'https:'].includes(url.protocol) && supportedHosts.includes(host) && (isShortLink || /(?:reel|reels|watch|videos|video\.php)/i.test(url.pathname));
  } catch {
    return false;
  }
}

function cleanUrl(value) {
  const url = new URL(value.trim());
  url.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => url.searchParams.delete(key));
  return url.toString();
}

function shortLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function setFormMessage(message, kind = '') {
  formMessage.textContent = message;
  formMessage.className = `form-message ${kind}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderQueue() {
  queueCount.textContent = `${queue.length} ITEM${queue.length === 1 ? '' : 'S'}`;
  queueTotal.textContent = `${queue.length} reel${queue.length === 1 ? '' : 's'}`;
  clearButton.disabled = queue.length === 0;
  previousButton.disabled = queue.length < 2;
  nextButton.disabled = queue.length < 2;

  if (!queue.length) {
    queueList.innerHTML = '<div class="queue-placeholder">Link yang kamu tambahkan akan muncul di sini.</div>';
    return;
  }

  queueList.innerHTML = queue.map((item, index) => `
    <div class="queue-item ${index === activeIndex ? 'active' : ''}" data-index="${index}">
      <span class="queue-index">${String(index + 1).padStart(2, '0')}</span>
      <button class="queue-open queue-link" type="button" title="Pilih Reel">${escapeHtml(shortLabel(item.url))}</button>
      <button class="queue-remove" type="button" aria-label="Hapus Reel" title="Hapus">×</button>
    </div>
  `).join('');

  queueList.querySelectorAll('.queue-item').forEach((item) => {
    const index = Number(item.dataset.index);
    item.querySelector('.queue-open').addEventListener('click', () => selectItem(index));
    item.querySelector('.queue-remove').addEventListener('click', (event) => {
      event.stopPropagation();
      removeItem(index);
    });
  });
}

function startPlayback() {
  if (activeIndex < 0) return;
  if (!facebookPlayerInstance) {
    playerStatus.textContent = 'Tunggu player siap, lalu ketuk tombol Play atau area video.';
    return;
  }
  try {
    facebookPlayerInstance.mute();
    facebookPlayerInstance.play();
    playerStatus.textContent = 'Memulai Reel…';
  } catch {
    playerStatus.textContent = 'Belum mulai? Ketuk lagi area video atau tombol Play.';
  }
}

function onFacebookXfbmlReady(message) {
  if (message.type !== 'video' || message.id !== activePlayerId) return;

  facebookPlayerInstance = message.instance;
  playButton.disabled = false;
  stopButton.disabled = false;
  screenPlayOverlay.hidden = false;
  playLabel.textContent = 'Play';
  playerLoading.hidden = true;
  playerStatus.textContent = 'Embed siap. Ketuk Play jika video belum berjalan.';

  facebookPlayerInstance.subscribe('startedPlaying', () => {
    playerLoading.hidden = true;
    screenPlayOverlay.hidden = true;
    playerStatus.textContent = 'Sedang memutar Reel.';
    playLabel.textContent = 'Play';
  });
  facebookPlayerInstance.subscribe('paused', () => {
    screenPlayOverlay.hidden = false;
    playerStatus.textContent = 'Reel dijeda. Ketuk Play untuk melanjutkan.';
    playLabel.textContent = 'Play';
  });
  facebookPlayerInstance.subscribe('finishedPlaying', () => {
    if (queue.length > 1) {
      move(1);
    } else {
      playerStatus.textContent = 'Reel selesai.';
      playLabel.textContent = 'Play';
    }
  });
  facebookPlayerInstance.subscribe('error', () => {
    playerStatus.textContent = 'Facebook tidak dapat memutar Reel ini. Coba buka Reel langsung di Facebook.';
  });

  if (autoplayRequested) {
    try {
      facebookPlayerInstance.mute();
      facebookPlayerInstance.play();
    } catch {
      playerStatus.textContent = 'Ketuk Play untuk memulai video.';
    }
  }
}

function initializeFacebookSdk() {
  if (facebookSdkInitialized) return;
  window.FB.init({ xfbml: false, version: 'v22.0' });
  window.FB.Event.subscribe('xfbml.ready', onFacebookXfbmlReady);
  facebookSdkInitialized = true;
}

function ensureFacebookSdk() {
  if (window.FB?.XFBML) {
    initializeFacebookSdk();
    return Promise.resolve(window.FB);
  }
  if (facebookSdkPromise) return facebookSdkPromise;

  facebookSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        initializeFacebookSdk();
        resolve(window.FB);
      } catch (error) {
        reject(error);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.dataset.reelflowFacebookSdk = 'true';
    script.onerror = () => reject(new Error('Facebook SDK tidak dapat dimuat.'));
    document.head.appendChild(script);
  });

  return facebookSdkPromise;
}

function renderFacebookEmbed(url, autoplay) {
  if (facebookPlayerInstance) {
    try { facebookPlayerInstance.pause(); } catch {}
  }
  facebookPlayerInstance = null;
  autoplayRequested = autoplay;
  activePlayerId = `reelflow-facebook-player-${++playerSequence}`;
  const playerId = activePlayerId;

  player.replaceChildren();
  const video = document.createElement('div');
  video.id = playerId;
  video.className = 'fb-video';
  video.dataset.href = url;
  video.dataset.width = '500';
  video.dataset.showText = 'false';
  video.dataset.allowFullscreen = 'true';
  video.dataset.autoplay = autoplay ? 'true' : 'false';
  player.appendChild(video);
  player.hidden = false;

  ensureFacebookSdk()
    .then((facebook) => {
      if (playerId !== activePlayerId) return;
      facebook.XFBML.parse(player);
    })
    .catch(() => {
      if (playerId !== activePlayerId) return;
      playerLoading.hidden = true;
      playButton.disabled = false;
      stopButton.disabled = true;
      playerStatus.textContent = 'Player Facebook gagal dimuat. Coba buka Reel langsung di Facebook.';
    });
}

function loadActive({ autoplay = true } = {}) {
  if (activeIndex < 0 || !queue[activeIndex]) {
    activePlayerId = '';
    facebookPlayerInstance = null;
    screenPlayOverlay.hidden = true;
    player.replaceChildren();
    player.hidden = true;
    playerEmpty.hidden = false;
    playerLoading.hidden = true;
    playButton.disabled = true;
    stopButton.disabled = true;
    nowPlayingLabel.textContent = 'Belum ada Reel';
    playerStatus.textContent = 'Tambahkan Reel untuk mulai.';
    return;
  }

  const active = queue[activeIndex];
  screenPlayOverlay.hidden = true;
  playerLoading.hidden = false;
  playerEmpty.hidden = true;
  player.hidden = false;
  playButton.disabled = true;
  stopButton.disabled = true;
  playLabel.textContent = 'Menyiapkan…';
  nowPlayingLabel.textContent = shortLabel(active.url);
  playerStatus.textContent = 'Memuat player Facebook resmi…';
  renderFacebookEmbed(active.url, autoplay);
  renderQueue();
}

function selectItem(index) {
  if (index < 0 || index >= queue.length) return;
  activeIndex = index;
  loadActive({ autoplay: true });
}

async function resolveInputUrl(value) {
  const cleaned = cleanUrl(value);
  if (!resolverUrl || !/\/share\/r\//i.test(new URL(cleaned).pathname)) return cleaned;

  setFormMessage('Mengubah link share Facebook…', 'success');
  const response = await fetch(`${resolverUrl}?url=${encodeURIComponent(cleaned)}`);
  const data = await response.json();
  if (!response.ok || !data.ok || !data.url) throw new Error(data.error || 'Resolver gagal mengubah URL.');
  if (!data.isReel || !/\/(reel|reels)\//i.test(new URL(data.url).pathname)) {
    throw new Error('Facebook mengarahkan link ini ke halaman login. Buka Reel di Facebook, lalu salin tautan akhir yang berisi /reel/ dan tempelkan di sini.');
  }
  return data.url;
}

async function addItem(value) {
  let url;
  try { url = await resolveInputUrl(value); } catch (error) { setFormMessage(error.message || 'Tautan tidak dapat dibaca.'); return; }
  if (/\/share\/r\//i.test(url)) {
    setFormMessage('Link share belum dapat diubah. Buka Reel di Facebook lalu salin URL yang berbentuk /reel/…');
    return;
  }
  if (!isFacebookUrl(url)) {
    setFormMessage('Masukkan URL Reel Facebook publik dari facebook.com atau fb.watch.');
    return;
  }
  const existingIndex = queue.findIndex((item) => item.url === url);
  if (existingIndex !== -1) {
    activeIndex = existingIndex;
    setFormMessage('Reel itu sudah ada — dipilih dari antrean.', 'success');
    loadActive({ autoplay: true });
    return;
  }
  queue.push({ url, addedAt: Date.now() });
  activeIndex = queue.length - 1;
  persistQueue();
  renderQueue();
  loadActive({ autoplay: true });
  input.value = '';
  setFormMessage('Reel ditambahkan ke antrean.', 'success');
}

function removeItem(index) {
  const wasActive = index === activeIndex;
  queue.splice(index, 1);
  if (!queue.length) activeIndex = -1;
  else if (index < activeIndex) activeIndex -= 1;
  else if (wasActive) activeIndex = Math.min(activeIndex, queue.length - 1);
  persistQueue();
  renderQueue();
  if (wasActive || activeIndex === -1) loadActive({ autoplay: true });
}

function move(step) {
  if (queue.length < 2) return;
  activeIndex = (activeIndex + step + queue.length) % queue.length;
  loadActive({ autoplay: true });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  addItem(input.value);
});

clearButton.addEventListener('click', () => {
  queue = [];
  activeIndex = -1;
  persistQueue();
  renderQueue();
  loadActive();
  setFormMessage('Antrean dibersihkan.', 'success');
});

previousButton.addEventListener('click', () => move(-1));
nextButton.addEventListener('click', () => move(1));
playButton.addEventListener('click', startPlayback);
screenPlayOverlay.addEventListener('click', startPlayback);

stopButton.addEventListener('click', () => {
  if (!facebookPlayerInstance) return;
  try {
    facebookPlayerInstance.pause();
    facebookPlayerInstance.seek(0);
    playerStatus.textContent = 'Reel dihentikan dan dikembalikan ke awal.';
    playLabel.textContent = 'Play';
  } catch {
    playerStatus.textContent = 'Facebook belum siap menghentikan video.';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea')) return;
  if (event.key === 'ArrowUp') move(-1);
  if (event.key === 'ArrowDown') move(1);
});

document.querySelector('#help-button').addEventListener('click', () => helpDialog.showModal());
document.querySelector('#close-help').addEventListener('click', () => helpDialog.close());
document.querySelector('#dialog-ok').addEventListener('click', () => helpDialog.close());

renderQueue();
if (queue.length) loadActive({ autoplay: true });
