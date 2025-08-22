/* ===== constants ===== */
const DESIGN_W = 3840;
const DESIGN_H = 2160;

/* ===== orientation gate removed - site now works in portrait mode ===== */

/* ===== stage layout scale ===== */
const stageWrap = document.getElementById('stage-wrap');
const stage = document.getElementById('stage');

function layoutScale() {
  const sw = stageWrap.clientWidth;
  const sh = stageWrap.clientHeight;
  
  // Check if mobile device (less than 768px width)
  const isMobile = window.innerWidth < 768;
  
  if (isMobile) {
    // For mobile, scale to fit with padding
    const padding = 20; // 20px buffer on each side
    const availableWidth = sw - (padding * 2);
    const availableHeight = sh - (padding * 2);
    
    // Calculate scale to fit within available space
    let scale = Math.min(availableWidth / DESIGN_W, availableHeight / DESIGN_H);
    
    // Apply additional scaling for better visibility, but not too much
    scale = scale * 1.2; // 20% larger instead of 50%
    
    stage.style.transform = `scale(${scale})`;
    const offsetX = (sw - DESIGN_W * scale) / 2;
    const offsetY = (sh - DESIGN_H * scale) / 2;
    stage.style.left = `${offsetX}px`;
    stage.style.top = `${offsetY}px`;
    stage.style.position = 'absolute';
    document.documentElement.style.setProperty('--stage-scale', String(scale));
  } else {
    // Desktop scaling remains the same
    let scale = Math.min(sw / DESIGN_W, sh / DESIGN_H);
    stage.style.transform = `scale(${scale})`;
    const offsetX = (sw - DESIGN_W * scale) / 2;
    const offsetY = (sh - DESIGN_H * scale) / 2;
    stage.style.left = `${offsetX}px`;
    stage.style.top = `${offsetY}px`;
    stage.style.position = 'absolute';
    document.documentElement.style.setProperty('--stage-scale', String(scale));
  }
}
window.addEventListener('resize', layoutScale);
layoutScale();

/* ===== place hotspots ===== */
function applyHotspotPositions() {
  // Hotspots and any element with data-x/y/w/h (like the desk)
  document.querySelectorAll('.hotspot, .desk-overlay').forEach(el => {
    const x = +el.dataset.x, y = +el.dataset.y, w = +el.dataset.w, h = +el.dataset.h;
    if (Number.isFinite(x)) el.style.left = `${x}px`;
    if (Number.isFinite(y)) el.style.top = `${y}px`;
    if (Number.isFinite(w)) el.style.width = `${w}px`;
    if (Number.isFinite(h)) el.style.height = `${h}px`;
  });
}
applyHotspotPositions();

/* ===== overlay helpers ===== */
function openOverlay(el) { el.classList.add('show'); }
function closeOverlay(el) { el.classList.remove('show'); }

document.querySelectorAll('.overlay [data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeOverlay(btn.closest('.overlay')));
});
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if (e.target === ov) closeOverlay(ov); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.show').forEach(ov => closeOverlay(ov));
    hideLottie();
  }
});

/* ===== About overlay ===== */
const aboutLink  = document.getElementById('aboutLink');
const aboutModal = document.getElementById('aboutOverlay');
if (aboutLink) aboutLink.addEventListener('click', (e) => { e.preventDefault(); openOverlay(aboutModal); });

/* ===== Frog Queen easter egg ===== */
const frogQueenLink = document.getElementById('frogQueenLink');
const frogAudio = document.getElementById('frogAudio');
if (frogQueenLink && frogAudio) {
  frogQueenLink.addEventListener('click', (e) => {
    e.preventDefault();
    try { frogAudio.currentTime = 0; frogAudio.play(); } catch(_) {}
  });
}

/* ===== Lottie overlay (play, then open modal) ===== */
const fxOverlay = document.getElementById('fx-overlay');
const fxLottie  = document.getElementById('fx-lottie');
let currentLottie = null;

function showLottie() { fxOverlay.style.display = 'flex'; }
function hideLottie() {
  if (currentLottie) { currentLottie.destroy(); currentLottie = null; }
  fxOverlay.style.display = 'none';
}
const animPath = (name) => `assets/animations/${encodeURIComponent(name)}`;

function playLottieCenter(path, { loop=false, maxMs=1600 } = {}, onDone = () => {}) {
  hideLottie();
  showLottie();
  currentLottie = lottie.loadAnimation({
    container: fxLottie, renderer: 'svg', loop, autoplay: true, path
  });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    hideLottie();
    onDone();
  };
  if (!loop) currentLottie.addEventListener('complete', finish);
  setTimeout(finish, maxMs);
}

/* ===== Music modal ===== */
const musicLink   = document.getElementById('musicLink');
const musicModal  = document.getElementById('musicOverlay');
const musicGrid   = document.getElementById('musicGrid');
const musicError  = document.getElementById('musicError');
const artistChips = document.getElementById('artistChips');
const dropdownBtn = document.getElementById('artistDropdownBtn');
const dropdownMenu = document.getElementById('artistDropdownMenu');
const dropdownText = document.querySelector('.dropdown-text');

let musicData = [];
let activeArtist = 'all';
let activeType = null;
let coverCache = new Map();
let loadingCovers = new Map();

// Compute cassette case aspect ratio from the actual PNG so cards match it exactly
const CASSETTE_SRC = 'assets/Cassette Case.png';
(function setCassetteAspect() {
  try {
    const img = new Image();
    img.src = CASSETTE_SRC;
    img.onload = function () {
      const w = img.naturalWidth || 2;
      const h = img.naturalHeight || 3;
      document.documentElement.style.setProperty('--cassette-w', String(w));
      document.documentElement.style.setProperty('--cassette-h', String(h));
    };
  } catch (_) { /* no-op */ }
})();

// ===== Dominant color extraction (best-effort; falls back to white on CORS) =====
function getDominantColorFromImage(img) {
  return new Promise((resolve) => {
    try {
      const w = 32, h = 32;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Draw scaled down to normalize sampling
      ctx.drawImage(img, 0, 0, w, h);
      let data;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch (e) {
        // Tainted canvas (no CORS) -> not possible
        resolve(null);
        return;
      }
      const hist = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue; // skip mostly transparent
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Skip near-white and near-black to avoid plastic glare and shadows
        const avg = (r + g + b) / 3;
        if (avg > 245 || avg < 15) continue;
        // Quantize to 16 levels per channel to reduce noise
        const rq = r >> 4, gq = g >> 4, bq = b >> 4;
        const key = (rq << 8) | (gq << 4) | bq;
        hist.set(key, (hist.get(key) || 0) + 1);
      }
      if (hist.size === 0) {
        resolve(null);
        return;
      }
      // Pick the most frequent bin (dominant color)
      let bestKey = null, bestCount = -1;
      for (const [k, c] of hist.entries()) { if (c > bestCount) { bestCount = c; bestKey = k; } }
      const rq = (bestKey >> 8) & 0xF, gq = (bestKey >> 4) & 0xF, bq = bestKey & 0xF;
      // Map back to 0..255 range by centering each bin
      const r = (rq << 4) + 8, g = (gq << 4) + 8, b = (bq << 4) + 8;
      resolve(`rgb(${r}, ${g}, ${b})`);
    } catch (e) {
      resolve(null);
    }
  });
}

