# Cloudflare 排行榜 API

遊戲前端仍放在 GitHub Pages；這個 Worker 只負責排行榜 API，資料儲存在 Cloudflare D1。

正式 API：<https://smoke-run-api.smoke-run-level-api.workers.dev>

## 本機執行

```powershell
cd worker
npm install
npm run db:migrate:local
npm run dev
```

Worker 預設在 `http://127.0.0.1:8787`，遊戲頁在本機會自動使用這個網址。

## 已完成的正式環境

- Worker：`smoke-run-api`
- D1：`smoke-run-db`（APAC）
- workers.dev 子網域：`smoke-run-level-api`

後續更新 Worker：

```powershell
cd worker
npm install
npm run db:migrate:remote
npm run deploy
```

## API

- `GET /health`
- `GET /api/leaderboard?board=easy|normal|hard|ach&limit=15`
- `POST /api/player`
- `POST /api/scores`

完整契約見 [`openapi.json`](openapi.json)。分數提交會驗證欄位與合理上限，並以玩家 ID 限制每分鐘最多 6 次。

