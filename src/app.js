import { getAlbums, getPhotos, removePhoto, saveAlbum, savePhoto } from "./db.js";

const $ = (selector) => document.querySelector(selector);
const el = {
  input: $("#photoInput"), gallery: $("#gallery"), empty: $("#emptyState"), photoCount: $("#photoCount"), peopleCount: $("#peopleCount"), favoriteCount: $("#favoriteCount"),
  dialog: $("#photoDialog"), dialogImage: $("#dialogImage"), favoriteButton: $("#favoriteButton"), deleteButton: $("#deleteButton"), closeDialog: $("#closeDialog"), toast: $("#toast"), infoDialog: $("#infoDialog"),
  albumList: $("#albumList"), selectButton: $("#selectPhotosButton"), selectionBar: $("#selectionBar"), selectionCount: $("#selectionCount"), cancelSelection: $("#cancelSelection"), makeAlbum: $("#makeAlbumButton"),
  albumDialog: $("#albumDialog"), albumForm: $("#albumForm"), albumName: $("#albumName"), cancelAlbum: $("#cancelAlbum"),
  exportBackup: $("#exportBackup"), backupInput: $("#backupInput"), storageUsage: $("#storageUsage"),
  myboxSettings: $("#myboxSettings"), syncAll: $("#syncAll"), myboxDialog: $("#myboxDialog"), myboxForm: $("#myboxForm"),
  myboxStatus: $("#myboxStatus"), syncKeyInput: $("#syncKeyInput"), disconnectMybox: $("#disconnectMybox"), cancelMybox: $("#cancelMybox"),
};

let photos = [], albums = [], selectedId = null, activeFilter = "all", activeAlbumId = null, selectionMode = false;
let selectedPhotoIds = new Set(), objectUrls = [];
const MYBOX_SYNC_URL = "https://personal-ai-album-sync.sjunho0304.workers.dev";
const SYNC_KEY_STORAGE = "personal-ai-album-sync-key";
let syncKey = localStorage.getItem(SYNC_KEY_STORAGE) ?? "";
const makeId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const formatDate = (time) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(time);

function showToast(message) {
  el.toast.textContent = message; el.toast.classList.add("visible");
  window.setTimeout(() => el.toast.classList.remove("visible"), 2400);
}

