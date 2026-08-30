const DB_NAME = "personal-ai-album";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, mode);
    const request = operation(transaction.objectStore(PHOTO_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export function getPhotos() {
  return runTransaction("readonly", (store) => store.getAll());
}

export function savePhoto(photo) {
  return runTransaction("readwrite", (store) => store.put(photo));
}

export function removePhoto(id) {
  return runTransaction("readwrite", (store) => store.delete(id));
}
