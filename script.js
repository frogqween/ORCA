/* ===== constants ===== */
const DESIGN_W = 3840;
const DESIGN_H = 2160;

/* ===== orientation gate ===== */
function checkOrientationGate() {
  const gate = document.getElementById('orientation-gate');
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isPortrait = window.innerHeight > window.innerWidth;
  if (isMobile && isPortrait) gate.classList.remove('hidden');
  else gate.classList.add('hidden');
}
window.addEventListener('resize', checkOrientationGate);
checkOrientationGate();

/* ===== stage layout scale ===== */
const stageWrap = document.getElementById('stage-wrap');
const stage = document.getElementById('stage');

function layoutScale() {
  const sw = stageWrap.clientWidth;
  const sh = stageWrap.clientHeight;
  const scale = Math.min(sw / DESIGN_W, sh / DESIGN_H);
  stage.style.transform = `scale(${scale})`;
  const offsetX = (sw - DESIGN_W * scale) / 2;
  const offsetY = (sh - DESIGN_H * scale) / 2;
  stage.style.left = `${offsetX}px`;
  stage.style.top = `${offsetY}px`;
  stage.style.position = 'absolute';
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

let musicData = [];
let activeArtist = 'all';
let activeType = null;
let coverCache = new Map();
let loadingCovers = new Map();

function unique(list, key) {
  const allValues = list.flatMap(x => x[key]).filter(Boolean);
  return [...new Set(allValues)];
}

function renderMusic() {
  if (!musicData.length) return;

  // Artist chips
const artists = unique(musicData, 'artist');
  const allArtists = [...artists, 'thugbrains'];
  const sortedArtists = [...new Set(allArtists)].sort((a, b) => {
    if (a === 'inutech') return -1;
    if (b === 'inutech') return 1;
    return a.localeCompare(b);
  });
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

      const cover = document.createElement('div');
      cover.className = 'cover-wrap';

      const img = document.createElement('img');
      img.alt = `${item.title} cover`;
      img.id = `cover-${idx}`;

      if (item.cover) img.src = item.cover; // direct URL (optional)

      img.dataset.spotify = item.spotify || '';
      img.dataset.apple   = item.apple || '';
      img.dataset.q       = `${item.artist||''} ${item.title||''}`.trim();

      cover.appendChild(img);

const body = document.createElement('div');
      body.className = 'card-body';
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = item.title;

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
      card.appendChild(cover);
      card.appendChild(body);
      fragment.appendChild(card);
    });

  musicGrid.appendChild(fragment);
  requestAnimationFrame(() => hydrateCovers());
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
  if (btn.dataset.filter === 'all') {
    activeArtist = 'all'; activeType = null;
    document.querySelectorAll('#musicFilters .chip').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    renderMusic();
    return;
  }
  if (btn.dataset.type) {
    const t = btn.dataset.type;
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
  });
}

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
      () => openOverlay(documentModal)
    );
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
  { file: 'akin inaj.png',       name: 'akin inaj',       bio: 'artist/producer. orca collective. singles include “x cited”, “stuck!”, “sinner’s sorry bones”.' },
  { file: 'vera yvan.png',       name: 'vera yvan',       bio: 'rapper/producer. 2025 singles: “protection spell”, “oef”, “superstar grim reaper”.' },
  { file: 'inutech.png',         name: 'inutech',         bio: 'producer/engineer. album “sort of light*”. collaborations across orca.' },
  { file: 'mt saint michael.png',name: 'mt saint michael',bio: 'composer. album “broadway nightlights” (2024).' },
  { file: 'june takateru.png',   name: 'june takateru',   bio: 'singer/songwriter (formerly james). 2025 singles: “medicine”, “i need you to know”.' },
  { file: 'leonardo joseph.png', name: 'leonardo joseph', bio: 'visual/music artist. 2023 “power+” single pack.' },
  { file: 'mr fremon.png',       name: 'mr fremon',       bio: 'rapper/producer. 2025 project “voice messages”.' },
  { file: 'oxylone.png',         name: 'oxylone',         bio: 'artist.' },
  { file: 'thugbrains.png',      name: 'thugbrains',      bio: 'artist/producer.' },
  { file: 'eidah.png',           name: 'eidah',           bio: 'artist.' },
  { file: 'brandon layfield.png',name: 'brandon layfield',bio: 'artist.' }
];

function buildArtistsSlides() {
  if (!artistsTrack) return;
  artistsTrack.innerHTML = '';
  ARTISTS.forEach(a => {
    const slide = document.createElement('div');
    slide.className = 'slide';

    const head = document.createElement('div');
    head.className = 'slide-head';

    const img = document.createElement('img');
    img.className = 'portrait';
    img.alt = `${a.name}`;
    img.src = `assets/characters/${a.file}`;

    const title = document.createElement('div');
    title.className = 'slide-title';
    title.textContent = a.name;

    head.appendChild(img);
    head.appendChild(title);

    const bio = document.createElement('div');
    bio.className = 'slide-bio';
    bio.textContent = a.bio || '';

    slide.appendChild(head);
    slide.appendChild(bio);

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

  // wheel => horizontal on the track
  // Snap-by-card on wheel (smooth, stable)
  let wheelAccum = 0;
  const cardWidth = () => {
    const first = trackEl.querySelector('.slide');
    if (!first) return trackEl.clientWidth * 0.8;
    const w = first.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(trackEl).gap || '16');
    return w + gap;
  };
  const WHEEL_STEP_MULT = 1.8; // moderate speed
  const snapTo = (dir) => {
    const step = cardWidth() * WHEEL_STEP_MULT;
    trackEl.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  const wheelToHorizontal = (e) => {
    const delta = Math.abs(e.deltaX) < Math.abs(e.deltaY) ? e.deltaY : e.deltaX;
    wheelAccum += delta;
    const threshold = 40;
    if (wheelAccum >= threshold) { snapTo(+1); wheelAccum = 0; }
    else if (wheelAccum <= -threshold) { snapTo(-1); wheelAccum = 0; }
    e.preventDefault();
  };
  trackEl.addEventListener('wheel', wheelToHorizontal, { passive: false });

  // Wheel only on the track to avoid extra event churn

  // arrow keys
  document.addEventListener('keydown', (e) => {
    if (!artistsModal.classList.contains('show')) return;
    const step = trackEl.clientWidth * 0.8;
    if (e.key === 'ArrowRight') trackEl.scrollBy({ left: +step, behavior: 'smooth' });
    if (e.key === 'ArrowLeft')  trackEl.scrollBy({ left: -step, behavior: 'smooth' });
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