async function syncRequest(path, options = {}) {
  if (!syncKey) throw new Error("MYBOX 동기화 키가 필요합니다.");
  const headers = new Headers(options.headers); headers.set("Authorization", `Bearer ${syncKey}`);
  const response = await fetch(`${MYBOX_SYNC_URL}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `MYBOX 요청 실패 (${response.status})`);
  return result;
}

async function verifyMyboxConnection() {
  const storage = await syncRequest("/storage");
  el.myboxStatus.textContent = `연결됨 · ${formatBytes(storage.usedBytes)} / ${formatBytes(storage.quotaBytes)} 사용 중`;
  el.myboxSettings.textContent = "MYBOX 연결됨"; el.syncAll.hidden = false;
  return storage;
}

async function syncPhoto(photo) {
  if (!syncKey || photo.syncStatus === "synced") return;
  photo.syncStatus = "syncing"; await savePhoto(photo); render();
  try {
    const result = await syncRequest("/upload", { method: "POST", headers: { "Content-Type": photo.type || "application/octet-stream", "X-File-Name": encodeURIComponent(photo.name) }, body: photo.blob });
    photo.syncStatus = "synced"; photo.syncedAt = Date.now(); photo.myboxResult = result.result ?? null;
  } catch (error) { photo.syncStatus = "error"; photo.syncError = error.message; }
  await savePhoto(photo); render();
}

async function syncAllPhotos() {
  const targets = photos.filter((photo) => photo.syncStatus !== "synced");
  if (!targets.length) { showToast("모든 사진이 이미 동기화됐어요."); return; }
  el.syncAll.disabled = true;
  for (let index = 0; index < targets.length; index += 1) { showToast(`${index + 1}/${targets.length} MYBOX에 업로드 중`); await syncPhoto(targets[index]); }
  el.syncAll.disabled = false;
  const failures = targets.filter((photo) => photo.syncStatus === "error").length;
  showToast(failures ? `${failures}장의 업로드를 다시 시도해 주세요.` : "MYBOX 동기화를 완료했어요.");
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

async function updateStorageUsage() {
  const photoBytes = photos.reduce((total, photo) => total + (photo.blob?.size ?? photo.size ?? 0), 0);
  if (!navigator.storage?.estimate) { el.storageUsage.textContent = `사진 원본 약 ${formatBytes(photoBytes)} 사용 중`; return; }
  const estimate = await navigator.storage.estimate();
  el.storageUsage.textContent = `앨범 사진 ${formatBytes(photoBytes)} · 앱 전체 ${formatBytes(estimate.usage)} / 기기 허용량 ${formatBytes(estimate.quota)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  if (!header?.startsWith("data:") || !encoded) throw new Error("잘못된 사진 데이터입니다.");
  const type = header.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

async function exportBackup() {
  if (!photos.length && !albums.length) { showToast("백업할 데이터가 없어요."); return; }
  el.exportBackup.disabled = true; showToast("백업 파일을 만들고 있어요.");
  try {
    const backupPhotos = [];
    for (const photo of photos) { const { blob, ...metadata } = photo; backupPhotos.push({ ...metadata, dataUrl: await blobToDataUrl(blob) }); }
    const payload = { format: "personal-ai-album", version: 1, exportedAt: new Date().toISOString(), albums, photos: backupPhotos };
    const file = new Blob([JSON.stringify(payload)], { type: "application/json" }), url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = `personal-album-${new Date().toISOString().slice(0, 10)}.album-backup.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("백업 파일을 저장했어요.");
  } catch { showToast("백업 파일 생성에 실패했어요."); }
  finally { el.exportBackup.disabled = false; }
}

async function importBackup(file) {
  if (!file) return;
  if (!confirm("백업의 사진과 앨범을 현재 데이터에 추가할까요? 같은 항목은 백업 내용으로 갱신됩니다.")) { el.backupInput.value = ""; return; }
  showToast("백업을 확인하고 있어요.");
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== "personal-ai-album" || payload.version !== 1 || !Array.isArray(payload.photos) || !Array.isArray(payload.albums)) throw new Error("지원하지 않는 백업입니다.");
    for (const album of payload.albums) { if (!album.id || !album.name) throw new Error("앨범 정보가 올바르지 않습니다."); await saveAlbum(album); }
    for (const item of payload.photos) {
      if (!item.id || !item.dataUrl) throw new Error("사진 정보가 올바르지 않습니다.");
      const { dataUrl, ...metadata } = item; await savePhoto({ ...metadata, blob: dataUrlToBlob(dataUrl) });
    }
    [photos, albums] = await Promise.all([getPhotos(), getAlbums()]); render(); showToast(`${payload.photos.length}장의 사진을 복원했어요.`);
  } catch (error) { showToast(error.message || "백업 파일을 불러오지 못했어요."); }
  finally { el.backupInput.value = ""; }
}

function currentPhotos() {
  let result = photos;
  if (activeFilter === "favorites") result = result.filter((photo) => photo.favorite);
  if (activeFilter === "people") result = result.filter((photo) => photo.people?.length);
  if (activeAlbumId) result = result.filter((photo) => photo.albumIds?.includes(activeAlbumId));
  return [...result].sort((a, b) => b.createdAt - a.createdAt);
}

function renderAlbums() {
  el.albumList.replaceChildren();
  [{ id: null, name: "모든 사진", count: photos.length }, ...albums.map((album) => ({ ...album, count: photos.filter((photo) => photo.albumIds?.includes(album.id)).length }))]
    .forEach((album) => {
      const button = document.createElement("button");
      button.className = `album-chip${activeAlbumId === album.id ? " active" : ""}`;
      button.textContent = `${album.name} ${album.count}`;
      button.addEventListener("click", () => { activeAlbumId = album.id; render(); });
      el.albumList.append(button);
    });
}

function render() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls = [];
  renderAlbums();
  el.selectionBar.hidden = !selectionMode;
  el.selectButton.textContent = selectionMode ? "선택 중" : "사진 선택";
  el.selectionCount.textContent = `${selectedPhotoIds.size}장 선택`;
  el.makeAlbum.disabled = selectedPhotoIds.size === 0;
  const visible = currentPhotos();
  el.gallery.replaceChildren(); el.photoCount.textContent = photos.length;
  el.favoriteCount.textContent = photos.filter((photo) => photo.favorite).length;
  el.peopleCount.textContent = new Set(photos.flatMap((photo) => photo.people ?? [])).size;
  el.empty.hidden = visible.length > 0;
  updateStorageUsage().catch(() => {});
  const groups = visible.reduce((map, photo) => { const date = formatDate(photo.createdAt); if (!map.has(date)) map.set(date, []); map.get(date).push(photo); return map; }, new Map());
  groups.forEach((items, date) => {
    const group = document.createElement("section"), heading = document.createElement("h2"), grid = document.createElement("div");
    group.className = "date-group"; heading.textContent = date; grid.className = "photo-grid";
    items.forEach((photo) => {
      const url = URL.createObjectURL(photo.blob), button = document.createElement("button"), image = document.createElement("img");
      objectUrls.push(url); button.className = `photo-card${selectedPhotoIds.has(photo.id) ? " selected" : ""}`;
      image.src = url; image.alt = photo.name; image.loading = "lazy"; button.append(image);
      const badge = document.createElement("span");
      if (selectionMode) { badge.className = "selection-mark"; badge.textContent = selectedPhotoIds.has(photo.id) ? "✓" : ""; button.append(badge); }
      else if (photo.favorite) { badge.className = "heart"; badge.textContent = "♥"; button.append(badge); }
      if (!selectionMode && syncKey) {
        const syncBadge = document.createElement("span"), labels = { syncing: "업로드 중", synced: "MYBOX ✓", error: "재시도 필요" };
        syncBadge.className = `sync-badge ${photo.syncStatus ?? ""}`; syncBadge.textContent = labels[photo.syncStatus] ?? "미동기화"; button.append(syncBadge);
      }
      button.addEventListener("click", () => selectionMode ? togglePhoto(photo.id) : openPhoto(photo.id)); grid.append(button);
    });
    group.append(heading, grid); el.gallery.append(group);
  });
}

function togglePhoto(id) { selectedPhotoIds.has(id) ? selectedPhotoIds.delete(id) : selectedPhotoIds.add(id); render(); }
function stopSelection() { selectionMode = false; selectedPhotoIds.clear(); render(); }
function openPhoto(id) {
  const photo = photos.find((item) => item.id === id); if (!photo) return; selectedId = id;
  const url = URL.createObjectURL(photo.blob); objectUrls.push(url); el.dialogImage.src = url;
  el.favoriteButton.textContent = photo.favorite ? "♥ 즐겨찾기 해제" : "♡ 즐겨찾기"; el.dialog.showModal();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/")); if (!files.length) return;
  showToast(`${files.length}장의 사진을 저장하고 있어요.`);
  for (const file of files) {
    const photo = { id: makeId("photo"), name: file.name, type: file.type, size: file.size, createdAt: file.lastModified || Date.now(), addedAt: Date.now(), favorite: false, people: [], albumIds: [], blob: file };
    await savePhoto(photo); photos.push(photo);
    if (syncKey) await syncPhoto(photo);
  }
  el.input.value = ""; render(); showToast("사진을 안전하게 저장했어요.");
}

el.input.addEventListener("change", (event) => addFiles(event.target.files).catch(() => showToast("사진 저장에 실패했어요.")));
el.closeDialog.addEventListener("click", () => el.dialog.close());
el.favoriteButton.addEventListener("click", async () => { const photo = photos.find((item) => item.id === selectedId); if (!photo) return; photo.favorite = !photo.favorite; await savePhoto(photo); el.dialog.close(); render(); });
el.deleteButton.addEventListener("click", async () => { if (!selectedId || !confirm("이 기기의 앨범에서 사진을 삭제할까요?")) return; await removePhoto(selectedId); photos = photos.filter((photo) => photo.id !== selectedId); el.dialog.close(); render(); showToast("사진을 삭제했어요."); });
document.querySelectorAll(".filter[data-filter]").forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter; document.querySelectorAll(".filter[data-filter]").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
el.selectButton.addEventListener("click", () => { selectionMode = !selectionMode; selectedPhotoIds.clear(); render(); });
el.cancelSelection.addEventListener("click", stopSelection);
el.makeAlbum.addEventListener("click", () => { el.albumName.value = ""; el.albumDialog.showModal(); el.albumName.focus(); });
el.cancelAlbum.addEventListener("click", () => el.albumDialog.close());
el.albumForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const name = el.albumName.value.trim(); if (!name || !selectedPhotoIds.size) return;
  const album = { id: makeId("album"), name, createdAt: Date.now() }; await saveAlbum(album); albums.push(album);
  for (const photo of photos.filter((item) => selectedPhotoIds.has(item.id))) { photo.albumIds = [...new Set([...(photo.albumIds ?? []), album.id])]; await savePhoto(photo); }
  el.albumDialog.close(); activeAlbumId = album.id; stopSelection(); showToast(`‘${name}’ 앨범을 만들었어요.`);
});
el.exportBackup.addEventListener("click", exportBackup);
el.backupInput.addEventListener("change", (event) => importBackup(event.target.files[0]));
el.myboxSettings.addEventListener("click", () => { el.syncKeyInput.value = syncKey; el.myboxDialog.showModal(); });
el.cancelMybox.addEventListener("click", () => el.myboxDialog.close());
el.disconnectMybox.addEventListener("click", () => { syncKey = ""; localStorage.removeItem(SYNC_KEY_STORAGE); el.syncKeyInput.value = ""; el.myboxSettings.textContent = "MYBOX 연결"; el.syncAll.hidden = true; el.myboxDialog.close(); render(); showToast("이 기기의 MYBOX 연결을 해제했어요."); });
el.myboxForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const candidate = el.syncKeyInput.value.trim(); if (!candidate) return;
  const previous = syncKey; syncKey = candidate; el.myboxStatus.textContent = "연결을 확인하고 있어요.";
  try { await verifyMyboxConnection(); localStorage.setItem(SYNC_KEY_STORAGE, syncKey); el.myboxDialog.close(); render(); showToast("MYBOX에 연결했어요."); }
  catch (error) { syncKey = previous; el.myboxStatus.textContent = error.message; }
});
el.syncAll.addEventListener("click", () => syncAllPhotos().catch((error) => showToast(error.message)));
$("#settingsButton").addEventListener("click", () => el.infoDialog.showModal());
$("#closeInfo").addEventListener("click", () => el.infoDialog.close());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
try {
  [photos, albums] = await Promise.all([getPhotos(), getAlbums()]); render();
  if (syncKey) verifyMyboxConnection().catch(() => { el.myboxSettings.textContent = "MYBOX 다시 연결"; el.syncAll.hidden = true; });
} catch { showToast("기기 저장소를 열 수 없어요."); }
