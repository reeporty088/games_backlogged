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
  const normalizedTokens = tokens.map((token) => {
    const { imageDataUrl, ...tokenRest } = token || {};
    return {
      ...tokenRest,
      imageUrl: tokenRest.imageUrl || imageDataUrl || ''
    };
  });
  const games = Array.isArray(base.games)
    ? base.games.map((game) => {
        const { coverDataUrl, ...gameRest } = game || {};
        return {
          ...gameRest,
          coverUrl: gameRest.coverUrl || coverDataUrl || ''
        };
      })
    : [];

  return { games, tokens: normalizedTokens };
}

function persistLocalStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('Falha ao salvar no cache local. O armazenamento do navegador pode estar cheio.', error);
  }
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
      persistLocalStore(localStore);
      return localStore;
    }

    const store = normalizeStore(remote);
    persistLocalStore(store);
    return store;
  } catch (error) {
    console.warn('Falha ao carregar do Firebase. Usando cache local.', error);
    return localStore || { games: [], tokens: [defaultToken()] };
  }
}

async function saveStore(store) {
  const normalized = normalizeStore(store);
  persistLocalStore(normalized);

  try {
    await withTimeout(saveRemoteStore(normalized), 12000, 'salvar no Firebase');
    return { remoteSynced: true };
  } catch (error) {
    console.warn('Falha ao salvar no Firebase. Dados mantidos no cache local.', error);
    return { remoteSynced: false };
  }
}


