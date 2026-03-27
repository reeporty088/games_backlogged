const STORAGE_KEY = 'noites_indie_store_v2';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const NUMS = ['0', '1', '2', '3', '4', '5'];

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.tokens?.length) parsed.tokens = [defaultToken()];
      return parsed;
    } catch (_) {}
  }
  return { games: [], tokens: [defaultToken()] };
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function defaultToken() {
  return { id: 'token-default', name: 'Teste', imageDataUrl: '' };
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
  if (!token?.imageDataUrl) return '<div class="token-preview"></div>';
  return `<img src="${token.imageDataUrl}" alt="${token.name}">`;
}

function initListaPage() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const empty = document.getElementById('empty-list');
  const addBtn = document.getElementById('btn-new-game');
  addBtn?.addEventListener('click', () => {
    window.location.href = 'plano.html';
  });

  const store = loadStore();
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
      <img class="game-cover" src="${game.coverDataUrl || ''}" alt="${game.name}">
      <div class="game-content">
        <h3>${game.name}</h3>
        <p>Finalizado: ${game.finishedAt || '—'}</p>
        <div class="notes-list">${notes}</div>
      </div>
    `;

    if (!game.coverDataUrl) {
      card.querySelector('.game-cover').style.background = 'linear-gradient(120deg,#3c1f71,#130927)';
    }

    grid.appendChild(card);
  }
}

function initPlanoPage() {
  const form = document.getElementById('game-form');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const editingId = params.get('id');

  const store = loadStore();
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
  let currentCoverDataUrl = game?.coverDataUrl || '';
  let ratings = game?.ratings ? [...game.ratings] : [];

  const nextNumber = Math.max(0, ...store.games.map((g) => g.number || 0)) + (game ? 0 : 1);
  const number = game?.number || nextNumber;

  numEl.value = pad2(number);
  nameEl.value = game?.name || '';
  dateEl.value = game?.finishedAt || '';

  function renderCover() {
    ctx.clearRect(0, 0, coverCanvas.width, coverCanvas.height);
    if (!sourceImg && !currentCoverDataUrl) {
      placeholder.style.display = 'block';
      return;
    }

    placeholder.style.display = 'none';
    if (!sourceImg && currentCoverDataUrl) {
      sourceImg = new Image();
      sourceImg.onload = renderCover;
      sourceImg.src = currentCoverDataUrl;
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
    currentCoverDataUrl = coverCanvas.toDataURL('image/png');
  }

  function loadImageFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      sourceImg = new Image();
      sourceImg.onload = () => {
        zoomEl.value = '1';
        panXEl.value = '0';
        panYEl.value = '0';
        renderCover();
      };
      sourceImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  coverInput.addEventListener('change', (e) => loadImageFromFile(e.target.files[0]));
  [zoomEl, panXEl, panYEl].forEach((el) => el.addEventListener('input', renderCover));

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

  addTokenBtn.addEventListener('click', () => {
    const tokenName = tokenNameInput.value.trim() || `Token ${store.tokens.length + 1}`;
    const file = tokenImageInput.files[0];

    const pushToken = (imgDataUrl = '') => {
      store.tokens.push({ id: crypto.randomUUID(), name: tokenName, imageDataUrl: imgDataUrl });
      saveStore(store);
      tokenNameInput.value = '';
      tokenImageInput.value = '';
      renderTokensStrip();
    };

    if (!file) {
      pushToken('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => pushToken(reader.result);
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const payload = {
      id: game?.id || crypto.randomUUID(),
      number,
      name: nameEl.value.trim(),
      finishedAt: dateEl.value,
      coverDataUrl: currentCoverDataUrl,
      ratings
    };

    const idx = store.games.findIndex((g) => g.id === payload.id);
    if (idx >= 0) store.games[idx] = payload;
    else store.games.push(payload);

    saveStore(store);
    window.location.href = 'lista.html';
  });

  renderChartStatic();
  renderTokensStrip();
  renderRatings();
  renderCover();
}

initStars();
initListaPage();
initPlanoPage();