// Parse CSS color strings to RGB
function parseColorToRGB(color) {
  if (!color) return null;
  if (color.startsWith('rgb')) {
    const m = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  }
  if (color[0] === '#') {
    let r, g, b;
    if (color.length === 4) {
      r = parseInt(color[1] + color[1], 16);
      g = parseInt(color[2] + color[2], 16);
      b = parseInt(color[3] + color[3], 16);
    } else if (color.length === 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    }
    if (Number.isFinite(r)) return { r, g, b };
  }
  return null;
}
function srgbToLinear(c) { c = c / 255; return (c <= 0.04045) ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4); }
function relativeLuminanceRGB(r, g, b) { const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b); return 0.2126 * R + 0.7152 * G + 0.0722 * B; }
function isDarkColor(color) {
  const rgb = parseColorToRGB(color);
  if (!rgb) return false; // default to light
  const L = relativeLuminanceRGB(rgb.r, rgb.g, rgb.b);
  return L < 0.5; // threshold; tweak if needed
}
function applyCardTextContrast(cardEl, color) {
  if (isDarkColor(color)) {
    cardEl.classList.add('card-dark');
    cardEl.classList.remove('card-light');
  } else {
    cardEl.classList.add('card-light');
    cardEl.classList.remove('card-dark');
  }
}

async function applyCardBackgroundFromCover(cardEl, imgEl) {
  try {
    const color = await getDominantColorFromImage(imgEl);
    const bg = color || '#ffffff';
    const inner = cardEl.querySelector('.card-inner') || cardEl;
    inner.style.backgroundColor = bg;
    applyCardTextContrast(cardEl, bg);
  } catch (_) {
    const inner = cardEl.querySelector('.card-inner') || cardEl;
    inner.style.backgroundColor = '#ffffff';
    applyCardTextContrast(cardEl, '#ffffff');
  }
}

function unique(list, key) {
  const allValues = list.flatMap(x => x[key]).filter(Boolean);
  return [...new Set(allValues)];
}

function renderMusic() {
  if (!musicData.length) return;

  // Artist chips and dropdown for mobile
  const artists = unique(musicData, 'artist');
  const allArtists = [...artists, 'thugbrains'];
  const sortedArtists = [...new Set(allArtists)].sort((a, b) => {
    if (a === 'inutech') return -1;
    if (b === 'inutech') return 1;
    return a.localeCompare(b);
  });
  
  // Desktop artist chips
  artistChips.innerHTML = '';
  sortedArtists.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = name;
    btn.dataset.artist = name;
    const hasSongs = musicData.some(song => Array.isArray(song.artist) ? song.artist.includes(name) : song.artist === name);
    if (!hasSongs) btn.classList.add('missing');
    if (name === activeArtist) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeArtist = (activeArtist === name) ? 'all' : name;
      document.querySelectorAll('#artistChips .chip').forEach(c => c.classList.remove('active'));
      if (activeArtist !== 'all') btn.classList.add('active');
      drawGrid();
    });
    artistChips.appendChild(btn);
  });
  
  // Mobile dropdown - only populate if elements exist
  if (dropdownMenu) {
    // Clear existing items except "All"
    const existingItems = dropdownMenu.querySelectorAll('.dropdown-item:not([data-artist="all"])');
    existingItems.forEach(item => item.remove());
    
    // Add artist items
    sortedArtists.forEach(name => {
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      item.textContent = name;
      item.dataset.artist = name;
      const hasSongs = musicData.some(song => Array.isArray(song.artist) ? song.artist.includes(name) : song.artist === name);
      if (!hasSongs) item.classList.add('missing');
      if (name === activeArtist) item.classList.add('active');
      
      item.addEventListener('click', () => {
        activeArtist = name;
        updateDropdownSelection();
        closeDropdown();
        drawGrid();
      });
      
      dropdownMenu.appendChild(item);
    });
  }

  drawGrid();
}

function drawGrid() {
  const filtered = musicData.filter(item => {
    const okArtist = activeArtist === 'all' ? true : (Array.isArray(item.artist) ? item.artist.includes(activeArtist) : item.artist === activeArtist);
    const okType   = activeType ? (item.type === activeType) : true;
    return okArtist && okType;
  });

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  musicGrid.innerHTML = '';
  
  // Sort by release date chronologically (newest first)
  filtered
    .sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date(`${a.year || 2000}-01-01`);
      const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date(`${b.year || 2000}-01-01`);
      return dateB - dateA; // newest first
    })
    .forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'card';

      // Inner safe area that respects cassette frame padding
      const inner = document.createElement('div');
      inner.className = 'card-inner';

      const cover = document.createElement('div');
      cover.className = 'cover-wrap';

      const img = document.createElement('img');
      img.alt = `${item.title} cover`;
      img.id = `cover-${idx}`;
      // Allow color extraction from cross-origin images when possible
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';

      if (item.cover) img.src = item.cover; // direct URL (optional)

      img.dataset.spotify = item.spotify || '';
      img.dataset.apple   = item.apple || '';
      img.dataset.q       = `${item.artist||''} ${item.title||''}`.trim();

      // Set default background to white and try to update on load
      inner.style.backgroundColor = '#ffffff';
      applyCardTextContrast(card, '#ffffff');
      img.addEventListener('load', () => applyCardBackgroundFromCover(card, img));

      cover.appendChild(img);

