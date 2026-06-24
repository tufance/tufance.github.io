# Spec: Portföy Canlı Fiyat Backend'i

**Tarih:** 2026-06-24
**Status:** Draft → User review
**İlgili faz:** CLAUDE_CODE_BRIEF Faz 2 (n8n yerine custom backend)

## Hedef

Pano (`tufance.github.io`) açıldığında veya yenilendiğinde, Yahoo Finance + TEFAS'tan canlı fiyatları çekip kurları ve holding fiyatlarını otomatik dolduran bir backend servisi. Manuel "Güncelle" akışı dokunulmadan kalır — backend erişilemezse pano sessizce mevcut manuel davranışa düşer.

## Karar Özeti

| Karar | Seçim | Gerekçe |
|---|---|---|
| Çalışma modeli | **On-demand API**, sayfa yüklenmesinde fetch | Cron yok, her zaman taze (cache kapsamında) |
| Stack | **Node.js + TypeScript** | Insider'da kullanılıyor; deploy hazır ekosistem |
| Host | **Cloudflare Workers** | Edge, ücretsiz 100k req/gün, built-in Cache API |
| Cache | **60 sn edge cache** (CF Cache API) | Rate-limit koruması; pratik "canlı" hissi |
| Auth | **CORS-restricted** (`https://tufance.github.io`) | Token yok, frontend'de saklanacak değer yok |
| Repo yapısı | **Monorepo**: `tufance.github.io/backend/` | Tek doğru kaynak; Pages root'tan `index.html` sunmaya devam |

## Mimari

```
[Pano (tufance.github.io)] ──GET /prices?yahoo=…&tefas=…──▶ [Cloudflare Worker]
                                                                    │
                                                  ┌─────────────────┼───────────────┐
                                                  ▼                 ▼               ▼
                                          [CF Cache (60s)]   [Yahoo Finance]    [TEFAS]
                                                              GET chart API    POST BindHistoryInfo
```

## API Kontratı

### `GET /prices`

**Query string:**
- `yahoo` (opsiyonel): virgülle ayrılmış Yahoo sembolleri. Örnek: `THYAO.IS,AAPL,CSPX.L`
- `tefas` (opsiyonel): virgülle ayrılmış TEFAS fon kodları. Örnek: `AFA,DPN`

Boş query gelirse sadece `rates` döner; 400 dönmez.

**Yanıt (200 OK):**
```json
{
  "updatedAt": "2026-06-24T15:01:23.456Z",
  "rates": {
    "usdtry": 46.46,
    "eurtry": 52.95,
    "gramAltin": 6167,
    "btcTRY": 2973440,
    "ethTRY": 81073,
    "bist100": 14620
  },
  "prices": {
    "THYAO.IS": { "price": 332.0,  "currency": "TRY", "source": "yahoo" },
    "AAPL":     { "price": 168.7,  "currency": "USD", "tryEquiv": 7842.5, "source": "yahoo" },
    "AFA":      { "price": 3.05,   "currency": "TRY", "source": "tefas" }
  },
  "errors": {
    "XYZ.IS": "symbol_not_found"
  }
}
```

**Rates kaynakları (sabit, query-bağımsız):**

| Çıktı alanı | Yahoo sembolü | Dönüşüm |
|---|---|---|
| `usdtry` | `TRY=X` | doğrudan |
| `eurtry` | `EURTRY=X` | doğrudan |
| `gramAltin` | `GC=F` + `TRY=X` | `goldOzUSD / 31.1035 × usdtry` |
| `btcTRY` | `BTC-USD` + `TRY=X` | `btcUsd × usdtry` |
| `ethTRY` | `ETH-USD` + `TRY=X` | `ethUsd × usdtry` |
| `bist100` | `XU100.IS` | doğrudan |

**`tryEquiv`:** Yabancı para hisse/ETF için backend, ilgili kur ile TL karşılığını hesaplayıp döner. Pano `tryEquiv ?? price`'i kullanır.

## Cache

- CF Cache API, key = tam istek URL'si (query dahil).
- Yanıt header'larına `Cache-Control: public, max-age=60` eklenir; CF otomatik depolar.
- Cache miss'te: `Promise.allSettled` ile tüm Yahoo + TEFAS istekleri paralel.
- `updatedAt` cache'lenen yanıttan döner — pano "x sn önce" gösterimi için kullanır.

KV/Durable Objects gerek yok — Cache API yeterli.

## CORS

