# Spec: Çok Kullanıcılı Cloud Sync (D1 + Cloudflare Access)

**Tarih:** 2026-06-27
**Status:** Approved → ready for plan
**İlgili faz:** Faz 5 (yeni — multi-user cloud persistence)

## Hedef

Pano verisi artık her kullanıcının kendi Cloudflare D1 satırında. Yetkilendirme Cloudflare Access üzerinden Google OAuth + e-posta allowlist'i ile. Cross-origin cookie sorununu çözmek için pano Worker'a taşınır, GitHub Pages doğal olarak boşalır (kapatılır ya da bırakılır).

## Karar Özeti

| Karar | Seçim | Gerekçe |
|---|---|---|
| Depo | **Cloudflare D1** (SQLite) | 5GB free, Worker'la native, esnek |
| Auth | **Cloudflare Access + Google** | Self-managed token yok, dashboard'dan policy |
| Allowlist | Cloudflare dashboard'da (Worker config'inde değil) | Dinamik, Worker deploy gerektirmez |
| Conflict resolution | **Last-write-wins** | Çok az çakışma; tek user genelde tek cihaz |
| Migration (lokal → bulut) | **Yok**, sıfırdan başla | Henüz gerçek veri yok |
| Offline davranışı | **Yok**, bağlantısız hiç açılmaz | Tek doğru kaynak bulut |
| Pano URL'si | **Worker'a taşınır** (`portfoy-api.tufance.workers.dev/`) | Same-origin → Access cookies sağlam |
| Login UX | **Kendi login sayfamız** | Tek ekran HTML, JS toggle |
| GitHub Pages | Bırakılır (kapatılabilir) | 301 gereksiz |

## Mimari

```
portfoy-api.tufance.workers.dev/         ← Workers Assets: public/index.html
                              /prices    ← public (Yahoo/TEFAS) - mevcut
                              /data      ← Access protected: portföy CRUD
                              /auth/login   ← public, 302 → Access login URL
                              /auth/logout  ← public, 302 → CF Access logout
                              /cdn-cgi/access/* ← Cloudflare native

tufance.github.io                        ← orphan, opsiyonel kapatma
```

### Login akışı (kullanıcı gözünden)

1. URL açar → JS `fetch('/data', { credentials: 'include', redirect: 'manual' })`
2. `opaqueredirect` veya `401` → `#login-screen` görünür
3. "Google ile devam et" → `/auth/login` → Access login URL → Google
4. Google izin → CF Access cookie set olur → `/`'e geri yönlendirme
5. JS tekrar `/data` → `200 { email, data, updatedAt }` → pano render
6. Header'da `tufan.cetiner@useinsider.com · Çıkış` görünür

## D1 Şeması

```sql
CREATE TABLE portfolios (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,        -- JSON blob (tüm pano state)
  updated_at TEXT NOT NULL          -- ISO 8601
);
CREATE INDEX idx_updated_at ON portfolios(updated_at);
```

Tek tablo, 1 row/user. JSON blob içeriği:

```json
{
  "holdings": [...], "cash": 0, "sales": [...], "contrib": [...],
  "goals": [...], "snaps": [...], "savTarget": {...},
  "mileDates": {...}, "proj": {...}, "state": {...},
  "schemaVersion": 1
}
```

`RATES` blob'a girmez (canlı `/prices`'tan).

## API Kontratı

### `GET /data`
- **Auth:** Cloudflare Access (header `Cf-Access-Authenticated-User-Email`)
- **Yanıt:**
  ```json
  { "email": "tufan@example.com", "data": {...}|null, "updatedAt": "..."|null }
  ```
- `data: null` → yeni kullanıcı, henüz blob yok.

### `PUT /data`
- **Auth:** Access
- **Body:** `{ "data": { ...blob } }`
- **Davranış:** UPSERT, `updated_at = new Date().toISOString()`
- **Yanıt:** `200 { "updatedAt": "..." }`
- **Validation:** Body 1MB üst sınır (Workers limit zaten), `data` object olmalı.

