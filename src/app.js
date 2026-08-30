import { getPhotos, removePhoto, savePhoto } from "./db.js";

const elements = {
  input: document.querySelector("#photoInput"),
  gallery: document.querySelector("#gallery"),
  empty: document.querySelector("#emptyState"),
  photoCount: document.querySelector("#photoCount"),
  peopleCount: document.querySelector("#peopleCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  dialog: document.querySelector("#photoDialog"),
  dialogImage: document.querySelector("#dialogImage"),
  favoriteButton: document.querySelector("#favoriteButton"),
  deleteButton: document.querySelector("#deleteButton"),
  closeDialog: document.querySelector("#closeDialog"),
  toast: document.querySelector("#toast"),
  infoDialog: document.querySelector("#infoDialog"),
};

let photos = [];
let selectedId = null;
let activeFilter = "all";
let objectUrls = [];

function makeId(file) {
  return `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}-${file.name}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(timestamp);
}

function currentPhotos() {
  if (activeFilter === "favorites") return photos.filter((photo) => photo.favorite);
  if (activeFilter === "people") return photos.filter((photo) => photo.people?.length);
  return photos;
}

function revokeUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function render() {
  revokeUrls();
  const visible = currentPhotos().sort((a, b) => b.createdAt - a.createdAt);
  elements.gallery.replaceChildren();
  elements.photoCount.textContent = photos.length;
  elements.favoriteCount.textContent = photos.filter((photo) => photo.favorite).length;
  elements.peopleCount.textContent = new Set(photos.flatMap((photo) => photo.people ?? [])).size;
  elements.empty.hidden = visible.length > 0;

  const groups = visible.reduce((result, photo) => {
    const date = formatDate(photo.createdAt);
    if (!result.has(date)) result.set(date, []);
    result.get(date).push(photo);
    return result;
  }, new Map());
  groups.forEach((items, date) => {
    const group = document.createElement("section");
    group.className = "date-group";
    const heading = document.createElement("h2");
    heading.textContent = date;
    const grid = document.createElement("div");
    grid.className = "photo-grid";

    items.forEach((photo) => {
      const url = URL.createObjectURL(photo.blob);
      objectUrls.push(url);
      const button = document.createElement("button");
      button.className = "photo-card";
      button.dataset.id = photo.id;
      const image = document.createElement("img");
      image.src = url;
      image.alt = photo.name;
      image.loading = "lazy";
      button.append(image);
      if (photo.favorite) {
        const heart = document.createElement("span");
        heart.className = "heart";
        heart.textContent = "♥";
        button.append(heart);
      }
      button.addEventListener("click", () => openPhoto(photo.id));
      grid.append(button);
    });

    group.append(heading, grid);
    elements.gallery.append(group);
  });
}

function openPhoto(id) {
  const photo = photos.find((item) => item.id === id);
  if (!photo) return;
  selectedId = id;
  const url = URL.createObjectURL(photo.blob);
  objectUrls.push(url);
  elements.dialogImage.src = url;
  elements.favoriteButton.textContent = photo.favorite ? "♥ 즐겨찾기 해제" : "♡ 즐겨찾기";
  elements.dialog.showModal();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  showToast(`${files.length}장의 사진을 저장하고 있어요.`);
  for (const file of files) {
    const photo = {
      id: makeId(file),
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: file.lastModified || Date.now(),
      addedAt: Date.now(),
      favorite: false,
      people: [],
      blob: file,
    };
    await savePhoto(photo);
    photos.push(photo);
  }
  render();
  showToast("사진을 안전하게 저장했어요.");
  elements.input.value = "";
}

elements.input.addEventListener("change", (event) => addFiles(event.target.files).catch(() => showToast("사진 저장에 실패했어요.")));
elements.closeDialog.addEventListener("click", () => elements.dialog.close());
elements.favoriteButton.addEventListener("click", async () => {
  const photo = photos.find((item) => item.id === selectedId);
  if (!photo) return;
  photo.favorite = !photo.favorite;
  await savePhoto(photo);
  elements.dialog.close();
  render();
});
elements.deleteButton.addEventListener("click", async () => {
  if (!selectedId || !confirm("이 기기의 앨범에서 사진을 삭제할까요?")) return;
  await removePhoto(selectedId);
  photos = photos.filter((photo) => photo.id !== selectedId);
  elements.dialog.close();
  render();
  showToast("사진을 삭제했어요.");
});
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
document.querySelector("#settingsButton").addEventListener("click", () => elements.infoDialog.showModal());
document.querySelector("#closeInfo").addEventListener("click", () => elements.infoDialog.close());

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");

try {
  photos = await getPhotos();
  render();
} catch {
  showToast("기기 저장소를 열 수 없어요.");
}
