# Prices Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pano (`tufance.github.io`) sayfa yüklendiğinde canlı kurları + holding fiyatlarını otomatik dolduran, Cloudflare Workers üzerinde çalışan TypeScript backend'i sıfırdan kurmak ve deploy etmek.

**Architecture:** Tek `GET /prices?yahoo=…&tefas=…` endpoint'i. Worker, Yahoo Finance chart API'sinden kurları + sembolleri, TEFAS `BindHistoryInfo` endpoint'inden fon fiyatlarını paralel çeker, sonucu CF Cache API ile 60 sn cache'ler, CORS-restricted JSON döner. Pano fetch ile çağırır, başarısızlıkta mevcut manuel akışa sessiz fallback yapar.

**Tech Stack:** Node.js 20+, TypeScript 5, Cloudflare Workers, `wrangler`, `vitest` + `msw` (unit tests), vanilla JS (frontend diff).

---

## Repo & Çalışma Dizini

Tüm çalışma `/Users/tufancetiner/tufance.github.io/` altında. Backend kodu `backend/` alt dizininde. Cloudflare Workers ayrı bir worker projesi (`*.workers.dev`) olarak deploy edilir; Pages backend kodunu servis etmez (sadece kök `index.html`).

## Dosya Yapısı

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `backend/package.json` | Bağımlılıklar + npm scriptleri | Yeni |
| `backend/tsconfig.json` | TS derleme ayarları | Yeni |
| `backend/wrangler.toml` | CF Workers config | Yeni |
| `backend/.gitignore` | node_modules, .wrangler, .dev.vars | Yeni |
| `backend/src/types.ts` | Paylaşılan tip tanımları | Yeni |
| `backend/src/yahoo.ts` | `fetchYahooQuote(symbol)` — saf fonksiyon | Yeni |
| `backend/src/tefas.ts` | `fetchTefasFund(code)` — saf fonksiyon | Yeni |
| `backend/src/rates.ts` | `buildRates(yahooFetcher)` — 6 oranı topla | Yeni |
| `backend/src/index.ts` | Worker entry: routing, CORS, cache | Yeni |
| `backend/vitest.config.ts` | Test config | Yeni |
| `backend/test/yahoo.test.ts` | `fetchYahooQuote` unit testi | Yeni |
| `backend/test/tefas.test.ts` | `fetchTefasFund` unit testi | Yeni |
| `backend/test/rates.test.ts` | `buildRates` unit testi | Yeni |
| `index.html` | `autoRefreshPrices()` + UI indicator | Modify |
| `README.md` | Mevcut → tufance.github.io'ya taşı | Copy |
| `CLAUDE_CODE_BRIEF.md` | Mevcut → tufance.github.io'ya taşı | Copy |

---

## Task 0: Auxiliary dokümanları taşı

**Files:**
- Copy: `/Users/tufancetiner/Financial-tracking/README.md` → `README.md`
- Copy: `/Users/tufancetiner/Financial-tracking/CLAUDE_CODE_BRIEF.md` → `CLAUDE_CODE_BRIEF.md`

- [ ] **Step 1: Kopyala**