const body = document.createElement('div');
      body.className = 'card-body';
      const title = document.createElement('div');
      title.className = 'card-title';
      
      // On mobile, remove featured artist info from titles
      let displayTitle = item.title;
      if (window.innerWidth < 768) {
        // Special case for Borderline (Chase T. Remix)
        if (displayTitle === 'Borderline (Chase T. Remix)') {
          displayTitle = 'Borderline (Remix)';
        } else {
          // Remove everything after and including "(feat."
          const featIndex = displayTitle.indexOf('(feat.');
          if (featIndex !== -1) {
            displayTitle = displayTitle.substring(0, featIndex).trim();
          }
        }
      }
      
      title.textContent = displayTitle;

      const bottom = document.createElement('div');
      bottom.className = 'card-bottom';

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      
      // Create year span with tooltip for full release date
      const yearSpan = document.createElement('span');
      yearSpan.style.cursor = 'help';
      yearSpan.textContent = item.year || '';
      if (item.releaseDate) {
        yearSpan.title = item.releaseDate;
      }
      
      meta.textContent = `${Array.isArray(item.artist) ? item.artist.join(' & ') : item.artist} • ${item.type}`;
      if (item.year) {
        meta.appendChild(document.createTextNode(' • '));
        meta.appendChild(yearSpan);
      }

      const links = document.createElement('div');
      links.className = 'card-links';

      const spotifyLink = document.createElement('a');
      spotifyLink.href = item.spotify || '#';
      spotifyLink.target = '_blank';
      spotifyLink.rel = 'noopener';
      spotifyLink.className = 'btn-sm';
      spotifyLink.textContent = 'Spotify';
      if (!item.spotify) spotifyLink.classList.add('missing');

      // Only add Apple Music button if URL exists and is not empty
      if (item.apple && item.apple.trim() !== '') {
        const appleLink = document.createElement('a');
        appleLink.href = item.apple;
        appleLink.target = '_blank';
        appleLink.rel = 'noopener';
        appleLink.className = 'btn-sm';
        appleLink.textContent = 'Apple Music';
        links.appendChild(spotifyLink);
        links.appendChild(appleLink);
      } else {
        // Only Spotify button when no Apple Music
        links.appendChild(spotifyLink);
      }

      bottom.appendChild(meta);
      bottom.appendChild(links);

      body.appendChild(title);
      body.appendChild(bottom);
      inner.appendChild(cover);
      inner.appendChild(body);
      card.appendChild(inner);
      fragment.appendChild(card);
    });

  musicGrid.appendChild(fragment);
  requestAnimationFrame(() => {
    hydrateCovers();
    alignAlbumToTopRowRight();
  });
}

async function loadMusic() {
  musicError.classList.add('hidden');
  
  // Try to load from localStorage first for instant display
  const cached = localStorage.getItem('musicDataCache');
  const cacheTime = localStorage.getItem('musicDataCacheTime');
  const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (cached && cacheAge < maxAge) {
    try {
      musicData = JSON.parse(cached);
      renderMusic();
      // Still fetch fresh data in background
      fetch('assets/music.json')
        .then(res => res.json())
        .then(data => {
          if (JSON.stringify(data) !== cached) {
            musicData = data;
            localStorage.setItem('musicDataCache', JSON.stringify(data));
            localStorage.setItem('musicDataCacheTime', Date.now().toString());
            renderMusic();
          }
        })
        .catch(() => {});
    } catch (e) {
      localStorage.removeItem('musicDataCache');
      localStorage.removeItem('musicDataCacheTime');
    }
  }
  
  // If no cache or error, fetch fresh
  if (!musicData.length) {
    try {
      const res = await fetch('assets/music.json');
      if (!res.ok) throw new Error('http error');
      musicData = await res.json();
      localStorage.setItem('musicDataCache', JSON.stringify(musicData));
      localStorage.setItem('musicDataCacheTime', Date.now().toString());
      renderMusic();
    } catch (e) {
      musicError.classList.remove('hidden');
    }
  }
  
  // Start preloading covers in background without blocking
  setTimeout(() => preloadCovers(musicData), 100);
}

// Filter bar
document.getElementById('musicFilters').addEventListener('click', (e)=>{
  const btn = e.target.closest('.chip');
  if (!btn) return;
  if (btn.dataset.type) {
    const t = btn.dataset.type;
    // Toggle type filter; when none selected, show all by default
    activeType = (activeType === t) ? null : t;
    document.querySelectorAll('#musicFilters .chip[data-type]').forEach(c=>c.classList.remove('active'));
    if (activeType) btn.classList.add('active');
    drawGrid();
  }
});
if (musicLink) {
  musicLink.addEventListener('click', (e) => {
    e.preventDefault();
    openOverlay(musicModal);
    if (!musicData.length) loadMusic();
    // Initialize dropdown state
    updateDropdownSelection();
    // Align once the overlay is visible
    requestAnimationFrame(alignAlbumToTopRowRight);
  });
}

// Dropdown helper functions
function updateDropdownSelection() {
  // Update button text
  if (dropdownText) {
    dropdownText.textContent = activeArtist === 'all' ? 'All Artists' : activeArtist;
  }
  
  // Update active state for all dropdown items
  if (dropdownMenu) {
    dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.classList.remove('active');
      if ((item.dataset.artist === 'all' && activeArtist === 'all') ||
          (item.dataset.artist === activeArtist)) {
        item.classList.add('active');
      }
    });
  }
}

function closeDropdown() {
  if (dropdownMenu) {
    dropdownMenu.classList.remove('show');
  }
  if (dropdownBtn) {
    dropdownBtn.classList.remove('active');
  }
}

function toggleDropdown() {
  if (dropdownMenu && dropdownBtn) {
    const isOpen = dropdownMenu.classList.contains('show');
    if (isOpen) {
      closeDropdown();
    } else {
      dropdownMenu.classList.add('show');
      dropdownBtn.classList.add('active');
    }
  }
}

// Add dropdown toggle event listener
if (dropdownBtn) {
  dropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });
}

// Add "All" option click handler
if (dropdownMenu) {
  const allItem = dropdownMenu.querySelector('.dropdown-item[data-artist="all"]');
  if (allItem) {
    allItem.addEventListener('click', () => {
      activeArtist = 'all';
      updateDropdownSelection();
      closeDropdown();
      drawGrid();
      // Also update desktop chips
      document.querySelectorAll('#artistChips .chip').forEach(c => c.classList.remove('active'));
    });
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (dropdownMenu && dropdownMenu.classList.contains('show') && 
      !e.target.closest('.artist-dropdown')) {
    closeDropdown();
  }
});

/* ===== chipbar alignment: Album right edge == last card of top row right edge ===== */
function alignAlbumToTopRowRight() {
  try {
    const chipbar = document.getElementById('musicFilters');
    if (!chipbar || !musicGrid) return;
    
    // Always use full width to prevent shifting between tabs
    chipbar.style.width = '100%';
    chipbar.style.overflowX = 'hidden';
  } catch (_) {}
}

// Keep alignment responsive while the overlay is open
window.addEventListener('resize', () => {
  const ov = document.getElementById('musicOverlay');
  if (ov && ov.classList.contains('show')) alignAlbumToTopRowRight();
});

/* ===== cover hydration ===== */
async function fetchSpotifyThumb(url) {
  if (coverCache.has(url)) return coverCache.get(url);
  if (loadingCovers.has(url)) return loadingCovers.get(url);
  
  const promise = (async () => {
    try {
      const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      if (!r.ok) return '';
      const j = await r.json();
      const result = j && j.thumbnail_url ? j.thumbnail_url : '';
      coverCache.set(url, result);
      return result;
    } catch { 
      coverCache.set(url, '');
      return ''; 
    } finally {
      loadingCovers.delete(url);
    }
  })();
  
  loadingCovers.set(url, promise);
  return promise;
}