### `GET /auth/login`
- **Auth:** yok
- **Davranış:** `302 → https://${CF_TEAM_NAME}.cloudflareaccess.com/cdn-cgi/access/login/${CF_ACCESS_AUD}?redirect_url=/`

### `GET /auth/logout`
- **Auth:** yok
- **Davranış:** `302 → /cdn-cgi/access/logout`

### `GET /prices` — mevcut, değişmez (public)

### `GET /` — Workers Assets fallback → `public/index.html`

## Cloudflare Access Kurulumu

Kullanıcı dashboard'da, tek seferlik:

1. **Zero Trust'a kayıt** — Free plan (kart bilgisi ister ama tahsil etmez).
2. **Settings → Authentication → Login methods → Google** ekle.
   - Google Cloud Console'da OAuth 2.0 Client ID + Secret oluştur.
   - Authorized redirect: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Client ID + Secret'i Cloudflare'e ver.
3. **Access → Applications → Add → Self-hosted:**
   - Application name: `Portföy Panosu`
   - Session duration: `24 hours`
   - Application domain: `portfoy-api.tufance.workers.dev`
   - Path: `/data` (sadece bu path korunsun)
   - Identity provider: Google
4. **Policies → Add policy:**
   - Action: Allow
   - Include: Emails → kullanıcı tarafından yönetilen liste