```bash
cd /Users/tufancetiner/tufance.github.io
cp /Users/tufancetiner/Financial-tracking/README.md .
cp /Users/tufancetiner/Financial-tracking/CLAUDE_CODE_BRIEF.md .
```

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE_CODE_BRIEF.md
git commit -m "Add README and Claude Code brief"
```

---

## Task 1: Backend iskeleti — package.json

**Files:**
- Create: `backend/package.json`

- [ ] **Step 1: Klasör oluştur**

```bash
mkdir -p /Users/tufancetiner/tufance.github.io/backend
cd /Users/tufancetiner/tufance.github.io/backend
```

- [ ] **Step 2: `backend/package.json` yaz**

```json
{
  "name": "portfoy-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240620.0",
    "msw": "^2.3.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 3: Bağımlılıkları kur**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npm install
```

Beklenen: `node_modules/` oluşur, `package-lock.json` üretilir.

- [ ] **Step 4: `wrangler --version` doğrula**

```bash
npx wrangler --version
```

Beklenen: `3.x.y` benzeri sürüm satırı.

- [ ] **Step 5: Commit yok** — sonraki task'larla beraber atılacak.

---

## Task 2: tsconfig, wrangler.toml, .gitignore

**Files:**
- Create: `backend/tsconfig.json`
- Create: `backend/wrangler.toml`
- Create: `backend/.gitignore`

- [ ] **Step 1: `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: `backend/wrangler.toml`**

```toml
name = "portfoy-api"
main = "src/index.ts"
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ALLOWED_ORIGIN = "https://tufance.github.io"
```

- [ ] **Step 3: `backend/.gitignore`**

```
node_modules/
.wrangler/
.dev.vars
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx tsc --noEmit
```

Beklenen: hata yok (henüz `src/` boş olduğu için warning yok).

- [ ] **Step 5: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/wrangler.toml backend/.gitignore
git commit -m "backend: scaffold worker project (wrangler + ts + npm)"
```

---

## Task 3: Tipler

**Files:**
- Create: `backend/src/types.ts`

- [ ] **Step 1: `backend/src/types.ts` yaz**

```typescript
export interface Rates {
  usdtry: number;
  eurtry: number;
  gramAltin: number;
  btcTRY: number;
  ethTRY: number;
  bist100: number;
}

export interface PriceEntry {
  price: number;
  currency: "TRY" | "USD" | "EUR" | "GBP";
  source: "yahoo" | "tefas";
  tryEquiv?: number;
}

export interface PricesResponse {
  updatedAt: string;
  rates: Rates | null;
  prices: Record<string, PriceEntry>;
  errors: Record<string, string>;
}

export interface YahooQuote {
  price: number;
  currency: "TRY" | "USD" | "EUR" | "GBP";
}

export interface Env {
  ALLOWED_ORIGIN: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx tsc --noEmit
```

Beklenen: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/types.ts
git commit -m "backend: add shared types"
```

---

## Task 4: vitest config + msw setup

**Files:**
- Create: `backend/vitest.config.ts`
- Create: `backend/test/setup.ts`

- [ ] **Step 1: `backend/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 2: `backend/test/setup.ts`**

```typescript
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 3: Boş test çalıştır**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run
```

Beklenen: "No test files found, exiting with code 0" benzeri ya da sıfır test pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/vitest.config.ts backend/test/setup.ts
git commit -m "backend: vitest + msw setup"
```

---

## Task 5: yahoo.ts — başarılı yanıt testi (failing)

**Files:**
- Test: `backend/test/yahoo.test.ts`

- [ ] **Step 1: `backend/test/yahoo.test.ts` yaz**

```typescript
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { fetchYahooQuote } from "../src/yahoo";

describe("fetchYahooQuote", () => {
  it("returns price and currency for a valid Yahoo symbol", async () => {
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS", () =>
        HttpResponse.json({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 332.0,
                  currency: "TRY",
                },
              },
            ],
            error: null,
          },
        })
      )
    );

    const quote = await fetchYahooQuote("THYAO.IS");
    expect(quote).toEqual({ price: 332.0, currency: "TRY" });
  });
});
```

- [ ] **Step 2: Test'i çalıştır, FAIL beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/yahoo.test.ts
```

Beklenen: FAIL — `Cannot find module '../src/yahoo'`.

---

## Task 6: yahoo.ts — minimal implementasyon (passing)

**Files:**
- Create: `backend/src/yahoo.ts`

- [ ] **Step 1: `backend/src/yahoo.ts` yaz**

```typescript
import type { YahooQuote } from "./types";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: { "user-agent": "portfoy-api/1.0" },
  });
  if (!res.ok) throw new Error(`yahoo_http_${res.status}`);
  const data = (await res.json()) as {
    chart: { result: Array<{ meta: { regularMarketPrice: number; currency: string } }> | null; error: unknown };
  };
  if (!data.chart.result?.[0]) throw new Error("symbol_not_found");
  const meta = data.chart.result[0].meta;
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency as YahooQuote["currency"],
  };
}
```

- [ ] **Step 2: Test'i çalıştır, PASS beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/yahoo.test.ts
```

Beklenen: 1 passing.