function withTimeout(promise, timeoutMs, operationName) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Tempo excedido ao ${operationName}.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function convertImageToWebp(file, options = {}) {
  if (!file) return null;
  const {
    maxSide = 1200,
    quality = 0.84
  } = options;

  let sourceWidth = 0;
  let sourceHeight = 0;
  let drawSource = null;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    sourceWidth = bitmap.width;
    sourceHeight = bitmap.height;
    drawSource = bitmap;
  } else {
    const img = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    sourceWidth = img.width;
    sourceHeight = img.height;
    drawSource = img;
  }

  const largestSide = Math.max(sourceWidth, sourceHeight);
  const scale = largestSide > maxSide ? maxSide / largestSide : 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível inicializar o canvas para converter imagem.');
  }
  context.drawImage(drawSource, 0, 0, targetWidth, targetHeight);
  if (typeof drawSource.close === 'function') drawSource.close();

  const webpBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível converter imagem para WebP.'));
        return;
      }
      resolve(blob);
    }, 'image/webp', quality);
  });

  const baseName = (file.name || 'imagem').replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase();
  return new File([webpBlob], `${baseName}.webp`, { type: 'image/webp' });
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

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function levenshteinDistance(a, b) {
  const alen = a.length;
  const blen = b.length;
  if (!alen) return blen;
  if (!blen) return alen;

  const matrix = Array.from({ length: alen + 1 }, () => Array(blen + 1).fill(0));
  for (let i = 0; i <= alen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= blen; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= alen; i += 1) {
    for (let j = 1; j <= blen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[alen][blen];
}

function gameSearchScore(gameName, query) {
  const name = normalizeText(gameName);
  const q = normalizeText(query);
  if (!q) return 0;
  if (!name) return 999;
  if (name === q) return 0;
  if (name.startsWith(q)) return 0.2;
  if (name.includes(q)) return 0.35;
  const distance = levenshteinDistance(name, q);
  return distance / Math.max(name.length, q.length);
}

function parseGameDate(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function gameRatingsScore(game) {
  if (!Array.isArray(game.ratings) || !game.ratings.length) return -1;
  const sum = game.ratings.reduce((acc, rate) => {
    const rowIndex = LETTERS.indexOf(rate.row);
    const col = Number(rate.col);
    if (rowIndex < 0 || Number.isNaN(col)) return acc;
    const rowValue = 5 - rowIndex;
    return acc + rowValue * 6 + col;
  }, 0);
  return sum / game.ratings.length;
}

async function initListaPage() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const empty = document.getElementById('empty-list');
  const addBtn = document.getElementById('btn-new-game');
  const searchInput = document.getElementById('search-games');
  const sortButtons = [...document.querySelectorAll('.sort-btn')];
  addBtn?.addEventListener('click', () => {
    window.location.href = 'plano.html';
  });

  const store = await loadStore();
  const games = store.games.map((game, index) => ({ ...game, addedIndex: index }));
  const sortState = {
    mode: 'added',
    direction: 'asc',
    search: ''
  };

  function updateSortButtons() {
    sortButtons.forEach((button) => {
      const isCurrent = button.dataset.sort === sortState.mode;
      button.classList.toggle('is-active', isCurrent);
      button.setAttribute('aria-pressed', String(isCurrent));
      if (!isCurrent) {
        button.removeAttribute('title');
        return;
      }
      const directionLabel = sortState.direction === 'asc' ? '↑' : '↓';
      button.title = `Ordenação atual ${directionLabel}`;
    });
  }

  if (!games.length) {
    empty.style.display = 'block';
    return;
  }

  function applyFiltersAndSort() {
    const query = sortState.search;
    const filtered = games
      .map((game) => ({ ...game, searchScore: gameSearchScore(game.name, query) }))
      .filter((game) => !query || game.searchScore <= 0.72);

    if (query) {
      filtered.sort((a, b) => a.searchScore - b.searchScore || a.name.localeCompare(b.name, 'pt-BR'));
    }

    filtered.sort((a, b) => {
      let result = 0;
      if (sortState.mode === 'date') {
        result = parseGameDate(b.finishedAt) - parseGameDate(a.finishedAt);
      } else if (sortState.mode === 'rating') {
        result = gameRatingsScore(b) - gameRatingsScore(a);
      } else if (sortState.mode === 'alpha') {
        result = a.name.localeCompare(b.name, 'pt-BR');
      } else {
        result = a.addedIndex - b.addedIndex;
      }

      if (sortState.mode !== 'rating' && sortState.direction === 'desc') {
        result *= -1;
      }
      return result || a.number - b.number;
    });

    return filtered;
  }

  async function handleDeleteGame(gameId, gameName) {
    const ok = window.confirm(`Tem certeza que deseja deletar "${gameName}" da lista?`);
    if (!ok) return;
    const idx = store.games.findIndex((game) => game.id === gameId);
    if (idx < 0) return;
    store.games.splice(idx, 1);
    await saveStore(store);
    const localIdx = games.findIndex((game) => game.id === gameId);
    if (localIdx >= 0) games.splice(localIdx, 1);
    renderList();
  }

  function renderList() {
    const filteredGames = applyFiltersAndSort();
    empty.style.display = filteredGames.length ? 'none' : 'block';
    grid.innerHTML = '';

    for (const game of filteredGames) {
      const card = document.createElement('article');
      card.className = 'game-card';
      card.addEventListener('click', () => {
        window.location.href = `plano.html?id=${game.id}`;
      });

      const notes = (game.ratings || []).map((r) => `${r.tokenName}: ${r.row}${r.col}`).join('<br>') || 'Sem notas';

      card.innerHTML = `
        <button type="button" class="delete-btn" aria-label="Deletar jogo">×</button>
        <span class="game-index">${pad2(game.number)}</span>
        <img class="game-cover" src="${game.coverUrl || ''}" alt="${game.name}">
        <div class="game-content">
          <h3>${game.name}</h3>
          <p>Finalizado: ${game.finishedAt || '—'}</p>
          <div class="notes-list">${notes}</div>
        </div>
      `;

      card.querySelector('.delete-btn').addEventListener('click', async (event) => {
        event.stopPropagation();
        await handleDeleteGame(game.id, game.name);
      });

      if (!game.coverUrl) {
        card.querySelector('.game-cover').style.background = 'linear-gradient(120deg,#3c1f71,#130927)';
      }

      grid.appendChild(card);
    }
  }

  sortButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.sort;
      if (sortState.mode === mode && (mode === 'date' || mode === 'added')) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.mode = mode;
        sortState.direction = 'asc';
      }
      updateSortButtons();
      renderList();
    });
  });

  searchInput?.addEventListener('input', () => {
    sortState.search = searchInput.value || '';
    renderList();
  });

  updateSortButtons();
  renderList();
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
      sourceImg.crossOrigin = 'anonymous';
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
    return new Promise((resolve, reject) => {
      try {
        coverCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Não foi possível preparar a capa para envio.'));
            return;
          }
          coverFileToUpload = new File([blob], `cover-${Date.now()}.webp`, { type: 'image/webp' });
          resolve();
        }, 'image/webp', 0.9);
      } catch (error) {
        reject(error);
      }
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
      try {
        renderCover();
        await updateCoverFromCanvas();
      } catch (error) {
        console.error('Falha ao processar capa no canvas:', error);
      }
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
      chip.innerHTML = `
        <button type="button" class="token-delete-btn" aria-label="Deletar token">×</button>
        ${getTokenImage(token)}
        <span>${token.name}</span>
      `;
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/token-id', token.id);
      });

      chip.querySelector('.token-delete-btn').addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = window.confirm(`Tem certeza que deseja deletar o token "${token.name}"?`);
        if (!ok) return;
        store.tokens = store.tokens.filter((candidate) => candidate.id !== token.id);
        if (!store.tokens.length) {
          store.tokens = [defaultToken()];
        }
        ratings = ratings.filter((rate) => rate.tokenId !== token.id);
        await saveStore(store);
        renderTokensStrip();
        renderRatings();
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
        const optimizedToken = await convertImageToWebp(file, { maxSide: 512, quality: 0.82 });
        imageUrl = await withTimeout(uploadImage(optimizedToken, 'tokens'), 15000, 'enviar token');
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

  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!form.reportValidity()) return;

    const gameName = nameEl.value.trim();
    if (!gameName) {
      alert('Preencha o nome do jogo antes de salvar.');
      nameEl.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }

    try {
      let coverUrl = currentCoverUrl;
      if (coverFileToUpload) {
        coverUrl = await withTimeout(uploadImage(coverFileToUpload, 'covers'), 15000, 'enviar capa');
      }

      const payload = {
        id: game?.id || crypto.randomUUID(),
        number,
        name: gameName,
        finishedAt: dateEl.value,
        coverUrl,
        ratings
      };

      const idx = store.games.findIndex((g) => g.id === payload.id);
      if (idx >= 0) store.games[idx] = payload;
      else store.games.push(payload);

      const result = await saveStore(store);
      if (!result.remoteSynced) {
        alert('Jogo salvo no dispositivo, mas não foi possível sincronizar com o Firebase agora.');
      }
      window.location.href = 'lista.html';
    } catch (error) {
      console.error('Erro ao salvar jogo no Firebase:', error);
      alert('Não foi possível salvar o jogo no Firebase.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar jogo';
      }
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