let jsonpSeq = 0;
function jsonp(url) {
  return new Promise((resolve) => {
    const name = `appleCb_${Date.now()}_${jsonpSeq++}`;
    window[name] = (data) => { resolve(data); try{ delete window[name]; s.remove(); }catch{} };
    const s = document.createElement('script');
    s.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    s.onerror = () => { resolve(null); try{ delete window[name]; s.remove(); }catch{} };
    document.body.appendChild(s);
  });
}
function parseAppleId(u='') {
  const qi = /[?&]i=(\d+)/.exec(u); if (qi) return qi[1];
  const m  = u.match(/\/(\d+)(?:[/?].*)?$/); return m ? m[1] : null;
}
async function fetchAppleThumb(url, qFallback) {
  const cacheKey = `${url}|${qFallback}`;
  if (coverCache.has(cacheKey)) return coverCache.get(cacheKey);
  if (loadingCovers.has(cacheKey)) return loadingCovers.get(cacheKey);
  
  const promise = (async () => {
    try {
      const id = parseAppleId(url);
      if (id) {
        const data = await jsonp(`https://itunes.apple.com/lookup?id=${id}`);
        const r = data && data.results && data.results[0];
        const art = r && (r.artworkUrl100 || r.artworkUrl60);
        if (art) {
          const result = art.replace(/\/\d+x\d+bb\.(jpg|png)/, '/1000x1000bb.$1');
          coverCache.set(cacheKey, result);
          return result;
        }
      }
      if (qFallback) {
        const data = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(qFallback)}&media=music&limit=1`);
        const r = data && data.results && data.results[0];
        const art = r && (r.artworkUrl100 || r.artworkUrl60);
        if (art) {
          const result = art.replace(/\/\d+x\d+bb\.(jpg|png)/, '/1000x1000bb.$1');
          coverCache.set(cacheKey, result);
          return result;
        }
      }
      coverCache.set(cacheKey, '');
      return '';
    } catch {
      coverCache.set(cacheKey, '');
      return '';
    } finally {
      loadingCovers.delete(cacheKey);
    }
  })();
  
  loadingCovers.set(cacheKey, promise);
  return promise;
}

const FALLBACK_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="%23f3f3f3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="%23999">No Artwork</text></svg>';

async function hydrateCovers() {
  const imgs = Array.from(document.querySelectorAll('#musicGrid img[id^="cover-"]'));
  
  // Process covers in parallel batches for better performance
  const batchSize = 5;
  for (let i = 0; i < imgs.length; i += batchSize) {
    const batch = imgs.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (img) => {
      if (img.src && img.src.length > 0 && img.src !== FALLBACK_SVG) return;
      
      const sp = img.dataset.spotify;
      const ap = img.dataset.apple;
      const q  = img.dataset.q;

      let url = sp ? await fetchSpotifyThumb(sp) : '';
      if (!url) url = await fetchAppleThumb(ap, q);

      img.src = url || FALLBACK_SVG;

      // Try to re-apply dominant color when real art loads (may be CORS-limited)
      if (img.complete && img.naturalWidth > 0) {
        applyCardBackgroundFromCover(img.closest('.card'), img);
      } else {
        img.addEventListener('load', () => applyCardBackgroundFromCover(img.closest('.card'), img), { once: true });
      }
      
      // Add lazy loading for offscreen images
      if ('loading' in HTMLImageElement.prototype) {
        img.loading = 'lazy';
      }
    }));
  }
}

async function preloadCovers(musicData) {
  // Only preload covers for visible items to save bandwidth
  const visibleCount = Math.min(12, musicData.length);
  const sortedData = [...musicData].sort((a,b) => (b.year || 0) - (a.year || 0));
  
  // Process in batches to avoid blocking
  const batchSize = 3;
  for (let i = 0; i < visibleCount; i += batchSize) {
    const batch = sortedData.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (item) => {
      if (item.cover) return;

      const sp = item.spotify;
      const ap = item.apple;
      const q = `${Array.isArray(item.artist) ? item.artist.join(' ') : item.artist || ''} ${item.title || ''}`.trim();

      let url = sp ? await fetchSpotifyThumb(sp) : '';
      if (!url) url = await fetchAppleThumb(ap, q);

      if (url && document.visibilityState === 'visible') {
        const preloadImg = new Image();
        preloadImg.src = url;
      }
    }));
    
    // Small delay between batches to keep UI responsive
    if (i + batchSize < visibleCount) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

/* ===== Videos & Document: play lottie, then open modal ===== */
const videosLink   = document.getElementById('videosLink');
const videosModal  = document.getElementById('videosOverlay');
const documentLink = document.getElementById('documentLink');
const documentModal= document.getElementById('documentOverlay');

let useAltCamera = false;

if (videosLink) {
  videosLink.addEventListener('click', (e) => {
    e.preventDefault();
    playLottieCenter(
      animPath('Phone Animation.json'),
      { loop:false, maxMs:1400 },
      () => openOverlay(videosModal)
    );
  });
}

if (documentLink) {
  documentLink.addEventListener('click', (e) => {
    e.preventDefault();
    const file = useAltCamera ? 'Camera Animation 2.json' : 'Camera Animation 1.json';
    useAltCamera = !useAltCamera;
    playLottieCenter(
      animPath(file),
      { loop:false, maxMs:1600 },
      () => {
        openOverlay(documentModal);
        // Initialize document viewer interactions on first open
        if (!documentModal.dataset.init) {
          initDocumentViewer();
          documentModal.dataset.init = '1';
        }
      }
    );
  });
}

// Document viewer: handle YouTube/year filter buttons and view toggling
function initDocumentViewer() {
  const viewer = document.querySelector('#documentOverlay .document-viewer');
  if (!viewer) return;
  const buttonsWrap = viewer.querySelector('.viewer-buttons');
  const youtubeView = document.getElementById('youtube-view');
  const yearView = document.getElementById('year-view');
  const yearContent = yearView ? yearView.querySelector('.year-content') : null;

  // YouTube player wiring
  const prevBtn = document.getElementById('prevVideo');
  const nextBtn = document.getElementById('nextVideo');
  const titleEl = document.getElementById('videoTitle');
  const indexEl = document.getElementById('videoIndex');

  // Load a YouTube playlist by ID
  const PLAYLIST_ID = 'PLm5FujTiTzRNTL4fbPC6bP3ymlLqGAe80';
  let ytPlayer = null;

  function updateIndexUi() {
    try {
      const length = ytPlayer && ytPlayer.getPlaylist ? ytPlayer.getPlaylist()?.length || 0 : 0;
      const idx = ytPlayer && ytPlayer.getPlaylistIndex ? (ytPlayer.getPlaylistIndex() + 1) : 0;
      if (indexEl) indexEl.textContent = length ? `${idx} / ${length}` : '';
    } catch {
      if (indexEl) indexEl.textContent = '';
    }
  }
  function updateTitleUi() {
    try {
      const data = ytPlayer && ytPlayer.getVideoData ? ytPlayer.getVideoData() : null;
      if (titleEl) titleEl.textContent = (data && data.title) ? data.title : 'Ready';
    } catch {}
  }

  function onPrev() { try { ytPlayer && ytPlayer.previousVideo && ytPlayer.previousVideo(); } catch {} }
  function onNext() { try { ytPlayer && ytPlayer.nextVideo && ytPlayer.nextVideo(); } catch {} }

  function bindNavButtons() {
    if (prevBtn && !prevBtn.dataset.bound) { prevBtn.addEventListener('click', onPrev); prevBtn.dataset.bound = '1'; }
    if (nextBtn && !nextBtn.dataset.bound) { nextBtn.addEventListener('click', onNext); nextBtn.dataset.bound = '1'; }
  }

  function createPlayerWhenReady() {
    // Wait for YouTube IFrame API to be ready
    if (window.YT && YT.Player) {
      ytPlayer = new YT.Player('youtube-player', {
        width: '100%', height: '100%',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          color: 'white',
          listType: 'playlist',
          list: PLAYLIST_ID
        },
        events: {
          onReady: () => {
            // Autoplay may be blocked; UI will still initialize
            updateIndexUi();
            updateTitleUi();
          },
          onStateChange: () => { updateIndexUi(); updateTitleUi(); }
        }
      });
    } else {
      setTimeout(createPlayerWhenReady, 100);
    }
  }

  function setActiveButton(btn) {
    buttonsWrap.querySelectorAll('.viewer-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  function showYouTube() {
    if (youtubeView) youtubeView.style.display = '';
    if (yearView) yearView.style.display = 'none';
  }
  function showYear(year) {
    if (youtubeView) youtubeView.style.display = 'none';
    if (yearView) yearView.style.display = '';
    if (yearContent) yearContent.innerHTML = `<p>Content for ${year} coming soon…</p>`;
  }

  // Default to YouTube on init and prepare player
  showYouTube();
  const defaultBtn = buttonsWrap.querySelector('.viewer-btn[data-view="youtube"]');
  setActiveButton(defaultBtn);
  bindNavButtons();
  createPlayerWhenReady();

  buttonsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.viewer-btn');
    if (!btn) return;
    if (btn.dataset.view === 'youtube') {
      showYouTube();
      setActiveButton(btn);
      return;
    }
    if (btn.dataset.year) {
      showYear(btn.dataset.year);
      setActiveButton(btn);
      return;
    }
  });
}

/* ===== Guest Book overlay ===== */
const guestBookLink = document.getElementById('guestBookLink');
const guestBookModal = document.getElementById('guestBookOverlay');
if (guestBookLink && guestBookModal) {
  guestBookLink.addEventListener('click', (e) => { 
    e.preventDefault(); 
    
    // Reset animation by forcing a reflow
    const book = document.querySelector('.open-book');
    if (book) {
      book.style.animation = 'none';
      book.offsetHeight; // Force reflow
      book.style.animation = '';
    }
    
    openOverlay(guestBookModal); 
  });
}

/* ===== Artists carousel overlay ===== */
const artistsLink   = document.getElementById('artistsLink');
const artistsModal  = document.getElementById('artistsOverlay');
const artistsTrack  = document.getElementById('artistsTrack');

/* ===== Background video playlist ===== */
(function initBackgroundVideoPlaylist(){
  const video1 = document.getElementById('bgVideo1');
  const video2 = document.getElementById('bgVideo2');
  if (!video1 || !video2) return;
  
  const VIDEO_FILES = [
    'Driveway and Road.mp4',
    'grass.mp4',
    'road.mp4',
    'sidewalk.mp4',
    'water.mp4'
  ];
  const base = 'assets/backgrounds/';
  
  let currentIndex = 0;
  let activeVideo = video1;
  let nextVideo = video2;
  
  function srcFor(name){ return base + encodeURIComponent(name); }
  
  function preloadNext() {
    const nextIndex = (currentIndex + 1) % VIDEO_FILES.length;
    nextVideo.src = srcFor(VIDEO_FILES[nextIndex]);
    // Preload the next video
    nextVideo.load();
  }
  
  function switchVideos() {
    // Swap which video is active
    activeVideo.classList.remove('active');
    nextVideo.classList.add('active');
    
    // Play the now-active video immediately
    nextVideo.currentTime = 0;
    nextVideo.play().catch(()=>{});
    
    // Swap references
    [activeVideo, nextVideo] = [nextVideo, activeVideo];
    
    // Update index
    currentIndex = (currentIndex + 1) % VIDEO_FILES.length;
    
    // Preload the next video in sequence
    preloadNext();
  }
  
  function startPlaylist() {
    // Set up first video
    activeVideo.src = srcFor(VIDEO_FILES[0]);
    activeVideo.muted = true;
    activeVideo.loop = false;
    
    // Start playing first video
    const tryPlay = () => activeVideo.play().catch(()=>{});
    if (activeVideo.readyState >= 2) tryPlay();
    else activeVideo.onloadeddata = () => { activeVideo.onloadeddata = null; tryPlay(); };
    
    // Preload second video
    preloadNext();
  }
  
  // Set up event listeners for seamless transitions
  video1.addEventListener('ended', switchVideos);
  video2.addEventListener('ended', switchVideos);
  video1.addEventListener('error', switchVideos);
  video2.addEventListener('error', switchVideos);
  
  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      activeVideo.muted = true;
      activeVideo.play().catch(()=>{});
    }
  });
  
  // Start the playlist
  startPlaylist();
})();

/* Edit bios here. File names must match files in assets/characters/ */
const ARTISTS = [
  { file: 'inutech.png',         name: 'inutech',         bio: 'a dream for sleeping dogs, those who may never wake. inutech' },
  { file: 'akin inaj.png',       name: 'akin inaj',       bio: 'akin inaj makes whatever the fuck they want. christened with an insatiable desire to create. they are obsessed with curation, direction, and self expression (art)+. diluting oneself to a consumable object/experience (product)+ is at the core of their pursuit, while the process is the lifeblood. formative years spent online, akin inaj was molded by the relationships they built. this along with consumption molded their understanding of art+. their relationship blossomed unconsciously, and as though guided by an unseen hand the decision was made, a life of art awaits. experience their consummation. + signals product: what regretfully must be sold to subsist. art: all mediums (movies, design, paint, music. etc.)' },
  { file: 'brandon layfield.png',name: 'brandon layfield',bio: 'full time frog queen, part time bad bitch, producer, artist, anything you need me to be.' },
  { file: 'eidah.png',           name: 'eidah',           bio: 'a curious spirit wandering from coast to coast, in search of the world\'s wonders. recording the life and times they experience, in hopes of rekindling the radiance of human nature.' },
  { file: 'june takateru.png',   name: 'james takateru',   bio: 'floating in the space between dream and reality, james takateru is a project encompassing many mediums based in new york city. their work ranges audio and visual — but always focusing on taking the inspiration from the many creative worlds around them into their own. from rock and indie to pop and electronic, from ink and collage to pixel and vector, continually building inwards to create something new.' },
  { file: 'leonardo joseph.png', name: 'leonardo joseph', bio: 'leonardojosv is an artist from tampa, fl attempting to push the boundaries of what pop music can be by finding inspiration in many different genres and anything that makes sound.' },
  { file: 'mr fremon.png',       name: 'mr fremon',       bio: 'i put chords and patterns into fl and makes shit' },
  { file: 'mt saint michael.png',name: 'mt saint michael',bio: '"mt saint michael" is the current recording project of lucas grant, of philadelphia, pa. conceived as a way to bring the sounds of ambient and avant garde music to a more accessible space, mt saint michael sees grant\'s experimental production style blended with vulnerable songwriting inspired as much by contemporary folk as it is by rock and pop hits of the early 2000s. the result is a fresh and unique take on electronic pop music, as much a part of the current meta as it is detached from it. grant also works extensively as a record producer for other artists—primarily in the orca manifold—and moonlights as a dj. you can contact him at luciferiantower@gmail.com with any inquiries or questions.' },
  { file: 'oxylone.png',         name: 'oxylone',         bio: 'oxylone lives and breathes in the extra-real. blurring the lines between reality and the abstract; digital and physical. he communicates psychological experiences through his own visceral visual vocabulary. his work seeks to ensnare, at least for a moment. it reaches out from unknown corners and crevices, peeking into the psyche and rendering its home a driveling mass of tissue. lives and breathes in the extra-real. blurring the lines between reality and the abstract; digital and physical. he communicates psychological experiences through his own visceral visual vocabulary. his work seeks to ensnare, at least for a moment. it reaches out from unknown corners and crevices, peeking into the psyche and rendering its home a driveling mass of tissue.' },
  { file: 'thugbrains.png',      name: 'thugbrains',      bio: 'animator. producer. kung fu panda enthusiast. pew pew explosion' },
  { file: 'vera yvan.png',       name: 'vera yvan',       bio: 'taking hip-hop\'s penchant for remixing, reinventing, and reimagining, vera yvan constantly shifts and alters any perceptible boundary necessary to communicate a world of ideas and emotions. whether it be through music, film, creative direction, or art existing in both the physical and digital, the project is constantly working & collaborating towards a fully fleshed and realized vision without compromise.' }
];

function buildArtistsSlides() {
  if (!artistsTrack) return;
  artistsTrack.innerHTML = '';
  const isMobile = window.innerWidth < 768;

  ARTISTS.forEach(a => {
    const slide = document.createElement('div');
    slide.className = 'slide';

    const img = document.createElement('img');
    img.className = 'portrait';
    img.alt = a.name;
    img.src = `assets/characters/${a.file}`;

    const title = document.createElement('div');
    title.className = 'slide-title';
    title.textContent = a.name;

    const bio = document.createElement('div');
    bio.className = 'slide-bio';
    bio.textContent = a.bio || '';

    if (isMobile) {
      // Mobile structure: Title -> Image -> Bio
      slide.appendChild(title);
      slide.appendChild(img);
      slide.appendChild(bio);
    } else {
      // Desktop structure: Image | (Title + Bio)
      const textContent = document.createElement('div');
      textContent.className = 'slide-content';
      textContent.appendChild(title);
      textContent.appendChild(bio);
      slide.appendChild(img);
      slide.appendChild(textContent);
    }
    artistsTrack.appendChild(slide);
  });
}

function enableCarouselInteractions(trackEl) {
  if (!trackEl) return;

  // drag to scroll
  let isDown = false, startX = 0, scrollLeft = 0;
  trackEl.addEventListener('pointerdown', (e) => {
    isDown = true;
    trackEl.setPointerCapture(e.pointerId);
    startX = e.clientX;
    scrollLeft = trackEl.scrollLeft;
  });
  trackEl.addEventListener('pointermove', (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    trackEl.scrollLeft = scrollLeft - dx;
  });
  const end = () => { isDown = false; };
  trackEl.addEventListener('pointerup', end);
  trackEl.addEventListener('pointercancel', end);
  trackEl.addEventListener('pointerleave', end);

  // wheel => horizontal on the track, one slide at a time
  let isScrolling = false;
  const scrollToSlide = (direction) => {
    if (isScrolling) return;
    isScrolling = true;
    
    const slides = Array.from(trackEl.querySelectorAll('.slide'));
    const trackRect = trackEl.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;
    
    // Find the current slide (closest to center)
    let currentIndex = 0;
    let minDistance = Infinity;
    slides.forEach((slide, index) => {
      const slideRect = slide.getBoundingClientRect();
      const slideCenter = slideRect.left + slideRect.width / 2;
      const distance = Math.abs(slideCenter - trackCenter);
      if (distance < minDistance) {
        minDistance = distance;
        currentIndex = index;
      }
    });
    
    // Calculate target index with wrapping
    let targetIndex = currentIndex + direction;
    
    // Wrap around: if we go past the end, loop to beginning
    if (targetIndex >= slides.length) {
      targetIndex = 0;
    } else if (targetIndex < 0) {
      targetIndex = slides.length - 1;
    }
    
    // Scroll to target slide
    if (targetIndex !== currentIndex && slides[targetIndex]) {
      slides[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
    
    setTimeout(() => { isScrolling = false; }, 600);
  };
  
  const wheelToHorizontal = (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 10) {
      scrollToSlide(delta > 0 ? 1 : -1);
    }
  };
  trackEl.addEventListener('wheel', wheelToHorizontal, { passive: false });

  // Wheel only on the track to avoid extra event churn

  // arrow keys
  document.addEventListener('keydown', (e) => {
    if (!artistsModal.classList.contains('show')) return;
    if (e.key === 'ArrowRight') scrollToSlide(1);
    if (e.key === 'ArrowLeft') scrollToSlide(-1);
  });
}

if (artistsLink) {
  artistsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (!artistsTrack.dataset.ready) {
      buildArtistsSlides();
      enableCarouselInteractions(artistsTrack);
      artistsTrack.dataset.ready = '1';
    }
    openOverlay(artistsModal); // blurred background, on one page
  });
}

/* ===== Background music player ===== */
(function initBackgroundMusic(){
  const bgMusic = document.getElementById('bgMusic');
  const speakerBtn = document.getElementById('speakerBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const musicPlayer = document.getElementById('musicPlayer');
  
  if (!bgMusic || !speakerBtn || !volumeSlider || !musicPlayer) return;
  
  // Start as circle and muted
  bgMusic.volume = 0;
  bgMusic.muted = true;
  let sliderVisible = false;
  
  // Try to start playing (muted)
  const startMusic = () => {
    bgMusic.play().catch(() => {
      // If autoplay fails, wait for user interaction
      document.addEventListener('click', () => {
        bgMusic.play().catch(() => {});
      }, { once: true });
    });
  };
  
  // Start music when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMusic);
  } else {
    startMusic();
  }
  
  // Speaker button toggle
  speakerBtn.addEventListener('click', () => {
    // Expand to oval and show slider if not visible
    if (!sliderVisible) {
      musicPlayer.classList.add('expanded');
      volumeSlider.classList.add('visible');
      sliderVisible = true;
    }
    
    if (bgMusic.muted || bgMusic.volume === 0) {
      // Unmute and set to moderate volume
      bgMusic.muted = false;
      bgMusic.volume = 0.5;
      volumeSlider.value = 50;
      speakerBtn.classList.remove('muted');
      updateSliderAppearance(50);
    } else {
      // Mute and return to circle
      bgMusic.muted = true;
      speakerBtn.classList.add('muted');
      updateSpeakerIcon(0);
      // Collapse back to circle when muted
      musicPlayer.classList.remove('expanded');
      volumeSlider.classList.remove('visible');
      sliderVisible = false;
    }
  });
  
  // Update speaker icon based on volume level (3 levels: quiet, medium, loud)
  function updateSpeakerIcon(volume) {
    const wave1 = speakerBtn.querySelector('.speaker-wave-1');
    const wave2 = speakerBtn.querySelector('.speaker-wave-2');
    const wave3 = speakerBtn.querySelector('.speaker-wave-3');
    
    if (volume > 0) {
      // 3 volume levels: 1-33% = quiet (1 wave), 34-66% = medium (2 waves), 67%+ = loud (3 waves)
      wave1.style.opacity = volume > 0 ? '1' : '0';    // First wave: any volume > 0
      wave2.style.opacity = volume > 33 ? '1' : '0';   // Second wave: medium volume
      wave3.style.opacity = volume > 66 ? '1' : '0';   // Third wave: high volume
    } else {
      wave1.style.opacity = '0';
      wave2.style.opacity = '0';
      wave3.style.opacity = '0';
    }
  }
  
  // Volume slider
  function updateSliderAppearance(value) {
    const percentage = value;
    const greyIntensity = Math.floor(40 + (percentage * 0.4)); // 40-80 range
    const fillColor = `rgba(${greyIntensity}, ${greyIntensity}, ${greyIntensity}, 0.8)`;
    const bgColor = 'rgba(255,255,255,0.2)';
    
    volumeSlider.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${percentage}%, ${bgColor} ${percentage}%, ${bgColor} 100%)`;
    
    // Update speaker icon waves
    updateSpeakerIcon(value);
  }
  
  volumeSlider.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    bgMusic.volume = volume;
    
    // Update slider appearance
    updateSliderAppearance(e.target.value);
    
    if (volume === 0) {
      bgMusic.muted = true;
      speakerBtn.classList.add('muted');
    } else {
      bgMusic.muted = false;
      speakerBtn.classList.remove('muted');
    }
  });
  
  // Initialize slider appearance
  updateSliderAppearance(0);
  
  // Resume music when page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !bgMusic.muted) {
      bgMusic.play().catch(() => {});
    }
  });
})();