- [ ] **Step 3: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/yahoo.ts backend/test/yahoo.test.ts
git commit -m "backend(yahoo): fetchYahooQuote happy path"
```

---

## Task 7: yahoo.ts — bilinmeyen sembol (error case)

**Files:**
- Modify: `backend/test/yahoo.test.ts`

- [ ] **Step 1: Test ekle**

`backend/test/yahoo.test.ts` dosyasının sonuna ekle:

```typescript
it("throws symbol_not_found when Yahoo returns empty result", async () => {
  server.use(
    http.get("https://query1.finance.yahoo.com/v8/finance/chart/XYZ.IS", () =>
      HttpResponse.json({ chart: { result: null, error: { code: "Not Found" } } })
    )
  );
  await expect(fetchYahooQuote("XYZ.IS")).rejects.toThrow("symbol_not_found");
});

it("throws yahoo_http_429 when rate-limited", async () => {
  server.use(
    http.get("https://query1.finance.yahoo.com/v8/finance/chart/RATE.IS", () =>
      HttpResponse.json({}, { status: 429 })
    )
  );
  await expect(fetchYahooQuote("RATE.IS")).rejects.toThrow("yahoo_http_429");
});
```

- [ ] **Step 2: Çalıştır, PASS beklenir** (mevcut kod bu durumları zaten karşılıyor)

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/yahoo.test.ts
```

Beklenen: 3 passing.

- [ ] **Step 3: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/test/yahoo.test.ts
git commit -m "backend(yahoo): cover not-found and rate-limit cases"
```

---

## Task 8: tefas.ts — tests + implementation

**Files:**
- Create: `backend/test/tefas.test.ts`
- Create: `backend/src/tefas.ts`

- [ ] **Step 1: Test yaz**

`backend/test/tefas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { fetchTefasFund } from "../src/tefas";

describe("fetchTefasFund", () => {
  it("returns latest FIYAT for a fund", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/DB/BindHistoryInfo", () =>
        HttpResponse.json({
          data: [
            { TARIH: "23.06.2026", FIYAT: 3.04 },
            { TARIH: "24.06.2026", FIYAT: 3.05 },
          ],
        })
      )
    );
    const price = await fetchTefasFund("AFA");
    expect(price).toBe(3.05);
  });

  it("throws fund_not_found when data is empty", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/DB/BindHistoryInfo", () =>
        HttpResponse.json({ data: [] })
      )
    );
    await expect(fetchTefasFund("XXX")).rejects.toThrow("fund_not_found");
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/tefas.test.ts
```

Beklenen: FAIL — modül yok.

- [ ] **Step 3: `backend/src/tefas.ts` yaz**

```typescript
const TEFAS_URL = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo";

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export async function fetchTefasFund(code: string): Promise<number> {
  const today = new Date();
  const fortnightAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const body = new URLSearchParams({
    fontip: "YAT",
    sfontur: "",
    fonkod: code,
    fongrup: "",
    bastarih: fmtDate(fortnightAgo),
    bittarih: fmtDate(today),
    fonturkod: "",
    fonunvantip: "",
  });
  const res = await fetch(TEFAS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "portfoy-api/1.0",
    },
    body,
  });
  if (!res.ok) throw new Error(`tefas_http_${res.status}`);
  const data = (await res.json()) as { data: Array<{ TARIH: string; FIYAT: number }> };
  if (!data.data?.length) throw new Error("fund_not_found");
  return data.data[data.data.length - 1].FIYAT;
}
```

- [ ] **Step 4: Çalıştır, PASS beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/tefas.test.ts
```

Beklenen: 2 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/tefas.ts backend/test/tefas.test.ts
git commit -m "backend(tefas): fetchTefasFund with happy + not-found cases"
```

---

## Task 9: rates.ts — 6 oranı topla

**Files:**
- Create: `backend/test/rates.test.ts`
- Create: `backend/src/rates.ts`

- [ ] **Step 1: Test yaz**

`backend/test/rates.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildRates } from "../src/rates";
import type { YahooQuote } from "../src/types";

