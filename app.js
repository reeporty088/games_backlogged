import { loadRemoteStore, saveRemoteStore, uploadImage } from './firebase.js';

const STORAGE_KEY = 'noites_indie_store_v2';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const NUMS = ['0', '1', '2', '3', '4', '5'];

function defaultToken() {
  return { id: 'token-default', name: 'Teste', imageUrl: '' };
}

function normalizeStore(rawStore) {
  const base = rawStore || {};
  const tokens = Array.isArray(base.tokens) && base.tokens.length ? base.tokens : [defaultToken()];
  const normalizedTokens = tokens.map((token) => ({
    ...token,
    imageUrl: token.imageUrl || token.imageDataUrl || ''
  }));
  const games = Array.isArray(base.games)
    ? base.games.map((game) => ({
        ...game,
        coverUrl: game.coverUrl || game.coverDataUrl || ''
      }))
    : [];

  return { games, tokens: normalizedTokens };
}

async function loadStore() {
  const localRaw = localStorage.getItem(STORAGE_KEY);
  const localStore = localRaw ? normalizeStore(JSON.parse(localRaw)) : null;

  try {
    const remote = await loadRemoteStore();
    const hasRemoteData =
      remote &&
      (Array.isArray(remote.games) && remote.games.length > 0
        || Array.isArray(remote.tokens) && remote.tokens.length > 0);

    if (!hasRemoteData && localStore) {
      await saveRemoteStore(localStore);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localStore));
      return localStore;
    }

    const store = normalizeStore(remote);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return store;
  } catch (error) {
    console.warn('Falha ao carregar do Firebase. Usando cache local.', error);
    return localStore || { games: [], tokens: [defaultToken()] };
  }
}

async function saveStore(store) {
  const normalized = normalizeStore(store);
  await saveRemoteStore(normalized);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function initStars() {
  const box = document.getElementById('stars');
  if (!box) return;
  const qtd = 80;
  const stars = [];

  for (let i = 0; i < qtd; i += 1) {
    const el = document.createElement('span');
    el.className = 'star';
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const depth = Math.random() * 0.9 + 0.2;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.opacity = String(Math.random() * 0.65 + 0.35);
    stars.push({ el, depth, x, y });
    box.appendChild(el);
  }

  window.addEventListener('mousemove', (e) => {
    const mx = (e.clientX / window.innerWidth - 0.5) * 24;
    const my = (e.clientY / window.innerHeight - 0.5) * 24;
    for (const s of stars) {
      s.el.style.transform = `translate(${mx * s.depth}px, ${my * s.depth}px)`;
    }
  });
}

function getTokenImage(token) {
  if (!token?.imageUrl) return '<div class="token-preview"></div>';
  return `<img src="${token.imageUrl}" alt="${token.name}">`;
}

async function initListaPage() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const empty = document.getElementById('empty-list');
  const addBtn = document.getElementById('btn-new-game');
  addBtn?.addEventListener('click', () => {
    window.location.href = 'plano.html';
  });

  const store = await loadStore();
  const games = [...store.games].sort((a, b) => a.number - b.number);

  if (!games.length) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = '';

  for (const game of games) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.addEventListener('click', () => {
      window.location.href = `plano.html?id=${game.id}`;
    });

    const notes = (game.ratings || []).map((r) => `${r.tokenName}: ${r.row}${r.col}`).join('<br>') || 'Sem notas';

    card.innerHTML = `
      <span class="game-index">${pad2(game.number)}</span>
      <img class="game-cover" src="${game.coverUrl || ''}" alt="${game.name}">
      <div class="game-content">
        <h3>${game.name}</h3>
        <p>Finalizado: ${game.finishedAt || '—'}</p>
        <div class="notes-list">${notes}</div>
      </div>
    `;

    if (!game.coverUrl) {
      card.querySelector('.game-cover').style.background = 'linear-gradient(120deg,#3c1f71,#130927)';
    }

    grid.appendChild(card);
  }
}

