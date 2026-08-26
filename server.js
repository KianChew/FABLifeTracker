const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ---- Layout persistence -------------------------------------------------
const LAYOUT_FILE = path.join(__dirname, 'layout.json');

// Default element positions are expressed as fractions of the canvas so
// they scale sensibly at any resolution.
function defaultLayout(width = 1920, height = 1080) {
  return {
    canvas: { width, height },
    elements: {
      p1: {
        x: Math.round(width * 0.02), y: Math.round(height * 0.03),
        width: Math.round(width * 0.14), height: Math.round(height * 0.11),
        displayMode: 'numeric',
      },
      p2: {
        x: Math.round(width * 0.84), y: Math.round(height * 0.03),
        width: Math.round(width * 0.14), height: Math.round(height * 0.11),
        displayMode: 'numeric',
      },
      p1Hero: {
        x: Math.round(width * 0.02), y: Math.round(height * 0.16),
        width: Math.round(width * 0.14), height: Math.round(height * 0.25),
      },
      p2Hero: {
        x: Math.round(width * 0.84), y: Math.round(height * 0.16),
        width: Math.round(width * 0.14), height: Math.round(height * 0.25),
      },
      timer: {
        x: Math.round(width * 0.5 - width * 0.09), y: Math.round(height * 0.03),
        width: Math.round(width * 0.18), height: Math.round(height * 0.065),
      },
    },
  };
}

function loadLayout() {
  try {
    const raw = fs.readFileSync(LAYOUT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.canvas && parsed.elements) {
      const fallback = defaultLayout(parsed.canvas.width, parsed.canvas.height);
      return {
        ...parsed,
        elements: {
          ...fallback.elements,
          ...parsed.elements,
          p1: { ...fallback.elements.p1, ...parsed.elements.p1 },
          p2: { ...fallback.elements.p2, ...parsed.elements.p2 },
        },
      };
    }
  } catch {
    // no saved layout yet, or it's corrupt — fall back to defaults
  }
  return defaultLayout();
}

function saveLayout() {
  fs.writeFile(LAYOUT_FILE, JSON.stringify(state.layout, null, 2), () => {});
}

// ---- Hero database persistence ------------------------------------------
const HEROES_FILE = path.join(__dirname, 'heroes.json');
const HERO_IMAGES_DIR = path.join(__dirname, 'public', 'hero-images');
const HERO_ART_DIR = path.join(__dirname, 'public', 'hero-art');
fs.mkdirSync(HERO_IMAGES_DIR, { recursive: true });
fs.mkdirSync(HERO_ART_DIR, { recursive: true });

