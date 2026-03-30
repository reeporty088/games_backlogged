import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBjR55EaCAanFJLwf8fj6hwz1z104zNYlA',
  authDomain: 'ni---games-backlogged.firebaseapp.com',
  databaseURL: 'https://ni---games-backlogged-default-rtdb.firebaseio.com',
  projectId: 'ni---games-backlogged',
  storageBucket: 'ni---games-backlogged.firebasestorage.app',
  messagingSenderId: '493199385681',
  appId: '1:493199385681:web:5d99928cfc7d8505fdc470',
  measurementId: 'G-N2RFR4EWS1'
};

const app = initializeApp(firebaseConfig);
analyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch(() => {
    // analytics é opcional e pode não estar disponível em alguns ambientes
  });

const firestore = getFirestore(app);
const db = getDatabase(app);
const storage = getStorage(app);

const STORE_COLLECTION = 'backlog';
const STORE_DOC = 'store';
const LEGACY_RTDB_PATH = 'backlogStore';

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const randomHex = globalThis.crypto?.getRandomValues
    ? [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  return `${Date.now()}-${randomHex}`;
}

function getStoreDocRef() {
  return doc(firestore, STORE_COLLECTION, STORE_DOC);
}

async function tryMigrateFromRealtimeDatabase() {
  try {
    const legacySnapshot = await get(ref(db, LEGACY_RTDB_PATH));
    if (!legacySnapshot.exists()) return null;

    const legacyStore = legacySnapshot.val();
    if (!legacyStore) return null;

    await setDoc(getStoreDocRef(), legacyStore);
    return legacyStore;
  } catch (error) {
    console.warn('Falha ao migrar dados legados do Realtime Database para o Firestore.', error);
    return null;
  }
}

export async function loadRemoteStore() {
  const snapshot = await getDoc(getStoreDocRef());
  if (snapshot.exists()) {
    return snapshot.data();
  }

  return tryMigrateFromRealtimeDatabase();
}

export async function saveRemoteStore(store) {
  await setDoc(getStoreDocRef(), store);
}

export async function uploadImage(fileOrBlob, pathPrefix) {
  if (!fileOrBlob) {
    throw new Error('Arquivo de imagem inválido para upload.');
  }

  const cleanName = fileOrBlob.name?.replace(/\s+/g, '-').toLowerCase() || 'image.png';
  const path = `${pathPrefix}/${Date.now()}-${createId()}-${cleanName}`;
  const imageRef = storageRef(storage, path);
  await uploadBytes(imageRef, fileOrBlob, {
    contentType: fileOrBlob.type || 'image/png'
  });
  return getDownloadURL(imageRef);
}
