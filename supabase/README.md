# 排行榜設定（Supabase，免費）

大約 5 分鐘。

## 1. 建立專案
1. 到 https://supabase.com 用 GitHub 帳號登入
2. 按 **New project**
   - Name：`smoke-run`
   - Database Password：隨便設一個強密碼（之後用不到，但要記下來）
   - Region：選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，離台灣近比較快
3. 按 **Create new project**，等 1～2 分鐘建立完成

## 2. 建立資料表
1. 左邊選單 → **SQL Editor** → **New query**
2. 把 `supabase/setup.sql` 的內容全部貼上
3. 按右下角 **Run**，看到 `Success. No rows returned` 就完成了

## 3. 取得連線資訊
左邊選單 → **Project Settings**（齒輪）→ **API**（或 **API Keys**），複製這兩個：
- **Project URL**：像 `https://abcdefgh.supabase.co`
- **anon public key** 或 **publishable key**：一長串文字

> 這兩個是「公開」金鑰，本來就設計成放在網頁上，不用擔心外流。
> ⚠️ 不要給 `service_role` / `secret` 那個，那個才是機密。

## 4. 填進遊戲
打開 `index.html`，搜尋 `const LB = {`，填進去：

```js
const LB = {
  url: 'https://abcdefgh.supabase.co',
  key: '貼上 anon / publishable key',
};
```

推上 GitHub 後約 1 分鐘，排行榜就會開放。
