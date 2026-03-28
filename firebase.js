import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js';
import { getDatabase, ref, get, set } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';
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
const db = getDatabase(app);
const storage = getStorage(app);
const STORE_PATH = 'backlogStore';

export async function loadRemoteStore() {
  const snapshot = await get(ref(db, STORE_PATH));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function saveRemoteStore(store) {
  await set(ref(db, STORE_PATH), store);
}

export async function uploadImage(fileOrBlob, pathPrefix) {
  const cleanName = fileOrBlob.name?.replace(/\s+/g, '-').toLowerCase() || 'image.png';
  const path = `${pathPrefix}/${Date.now()}-${crypto.randomUUID()}-${cleanName}`;
  const imageRef = storageRef(storage, path);
  await uploadBytes(imageRef, fileOrBlob, {
    contentType: fileOrBlob.type || 'image/png'
  });
  return getDownloadURL(imageRef);
}