/* ===== Custom Cursor functionality ===== */
(function initCustomCursor() {
  // Check if device is mobile - if so, don't create custom cursor
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile) return;
  
  // Create cursor element
  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  cursor.innerHTML = '<img src="assets/Cursor.png" alt="">';
  document.body.appendChild(cursor);
  
  // Track mouse position
  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;
  
  // Update cursor position with smooth animation
  function updateCursor() {
    // Smooth cursor movement
    const dx = mouseX - cursorX;
    const dy = mouseY - cursorY;
    
    cursorX += dx * 1; // Set to 1 for instant following (no delay)
    cursorY += dy * 1;
    
    cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
    
    requestAnimationFrame(updateCursor);
  }
  
  // Mouse move handler
  document.addEventListener('mousemove', (e) => {
    // Offset to position fingertip at cursor
    // Adjust these values to match where the fingertip is in your image
    const offsetX = -180; // Move left (negative) or right (positive)
    const offsetY = -10; // Move up (negative) or down (positive)
    
    mouseX = e.clientX + offsetX;
    mouseY = e.clientY + offsetY;
    
    // Show cursor when mouse moves
    cursor.style.opacity = '1';
  });
  
  // Hide cursor when mouse leaves window
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
  });
  
  // Start animation loop
  updateCursor();
  
  // Add hover effects for interactive elements
  const interactiveElements = 'a, button, input, textarea, .hotspot, .chip, .card, .comment, .vote-btn, .filter-btn, .nav-btn, .viewer-btn, .close-btn';
  
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(interactiveElements)) {
      cursor.classList.add('hover');
    }
  });
  
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(interactiveElements)) {
      cursor.classList.remove('hover');
    }
  });
})();

