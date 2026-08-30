import { getAlbums, getPhotos, removePhoto, saveAlbum, savePhoto } from "./db.js";

const $ = (selector) => document.querySelector(selector);
const el = {
  input: $("#photoInput"), gallery: $("#gallery"), empty: $("#emptyState"), photoCount: $("#photoCount"), peopleCount: $("#peopleCount"), favoriteCount: $("#favoriteCount"),
  dialog: $("#photoDialog"), dialogImage: $("#dialogImage"), favoriteButton: $("#favoriteButton"), deleteButton: $("#deleteButton"), closeDialog: $("#closeDialog"), toast: $("#toast"), infoDialog: $("#infoDialog"),
  albumList: $("#albumList"), selectButton: $("#selectPhotosButton"), selectionBar: $("#selectionBar"), selectionCount: $("#selectionCount"), cancelSelection: $("#cancelSelection"), makeAlbum: $("#makeAlbumButton"),
  albumDialog: $("#albumDialog"), albumForm: $("#albumForm"), albumName: $("#albumName"), cancelAlbum: $("#cancelAlbum"),
};

let photos = [], albums = [], selectedId = null, activeFilter = "all", activeAlbumId = null, selectionMode = false;
let selectedPhotoIds = new Set(), objectUrls = [];
const makeId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const formatDate = (time) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(time);

function showToast(message) {
  el.toast.textContent = message; el.toast.classList.add("visible");
  window.setTimeout(() => el.toast.classList.remove("visible"), 2400);
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
$("#settingsButton").addEventListener("click", () => el.infoDialog.showModal());
$("#closeInfo").addEventListener("click", () => el.infoDialog.close());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
try { [photos, albums] = await Promise.all([getPhotos(), getAlbums()]); render(); } catch { showToast("기기 저장소를 열 수 없어요."); }
