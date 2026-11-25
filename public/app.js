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
const playLabel = document.querySelector('#play-label');
const helpDialog = document.querySelector('#help-dialog');

let queue = readQueue();
let activeIndex = queue.length ? 0 : -1;
let autoplayEnabled = true;
let sdkPromise;

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

function renderFacebookEmbed(url, autoplay) {
  const params = new URLSearchParams({ href: url, show_text: 'false', autoplay: autoplay ? 'true' : 'false', width: '500' });
  player.src = `https://www.facebook.com/plugins/video.php?${params.toString()}`;
  player.hidden = false;
}

function loadActive({ autoplay = true } = {}) {
  if (activeIndex < 0 || !queue[activeIndex]) {
    player.hidden = true;
    playerEmpty.hidden = false;
    playerLoading.hidden = true;
    playButton.disabled = true;
    nowPlayingLabel.textContent = 'Belum ada Reel';
    playerStatus.textContent = 'Tambahkan Reel untuk mulai.';
    return;
  }

  const active = queue[activeIndex];
  autoplayEnabled = autoplay;
  playerLoading.hidden = false;
  playerEmpty.hidden = true;
  player.hidden = false;
  playButton.disabled = false;
  playLabel.textContent = autoplay ? 'Coba autoplay' : 'Muat ulang';
  nowPlayingLabel.textContent = shortLabel(active.url);
  playerStatus.textContent = 'Memuat Facebook SDK dan embed resmi…';
  renderFacebookEmbed(active.url, autoplay);
  renderQueue();
}

function selectItem(index) {
  if (index < 0 || index >= queue.length) return;
  activeIndex = index;
  loadActive({ autoplay: true });
}

function addItem(value) {
  let url;
  try { url = cleanUrl(value); } catch { setFormMessage('Tautan tidak dapat dibaca.'); return; }
  if (/\/share\/r\//i.test(url)) {
    setFormMessage('Link share belum bisa di-embed. Buka link di Facebook, lalu salin URL akhir yang berbentuk /reel/…');
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
playButton.addEventListener('click', () => {
  if (activeIndex < 0) return;
  if (autoplayEnabled) {
    player.src = 'about:blank';
    player.hidden = true;
    playerLoading.hidden = true;
    playerStatus.textContent = 'Embed dihentikan. Tekan tombol untuk mencoba lagi.';
    playLabel.textContent = 'Coba autoplay';
    autoplayEnabled = false;
  } else {
    loadActive({ autoplay: true });
  }
});

player.addEventListener('load', () => {
  playerLoading.hidden = true;
  playerStatus.textContent = 'Embed resmi siap. Tekan play jika autoplay diblokir browser.';
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