/* ===== Guestbook functionality ===== */
(function initGuestbook() {
  // Storage key for guestbook data
  const STORAGE_KEY = 'orca-guestbook';
  
  // Get elements
  const mailingForm = document.getElementById('mailingForm');
  const guestForm = document.getElementById('guestForm');
  const commentsDisplay = document.getElementById('commentsDisplay');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const mailingStatus = document.getElementById('mailingStatus');
  
  // State
  let comments = [];
  let currentSort = 'recent';
  let currentPage = 1;
  let userVotes = {}; // Track user votes to prevent duplicate voting
  let commentsPerPage = 3; // Will be calculated dynamically
  
  // Load data from localStorage
  function loadComments() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        comments = parsed.comments || [];
        userVotes = parsed.userVotes || {};
      }
    } catch (e) {
      console.warn('Could not load guestbook data:', e);
      comments = [];
      userVotes = {};
    }
  }
  
  // Save data to localStorage
  function saveComments() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        comments,
        userVotes
      }));
    } catch (e) {
      console.warn('Could not save guestbook data:', e);
    }
  }
  
  // Remove prewritten samples: no-op function retained for compatibility
  function addSampleComments() {}
  
  // Format timestamp for display
  function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
  
  // Sort comments based on current sort method
  function sortComments(commentsToSort) {
    const sorted = [...commentsToSort];
    switch (currentSort) {
      case 'recent':
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case 'oldest':
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case 'liked':
        return sorted.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));
      default:
        return sorted;
    }
  }
  
  // Create comment HTML element
  function createCommentElement(comment) {
    const commentEl = document.createElement('div');
    commentEl.className = 'comment';
    commentEl.dataset.id = comment.id;
    
    const userLiked = userVotes[comment.id] === 'like';
    const userDisliked = userVotes[comment.id] === 'dislike';
    
    commentEl.innerHTML = `
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(comment.name)}</span>
        <span class="comment-date">${formatTimestamp(comment.timestamp)}</span>
      </div>
      <div class="comment-text">${escapeHtml(comment.message)}</div>
      <div class="comment-actions">
        <button class="vote-btn like-btn ${userLiked ? 'liked' : ''}" data-action="like" data-id="${comment.id}">
          <span>❤️</span> <span>${comment.likes}</span>
        </button>
        <button class="vote-btn dislike-btn ${userDisliked ? 'disliked' : ''}" data-action="dislike" data-id="${comment.id}">
          <span>👎</span> <span>${comment.dislikes}</span>
        </button>
      </div>
    `;
    
    return commentEl;
  }
  
  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Calculate how many comments fit on a page
  function calculateCommentsPerPage() {
    if (!commentsDisplay) return 4;
    
    const displayHeight = commentsDisplay.offsetHeight;
    // Estimate comment height - reduced to fit 4 comments better
    const estimatedCommentHeight = 100;
    const calculatedPerPage = Math.floor(displayHeight / estimatedCommentHeight);
    
    // Default to 4 comments per page for optimal display
    return Math.max(3, Math.min(4, calculatedPerPage));
  }
  
  // Display comments for current page
  function displayComments() {
    if (!commentsDisplay) return;
    
    // Recalculate comments per page
    commentsPerPage = calculateCommentsPerPage();
    
    const sortedComments = sortComments(comments);
    const totalPages = Math.ceil(sortedComments.length / commentsPerPage);
    
    // Ensure current page is valid
    if (currentPage > totalPages && totalPages > 0) {
      currentPage = totalPages;
    }
    if (currentPage < 1) {
      currentPage = 1;
    }
    
    const startIndex = (currentPage - 1) * commentsPerPage;
    const endIndex = startIndex + commentsPerPage;
    const commentsToShow = sortedComments.slice(startIndex, endIndex);
    
    // Clear and populate comments display
    commentsDisplay.innerHTML = '';
    
    if (commentsToShow.length === 0) {
      commentsDisplay.innerHTML = '<div class="no-comments">No messages yet. Be the first to sign!</div>';
    } else {
      commentsToShow.forEach(comment => {
        commentsDisplay.appendChild(createCommentElement(comment));
      });
    }
    
    // Update page info and navigation buttons
    if (pageInfo) {
      pageInfo.textContent = totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : 'Page 1';
    }
    
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage <= 1;
    }
    
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= totalPages || totalPages === 0;
    }
    
  }
  
  // Handle voting
  function handleVote(commentId, action) {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    
    const previousVote = userVotes[commentId];
    
    // Remove previous vote if it exists
    if (previousVote === 'like') {
      comment.likes = Math.max(0, comment.likes - 1);
    } else if (previousVote === 'dislike') {
      comment.dislikes = Math.max(0, comment.dislikes - 1);
    }
    
    // Apply new vote if different from previous
    if (previousVote !== action) {
      if (action === 'like') {
        comment.likes++;
        userVotes[commentId] = 'like';
      } else if (action === 'dislike') {
        comment.dislikes++;
        userVotes[commentId] = 'dislike';
      }
    } else {
      // Remove vote if clicking same button
      delete userVotes[commentId];
    }
    
    saveComments();
    displayComments();
  }
  
  // Handle comment form submission
  if (guestForm) {
    guestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const formData = new FormData(guestForm);
      const name = formData.get('name')?.trim();
      const message = formData.get('note')?.trim();
      
      if (!name || !message) {
        alert('Please fill in both name and message.');
        return;
      }
      
      if (message.length > 500) {
        alert('Message is too long. Please keep it under 500 characters.');
        return;
      }
      
      // Add new comment
      const newComment = {
        id: Date.now(),
        name,
        message,
        timestamp: Date.now(),
        likes: 0,
        dislikes: 0
      };
      
      comments.push(newComment);
      saveComments();
      
      // Reset form and refresh display
      guestForm.reset();
      currentPage = 1; // Go to first page to show new comment
      displayComments();
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'success-message';
      successMsg.textContent = 'Thank you for signing the guestbook!';
      successMsg.style.cssText = 'color: #28a745; font-size: 12px; margin-top: 8px; text-align: center;';
      
      const existingSuccess = guestForm.querySelector('.success-message');
      if (existingSuccess) {
        existingSuccess.remove();
      }
      
      guestForm.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
    });
    
    // Handle Enter key in textarea - prevent default behavior and submit form
    const noteTextarea = guestForm.querySelector('textarea[name="note"]');
    if (noteTextarea) {
      noteTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const submitBtn = guestForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      });
    }
  }
  
  // Handle mailing list form submission
  if (mailingForm && mailingStatus) {
    mailingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const formData = new FormData(mailingForm);
      const name = formData.get('name')?.trim();
      const email = formData.get('email')?.trim();
      
      if (!name || !email) {
        mailingStatus.textContent = 'Please fill in both fields.';
        mailingStatus.style.color = '#dc3545';
        return;
      }
      
      // Simple email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        mailingStatus.textContent = 'Please enter a valid email address.';
        mailingStatus.style.color = '#dc3545';
        return;
      }
      
      // Simulate successful signup
      mailingForm.reset();
      mailingStatus.textContent = 'Thank you for joining our mailing list!';
      mailingStatus.style.color = '#28a745';
      
      setTimeout(() => {
        mailingStatus.textContent = '';
      }, 5000);
    });
    
    // Handle Enter key in email input - submit form
    const emailInput = mailingForm.querySelector('input[name="email"]');
    if (emailInput) {
      emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const submitBtn = mailingForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      });
    }
  }
  
  // Handle filter button clicks
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active filter button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update current sort and refresh display
      currentSort = btn.dataset.sort;
      currentPage = 1;
      displayComments();
    });
  });
  
  // Handle pagination
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        displayComments();
      }
    });
  }
  
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(comments.length / commentsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        displayComments();
      }
    });
  }
  
  
  // Handle vote button clicks (event delegation)
  if (commentsDisplay) {
    commentsDisplay.addEventListener('click', (e) => {
      if (e.target.closest('.vote-btn')) {
        const btn = e.target.closest('.vote-btn');
        const action = btn.dataset.action;
        const commentId = parseInt(btn.dataset.id);
        
        if (action && commentId) {
          handleVote(commentId, action);
        }
      }
    });
  }
  
  // Initialize guestbook
  loadComments();
  // If the only existing items are the previous sample names, clear them once
  try {
    const onlySamples = comments.length > 0 && comments.length <= 5 && comments.every(c => ['Alex','Sam','Jordan'].includes(c.name));
    if (onlySamples) { comments = []; userVotes = {}; saveComments(); }
  } catch {}
  displayComments();
  
  // Recalculate comments per page on window resize
  window.addEventListener('resize', () => {
    const oldCommentsPerPage = commentsPerPage;
    commentsPerPage = calculateCommentsPerPage();
    if (oldCommentsPerPage !== commentsPerPage) {
      displayComments();
    }
  });
  
})();
