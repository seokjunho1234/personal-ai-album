const DB_NAME = "personal-ai-album";
const DB_VERSION = 2;
const PHOTO_STORE = "photos";
const ALBUM_STORE = "albums";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(ALBUM_STORE)) {
        const store = db.createObjectStore(ALBUM_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export const getPhotos = () => runTransaction(PHOTO_STORE, "readonly", (store) => store.getAll());
export const savePhoto = (photo) => runTransaction(PHOTO_STORE, "readwrite", (store) => store.put(photo));
export const removePhoto = (id) => runTransaction(PHOTO_STORE, "readwrite", (store) => store.delete(id));
export const getAlbums = () => runTransaction(ALBUM_STORE, "readonly", (store) => store.getAll());
export const saveAlbum = (album) => runTransaction(ALBUM_STORE, "readwrite", (store) => store.put(album));
