# MYBOX Sync Worker

앨범 PWA와 MYBOX 사이에서 개인 액세스 토큰을 보호하는 Cloudflare Worker입니다.

필수 Secret:

- `MYBOX_PAT`: MYBOX에서 새로 발급한 개인 액세스 토큰
- `SYNC_KEY`: 앱과 Worker 사이에서 사용할 충분히 긴 임의 문자열

Secret은 소스 코드나 `wrangler.jsonc`에 기록하지 않습니다. Cloudflare 대시보드의 Worker 설정에서 Secret 형식으로 등록합니다.

엔드포인트:

- `GET /health`: 설정 상태 확인
- `GET /storage`: MYBOX 사용량 조회
- `POST /upload`: 사진 원본 업로드(최대 25MB)