function loadHeroes() {
  try {
    const raw = fs.readFileSync(HEROES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // no saved hero list yet
  }
  return [];
}

function saveHeroes() {
  fs.writeFile(HEROES_FILE, JSON.stringify(state.heroes, null, 2), () => {});
}

function makeId() {
  return 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function numericLife(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeroName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function applyImportedHero(card, importedByName) {
  const name = String(card.printed_name || '').trim();
  const typebox = String(card.printed_typebox || '');
  const life = numericLife(card.printed_life);
  if (!name || life == null) return;
  if (!/\bHero\b/i.test(typebox) || /\bDemi-Hero\b/i.test(typebox)) return;

  const key = normalizeHeroName(name);
  if (!importedByName.has(key)) {
    importedByName.set(key, {
      name: name.slice(0, 40),
      ccLife: null,
      sageLife: null,
      imageUrl: card.faces?.[0]?.image?.large || null,
    });
  }

  const imported = importedByName.get(key);
  if (!imported.imageUrl) imported.imageUrl = card.faces?.[0]?.image?.large || null;
  if (/\bYoung\b/i.test(typebox)) {
    imported.sageLife = imported.sageLife == null ? life : Math.max(imported.sageLife, life);
  } else {
    imported.ccLife = imported.ccLife == null ? life : Math.max(imported.ccLife, life);
  }
}

async function fetchCardVaultHeroes() {
  const importedByName = new Map();
  let page = 1;
  let next = true;

  while (next) {
    const params = new URLSearchParams({
      type: 'Hero',
      life_lookup: 'gte',
      life: '1',
      page_size: '100',
      page: String(page),
    });
    const res = await fetch(`https://api.cardvault.fabtcg.com/carddb/api/v1/advanced-search?${params}`);
    if (!res.ok) throw new Error(`CardVault returned HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data.results)) throw new Error('CardVault returned an unexpected response.');
    data.results.forEach((card) => applyImportedHero(card, importedByName));

    next = Boolean(data.next);
    page += 1;
  }

  return [...importedByName.values()].filter((h) => h.ccLife != null || h.sageLife != null);
}

function mergeImportedHeroes(importedHeroes) {
  let added = 0;
  let updated = 0;
  const imageJobs = [];
  const existingByName = new Map(state.heroes.map((h) => [normalizeHeroName(h.name), h]));

  importedHeroes.forEach((imported) => {
    const existing = existingByName.get(normalizeHeroName(imported.name));
    if (existing) {
      let changed = false;
      if (imported.ccLife != null && existing.ccLife !== imported.ccLife) {
        existing.ccLife = imported.ccLife;
        changed = true;
      }
      if (imported.sageLife != null && existing.sageLife !== imported.sageLife) {
        existing.sageLife = imported.sageLife;
        changed = true;
      }
      if (imported.imageUrl) imageJobs.push({ hero: existing, url: imported.imageUrl });
      if (changed) updated += 1;
      return;
    }

    const hero = {
      id: makeId(),
      name: imported.name,
      ccLife: imported.ccLife,
      sageLife: imported.sageLife,
    };
    state.heroes.push(hero);
    if (imported.imageUrl) imageJobs.push({ hero, url: imported.imageUrl });
    added += 1;
  });

  state.players.forEach((p) => {
    const hero = state.heroes.find((h) => h.id === p.heroId);
    if (hero) p.heroName = hero.name;
  });

  return { added, updated, totalImported: importedHeroes.length, imageJobs };
}

async function cropHeroArt(heroId, sourcePath) {
  const filename = `${heroId}.webp`;
  const artPath = path.join(HERO_ART_DIR, filename);
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error('image dimensions unavailable');

  await sharp(sourcePath)
    .extract({
      left: Math.round(width * 0.08),
      top: Math.round(height * 0.13),
      width: Math.round(width * 0.84),
      height: Math.round(height * 0.39),
    })
    .webp({ quality: 92 })
    .toFile(artPath);

  return `/hero-art/${filename}`;
}

async function cacheHeroImage(heroId, imageUrl) {
  const filename = `${heroId}.webp`;
  const filePath = path.join(HERO_IMAGES_DIR, filename);
  const imagePath = `/hero-images/${filename}`;

  if (!fs.existsSync(filePath)) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`image download returned HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(filePath, bytes);
  }

  return {
    imagePath,
    artPath: await cropHeroArt(heroId, filePath),
  };
}

async function importHeroesFromCardVault() {
  if (state.heroImport.running) return;
  state.heroImport = { running: true, message: 'Importing heroes from CardVault...' };
  broadcast();

  try {
    const importedHeroes = await fetchCardVaultHeroes();
    const result = mergeImportedHeroes(importedHeroes);
    state.heroImport = {
      running: true,
      message: `Downloading ${result.imageJobs.length} hero images...`,
    };
    broadcast();

    let imagesDownloaded = 0;
    let imagesFailed = 0;
    for (const job of result.imageJobs) {
      try {
        const cached = await cacheHeroImage(job.hero.id, job.url);
        job.hero.imagePath = cached.imagePath;
        job.hero.artPath = cached.artPath;
        imagesDownloaded += 1;
      } catch {
        imagesFailed += 1;
      }
    }

    saveHeroes();
    state.heroImport = {
      running: false,
      message: `CardVault import complete: ${result.added} added, ${result.updated} updated, ${imagesDownloaded} images cached${imagesFailed ? `, ${imagesFailed} image downloads failed` : ''}.`,
    };
  } catch (err) {
    state.heroImport = {
      running: false,
      message: `CardVault import failed: ${err.message || 'Unknown error'}`,
    };
  }

  broadcast();
}

async function upgradeExistingHeroArt() {
  const pending = state.heroes.filter((hero) => hero.imagePath && !hero.artPath);
  if (!pending.length) return;

  let updated = 0;
  for (const hero of pending) {
    const localImagePath = path.join(__dirname, 'public', hero.imagePath.replace(/^\//, ''));
    if (!fs.existsSync(localImagePath)) continue;
    try {
      hero.artPath = await cropHeroArt(hero.id, localImagePath);
      updated += 1;
    } catch {
      // leave the hero without art if the source image is bad
    }
  }

  if (updated > 0) saveHeroes();
}

// ---- State ----------------------------------------------------------
let state = {
  phase: 'setup', // 'setup' | 'live'
  setup: {
    format: 'cc',
    names: ['Player 1', 'Player 2'],
    heroIds: [null, null],
    timerMode: 'countdown',
    durationMs: 30 * 60000,
  },
  players: [
    { name: 'Player 1', life: 20, heroId: null, heroName: '' },
    { name: 'Player 2', life: 20, heroId: null, heroName: '' },
  ],
  startingLife: 20,
  timer: {
    mode: 'countdown',       // 'countdown' | 'stopwatch'
    durationMs: 30 * 60000,  // configured countdown length
    remainingMs: 30 * 60000, // countdown time left
    elapsedMs: 0,            // stopwatch time elapsed
    running: false,
    lastTick: null,
  },
  layout: loadLayout(),
  heroes: loadHeroes(), // { id, name, ccLife, sageLife } — ccLife/sageLife null if hero doesn't exist in that format
  heroImport: { running: false, message: '' },
  lastFormat: null,     // 'cc' | 'sage' | null — remembers the last format picked, for convenience
};

void upgradeExistingHeroArt();

function broadcast() {
  const msg = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ---- Timer tick loop --------------------------------------------------
setInterval(() => {
  if (!state.timer.running) return;
  const now = Date.now();
  const delta = now - state.timer.lastTick;
  state.timer.lastTick = now;

  if (state.timer.mode === 'countdown') {
    state.timer.remainingMs = Math.max(0, state.timer.remainingMs - delta);
    if (state.timer.remainingMs === 0) state.timer.running = false;
  } else {
    state.timer.elapsedMs += delta;
  }
  broadcast();
}, 200);

// ---- WebSocket handling ------------------------------------------------
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state }));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    handleMessage(msg);
  });
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'life:delta': {
      const p = state.players[msg.player];
      if (p) p.life += msg.delta;
      break;
    }
    case 'life:set': {
      const p = state.players[msg.player];
      if (p) p.life = msg.value;
      break;
    }
    case 'name:set': {
      const p = state.players[msg.player];
      if (p) {
        const name = String(msg.value || '').slice(0, 24);
        p.name = name || `Player ${Number(msg.player) + 1}`;
        state.setup.names[msg.player] = p.name;
      }
      break;
    }
    case 'match:setup:update': {
      const player = Number(msg.player);
      if (msg.field === 'name' && (player === 0 || player === 1)) {
        const name = String(msg.value || '').slice(0, 24);
        state.setup.names[player] = name || `Player ${player + 1}`;
      } else if (msg.field === 'format') {
        state.setup.format = msg.value === 'sage' ? 'sage' : 'cc';
        state.setup.heroIds = [null, null];
      } else if (msg.field === 'hero' && (player === 0 || player === 1)) {
        const hero = state.heroes.find((h) => h.id === msg.value);
        const lifeKey = state.setup.format === 'sage' ? 'sageLife' : 'ccLife';
        state.setup.heroIds[player] = hero && hero[lifeKey] != null ? hero.id : null;
      } else if (msg.field === 'timerMode') {
        state.setup.timerMode = msg.value === 'stopwatch' ? 'stopwatch' : 'countdown';
      } else if (msg.field === 'duration') {
        state.setup.durationMs = Math.min(180 * 60000, Math.max(60000, Math.round(Number(msg.value))));
      }
      break;
    }
    case 'match:setup:open': {
      state.phase = 'setup';
      state.setup.names = state.players.map((p, i) => p.name || `Player ${i + 1}`);
      state.setup.heroIds = state.players.map((p) => p.heroId || null);
      state.setup.format = state.lastFormat === 'sage' ? 'sage' : 'cc';
      state.setup.timerMode = state.timer.mode;
      state.setup.durationMs = state.timer.durationMs;
      break;
    }
    case 'timer:start': {
      state.timer.running = true;
      state.timer.lastTick = Date.now();
      break;
    }
    case 'timer:pause': {
      state.timer.running = false;
      break;
    }
    case 'timer:reset': {
      state.timer.running = false;
      state.timer.remainingMs = state.timer.durationMs;
      state.timer.elapsedMs = 0;
      break;
    }
    case 'timer:setDuration': {
      state.timer.durationMs = msg.value;
      state.timer.remainingMs = msg.value;
      state.timer.running = false;
      break;
    }
    case 'timer:setMode': {
      state.timer.mode = msg.value;
      state.timer.running = false;
      state.timer.remainingMs = state.timer.durationMs;
      state.timer.elapsedMs = 0;
      break;
    }
    case 'match:reset': {
      const startingLife = msg.startingLife ?? state.startingLife;
      state.startingLife = startingLife;
      state.players.forEach((p) => {
        p.life = startingLife;
        p.heroId = null;
        p.heroName = '';
      });
      state.setup.names = state.players.map((p, i) => p.name || `Player ${i + 1}`);
      state.setup.heroIds = [null, null];
      state.phase = 'setup';
      break;
    }
    case 'match:start': {
      const setup = {
        ...state.setup,
        ...(msg.format ? { format: msg.format } : {}),
        ...(Array.isArray(msg.heroIds) ? { heroIds: msg.heroIds } : {}),
        ...(Array.isArray(msg.names) ? { names: msg.names } : {}),
        ...(msg.timerMode ? { timerMode: msg.timerMode } : {}),
        ...(msg.durationMs != null ? { durationMs: msg.durationMs } : {}),
      };
      const format = setup.format === 'sage' ? 'sage' : 'cc';
      state.lastFormat = format;
      state.setup = {
        format,
        names: [0, 1].map((i) => String(setup.names?.[i] || `Player ${i + 1}`).slice(0, 24)),
        heroIds: [0, 1].map((i) => setup.heroIds?.[i] || null),
        timerMode: setup.timerMode === 'stopwatch' ? 'stopwatch' : 'countdown',
        durationMs: Math.min(180 * 60000, Math.max(60000, Math.round(Number(setup.durationMs) || 30 * 60000))),
      };
      state.players.forEach((p, i) => {
        p.name = state.setup.names[i];
        p.life = state.startingLife;
        p.heroId = null;
        p.heroName = '';
      });
      state.setup.heroIds.forEach((heroId, i) => {
        const p = state.players[i];
        const hero = state.heroes.find((h) => h.id === heroId);
        if (!p || !hero) return;
        const life = format === 'cc' ? hero.ccLife : hero.sageLife;
        if (life != null) p.life = life;
        p.heroId = hero.id;
        p.heroName = hero.name;
      });
      state.timer.mode = state.setup.timerMode;
      state.timer.durationMs = state.setup.durationMs;
      state.timer.remainingMs = state.timer.durationMs;
      state.timer.elapsedMs = 0;
      state.timer.running = false;
      state.timer.lastTick = null;
      state.phase = 'live';
      break;
    }
    case 'hero:add': {
      const hero = {
        id: makeId(),
        name: (msg.name || '').slice(0, 40),
        ccLife: msg.ccLife != null && msg.ccLife !== '' ? Number(msg.ccLife) : null,
        sageLife: msg.sageLife != null && msg.sageLife !== '' ? Number(msg.sageLife) : null,
      };
      state.heroes.push(hero);
      saveHeroes();
      break;
    }
    case 'hero:update': {
      const hero = state.heroes.find((h) => h.id === msg.id);
      if (!hero) return;
      if (msg.name != null) hero.name = msg.name.slice(0, 40);
      hero.ccLife = msg.ccLife != null && msg.ccLife !== '' ? Number(msg.ccLife) : null;
      hero.sageLife = msg.sageLife != null && msg.sageLife !== '' ? Number(msg.sageLife) : null;
      // Keep any players currently using this hero in sync with the edited name.
      state.players.forEach((p) => {
        if (p.heroId === hero.id) p.heroName = hero.name;
      });
      saveHeroes();
      break;
    }
    case 'hero:delete': {
      state.heroes = state.heroes.filter((h) => h.id !== msg.id);
      state.players.forEach((p) => {
        if (p.heroId === msg.id) {
          p.heroId = null;
          p.heroName = '';
        }
      });
      saveHeroes();
      break;
    }
    case 'hero:importCardVault': {
      importHeroesFromCardVault();
      return;
    }
    case 'layout:setCanvas': {
      const newW = Math.max(320, Math.round(msg.width));
      const newH = Math.max(180, Math.round(msg.height));
      const oldW = state.layout.canvas.width;
      const oldH = state.layout.canvas.height;
      const rx = newW / oldW;
      const ry = newH / oldH;
      Object.values(state.layout.elements).forEach((el) => {
        el.x = Math.round(el.x * rx);
        el.y = Math.round(el.y * ry);
        el.width = Math.round(el.width * rx);
        el.height = Math.round(el.height * ry);
      });
      state.layout.canvas = { width: newW, height: newH };
      saveLayout();
      break;
    }
    case 'layout:setElement': {
      const el = state.layout.elements[msg.id];
      if (!el) return;
      if ((msg.id === 'p1' || msg.id === 'p2') && msg.displayMode != null) {
        el.displayMode = msg.displayMode === 'healthbar' ? 'healthbar' : 'numeric';
      }
      const cw = state.layout.canvas.width;
      const ch = state.layout.canvas.height;
      if (msg.width != null) el.width = Math.max(60, Math.round(msg.width));
      if (msg.height != null) el.height = Math.max(40, Math.round(msg.height));
      if (msg.x != null) el.x = Math.round(Math.min(Math.max(msg.x, 0), cw - el.width));
      if (msg.y != null) el.y = Math.round(Math.min(Math.max(msg.y, 0), ch - el.height));
      saveLayout();
      break;
    }
    case 'layout:reset': {
      state.layout = defaultLayout(state.layout.canvas.width, state.layout.canvas.height);
      saveLayout();
      break;
    }
    default:
      return;
  }
  broadcast();
}

// ---- Helpers -------------------------------------------------------
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

app.get('/api/network', (req, res) => {
  res.json({ ip: getLocalIp(), port: PORT });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const ip = getLocalIp();
  console.log('\nLife Tracker server is running.\n');
  console.log(`  On this PC:      http://localhost:${PORT}`);
  console.log(`  On the tablet:   http://${ip}:${PORT}/controller.html`);
  console.log(`  OBS browser src: http://${ip}:${PORT}/overlay.html\n`);
});
