# Cloud Sync (D1 + Cloudflare Access) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pano verisini Cloudflare D1'e taşı, Cloudflare Access + Google OAuth ile multi-user yap, panoyu Worker'a host et (same-origin auth için), login UX kendi sayfamızla.

**Architecture:** Worker hem statik HTML'i (Workers Assets) hem API'yi (D1 + `/prices` + `/auth/*`) servis eder. `/data` Cloudflare Access koruması altında, Worker `Cf-Access-Authenticated-User-Email` header'ından kullanıcıyı tanır.

**Tech Stack:** TypeScript, Cloudflare Workers Assets, D1 (SQLite), Cloudflare Access (Google OAuth), vitest + msw + miniflare.

---

## Çalışma Dizini

Tüm değişiklikler `/Users/tufancetiner/tufance.github.io/` altında. Branch: `main`, commit-only (push'u final task'ta).

## Dosya Yapısı (yeni/değişen)

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `backend/public/index.html` | Pano + login screen (Workers Assets) | **Move** (root'tan) |
| `backend/migrations/0001_init.sql` | D1 schema | Yeni |
| `backend/src/auth.ts` | `readUserEmail(req): string \| null` | Yeni |
| `backend/src/store.ts` | D1 CRUD (`getPortfolio`, `upsertPortfolio`) | Yeni |
| `backend/src/index.ts` | + `/data`, `/auth/login`, `/auth/logout`, ASSETS fallback | Modify |
| `backend/src/types.ts` | + `Env` D1 binding + AUD/TEAM, `PortfolioRow` | Modify |
| `backend/wrangler.toml` | + `[assets]`, `[[d1_databases]]`, `CF_TEAM_NAME`/`CF_ACCESS_AUD` vars | Modify |
| `backend/test/auth.test.ts` | header parse unit | Yeni |
| `backend/test/store.test.ts` | D1 CRUD unit (miniflare) | Yeni |
| `index.html` (root) | silinir | Delete |

---

## Task 0: D1 database oluştur (controller-driven, en başta)

**Not:** Bu adım `wrangler d1 create` çalıştırır ve dönen `database_id`'yi `wrangler.toml`'a yazmak için gerek. Subagent yerine controller (Claude main loop) yapacak — env etkileşimi var.

- [ ] **Step 1:** Controller çalıştırır:
  ```bash
  cd /Users/tufancetiner/tufance.github.io/backend
  npx wrangler d1 create portfoy-db
  ```
  Çıktıda `database_id = "..."` satırını yakala.

- [ ] **Step 2:** Controller bu `database_id`'yi sonraki task'lara prop olarak verir.

---

## Task 1: Backend scaffold genişlet (wrangler + migrations + types)

**Files:**
- Modify: `backend/wrangler.toml`
- Create: `backend/migrations/0001_init.sql`
- Modify: `backend/src/types.ts`

### Step 1: `backend/wrangler.toml` güncelle

Mevcut içeriği koruyarak ekle (Task 0'dan gelen `database_id` ile):

```toml
name = "portfoy-api"
main = "src/index.ts"
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./public"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "portfoy-db"
database_id = "<TASK_0_DEN_GELEN>"
migrations_dir = "migrations"

[vars]
ALLOWED_ORIGIN = "https://portfoy-api.tufance.workers.dev"
CF_TEAM_NAME = ""              # Task 8'de doldurulacak
CF_ACCESS_AUD = ""             # Task 8'de doldurulacak
```

Önceki `ALLOWED_ORIGIN` (`https://tufance.github.io`) artık irrelevant olduğu için değişti; same-origin'e taşındık.

### Step 2: `backend/migrations/0001_init.sql` oluştur

```sql
CREATE TABLE IF NOT EXISTS portfolios (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolios_updated_at ON portfolios(updated_at);
```

### Step 3: `backend/src/types.ts` güncelle (mevcut + ekle)

Mevcut `Env` interface'i şununla değiştir:

```typescript
export interface Env {
  ALLOWED_ORIGIN: string;
  CF_TEAM_NAME: string;
  CF_ACCESS_AUD: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  DB: D1Database;
}

export interface PortfolioRow {
  email: string;
  data: string;          // JSON-encoded blob
  updated_at: string;
}

export interface PortfolioResponse {
  email: string;
  data: Record<string, unknown> | null;
  updatedAt: string | null;
}
```

Diğer mevcut tipler aynı kalır.

### Step 4: Migration'ı local'e uygula

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx wrangler d1 migrations apply portfoy-db --local
```

Beklenen: `0001_init.sql` başarıyla uygulandı.

### Step 5: Typecheck

```bash
npx tsc --noEmit
```

`D1Database` tipi `@cloudflare/workers-types`'tan gelir — mevcut.

### Step 6: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/wrangler.toml backend/migrations/ backend/src/types.ts
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "backend: scaffold d1 + assets + access env"
```

---

## Task 2: `auth.ts` — kullanıcı email çözücü

**Files:**
- Create: `backend/test/auth.test.ts`
- Create: `backend/src/auth.ts`

### Step 1: Failing test

`backend/test/auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readUserEmail } from "../src/auth";

describe("readUserEmail", () => {
  it("returns email from Cf-Access-Authenticated-User-Email header", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "tufan@example.com" }
    });
    expect(readUserEmail(req)).toBe("tufan@example.com");
  });

  it("returns null when header missing", () => {
    const req = new Request("https://x/");
    expect(readUserEmail(req)).toBeNull();
  });

  it("returns null for empty string", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "" }
    });
    expect(readUserEmail(req)).toBeNull();
  });

  it("trims whitespace", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "  tufan@example.com  " }
    });
    expect(readUserEmail(req)).toBe("tufan@example.com");
  });
});
```

Run: `npx vitest run test/auth.test.ts` → FAIL (module yok).

### Step 2: Implementation

`backend/src/auth.ts`:

```typescript
const HEADER = "Cf-Access-Authenticated-User-Email";

export function readUserEmail(req: Request): string | null {
  const raw = req.headers.get(HEADER);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

Run: 4/4 PASS.

### Step 3: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/auth.ts backend/test/auth.test.ts
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "backend(auth): readUserEmail header parser"
```

---

## Task 3: `store.ts` — D1 portfolio CRUD

**Files:**
- Create: `backend/test/store.test.ts`
- Create: `backend/src/store.ts`

### Step 1: Failing test (miniflare D1)

`backend/test/store.test.ts`:

```typescript
import { beforeEach, describe, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { getPortfolio, upsertPortfolio } from "../src/store";

let mf: Miniflare;
let db: D1Database;

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch: () => new Response('') }",
    d1Databases: { DB: "test-db" },
  });
  db = await mf.getD1Database("DB");
  await db.exec(
    "CREATE TABLE portfolios (email TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);"
  );
});

describe("getPortfolio", () => {
  it("returns null for unknown user", async () => {
    expect(await getPortfolio(db, "x@y.com")).toBeNull();
  });

  it("returns row for known user", async () => {
    await db.prepare("INSERT INTO portfolios VALUES (?, ?, ?)")
      .bind("x@y.com", '{"k":1}', "2026-06-27T00:00:00Z").run();
    const row = await getPortfolio(db, "x@y.com");
    expect(row).toEqual({ data: '{"k":1}', updated_at: "2026-06-27T00:00:00Z" });
  });
});

describe("upsertPortfolio", () => {
  it("inserts when row absent", async () => {
    const ts = await upsertPortfolio(db, "x@y.com", '{"a":1}');
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const row = await getPortfolio(db, "x@y.com");
    expect(row?.data).toBe('{"a":1}');
  });

  it("overwrites when row present", async () => {
    await upsertPortfolio(db, "x@y.com", '{"v":1}');
    await upsertPortfolio(db, "x@y.com", '{"v":2}');
    const row = await getPortfolio(db, "x@y.com");
    expect(row?.data).toBe('{"v":2}');
  });
});
```

`miniflare` paket olarak `wrangler`'la birlikte geliyor ama doğrudan import için `npm i -D miniflare` gerekebilir. Önce kur:

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npm install --save-dev miniflare
```

Run: `npx vitest run test/store.test.ts` → FAIL (module yok).

### Step 2: Implementation

`backend/src/store.ts`:

```typescript
export interface StoredRow {
  data: string;
  updated_at: string;
}

export async function getPortfolio(db: D1Database, email: string): Promise<StoredRow | null> {
  const row = await db
    .prepare("SELECT data, updated_at FROM portfolios WHERE email = ?")
    .bind(email)
    .first<StoredRow>();
  return row ?? null;
}

export async function upsertPortfolio(
  db: D1Database,
  email: string,
  dataJson: string
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO portfolios (email, data, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
    )
    .bind(email, dataJson, now)
    .run();
  return now;
}
```

Run: 4/4 PASS.

### Step 3: Typecheck

```bash
npx tsc --noEmit
```

### Step 4: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/store.ts backend/test/store.test.ts backend/package.json backend/package-lock.json
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "backend(store): d1 portfolio crud"
```

---

## Task 4: Worker entry — yeni route'lar + ASSETS fallback

**Files:**
- Modify: `backend/src/index.ts`

### Step 1: Mevcut Worker entry'sini güncelle

`backend/src/index.ts` tamamen şu içerikle değiştir:

```typescript
import { fetchYahooQuote } from "./yahoo";
import { fetchTefasFund } from "./tefas";
import { buildRates } from "./rates";
import { readUserEmail } from "./auth";
import { getPortfolio, upsertPortfolio } from "./store";
import type { Env, PriceEntry, PricesResponse, Rates, PortfolioResponse } from "./types";

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

const SYMBOL_RE = /^[A-Z0-9.\-=]+$/;

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(s => s.length > 0 && SYMBOL_RE.test(s));
}

async function handlePrices(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const yahooSymbols = parseSymbols(url.searchParams.get("yahoo"));
  const tefasFunds = parseSymbols(url.searchParams.get("tefas"));

  const errors: Record<string, string> = {};
  let rates: Rates | null = null;
  try { rates = await buildRates(fetchYahooQuote); }
  catch (e) { errors._rates = (e as Error).message || "upstream_error"; }

  const [yahooResults, tefasResults] = await Promise.all([
    Promise.allSettled(yahooSymbols.map(sym => fetchYahooQuote(sym).then(q => [sym, q] as const))),
    Promise.allSettled(tefasFunds.map(code => fetchTefasFund(code).then(p => [code, p] as const))),
  ]);

  const prices: Record<string, PriceEntry> = {};
  for (const r of yahooResults) {
    if (r.status === "fulfilled") {
      const [sym, q] = r.value;
      const entry: PriceEntry = { price: q.price, currency: q.currency, source: "yahoo" };
      if (q.currency === "USD" && rates) entry.tryEquiv = q.price * rates.usdtry;
      else if (q.currency === "EUR" && rates) entry.tryEquiv = q.price * rates.eurtry;
      prices[sym] = entry;
    } else {
      const sym = yahooSymbols[yahooResults.indexOf(r)];
      errors[sym] = (r.reason?.message as string) ?? "upstream_error";
    }
  }
  for (const r of tefasResults) {
    if (r.status === "fulfilled") {
      const [code, p] = r.value;
      prices[code] = { price: p, currency: "TRY", source: "tefas" };
    } else {
      const code = tefasFunds[tefasResults.indexOf(r)];
      errors[code] = (r.reason?.message as string) ?? "upstream_error";
    }
  }

  const body: PricesResponse = { updatedAt: new Date().toISOString(), rates, prices, errors };
  return jsonResponse(body, 200, { "cache-control": "public, max-age=60" });
}

async function handleGetData(request: Request, env: Env): Promise<Response> {
  const email = readUserEmail(request);
  if (!email) return new Response("unauthorized", { status: 401 });
  const row = await getPortfolio(env.DB, email);
  const body: PortfolioResponse = {
    email,
    data: row ? JSON.parse(row.data) : null,
    updatedAt: row?.updated_at ?? null,
  };
  return jsonResponse(body);
}

async function handlePutData(request: Request, env: Env): Promise<Response> {
  const email = readUserEmail(request);
  if (!email) return new Response("unauthorized", { status: 401 });
  let payload: { data?: unknown };
  try { payload = await request.json(); }
  catch { return jsonResponse({ error: "invalid_json" }, 400); }
  if (!payload || typeof payload.data !== "object" || payload.data === null) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const dataJson = JSON.stringify(payload.data);
  const updatedAt = await upsertPortfolio(env.DB, email, dataJson);
  return jsonResponse({ updatedAt });
}

function handleAuthLogin(env: Env): Response {
  if (!env.CF_TEAM_NAME || !env.CF_ACCESS_AUD) {
    return new Response("access_not_configured", { status: 503 });
  }
  const target = `https://${env.CF_TEAM_NAME}.cloudflareaccess.com/cdn-cgi/access/login/${env.CF_ACCESS_AUD}?redirect_url=/`;
  return Response.redirect(target, 302);
}

function handleAuthLogout(request: Request): Response {
  const origin = new URL(request.url).origin;
  return Response.redirect(`${origin}/cdn-cgi/access/logout`, 302);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/prices") {
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      let response = await cache.match(cacheKey);
      if (response) return response;
      response = await handlePrices(request);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    if (path === "/data") {
      if (request.method === "GET") return handleGetData(request, env);
      if (request.method === "PUT") return handlePutData(request, env);
      return new Response("method_not_allowed", { status: 405 });
    }

    if (path === "/auth/login") return handleAuthLogin(env);
    if (path === "/auth/logout") return handleAuthLogout(request);

    return env.ASSETS.fetch(request);
  },
};
```

### Step 2: Typecheck

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx tsc --noEmit
```