async function initPlanoPage() {
  const form = document.getElementById('game-form');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const editingId = params.get('id');

  const store = await loadStore();
  const game = store.games.find((g) => g.id === editingId) || null;

  const nameEl = document.getElementById('game-name');
  const numEl = document.getElementById('game-number');
  const dateEl = document.getElementById('finished-at');

  const coverInput = document.getElementById('cover-input');
  const coverCanvas = document.getElementById('cover-canvas');
  const placeholder = document.getElementById('cover-placeholder');
  const pasteZone = document.getElementById('paste-zone');
  const zoomEl = document.getElementById('zoom');
  const panXEl = document.getElementById('pan-x');
  const panYEl = document.getElementById('pan-y');

  const tokenImageInput = document.getElementById('token-image-input');
  const tokenNameInput = document.getElementById('token-name-input');
  const addTokenBtn = document.getElementById('btn-add-token');
  const tokensStrip = document.getElementById('tokens-strip');
  const chart = document.getElementById('chart-grid');

  const ctx = coverCanvas.getContext('2d');
  let sourceImg = null;
  let currentCoverUrl = game?.coverUrl || '';
  let coverFileToUpload = null;
  let ratings = game?.ratings ? [...game.ratings] : [];

  const nextNumber = Math.max(0, ...store.games.map((g) => g.number || 0)) + (game ? 0 : 1);
  const number = game?.number || nextNumber;

  numEl.value = pad2(number);
  nameEl.value = game?.name || '';
  dateEl.value = game?.finishedAt || '';

  function renderCover() {
    ctx.clearRect(0, 0, coverCanvas.width, coverCanvas.height);
    if (!sourceImg && !currentCoverUrl) {
      placeholder.style.display = 'block';
      return;
    }

    placeholder.style.display = 'none';
    if (!sourceImg && currentCoverUrl) {
      sourceImg = new Image();
      sourceImg.onload = renderCover;
      sourceImg.src = currentCoverUrl;
      return;
    }

    const zoom = Number(zoomEl.value);
    const px = Number(panXEl.value);
    const py = Number(panYEl.value);

    const baseScale = Math.max(coverCanvas.width / sourceImg.width, coverCanvas.height / sourceImg.height);
    const scale = baseScale * zoom;
    const dw = sourceImg.width * scale;
    const dh = sourceImg.height * scale;
    const dx = (coverCanvas.width - dw) / 2 + px;
    const dy = (coverCanvas.height - dh) / 2 + py;

    ctx.drawImage(sourceImg, dx, dy, dw, dh);
  }

  function updateCoverFromCanvas() {
    return new Promise((resolve) => {
      coverCanvas.toBlob((blob) => {
        coverFileToUpload = blob;
        resolve();
      }, 'image/png');
    });
  }

  function loadImageFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      sourceImg = new Image();
      sourceImg.onload = async () => {
        zoomEl.value = '1';
        panXEl.value = '0';
        panYEl.value = '0';
        renderCover();
        await updateCoverFromCanvas();
      };
      sourceImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  coverInput.addEventListener('change', (e) => loadImageFromFile(e.target.files[0]));
  [zoomEl, panXEl, panYEl].forEach((el) =>
    el.addEventListener('input', async () => {
      if (!sourceImg) return;
      renderCover();
      await updateCoverFromCanvas();
    })
  );

  pasteZone.addEventListener('paste', (e) => {
    const item = [...e.clipboardData.items].find((it) => it.type.startsWith('image/'));
    if (item) loadImageFromFile(item.getAsFile());
  });

  function getPointFromEvent(ev) {
    const rect = chart.getBoundingClientRect();
    const xRaw = ev.clientX - rect.left;
    const yRaw = ev.clientY - rect.top;
    const colIndex = Math.max(0, Math.min(5, Math.floor((xRaw / rect.width) * 6)));
    const rowIndex = Math.max(0, Math.min(5, Math.floor((yRaw / rect.height) * 6)));
    return { row: LETTERS[rowIndex], col: NUMS[colIndex], rowIndex, colIndex };
  }

  function renderChartStatic() {
    chart.innerHTML = '<div class="axis-v"></div><div class="axis-h"></div>';

    for (let i = 0; i < LETTERS.length; i += 1) {
      const label = document.createElement('span');
      label.className = 'axis-label';
      label.style.left = 'calc(50% + 8px)';
      label.style.top = `${((i + 0.5) / 6) * 100}%`;
      label.textContent = LETTERS[i];
      chart.appendChild(label);
    }

    for (let i = 0; i < NUMS.length; i += 1) {
      const label = document.createElement('span');
      label.className = 'axis-label';
      label.style.top = 'calc(50% + 8px)';
      label.style.left = `${((i + 0.5) / 6) * 100}%`;
      label.textContent = NUMS[i];
      chart.appendChild(label);
    }
  }

  function renderTokensStrip() {
    tokensStrip.innerHTML = '';
    for (const token of store.tokens) {
      const chip = document.createElement('div');
      chip.className = 'token-chip';
      chip.draggable = true;
      chip.dataset.tokenId = token.id;
      chip.innerHTML = `${getTokenImage(token)}<span>${token.name}</span>`;
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/token-id', token.id);
      });
      tokensStrip.appendChild(chip);
    }
  }

  function renderRatings() {
    chart.querySelectorAll('.token-marker').forEach((node) => node.remove());

    for (const rate of ratings) {
      const token = store.tokens.find((t) => t.id === rate.tokenId);
      if (!token) continue;
      const marker = document.createElement('div');
      marker.className = 'token-marker';
      marker.style.left = `${((Number(rate.col) + 0.5) / 6) * 100}%`;
      marker.style.top = `${((LETTERS.indexOf(rate.row) + 0.5) / 6) * 100}%`;
      marker.innerHTML = `${getTokenImage(token)}<span>${token.name}</span>`;
      marker.draggable = true;
      marker.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/token-id', rate.tokenId);
      });
      chart.appendChild(marker);
    }
  }

  chart.addEventListener('dragover', (e) => e.preventDefault());
  chart.addEventListener('drop', (e) => {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('text/token-id');
    if (!tokenId) return;

    const pos = getPointFromEvent(e);
    const token = store.tokens.find((t) => t.id === tokenId);
    if (!token) return;

    const existingIndex = ratings.findIndex((r) => r.tokenId === tokenId);
    const payload = { tokenId, tokenName: token.name, row: pos.row, col: pos.col };
    if (existingIndex >= 0) ratings[existingIndex] = payload;
    else ratings.push(payload);

    renderRatings();
  });

  addTokenBtn.addEventListener('click', async () => {
    const tokenName = tokenNameInput.value.trim() || `Token ${store.tokens.length + 1}`;
    const file = tokenImageInput.files[0];

    let imageUrl = '';
    if (file) {
      try {
        imageUrl = await uploadImage(file, 'tokens');
      } catch (error) {
        console.error('Falha ao subir imagem de token:', error);
        alert('Não foi possível subir a imagem do token para o Firebase.');
        return;
      }
    }

    store.tokens.push({ id: crypto.randomUUID(), name: tokenName, imageUrl });
    await saveStore(store);
    tokenNameInput.value = '';
    tokenImageInput.value = '';
    renderTokensStrip();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      let coverUrl = currentCoverUrl;
      if (coverFileToUpload) {
        coverUrl = await uploadImage(coverFileToUpload, 'covers');
      }

      const payload = {
        id: game?.id || crypto.randomUUID(),
        number,
        name: nameEl.value.trim(),
        finishedAt: dateEl.value,
        coverUrl,
        ratings
      };

      const idx = store.games.findIndex((g) => g.id === payload.id);
      if (idx >= 0) store.games[idx] = payload;
      else store.games.push(payload);

      await saveStore(store);
      window.location.href = 'lista.html';
    } catch (error) {
      console.error('Erro ao salvar jogo no Firebase:', error);
      alert('Não foi possível salvar o jogo no Firebase.');
    }
  });

  renderChartStatic();
  renderTokensStrip();
  renderRatings();
  renderCover();
}

initStars();
initListaPage();
initPlanoPage();