5. **Application AUD'sini kopyala** → `wrangler.toml` `CF_ACCESS_AUD` env var.
6. **Team domain** (`<team>.cloudflareaccess.com` URL'inin team kısmı) → `wrangler.toml` `CF_TEAM_NAME`.

Allowlist bundan sonra dashboard'dan yönetilir. Yeni kullanıcı eklemek için Worker deploy gerekmez.

## Frontend Diff

### Dosya konumu

- `index.html` root'tan `backend/public/index.html`'e taşınır (`git mv`).
- GitHub Pages doğal olarak 404 verir (`tufance.github.io/`). Kullanıcı isterse Pages'ı dashboard'dan kapatır.

### Yeni UI parçaları

**Login ekranı** — header'dan önce, mevcut tema ile:
```html
<div id="login-screen" hidden>
  <div class="login-card">
    <div class="dot">₺</div>
    <h1>Portföy Panosu</h1>
    <div class="sub">Kişisel birikim & finansal hedef takibi</div>
    <a class="btn-google" href="/auth/login">Google ile devam et</a>
    <div class="hint">Yetkili hesaplar erişebilir.</div>
  </div>
</div>
```

**User chip** — header'da, sağda:
```html
<div class="user-chip"><span id="userEmail">—</span> · <a href="/auth/logout">Çıkış</a></div>
```

### Boot fonksiyonu (yeni)

```js
async function boot() {
  try {
    const res = await fetch('/data', { credentials: 'include', redirect: 'manual' });
    if (res.type === 'opaqueredirect' || res.status === 401) {
      showLogin(); return;
    }
    if (!res.ok) throw new Error('boot_failed');
    const { email, data, updatedAt } = await res.json();
    document.getElementById('userEmail').textContent = email;
    hydrate(data);   // data === null → empty state
    state.lastSync = updatedAt;
    showApp();
    autoRefreshPrices().catch(() => {});
    renderTab();
  } catch {
    showError();
  }
}
boot();
```

### Persistence değişimi

Mevcut `store` (localStorage shim) ile `save()` / `load()` yerine:

- `load()` → kaldırılır. Boot tek atışta `/data` çeker.
- `save()` → `scheduleSave()` ile değişir:
  ```js
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);  // debounce
  }
  async function saveNow() {
    const blob = {
      holdings: HOLDINGS, cash: CASH, sales: SALES,
      contrib: CONTRIB, goals: GOALS, snaps: SNAPS,
      savTarget: SAV_TARGET, mileDates: MILE_DATES,
      proj: PROJ, state: state, schemaVersion: 1
    };
    const r = await fetch('/data', {
      method: 'PUT',
      credentials: 'include',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ data: blob })
    });
    if (r.ok) state.lastSync = (await r.json()).updatedAt;
  }
  ```
- Mevcut UI handler'larında `save()` çağrılarının hepsi → `scheduleSave()`.

### `hydrate(data)` yardımcısı

```js
function hydrate(data) {
  if (!data) {
    HOLDINGS = []; CASH = 0; SALES = []; CONTRIB = []; GOALS = [];
    SNAPS = []; SAV_TARGET = {amount:1000,ccy:"USD"};
    MILE_DATES = {}; PROJ = {value:null,monthly:null,annual:10,years:10};
    return;
  }
  HOLDINGS = data.holdings ?? [];
  CASH = data.cash ?? 0;
  SALES = data.sales ?? [];
  CONTRIB = data.contrib ?? [];
  GOALS = data.goals ?? [];
  SNAPS = data.snaps ?? [];
  SAV_TARGET = data.savTarget ?? {amount:1000,ccy:"USD"};
  MILE_DATES = data.mileDates ?? {};
  PROJ = Object.assign({value:null,monthly:null,annual:10,years:10}, data.proj ?? {});
  if (data.state) state = Object.assign(state, data.state);
}
```

## Worker Dosya Yapısı

```
backend/
├── public/
│   └── index.html              # root'tan taşındı (git mv)
├── migrations/
│   └── 0001_init.sql           # CREATE TABLE portfolios
├── src/
│   ├── index.ts                # + /data, /auth/login, /auth/logout, ASSETS fallback
│   ├── auth.ts                 # readUserEmail(request): string | null
│   ├── store.ts                # getPortfolio(db, email), upsertPortfolio(db, email, data)
│   ├── yahoo.ts, tefas.ts, rates.ts, types.ts   # mevcut
│   └── (login.ts gerekmez — HTML public/'de)
├── test/
│   ├── auth.test.ts
│   ├── store.test.ts
│   └── ...existing
└── wrangler.toml               # + [assets] + [[d1_databases]] + vars
```

## Test Stratejisi

- **`auth.ts`** unit: header parse + email validation.
- **`store.ts`** unit: miniflare D1 + `getPortfolio`/`upsertPortfolio` happy + boş + üzerine yazma.
- **`/data` GET/PUT** integration: miniflare ile Access header simülasyonu + D1.
- **Frontend:** boot → login akışı manuel browser test (subagent değil, controller-driven).

## Deploy Adımları

```bash
cd backend
# 1. D1 oluştur
npx wrangler d1 create portfoy-db
# Çıktıdaki database_id'yi wrangler.toml'a yapıştır

# 2. Migration uygula (production)
npx wrangler d1 migrations apply portfoy-db --remote

# 3. Worker deploy
npx wrangler deploy
```

Cloudflare Access ayarları yukarıdaki "Kurulum" bölümünde — kullanıcı dashboard'da yapar, env vars `wrangler.toml`'a yapışır, yeniden deploy.

## Kapsam Dışı (YAGNI)

- Otomatik backup (Cron + R2) — manuel `wrangler d1 export` yeterli.
- Conflict resolution (optimistic locking, CRDT) — last-write-wins kâfi.
- LocalStorage offline cache — kullanıcı kapalı dedi.
- "Data export" UI'sı — gerekirse sonra.
- Hesap silme UI'sı — Cloudflare Access'ten policy çıkarmak yeterli.
- Sub-user / paylaşılan portföy — single-user model.

## Riskler

1. **Workers Assets binding wrangler v3'te kararlı** — sorun yok ama yeni özellik, izlenmesi gerekir.
2. **Google OAuth setup kullanıcı tarafında** — adım adım dokümantasyon planda.
3. **D1 100K yazma/gün** — debounce var, 1 user × 100 save/gün × 10 user = 1000/gün → sınırın çok altı.
4. **Workers Assets dizin yapısı:** `backend/public/` altındaki tüm dosyalar public servisi. Sadece `index.html` koyacağız; başka sırlar girmesin.

## Plan Self-Review Notu

Yazar (Claude): Bu spec onaylandı, doğrudan implementation plan'ine geçilir; brainstorming skill'inin "user reviews spec" gate'i kullanıcı talimatıyla atlanıyor.