Expected: PASS.

### Step 3: Mevcut test suite hâlâ yeşil

```bash
npx vitest run
```

Expected: 4 yahoo + 2 tefas + 2 rates + 4 auth + 4 store = 16 passing.

### Step 4: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/index.ts
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "backend(worker): /data crud + /auth/login + /auth/logout + ASSETS fallback"
```

---

## Task 5: index.html'i `backend/public/`'e taşı

**Files:**
- Move: `index.html` → `backend/public/index.html`

### Step 1: Klasör + move

```bash
cd /Users/tufancetiner/tufance.github.io
mkdir -p backend/public
git mv index.html backend/public/index.html
```

### Step 2: node --check (move sonrası içerik aynı kaldığı için PASS olmalı)

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('backend/public/index.html','utf8');const scripts=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]);require('fs').writeFileSync('/tmp/check.js',scripts.join('\\n;\\n'));"
node --check /tmp/check.js && echo OK
```

Expected: OK.

### Step 3: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "frontend: move index.html under workers assets"
```

---

## Task 6: Frontend — login screen + user chip + boot/save/load akışı

**Files:**
- Modify: `backend/public/index.html`

Bu en büyük frontend değişikliği. Mevcut UI'ı KORU, sadece persistence katmanını ve login screen'i ekle.

### Step 1: CSS ekle

`<style>` bloğunun sonuna (kapanış `</style>`'dan önce), yeni stiller:

```css
/* ===== login + user chip ===== */
#login-screen{position:fixed;inset:0;display:grid;place-items:center;background:var(--bg);z-index:100}
#login-screen[hidden]{display:none}
.login-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:36px 32px;max-width:380px;width:90%;text-align:center}
.login-card .dot{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#ff9d52);display:inline-grid;place-items:center;font-family:"Space Grotesk";font-weight:700;color:#1a0f04;font-size:24px;margin-bottom:14px}
.login-card h1{font-size:22px;margin:0 0 6px}
.login-card .sub{color:var(--muted);font-size:13px;margin-bottom:24px}
.btn-google{display:inline-flex;align-items:center;gap:10px;padding:12px 22px;background:#fff;color:#1f1f29;border-radius:12px;font-weight:600;font-size:14px;text-decoration:none;transition:.15s}
.btn-google:hover{filter:brightness(0.96)}
.btn-google svg{width:18px;height:18px}
.login-card .hint{color:var(--faint);font-size:12px;margin-top:18px}
.user-chip{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px}
.user-chip a{color:var(--accent);text-decoration:none}
.user-chip a:hover{text-decoration:underline}
#app[hidden]{display:none}
```

### Step 2: `<body>` başında login screen ekle

Mevcut `<body>` etiketinden HEMEN sonra (her şeyden önce):

```html
<div id="login-screen" hidden>
  <div class="login-card">
    <div class="dot">₺</div>
    <h1>Portföy Panosu</h1>
    <div class="sub">Kişisel birikim & finansal hedef takibi</div>
    <a class="btn-google" href="/auth/login">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M23 12.27c0-.81-.07-1.6-.21-2.36H12v4.46h6.18a5.3 5.3 0 0 1-2.29 3.48v2.89h3.71C21.74 18.8 23 15.78 23 12.27z"/><path fill="#34A853" d="M12 23c3.09 0 5.69-1.02 7.59-2.78l-3.71-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.99 0-5.52-2.02-6.42-4.73H1.74v2.97C3.62 20.41 7.5 23 12 23z"/><path fill="#FBBC05" d="M5.58 13.7a6.91 6.91 0 0 1 0-4.41V6.32H1.74a11 11 0 0 0 0 9.36l3.84-2z"/><path fill="#EA4335" d="M12 5.45c1.68 0 3.18.58 4.36 1.71l3.27-3.27C17.68 1.99 15.08 1 12 1 7.5 1 3.62 3.59 1.74 7.32l3.84 2.97C6.48 7.47 9.01 5.45 12 5.45z"/></svg>
      Google ile devam et
    </a>
    <div class="hint">Yetkili hesaplar erişebilir.</div>
  </div>
</div>
```

### Step 3: Mevcut tüm pano içeriğini `<div id="app" hidden>` ile sar

Mevcut `<header>...</header>` ve sonrasındaki tüm görsel content'i tek bir `<div id="app" hidden>...</div>` içine al. (Modal overlay'ler app içinde kalsın.)

`<script>` bloğu app dışında, body'nin sonunda kalır.

### Step 4: Header'da user chip ekle

Header'ın sonunda (`<div class="updated">` 'tan hemen önce):

```html
<div class="user-chip"><span id="userEmail">—</span> · <a href="/auth/logout">Çıkış</a></div>
```

### Step 5: Persistence layer'ı değiştir — JS değişiklikleri

`<script>` bloğunda **mevcut** şu kısımları **kaldır**:
- `const store = {...}` (localStorage shim)
- `async function save() {...}` (eski 11 anahtarlı save)
- `async function load() {...}` (eski 11 anahtarlı load)
- Şu anki init satırı (`load().then(...)` ya da `boot()` benzeri)

**Yerine** ekle:

```javascript
function dumpState(){
  return {
    holdings: HOLDINGS, cash: CASH, sales: SALES, contrib: CONTRIB,
    goals: GOALS, snaps: SNAPS, savTarget: SAV_TARGET, mileDates: MILE_DATES,
    proj: PROJ, state: state, schemaVersion: 1
  };
}

function hydrate(data){
  if (!data){
    HOLDINGS=[]; CASH=0; SALES=[]; CONTRIB=[]; GOALS=[];
    SNAPS=[]; SAV_TARGET={amount:1000,ccy:"USD"};
    MILE_DATES={}; PROJ={value:null,monthly:null,annual:10,years:10};
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

let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}
async function saveNow(){
  try{
    const r = await fetch('/data', {
      method:'PUT', credentials:'include',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ data: dumpState() })
    });
    if (r.ok){
      const { updatedAt } = await r.json();
      state.lastSync = updatedAt;
    }
  }catch(e){ console.warn('save failed', e.message); }
}

// MEVCUT save() çağrılarının hepsi scheduleSave() oluyor
async function save(){ scheduleSave(); }   // backward compat shim

function showLogin(){ document.getElementById('login-screen').hidden=false; document.getElementById('app').hidden=true; }
function showApp(){ document.getElementById('login-screen').hidden=true; document.getElementById('app').hidden=false; }

async function boot(){
  try{
    const r = await fetch('/data', { credentials:'include', redirect:'manual' });
    if (r.type === 'opaqueredirect' || r.status === 401){
      showLogin(); return;
    }
    if (!r.ok) throw new Error('boot_failed');
    const { email, data, updatedAt } = await r.json();
    document.getElementById('userEmail').textContent = email;
    hydrate(data);
    state.lastSync = updatedAt;
    showApp();
    if (typeof renderTab === 'function') renderTab();
    autoRefreshPrices().catch(() => {});
  }catch(e){
    console.error('boot error', e);
    showLogin();
  }
}

boot();
```

### Step 6: `node --check`

```bash
cd /Users/tufancetiner/tufance.github.io
node -e "const fs=require('fs');const html=fs.readFileSync('backend/public/index.html','utf8');const scripts=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]);require('fs').writeFileSync('/tmp/check.js',scripts.join('\\n;\\n'));"
node --check /tmp/check.js && echo OK
```

Expected: OK.

### Step 7: Commit

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/public/index.html
git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "frontend: login screen + cloud sync (boot/save via /data)"
```

---

## Task 7: Lokal smoke test (controller-driven)

Wrangler dev'i başlatıp end-to-end manuel doğrulama.

- [ ] **Step 1:** `wrangler d1 migrations apply portfoy-db --local` zaten Task 1.Step 4'te yapıldı; tekrar gerekirse çalıştır.

- [ ] **Step 2:** Worker'ı başlat:
  ```bash
  cd /Users/tufancetiner/tufance.github.io/backend
  npx wrangler dev --port 8787 --local
  ```

- [ ] **Step 3:** Curl ile smoke test:
  ```bash
  # / → HTML serve (login screen görünmeli)
  curl -s http://localhost:8787/ | head -20

  # /prices → çalışıyor mu
  curl -s http://localhost:8787/prices | head -3

  # /data → header olmadan 401
  curl -s -i http://localhost:8787/data | head -5

  # /data → fake Access header ile (lokal test için manuel)
  curl -s http://localhost:8787/data -H 'Cf-Access-Authenticated-User-Email: test@example.com' | python3 -m json.tool

  # /data PUT
  curl -s -X PUT http://localhost:8787/data \
    -H 'Cf-Access-Authenticated-User-Email: test@example.com' \
    -H 'content-type: application/json' \
    -d '{"data":{"holdings":[],"cash":0,"schemaVersion":1}}' | python3 -m json.tool

  # /data GET tekrar
  curl -s http://localhost:8787/data -H 'Cf-Access-Authenticated-User-Email: test@example.com' | python3 -m json.tool

  # /auth/login (henüz CF_TEAM_NAME boş — 503 verir, normal)
  curl -s -i http://localhost:8787/auth/login | head -5
  ```

- [ ] **Step 4:** Wrangler dev'i durdur (`pkill -f "wrangler dev"`).

- [ ] **Step 5:** Sonuçları rapor et. Hata varsa → düzeltici subagent dispatch.

---

## Task 8: Cloudflare Access kurulumu (user-driven)

Bu adım kullanıcı dashboard'da yapacak. Controller rehberlik eder.

- [ ] **Step 1:** Kullanıcı Cloudflare dashboard → Zero Trust → kayıt ol (Free plan).

- [ ] **Step 2:** Google Cloud Console'da OAuth Client oluştur:
  - https://console.cloud.google.com/apis/credentials
  - Create OAuth client ID → Web application
  - Authorized redirect URI: `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
  - Client ID + Secret'i kopyala

- [ ] **Step 3:** Cloudflare Zero Trust → Settings → Authentication → Add → Google → Client ID + Secret'i yapıştır.

- [ ] **Step 4:** Cloudflare Zero Trust → Access → Applications → Add → Self-hosted:
  - Application name: `Portföy Panosu`
  - Session duration: `24 hours`
  - Application domain: `portfoy-api.tufance.workers.dev`
  - Path: `/data`
  - Identity provider: Google
  - Save → Application Audience (AUD) tag'i kopyala.

- [ ] **Step 5:** Aynı Application için Policy ekle:
  - Action: Allow
  - Include: Emails → kullanıcının vereceği liste (örnek: `tufan.cetiner@useinsider.com`)

- [ ] **Step 6:** Kullanıcı CF_TEAM_NAME (`<team>.cloudflareaccess.com` formundaki team) + CF_ACCESS_AUD değerlerini controller'a verir.

- [ ] **Step 7:** Controller `wrangler.toml`'a değerleri yapıştırır + commit:
  ```bash
  cd /Users/tufancetiner/tufance.github.io
  git add backend/wrangler.toml
  git -c user.email="tufan.cetiner@useinsider.com" -c user.name="Tufan Cetiner" commit -m "backend: configure cloudflare access (team + aud)"
  ```

---

## Task 9: Production migration + deploy + canlı doğrulama (controller-driven)

- [ ] **Step 1:** D1 migration production'a uygula:
  ```bash
  cd /Users/tufancetiner/tufance.github.io/backend
  npx wrangler d1 migrations apply portfoy-db --remote
  ```

- [ ] **Step 2:** Deploy:
  ```bash
  npx wrangler deploy
  ```

- [ ] **Step 3:** Smoke test canlı:
  ```bash
  # / → HTML
  curl -sI https://portfoy-api.tufance.workers.dev/ | head -5

  # /data → Access olmadan 302 (Cloudflare login redirect)
  curl -s -i https://portfoy-api.tufance.workers.dev/data | head -10

  # /auth/login → 302 Google login URL'sine
  curl -s -i https://portfoy-api.tufance.workers.dev/auth/login | head -10

  # /prices → 200 (mevcut)
  curl -s 'https://portfoy-api.tufance.workers.dev/prices' | head -3
  ```

- [ ] **Step 4:** Tarayıcıda E2E:
  Kullanıcı tarayıcıda `https://portfoy-api.tufance.workers.dev/` açar:
  - Login screen görünür
  - "Google ile devam et" tıklar
  - Google login + izin
  - Pano açılır (boş, kendi user'ı için ilk kez)
  - Bir yatırım ekler → otomatik PUT /data
  - Sayfayı yeniler → yatırım hâlâ orada (D1'den geldi)
  - "Çıkış" tıklar → login screen'e döner

- [ ] **Step 5:** Push:
  ```bash
  cd /Users/tufancetiner/tufance.github.io
  git push origin main
  ```

---

## Plan Self-Review

- ✅ Spec kapsamı: D1 schema (Task 1), API kontratı (Task 4), auth (Task 2), store CRUD (Task 3), Worker routing (Task 4), pano taşıma (Task 5), frontend integration (Task 6), Access kurulumu (Task 8), deploy + verification (Task 9).
- ✅ Placeholder yok: `<TASK_0_DEN_GELEN>` ve allowlist user-provided, plan içinde dış kaynaklı belirli.
- ✅ Tip tutarlılığı: `Env` (Task 1.Step 3) → Task 4'te aynı isimlerle kullanılıyor; `getPortfolio`/`upsertPortfolio` Task 3'te tanımlı, Task 4'te aynı imzayla çağrılıyor.
- ⚠️ Riskler:
  - Workers Assets'in `directory = "./public"` davranışı: only files in `public/` are served. Root-relative paths in HTML hâlâ doğru. ✓
  - Mevcut localStorage'daki kullanıcı verisi kaybolur (user kabul etti).
  - GitHub Pages'in `tufance.github.io`'da gösterdiği eski HTML kalır (yeni commit'le `index.html` silindiği için 404 olur, problem değil).