describe("buildRates", () => {
  it("assembles all six rates from the right Yahoo symbols", async () => {
    const yahoo = vi.fn(async (symbol: string): Promise<YahooQuote> => {
      const map: Record<string, YahooQuote> = {
        "TRY=X":    { price: 46.46,    currency: "TRY" },
        "EURTRY=X": { price: 52.95,    currency: "TRY" },
        "GC=F":     { price: 4127.5,   currency: "USD" }, // USD/ons
        "BTC-USD":  { price: 64000,    currency: "USD" },
        "ETH-USD":  { price: 1745,     currency: "USD" },
        "XU100.IS": { price: 14620,    currency: "TRY" },
      };
      const q = map[symbol];
      if (!q) throw new Error("symbol_not_found");
      return q;
    });

    const rates = await buildRates(yahoo);

    expect(rates.usdtry).toBe(46.46);
    expect(rates.eurtry).toBe(52.95);
    expect(rates.bist100).toBe(14620);
    expect(rates.gramAltin).toBeCloseTo((4127.5 / 31.1035) * 46.46, 2);
    expect(rates.btcTRY).toBe(64000 * 46.46);
    expect(rates.ethTRY).toBe(1745 * 46.46);

    expect(yahoo).toHaveBeenCalledTimes(6);
  });

  it("propagates failure if usdtry fails (rates unusable without it)", async () => {
    const yahoo = vi.fn(async (sym: string): Promise<YahooQuote> => {
      if (sym === "TRY=X") throw new Error("yahoo_http_503");
      return { price: 100, currency: "USD" };
    });
    await expect(buildRates(yahoo)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/rates.test.ts
```

Beklenen: FAIL — modül yok.

- [ ] **Step 3: `backend/src/rates.ts` yaz**

```typescript
import type { Rates, YahooQuote } from "./types";

export type YahooFetcher = (symbol: string) => Promise<YahooQuote>;

const OUNCE_TO_GRAM = 31.1035;

export async function buildRates(fetchQuote: YahooFetcher): Promise<Rates> {
  const symbols = ["TRY=X", "EURTRY=X", "GC=F", "BTC-USD", "ETH-USD", "XU100.IS"] as const;
  const [usd, eur, goldOz, btc, eth, bist] = await Promise.all(symbols.map((s) => fetchQuote(s)));

  return {
    usdtry: usd.price,
    eurtry: eur.price,
    gramAltin: (goldOz.price / OUNCE_TO_GRAM) * usd.price,
    btcTRY: btc.price * usd.price,
    ethTRY: eth.price * usd.price,
    bist100: bist.price,
  };
}
```

- [ ] **Step 4: Çalıştır, PASS beklenir**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/rates.test.ts
```

Beklenen: 2 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/rates.ts backend/test/rates.test.ts
git commit -m "backend(rates): assemble 6 rates from Yahoo symbols"
```

---

## Task 10: index.ts — Worker entry + CORS

**Files:**
- Create: `backend/src/index.ts`

- [ ] **Step 1: `backend/src/index.ts` yaz**

```typescript
import { fetchYahooQuote } from "./yahoo";
import { fetchTefasFund } from "./tefas";
import { buildRates } from "./rates";
import type { Env, PriceEntry, PricesResponse, Rates } from "./types";

function corsHeaders(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

const SYMBOL_RE = /^[A-Z0-9.\-=]+$/;

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && SYMBOL_RE.test(s));
}

async function handlePrices(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const yahooSymbols = parseSymbols(url.searchParams.get("yahoo"));
  const tefasFunds = parseSymbols(url.searchParams.get("tefas"));

  const errors: Record<string, string> = {};
  let rates: Rates | null = null;
  try {
    rates = await buildRates(fetchYahooQuote);
  } catch (e) {
    errors._rates = (e as Error).message || "upstream_error";
  }

  const yahooResults = await Promise.allSettled(
    yahooSymbols.map((sym) => fetchYahooQuote(sym).then((q) => [sym, q] as const))
  );
  const tefasResults = await Promise.allSettled(
    tefasFunds.map((code) => fetchTefasFund(code).then((p) => [code, p] as const))
  );

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

  const body: PricesResponse = {
    updatedAt: new Date().toISOString(),
    rates,
    prices,
    errors,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      ...corsHeaders(env),
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/prices") {
      return new Response("not_found", { status: 404, headers: corsHeaders(env) });
    }
    if (request.method !== "GET") {
      return new Response("method_not_allowed", { status: 405, headers: corsHeaders(env) });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    let response = await cache.match(cacheKey);
    if (response) return response;

    response = await handlePrices(request, env);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx tsc --noEmit
```

Beklenen: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/index.ts
git commit -m "backend(worker): /prices entry with cors + cache"
```

---

## Task 11: Lokal Worker dev — gerçek Yahoo'ya canlı istek

**Files:** (yok — sadece doğrulama)

- [ ] **Step 1: Worker'ı lokalde başlat (background)**

Terminal 1:
```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx wrangler dev --port 8787
```

Beklenen: `Ready on http://localhost:8787`.

- [ ] **Step 2: Rates-only istek**

Terminal 2:
```bash
curl -s 'http://localhost:8787/prices' | python3 -m json.tool
```

Beklenen JSON şekli (değerler gerçek piyasaya göre değişir):
```json
{
  "updatedAt": "2026-06-24T...",
  "rates": { "usdtry": 4x.xx, "eurtry": 5x.xx, "gramAltin": ..., "btcTRY": ..., "ethTRY": ..., "bist100": ... },
  "prices": {},
  "errors": {}
}
```

Eğer `rates` null + `errors._rates` doluysa: Yahoo Cloudflare edge'den 403/429 dönüyor demektir → Task 11a'ya geç.

- [ ] **Step 3: Tek hisse**

```bash
curl -s 'http://localhost:8787/prices?yahoo=THYAO.IS' | python3 -m json.tool
```

Beklenen: `prices["THYAO.IS"]` doludur.

- [ ] **Step 4: Fon (TEFAS) testi**

```bash
curl -s 'http://localhost:8787/prices?tefas=AFA' | python3 -m json.tool
```

Beklenen: `prices.AFA.price` bir sayı. Eğer `errors.AFA` varsa Task 11b'ye geç.

- [ ] **Step 5: CORS preflight testi**

```bash
curl -s -i -X OPTIONS 'http://localhost:8787/prices' \
  -H 'Origin: https://tufance.github.io' \
  -H 'Access-Control-Request-Method: GET'
```

Beklenen header'lar:
```
HTTP/1.1 204
access-control-allow-origin: https://tufance.github.io
access-control-allow-methods: GET, OPTIONS
```

- [ ] **Step 6: Cache testi**

```bash
time curl -s 'http://localhost:8787/prices?yahoo=THYAO.IS' > /dev/null
time curl -s 'http://localhost:8787/prices?yahoo=THYAO.IS' > /dev/null
```

Beklenen: ikinci çağrı belirgin şekilde hızlı (CF Cache hit; wrangler dev'de yine de sembolik).

- [ ] **Step 7: Worker'ı durdur** — Terminal 1'de `Ctrl+C`.

---

## Task 11a (koşullu): Yahoo 403/429 düzeltmesi

Sadece Task 11.Step 2'de `rates: null` + `errors._rates: yahoo_http_4xx` görünürse uygula.

**Files:**
- Modify: `backend/src/yahoo.ts`

- [ ] **Step 1: User-agent'ı tarayıcı-benzeri yap**

`backend/src/yahoo.ts` içinde `headers:` satırını şununla değiştir:

```typescript
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      accept: "application/json,text/plain,*/*",
    },
```

- [ ] **Step 2: Test'leri çalıştır** — kullanıcı-agent değişikliği davranışı bozmamalı.

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 3: `wrangler dev`'i tekrar dene** — Task 11.Step 2.

- [ ] **Step 4: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/yahoo.ts
git commit -m "backend(yahoo): browser-like UA to dodge CF edge block"
```

---

## Task 11b (koşullu): TEFAS endpoint düzeltmesi

Sadece Task 11.Step 4'te `errors.AFA` görünürse uygula.

**Files:**
- Modify: `backend/src/tefas.ts`

- [ ] **Step 1: Olası nedenler:**
  - TEFAS, JSON yerine HTML döndürür (referer header'ı gerektiriyor) → header ekle.
  - Workers'tan IP bloklu → fallback olarak `BindComparisonFundReturns` dene.

- [ ] **Step 2: Referer header ekle**

`backend/src/tefas.ts` içinde `headers:` bloğuna ekle:

```typescript
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
      referer: "https://www.tefas.gov.tr/FonAnaliz.aspx",
      accept: "application/json,text/plain,*/*",
    },
```

- [ ] **Step 3: Test'leri çalıştır**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 4: `wrangler dev`'i tekrar dene** — Task 11.Step 4.

- [ ] **Step 5: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add backend/src/tefas.ts
git commit -m "backend(tefas): browser-like headers + referer"
```

---

## Task 12: Cloudflare deploy

**Files:** (yok — kullanıcı etkileşimi)

- [ ] **Step 1: Wrangler ile login (kullanıcı tek seferlik)**

Kullanıcı için: yeni terminalde

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx wrangler login
```

Tarayıcı açılır → "Allow" tıkla → CLI'a "Successfully logged in" der.

- [ ] **Step 2: Deploy**

```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx wrangler deploy
```

Beklenen çıktı içinde: `Published portfoy-api ... https://portfoy-api.<account>.workers.dev`.

- [ ] **Step 3: Canlı URL'yi doğrula**

```bash
curl -s 'https://portfoy-api.<account>.workers.dev/prices' | python3 -m json.tool | head -30
```

Beklenen: rates dolu JSON yanıt.

URL'yi sonraki task'ta kullanacaksın; not al.

---

## Task 13: Frontend — `index.html` autoRefreshPrices

**Files:**
- Modify: `index.html`

Bu task'ı uygulamadan önce mevcut `index.html`'i incele: `RATES` global'i ve `HOLDINGS` global'i nerede tanımlı? `Güncelle` modal handler nerede? Yeni kod, mevcut akışı bozmadan eklenmeli.

- [ ] **Step 1: API URL sabiti ekle**

`index.html`'de `<script>` bloğunun başında, mevcut store/helper tanımlarından önce, küçük bir blok ekle:

```javascript
const PORTFOY_API_URL = "https://portfoy-api.<account>.workers.dev/prices";
```

`<account>` yerini Task 12.Step 2 çıktısındaki gerçek subdomain ile değiştir.

- [ ] **Step 2: `autoRefreshPrices` fonksiyonunu ekle**

`<script>` bloğunun sonuna, init satırlarından **önce** ekle:

```javascript
function ___buildSymbolKey(h){
  if (h.type === "fon") return h.code;
  if ((h.type === "hisse" || h.type === "etf") && h.region === "yurtici") return h.code + ".IS";
  return h.code;
}

async function autoRefreshPrices(){
  const yahoo = [], tefas = [];
  for (const h of HOLDINGS){
    if (!h.code) continue;
    if (h.type === "fon") tefas.push(h.code);
    else yahoo.push(___buildSymbolKey(h));
  }
  const qs = new URLSearchParams();
  if (yahoo.length) qs.set("yahoo", yahoo.join(","));
  if (tefas.length) qs.set("tefas", tefas.join(","));
  const url = `${PORTFOY_API_URL}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("api_down");
  const data = await res.json();

  if (data.rates){
    Object.assign(RATES, data.rates);
    save("pf_rates", RATES);
  }
  for (const h of HOLDINGS){
    const k = ___buildSymbolKey(h);
    const p = data.prices?.[k];
    if (p) h.price = p.tryEquiv ?? p.price;
  }
  save("pf_holdings", HOLDINGS);
  STATE.lastUpdate = data.updatedAt;
  save("pf_state", STATE);
  if (typeof pushSnapshot === "function") pushSnapshot();
  if (typeof render === "function") render();
  return data;
}
```

Not: `save`, `RATES`, `HOLDINGS`, `STATE`, `pushSnapshot`, `render` mevcut `index.html`'de tanımlı olmalı. Eğer farklı isimlerle çağrılıyorlarsa eşleştir.

- [ ] **Step 3: Sayfa init'inde otomatik çağrı**

`<script>` bloğunda mevcut "uygulama başlat" çağrısının hemen sonrasına ekle (genelde `render()` ya da bir `boot()` fonksiyonu vardır):

```javascript
autoRefreshPrices().catch((e) => {
  console.warn("autoRefresh failed, falling back to manual:", e.message);
});
```

- [ ] **Step 4: `node --check` ile JS'i doğrula**

```bash
cd /Users/tufancetiner/tufance.github.io
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const scripts=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);require('fs').writeFileSync('/tmp/check.js',scripts.join('\\n;\\n'));" \
  && node --check /tmp/check.js \
  && echo OK
```

Beklenen: `OK`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tufancetiner/tufance.github.io
git add index.html
git commit -m "frontend: auto-refresh prices on load via worker api"
```

---

## Task 14: Push + canlı doğrulama

**Files:** (yok)

- [ ] **Step 1: Push**

```bash
cd /Users/tufancetiner/tufance.github.io
git push origin main
```

Beklenen: tüm commit'ler `main`'e iter.

- [ ] **Step 2: GitHub Pages build'i bekle (~30sn)**

```bash
sleep 45 && curl -sI https://tufance.github.io/ | head -5
```

Beklenen: `HTTP/2 200`.

- [ ] **Step 3: Tarayıcı / curl ile JS dosyasında `PORTFOY_API_URL` var mı?**

```bash
curl -s https://tufance.github.io/ | grep -c "PORTFOY_API_URL"
```

Beklenen: `>= 1`.

- [ ] **Step 4: Worker URL'sini browser'dan çağırarak CORS test et**

Bunu kullanıcı manuel yapar:
1. `https://tufance.github.io/` aç → DevTools → Console.
2. Network sekmesinde `prices?…` isteğini bul.
3. Yanıt 200 + JSON olmalı, kurlar otomatik güncellenmiş olmalı.

Eğer CORS hatası: `wrangler.toml`'da `ALLOWED_ORIGIN` doğru mu? Worker yeniden deploy gerekebilir.

- [ ] **Step 5: Final commit (gerekirse, yok)**

Tüm değişiklikler push edilmiş olmalı. Pages site canlı, API çağrısı çalışıyor.

---

## Doğrulama Özeti

Plan başarıyla tamamlandığında:

- `backend/` dizini mevcut, tüm testler geçer (`npm test`)
- Cloudflare Workers'ta `portfoy-api` deploy edilmiş, canlı
- `https://tufance.github.io/` açıldığında otomatik olarak Worker'a istek atar, kurlar + sembol fiyatları güncellenir
- API kapalıyken pano manuel "Güncelle" akışıyla çalışmaya devam eder (regresyon yok)
- Tüm değişiklikler `tufance/tufance.github.io` repo'sunda commit edilmiş ve push edilmiş

## Plan Self-Review (yazar notu)

- ✅ Spec kapsamı: API kontratı (Task 6-10), cache (Task 10), CORS (Task 10/11), hata yönetimi (Task 7/8/10), proje yapısı (Task 1-2), frontend entegrasyonu (Task 13), test stratejisi (Task 4-9), deploy (Task 12).
- ✅ Placeholder taraması: yok. URL `<account>` placeholder'ı Task 12 sonrası elle değiştirilecek (engineer-actionable).
- ✅ Tip tutarlılığı: `YahooQuote`, `Rates`, `PriceEntry`, `PricesResponse`, `Env` Task 3'te tanımlı, Task 6/9/10'da aynı isimlerle kullanılıyor.
- ⚠️ Spec'ten **kapsam dışı bırakılan UI parçaları:**
  - Header'da "Son güncelleme: HH:MM (canlı)" yeşil/kırmızı nokta indicator
  - Güncelle modal'ına "Otomatik (canlı)" sekmesi
  - Gerekçe: v1 için otomatik fetch sayfa yüklenmesinde zaten çalışıyor (kullanıcı yüklenmiş fiyatları görür) ve fail durumunda mevcut manuel akış sessiz fallback ile korunuyor. UI polish'i v1.1 follow-up'ı.
- ⚠️ Açık nokta: TEFAS'ın Cloudflare Workers IP'lerinden erişilebilir olup olmadığı kanıtlanmadı; Task 11b koşullu olarak fix sağlıyor. Çalışmazsa fallback: pano fon fiyatlarını manuel girişe bırakır, Yahoo kısmı çalışır.
