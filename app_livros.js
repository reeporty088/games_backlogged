import { loadRemoteStore, saveRemoteStore, uploadImage } from './firebase.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const NUMS = ['0', '1', '2', '3', '4', '5'];
const LOCAL_BOOKS_KEY = 'cantinho_livros_store_v1';

function defaultToken() {
  return { id: 'token-default-book', name: 'Leitor(a)', imageUrl: '' };
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const randomHex = globalThis.crypto?.getRandomValues
    ? [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  return `${Date.now()}-${randomHex}`;
}

function normalizeStore(rawStore) {
  const base = rawStore || {};
  const tokensRaw = Array.isArray(base.bookTokens) && base.bookTokens.length ? base.bookTokens : [defaultToken()];
  const booksRaw = Array.isArray(base.books) ? base.books : [];

  const bookTokens = tokensRaw.map((token) => {
    const { imageDataUrl, ...rest } = token || {};
    return {
      ...rest,
      imageUrl: rest.imageUrl || imageDataUrl || ''
    };
  });

  const books = booksRaw.map((book) => {
    const { coverDataUrl, ...rest } = book || {};
    return {
      ...rest,
      coverUrl: rest.coverUrl || coverDataUrl || '',
      opinion: rest.opinion || ''
    };
  });

  return { ...base, books, bookTokens };
}

function persistLocalStore(store) {
  try {
    localStorage.setItem(LOCAL_BOOKS_KEY, JSON.stringify({ books: store.books, bookTokens: store.bookTokens }));
  } catch (error) {
    console.warn('Falha ao salvar livros no cache local. O armazenamento pode estar cheio.', error);
  }
}

async function loadStore() {
  const localRaw = localStorage.getItem(LOCAL_BOOKS_KEY);
  const localStore = localRaw ? normalizeStore(JSON.parse(localRaw)) : null;

  try {
    const remote = await loadRemoteStore();
    const normalized = normalizeStore(remote);
    persistLocalStore(normalized);
    return normalized;
  } catch (error) {
    console.warn('Falha ao carregar livros no Firebase. Usando cache local.', error);
    return localStore || { books: [], bookTokens: [defaultToken()] };
  }
}

async function saveStore(store) {
  const normalized = normalizeStore(store);
  persistLocalStore(normalized);

  try {
    await withTimeout(saveRemoteStore(normalized), 12000, 'salvar livros no Firebase');
    return { remoteSynced: true };
  } catch (error) {
    console.warn('Falha ao salvar livros no Firebase. Dados mantidos no cache local.', error);
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

function normalizeText(value) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[alen][blen];
}

function bookSearchScore(nameValue, query) {
  const name = normalizeText(nameValue);
  const q = normalizeText(query);
  if (!q) return 0;
  if (!name) return 999;
  if (name === q) return 0;
  if (name.startsWith(q)) return 0.2;
  if (name.includes(q)) return 0.35;
  return levenshteinDistance(name, q) / Math.max(name.length, q.length);
}

function parseDate(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratingsScore(item) {
  if (!Array.isArray(item.ratings) || !item.ratings.length) return -1;
  const sum = item.ratings.reduce((acc, rate) => {
    const rowIndex = LETTERS.indexOf(rate.row);
    const col = Number(rate.col);
    if (rowIndex < 0 || Number.isNaN(col)) return acc;
    return acc + (5 - rowIndex) * 6 + col;
  }, 0);
  return sum / item.ratings.length;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getTokenImage(token) {
  if (!token?.imageUrl) return '<div class="token-preview"></div>';
  return `<img src="${token.imageUrl}" alt="${token.name}">`;
}

async function initListaLivrosPage() {
  const grid = document.getElementById('books-grid');
  if (!grid) return;

  const empty = document.getElementById('empty-books');
  const addBtn = document.getElementById('btn-new-book');
  const searchInput = document.getElementById('search-books');
  const sortButtons = [...document.querySelectorAll('.sort-btn')];
  addBtn?.addEventListener('click', () => {
    window.location.href = 'plano_livros.html';
  });

  const store = await loadStore();
  const books = store.books.map((book, index) => ({ ...book, addedIndex: index }));
  const sortState = { mode: 'added', direction: 'asc', search: '' };

  function applyFiltersAndSort() {
    const filtered = books
      .map((book) => ({ ...book, searchScore: bookSearchScore(book.name, sortState.search) }))
      .filter((book) => !sortState.search || book.searchScore <= 0.72);

    filtered.sort((a, b) => {
      let result = 0;
      if (sortState.mode === 'date') result = parseDate(b.finishedAt) - parseDate(a.finishedAt);
      else if (sortState.mode === 'rating') result = ratingsScore(b) - ratingsScore(a);
      else if (sortState.mode === 'alpha') result = a.name.localeCompare(b.name, 'pt-BR');
      else result = a.addedIndex - b.addedIndex;
      if (sortState.mode !== 'rating' && sortState.direction === 'desc') result *= -1;
      return result || (a.number || 0) - (b.number || 0);
    });

    return filtered;
  }

  function updateSortButtons() {
    sortButtons.forEach((button) => {
      const isCurrent = button.dataset.sort === sortState.mode;
      button.classList.toggle('is-active', isCurrent);
      button.setAttribute('aria-pressed', String(isCurrent));
    });
  }

  async function handleDeleteBook(bookId, bookName) {
    if (!window.confirm(`Tem certeza que deseja deletar "${bookName}" da lista?`)) return;
    const idx = store.books.findIndex((book) => book.id === bookId);
    if (idx < 0) return;
    store.books.splice(idx, 1);
    await saveStore(store);
    const localIdx = books.findIndex((book) => book.id === bookId);
    if (localIdx >= 0) books.splice(localIdx, 1);
    renderList();
  }

  function renderList() {
    const filtered = applyFiltersAndSort();
    empty.style.display = filtered.length ? 'none' : 'block';
    grid.innerHTML = '';

    for (const book of filtered) {
      const card = document.createElement('article');
      card.className = 'game-card livros-item-card';
      card.addEventListener('click', () => {
        window.location.href = `plano_livros.html?id=${book.id}`;
      });

      const notes = (book.ratings || []).map((r) => `${r.tokenName}: ${r.row}${r.col}`).join('<br>') || 'Sem notas';
      card.innerHTML = `
        <button type="button" class="delete-btn" aria-label="Deletar livro">×</button>
        <span class="game-index">${pad2(book.number || 0)}</span>
        <img class="game-cover" src="${book.coverUrl || ''}" alt="${book.name}">
        <div class="game-content">
          <h3>${book.name}</h3>
          <p>Finalizado: ${book.finishedAt || '—'}</p>
          <div class="notes-list">${notes}</div>
        </div>
      `;

      card.querySelector('.delete-btn').addEventListener('click', async (event) => {
        event.stopPropagation();
        await handleDeleteBook(book.id, book.name);
      });

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

async function initPlanoLivroPage() {
  const form = document.getElementById('book-form');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const editingId = params.get('id');
  const store = await loadStore();
  const book = store.books.find((candidate) => candidate.id === editingId) || null;

  const nameEl = document.getElementById('book-name');
  const numEl = document.getElementById('book-number');
  const dateEl = document.getElementById('finished-at');
  const opinionEl = document.getElementById('book-opinion');

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
  let currentCoverUrl = book?.coverUrl || '';
  let ratings = book?.ratings ? [...book.ratings] : [];

  const nextNumber = Math.max(0, ...store.books.map((b) => b.number || 0)) + (book ? 0 : 1);
  const number = book?.number || nextNumber;

  numEl.value = pad2(number);
  nameEl.value = book?.name || '';
  dateEl.value = book?.finishedAt || '';
  opinionEl.value = book?.opinion || '';

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
        currentCoverUrl = coverCanvas.toDataURL('image/webp', 0.9);
      };
      sourceImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  coverInput.addEventListener('change', (e) => loadImageFromFile(e.target.files[0]));
  [zoomEl, panXEl, panYEl].forEach((input) => input.addEventListener('input', () => {
    if (!sourceImg) return;
    renderCover();
    currentCoverUrl = coverCanvas.toDataURL('image/webp', 0.9);
  }));

  pasteZone.addEventListener('paste', (e) => {
    const imageItem = [...e.clipboardData.items].find((item) => item.type.startsWith('image/'));
    if (imageItem) loadImageFromFile(imageItem.getAsFile());
  });

  function getPointFromEvent(ev) {
    const rect = chart.getBoundingClientRect();
    const colIndex = Math.max(0, Math.min(5, Math.floor(((ev.clientX - rect.left) / rect.width) * 6)));
    const rowIndex = Math.max(0, Math.min(5, Math.floor(((ev.clientY - rect.top) / rect.height) * 6)));
    return { row: LETTERS[rowIndex], col: NUMS[colIndex] };
  }

  function updateRatingPosition(tokenId, pos) {
    if (!tokenId || !pos) return;
    const token = store.bookTokens.find((candidate) => candidate.id === tokenId);
    if (!token) return;

    const existingIndex = ratings.findIndex((rate) => rate.tokenId === tokenId);
    const payload = { tokenId, tokenName: token.name, row: pos.row, col: pos.col };
    if (existingIndex >= 0) ratings[existingIndex] = payload;
    else ratings.push(payload);

    renderRatings();
  }

  let selectedTokenId = null;

  function syncSelectedTokenVisualState() {
    tokensStrip.querySelectorAll('.token-chip').forEach((chip) => {
      chip.classList.toggle('token-selected', chip.dataset.tokenId === selectedTokenId);
    });
    chart.querySelectorAll('.token-marker').forEach((marker) => {
      marker.classList.toggle('token-selected', marker.dataset.tokenId === selectedTokenId);
    });
  }

  function setSelectedToken(tokenId) {
    selectedTokenId = tokenId;
    syncSelectedTokenVisualState();
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
    for (const token of store.bookTokens) {
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
      chip.addEventListener('click', () => {
        setSelectedToken(token.id);
      });
      chip.querySelector('.token-delete-btn').addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`Tem certeza que deseja deletar o token "${token.name}"?`)) return;
        store.bookTokens = store.bookTokens.filter((candidate) => candidate.id !== token.id);
        if (!store.bookTokens.length) store.bookTokens = [defaultToken()];
        if (selectedTokenId === token.id) {
          selectedTokenId = null;
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
    const markersByCell = new Map();

    for (const rate of ratings) {
      const token = store.bookTokens.find((candidate) => candidate.id === rate.tokenId);
      if (!token) continue;
      const cellKey = `${rate.row}:${rate.col}`;
      const bucket = markersByCell.get(cellKey) || [];
      bucket.push(rate);
      markersByCell.set(cellKey, bucket);
    }

    for (const ratesInCell of markersByCell.values()) {
      const spacing = 42;
      const total = ratesInCell.length;
      ratesInCell.forEach((rate, index) => {
        const token = store.bookTokens.find((candidate) => candidate.id === rate.tokenId);
        if (!token) return;
        const marker = document.createElement('div');
        marker.className = 'token-marker';
        marker.style.left = `${((Number(rate.col) + 0.5) / 6) * 100}%`;
        marker.style.top = `${((LETTERS.indexOf(rate.row) + 0.5) / 6) * 100}%`;
        marker.style.setProperty('--stack-offset', `${(index - (total - 1) / 2) * spacing}px`);
        marker.innerHTML = `${getTokenImage(token)}<span>${token.name}</span>`;
        marker.dataset.tokenId = rate.tokenId;
        marker.draggable = true;
        marker.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/token-id', rate.tokenId);
        });
        marker.addEventListener('click', () => {
          setSelectedToken(rate.tokenId);
        });
        chart.appendChild(marker);
      });
    }
    syncSelectedTokenVisualState();
  }

  chart.addEventListener('dragover', (e) => e.preventDefault());
  chart.addEventListener('drop', (e) => {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('text/token-id');
    if (!tokenId) return;
    const pos = getPointFromEvent(e);
    updateRatingPosition(tokenId, pos);
  });

  chart.addEventListener('click', (e) => {
    if (!selectedTokenId) return;
    if (e.target.closest('.token-marker')) return;
    const pos = getPointFromEvent(e);
    updateRatingPosition(selectedTokenId, pos);
  });

  addTokenBtn.addEventListener('click', async () => {
    try {
      const tokenName = tokenNameInput.value.trim() || `Token ${store.bookTokens.length + 1}`;
      const file = tokenImageInput.files[0];
      let imageUrl = '';
      if (file) {
        try {
          imageUrl = await withTimeout(uploadImage(file, 'book-tokens'), 15000, 'enviar token');
        } catch (error) {
          console.error('Falha ao subir imagem de token:', error);
          alert('Não foi possível subir a imagem do token para o Firebase.');
          return;
        }
      }
      store.bookTokens.push({ id: createId(), name: tokenName, imageUrl });
      const { remoteSynced } = await saveStore(store);
      if (!remoteSynced) {
        alert('Token salvo somente no navegador. Verifique a conexão com o Firebase.');
      }
      tokenNameInput.value = '';
      tokenImageInput.value = '';
      renderTokensStrip();
    } catch (error) {
      console.error('Falha ao adicionar token:', error);
      alert('Não foi possível adicionar o token. Tente novamente.');
    }
  });

  const submitBtn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookName = nameEl.value.trim();
    if (!bookName) {
      alert('Preencha o nome do livro antes de salvar.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    const payload = {
      id: book?.id || createId(),
      number,
      name: bookName,
      finishedAt: dateEl.value,
      coverUrl: currentCoverUrl,
      opinion: opinionEl.value.trim(),
      ratings
    };

    const index = store.books.findIndex((candidate) => candidate.id === payload.id);
    if (index >= 0) store.books[index] = payload;
    else store.books.push(payload);

    await saveStore(store);
    window.location.href = 'lista_livros.html';
  });

  renderChartStatic();
  renderTokensStrip();
  renderRatings();
  renderCover();
}

initListaLivrosPage();
initPlanoLivroPage();
