const MYBOX_API = "https://open-api.mybox.naver.com/v1";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-Parent-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request, env, body, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request, env) });
}

function isConfigured(env) {
  return Boolean(env.MYBOX_PAT && env.SYNC_KEY);
}

function isAuthorized(request, env) {
  const value = request.headers.get("Authorization") ?? "";
  return Boolean(env.SYNC_KEY) && value === `Bearer ${env.SYNC_KEY}`;
}

async function myboxRequest(env, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.MYBOX_PAT}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${MYBOX_API}${path}`, { ...init, headers });
}

async function uploadPhoto(request, env) {
  const fileName = decodeURIComponent(request.headers.get("X-File-Name") ?? "").trim();
  const parentId = request.headers.get("X-Parent-Id")?.trim();
  const contentType = request.headers.get("Content-Type") ?? "application/octet-stream";
  const fileSize = Number(request.headers.get("Content-Length") ?? 0);
  if (!fileName || !fileSize || fileSize > 25 * 1024 * 1024) {
    console.warn("upload_validation_failed", { hasFileName: Boolean(fileName), fileSize });
    return json(request, env, { error: "사진 이름 또는 크기가 올바르지 않습니다. 최대 25MB까지 지원합니다." }, 400);
  }

  const metadata = { fileName, fileSize, isOverwrite: false };
  if (parentId) metadata.parentId = parentId;
  const createResponse = await myboxRequest(env, "/drive/files", { method: "POST", body: JSON.stringify(metadata) });
  if (!createResponse.ok) {
    const detail = await createResponse.text();
    console.error("mybox_prepare_failed", { status: createResponse.status });
    return json(request, env, { error: "MYBOX 업로드 준비에 실패했습니다.", detail }, createResponse.status);
  }
  const { uploadUrl } = await createResponse.json();
  const fileBlob = new Blob([await request.arrayBuffer()], { type: contentType });
  const uploadForm = new FormData();
  uploadForm.append("Filedata", fileBlob, fileName);
  const uploadResponse = await fetch(uploadUrl, { method: "POST", body: uploadForm });
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    let safeError = {};
    try { const parsed = JSON.parse(errorText); safeError = { code: parsed.code, message: parsed.message }; } catch { safeError = { message: uploadResponse.statusText }; }
    console.error("mybox_upload_failed", { status: uploadResponse.status, ...safeError });
    return json(request, env, { error: "MYBOX 파일 업로드에 실패했습니다.", status: uploadResponse.status, ...safeError }, 502);
  }
  console.log("mybox_upload_succeeded", { fileSize });
  const responseText = await uploadResponse.text();
  let result = null;
  try { result = responseText ? JSON.parse(responseText) : null; } catch { result = { uploaded: true }; }
  return json(request, env, { ok: true, fileName, result }, 201);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json(request, env, { ok: true, configured: isConfigured(env) });
    if (!isConfigured(env)) return json(request, env, { error: "Cloudflare Secret 설정이 필요합니다." }, 503);
    if (!isAuthorized(request, env)) return json(request, env, { error: "인증에 실패했습니다." }, 401);
    if (url.pathname === "/storage" && request.method === "GET") {
      const response = await myboxRequest(env, "/drive/storage");
      return new Response(response.body, { status: response.status, headers: { ...corsHeaders(request, env), "Content-Type": "application/json" } });
    }
    if (url.pathname === "/upload" && request.method === "POST") return uploadPhoto(request, env);
    return json(request, env, { error: "지원하지 않는 요청입니다." }, 404);
  },
};