```http
Access-Control-Allow-Origin: https://tufance.github.io
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

Lokal `wrangler dev` modunda env var ile `*` döner.

`OPTIONS` preflight: 204 + header'lar.

## Hata Yönetimi

| Senaryo | Davranış |
|---|---|
| Tek sembol Yahoo 404 | `errors[sym]: "symbol_not_found"`, diğerleri döner |
| Yahoo tümü timeout | `rates: null`, `errors._rates: "upstream_error"`, kullanıcı semboller dönmeye devam edebilir |
| TEFAS POST timeout | `errors[fund]: "tefas_timeout"`, hisseler etkilenmez |
| Geçersiz query (örn. ham `<script>`) | URL-encode tabanlı temel sanitizasyon; backend yalnız `^[A-Z0-9.\-=]+$` regex'ine uyan sembolleri kabul eder; geçersizler atlanır, `errors[sym]: "invalid_symbol"`. |
| Worker timeout (10s) | İlk 9s'de kısmi yanıt; aşılırsa 504 |
| Frontend tarafında `fetch` hatası | Sessiz fallback: mevcut manuel "Güncelle" akışı kalır, header'da kırmızı "API ulaşılamıyor" gösterilir |

## Proje Yapısı

```
tufance.github.io/                         (Pages repo, mevcut)
├── index.html                             [diff: ~30 satır fetch entegrasyonu]
├── README.md                              [yeni]
├── CLAUDE_CODE_BRIEF.md                   [yeni — Financial-tracking'ten taşınır]
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-24-prices-backend-design.md   [BU DOSYA]
└── backend/                               [YENİ]
    ├── package.json
    ├── tsconfig.json
    ├── wrangler.toml                      # CF Workers config
    ├── .gitignore                         # node_modules, .dev.vars, .wrangler
    ├── src/
    │   ├── index.ts                       # entry: routing, CORS, cache
    │   ├── yahoo.ts                       # fetchYahooQuote(symbol)
    │   ├── tefas.ts                       # fetchTefasFund(code)
    │   ├── rates.ts                       # buildRates(yahooClient)
    │   └── types.ts
    └── test/
        ├── yahoo.test.ts                  # vitest + mocked fetch
        ├── tefas.test.ts
        └── rates.test.ts
```

## Frontend Entegrasyonu (`index.html`)

Yeni JS bloğu — pano init'inde çağrılır:

```js
const API_URL = "https://portfoy-api.tufance.workers.dev/prices";

async function autoRefreshPrices(){
  const yahoo = [], tefas = [];
  for (const h of HOLDINGS){
    if (h.type === "fon") tefas.push(h.code);
    else if ((h.type === "hisse" || h.type === "etf") && h.region === "yurtici")
      yahoo.push(h.code + ".IS");
    else yahoo.push(h.code);
  }
  const url = `${API_URL}?yahoo=${yahoo.join(",")}&tefas=${tefas.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("api_down");
  const data = await res.json();
  RATES.usdtry = data.rates.usdtry; /* ... */
  HOLDINGS.forEach(h => {
    const key = h.type === "fon" ? h.code : (h.region === "yurtici" ? `${h.code}.IS` : h.code);
    const p = data.prices[key];
    if (p) h.price = p.tryEquiv ?? p.price;
  });
  pushSnapshot(); render();
  setApiStatus("ok", data.updatedAt);
}

// Pano init:
autoRefreshPrices().catch(() => setApiStatus("err"));
```

**Güncelle modalına yeni sekme:** "Otomatik (canlı)" — `autoRefreshPrices()` tetikler, sonucu özet halinde gösterir. Manuel sekme korunur.

**Header indicator:** "Son güncelleme: 14:32 (canlı)" yeşil/kırmızı nokta ile.

## Test Stratejisi

- **Unit (vitest + msw):** `yahoo.ts`, `tefas.ts`, `rates.ts` mocked HTTP yanıtlarıyla. Hedef: kritik dönüşümler (gram altın hesabı, USD→TRY) %100 cover.
- **Lokal E2E:** `wrangler dev` → curl ile gerçek Yahoo'ya canlı istek (TEFAS opsiyonel — bazen yavaş).
- **Manuel doğrulama:** deploy sonrası `curl 'https://…/prices?yahoo=THYAO.IS,AAPL&tefas=AFA'` → JSON şema kontrolü.
- **Frontend:** mevcut kuralı koru — `node --check` ile parse; tarayıcı testi opsiyonel (kullanıcı talebi).

## Deploy

```bash
cd backend
npm install
npx wrangler login          # kullanıcı tek seferlik
npx wrangler deploy         # → https://portfoy-api.tufance.workers.dev
```

`index.html`'deki `API_URL` deploy URL'siyle güncellenir, repo'ya push edilir, Pages otomatik yayına alır.

## Kapsam Dışı (YAGNI)

- Stale-while-revalidate
- Rate limiting (Worker tarafı)
- Token tabanlı auth
- Otomatik retry/circuit breaker
- TEFAS için `BindComparisonFundReturns` (önce `BindHistoryInfo` dener, çalışırsa yeterli)
- Diğer veri kaynakları (BIST'in resmi feed'i vs.)

## Riskler / Açık Sorular

1. **Yahoo Finance unofficial API:** `query1.finance.yahoo.com/v8/finance/chart/...` ücretsiz ve token istemiyor ama TOS gri alanda; oran sınırı belgesizdir. 60 sn cache + tek client (Worker) ile pratikte sorun beklemiyorum.
2. **TEFAS POST:** Endpoint Türkiye dışından (Cloudflare edge) erişimde bazen 403 verebilir. İlk denemeden sonra geçerse, çözüm: Worker'da `cf: { resolveOverride }` ile TR PoP zorlama veya alternatif TEFAS scraper. Test sırasında doğrulanacak.
3. **`tufance.github.io` repo'su user/personal site:** Pano `index.html` kök yolda yaşıyor. Backend `backend/` altında yer alır; Pages bu klasörü servis etmez (yalnız `*.html`/`*.css`/`*.js` kök), karışıklık olmaz.

## Onay

Bu spec onaylandıktan sonra **writing-plans** skill'ine geçilir; aşama aşama implementasyon planı çıkarılır.
