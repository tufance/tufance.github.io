# Portföy Panosu — Claude Code Devir Dosyası

Bu dosya, projeyi Claude Code'a taşımak için gereken **her şeyi** içerir: mevcut durum,
veri modeli, tasarım sistemi, canlı veri kaynakları, kalan işler ve sonda **yapıştır-çalıştır prompt**.

> Çalışan uygulama tek dosyadır: `index.html` (≈71 KB, harici bağımlılık yok; sadece CDN'den Chart.js + Google Fonts).
> Claude Code bu dosyayı **başlangıç noktası** olarak almalı, sıfırdan yazmamalı.

---

## 1. Proje özeti

Kişisel, çoklu varlık **portföy + birikim + finansal hedef** panosu. Tek dosyalık statik HTML
(vanilla JS + Chart.js). Türkçe arayüz. Veriler tarayıcıda saklanır. GitHub Pages'te yayınlanacak.
İleride n8n + TEFAS/Yahoo ile fiyatlar otomatik güncellenecek.

**Tasarım dili:** koyu/premium "fintech" — koyu mor-siyah zemin, turuncu vurgu, kârda yeşil / zararda kırmızı.

---

## 2. Teknik kurallar / kısıtlar

- **Tek dosya:** `index.html`. JS ve CSS inline. (FIFO/n8n aşamasında ek dosyalar eklenebilir: `prices.json`, `n8n-workflow.json`.)
- **Bağımlılıklar (CDN, HTTPS):**
  - Chart.js 4.4.1 — `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`
  - Google Fonts — `Space Grotesk` (başlıklar/sayılar), `Inter` (gövde)
- **Persistence (3 kademeli, mevcut `store` helper'ı):** önce `window.storage` (Claude artifact),
  sonra `localStorage` (kendi domaininde — GitHub Pages bunu kullanır), olmazsa bellek.
  GitHub Pages'te `localStorage` devreye girer; **bu davranışı bozma.**
- **CORS gerçeği:** Tarayıcıdan TEFAS/Yahoo'ya doğrudan istek **engellenir**. Canlı fiyat için
  sunucu tarafı (n8n) gerekir; n8n sonucu repo'ya `prices.json` olarak yazar, pano onu **same-origin** okur.
- **Para birimi modeli:** Her varlığın `unitCost` ve `price` değeri **TL/birim** cinsinden saklanır.
  Görüntüleme para birimi (TRY/USD/EUR/gram altın/BTC/ETH) toplam TL'yi ilgili kurun TL karşılığına böler.
  - USD holding fiyatı = USD/TRY kuru; EUR = EUR/TRY; altın = gram altın TL; BTC = BTC×USD/TRY; ETH = ETH×USD/TRY.
  - "Güncelle"de döviz/altın/kripto holding fiyatları kurla otomatik senkronlanır.

---

## 3. Tamamlanan özellikler (4 sekme)

**Genel Bakış**
- Hero: toplam portföy + **6 para birimi** geçişi (TRY/USD/EUR/gram altın/BTC/ETH), toplam K/Z, günlük değişim, nakit satırı, tasarruf şeridi (bu ay / hedef + en yakın hedef ilerlemesi).
- Getiri şeridi: 1G / 1H / 1A / 3A / 6A / 1Y / Başlangıç (1G = günlük; Başlangıç = maliyete göre; diğerleri snapshot biriktikçe dolar).
- Varlık dağılımı (donut) + Performans (çizgi; portföy vs gram altın/dolar/BIST, başlangıç=100).
- **Alternatiflerle karşılaştırma:** her alımın **kendi tarihindeki** benchmark seviyesine göre money-weighted getiri (aşağıda).
- Gruplu holding tabloları: tür + **yurt içi/yurt dışı** ayrımı; satır başına Düzenle / Sat; koşullu yeşil-kırmızı.
- Nakit grubu + satış defteri (realize K/Z).
- Yatırım ekle/düzenle, Sat→nakit (TL), Güncelle (kur+fiyat) modalları.

**Tasarruf**
- gccy geçişi (USD/TRY/EUR). Metrikler: bu ay, son 12 ay ort., toplam sermaye, ortalama aylık.
- Aylık hedef + dairesel başarı oranı.
- **Büyüme ayrıştırması:** yatırdığın para vs piyasa getirisi vs toplam (yığın çubuk).
- Aylık katkı bar grafiği (hedef çizgili) + kümülatif sermaye eğrisi.
- Katkı tablosu: ekle/düzenle/sil, geçmiş aya (geriye dönük) giriş.

**Hedefler**
- Varsayımlar: aylık katkı (son 12 ay ort., elle değişebilir) + yıllık net getiri %.
- Hedef kartları: ilerleme çubuğu, mevcut/kalan, kalan süre, **tahmini ulaşma tarihi**, otomatik analiz cümlesi.
- Senaryolar (USD'de $2k/$3k/$4k; TRY'de 60k/90k/120k) → en yakın hedefe süre.
- Kilometre taşları: $100k / $250k / $500k / $1M (ulaşılan tarih saklanır).

**Projeksiyon**
- Bileşik faiz simülatörü: mevcut değer + aylık yatırım + yıllık getiri % + süre (yıl).
- Özet kartları + büyüme eğrisi (toplam değer vs yatırılan anapara) + yıllık döküm tablosu.

---

## 4. Veri modeli (persistence anahtarları → yapı)

```
pf_holdings  HOLDINGS  [{id, type, region, code, name, qty, unitCost, price|null, dayPct, buyDate, bmAtCost:{gold,usd,bist}}]
                       type: fon|hisse|etf|doviz|altin|kripto
                       region: yurtici|yurtdisi|null   (sadece fon/hisse/etf)
                       price/unitCost: TL/birim;  price=null => "fiyat bekleniyor"
                       bmAtCost: alım tarihindeki gram altın TL, USD/TRY, BIST100 seviyeleri
pf_rates     RATES     {usdtry, eurtry, gramAltin, btcTRY, ethTRY, bist100}
pf_snaps     SNAPS     [{date, idx:{port,gold,usd,bist}}]   // base 100 = inception; her Güncelle'de bugünün noktası eklenir
pf_cash      CASH      number (TL)
pf_sales     SALES     [{date, code, name, qty, price, proceeds, pnl}]
pf_contrib   CONTRIB   [{id, ym:"YYYY-MM", amount, ccy, note}]
pf_savtarget SAV_TARGET {amount, ccy}
pf_goals     GOALS     [{id, name, amount, ccy, date}]
pf_miles     MILE_DATES {threshold(USD): "YYYY-MM-DD"}
pf_proj      PROJ      {value|null, monthly|null, annual, years}
pf_state     state     {ccy, gccy, benchmarks:{gold,usd,bist}, lastUpdate, tab, asMonthly|null, asAnnual}
```

**Money-weighted karşılaştırma (doğru çalışan mantık):**
```
invested      = Σ qty*unitCost                         (yatırılan TL)
actual        = Σ qty*price                            (bugünkü TL)
altValue(B)   = Σ (qty*unitCost) * (B_now / bmAtCost[B])   // aynı parayı alım tarihinde B'ye koysaydın
getiri%(X)    = (X - invested) / invested * 100        // portföy ve her benchmark için
```

**Bileşik faiz (projeksiyon) algoritması — n8n/endpoint için saf fonksiyon:**
```js
function projectSeries(value, monthly, annualPct, years){
  const r = Math.pow(1 + annualPct/100, 1/12) - 1;     // aylık bileşik
  let v = value, contribTotal = 0; const rows = [{year:0, value, contribTotal:0, gain:0, yearContrib:0}];
  for (let y=1; y<=years; y++){ let yc=0;
    for (let m=0; m<12; m++){ v = v*(1+r) + monthly; yc += monthly; contribTotal += monthly; }
    rows.push({ year:y, yearContrib:yc, contribTotal, value:v, gain:v - value - contribTotal });
  }
  return rows;   // her satır: {year, yearContrib, contribTotal, value, gain}
}
```

---

## 5. Tasarım sistemi (CSS değişkenleri — değiştirme)

```
--bg:#0B0B14  --surface:#14141F  --surface2:#1A1A28  --border:#262633
--text:#EDEDF2  --muted:#8B8B9E  --faint:#5A5A6E
--accent:#FF7A1A (turuncu)  --violet:#7C5CFF  --gold:#E8B84B  --blue:#3BA0FF
--up:#34D399 (yeşil)  --down:#F87171 (kırmızı)
Fontlar: Space Grotesk (h1-3, .num), Inter (gövde). Sayılarda tabular-nums.
```

---

## 6. Canlı veriler (23 Haziran 2026 — başlangıç değerleri index.html'de gömülü)

```
USD/TRY 46.46   EUR/TRY 52.95   gram altın 6167 TL
BTC ~64.000 $ (₺2.973.440)   ETH ~1.745 $ (₺81.073)   BIST100 ~14.620
```
> Bunlar makro kurlar. Kullanıcının **gerçek hisse/fon/ETF holding'leri henüz girilmedi**;
> içindeki THYAO/AFA/Apple vb. örnektir. Kullanıcı gerçek listeyi verince her birinin canlı fiyatı + alım tarihindeki benchmark seviyeleri doldurulmalı.

---

## 7. Kalan işler (Claude Code yapacak)

### Faz 1 — Deploy (deterministik, hemen)
- Repo iskeleti: `index.html` (kök), `README.md`. `index.html` adı şart (Pages açılış sayfası).
- `gh` CLI ile (kullanıcı `gh auth login` yapmış olmalı):
  ```bash
  gh repo create portfoy --public --source=. --remote=origin --push
  gh api -X POST repos/{owner}/portfoy/pages -f source.branch=main -f source.path=/  # Pages'i aç
  ```
  Alternatif: web arayüzünden Settings → Pages → main / root.
- Yayın adresi: `https://<kullanıcı>.github.io/portfoy/`.

### Faz 2 — Canlı fiyat otomasyonu (n8n + TEFAS/Yahoo)
**Mimari (CORS'suz):** n8n cron (günlük, ~18:30 TR) → fiyatları çek → repo'ya `prices.json` yaz (GitHub API) →
pano açılışta/`Güncelle`de `./prices.json` okur (same-origin), `RATES` ve holding fiyatlarını doldurur, snapshot ekler.

**`prices.json` şeması:**
```json
{ "updatedAt": "2026-06-24T18:30:00+03:00",
  "rates": { "usdtry":46.46, "eurtry":52.95, "gramAltin":6167, "btcTRY":2973440, "ethTRY":81073, "bist100":14620 },
  "prices": { "THYAO":332.0, "ASELS":121.0, "AFA":3.05 } }
```

**Veri kaynakları (sunucu tarafı):**
- **Yahoo Finance** — `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=5d&interval=1d`
  → `chart.result[0].meta.regularMarketPrice`. Semboller:
  - BIST hisse/ETF: `THYAO.IS`, `ASELS.IS`, `ZPX30.IS` … (`.IS` eki)
  - Yabancı: US `AAPL`; Londra `CSPX.L`/`VUSA.L`
  - Kur: `TRY=X` (USD/TRY), `EURTRY=X`
  - Altın: `GC=F` (ons USD) → gram TL = `price/31.1035 * usdtry`
  - Kripto: `BTC-USD`, `ETH-USD`
  - Endeks: `XU100.IS`
- **TEFAS (fonlar)** — POST `https://www.tefas.gov.tr/api/DB/BindHistoryInfo`
  form-data `{ fontip:"YAT", fonkod:"AFA", bastarih:"...", bittarih:"..." }` → son kayıttaki `FIYAT`.
  (Endpoint/parametreleri Claude Code doğrulasın; gerekiyorsa `BindComparisonFundReturns` kullan.)
- **GitHub'a yazma:** PUT `https://api.github.com/repos/{owner}/{repo}/contents/prices.json`
  (base64 `content` + mevcut `sha` + commit mesajı). Token kullanıcının PAT'i — **kullanıcı sağlar, koda gömülmez.**

**Pano tarafı entegrasyon:** `Güncelle` butonuna "Otomatik (prices.json)" seçeneği ekle →
`fetch('./prices.json')` → `RATES` ve eşleşen holding `price`'larını doldur → snapshot'ı kaydet.
Manuel giriş seçeneği korunsun.

**Çıktı:** Claude Code, içe aktarılabilir bir `n8n-workflow.json` üretsin (Cron → HTTP (Yahoo/TEFAS) → Function (prices.json) → GitHub PUT).

### Faz 3 — FIFO transaction defteri (mimari refaktör)
Pozisyon-bazlı modeli, **işlem (transaction) bazlı** modele çevir:
```
TX = [{id, date, side:'buy'|'sell', type, region, code, name, qty, price, ccy, fxAtTx, fee}]
```
- Pozisyonlar TX'leri replay ederek hesaplanır; **satışta FIFO** lot eşleştirmesi (en eski alım önce), realize K/Z üretir.
- Maliyet TL bazında: yabancı para işlemlerde `fxAtTx` ile dönüştür.
- Mevcut `HOLDINGS` → TX migration'ı yaz (her holding = 1 buy TX, `fxAtTx` = bmAtCost.usd ya da o günün kuru).
- UI: işlem geçmişi görünümü; mevcut "Sat" akışı bir `sell` TX üretsin (CASH yerine/yanında).

### Faz 4 — Projeksiyon JSON endpoint'i
`projectSeries()` fonksiyonunu (Bölüm 4) bağımsız bir modül/endpoint olarak da sun (n8n Function node ya da küçük serverless),
girdi `{value, monthly, annualPct, years}` → çıktı yıllık seri JSON. Pano zaten bu fonksiyonu içeride kullanıyor.

---

## 8. Doğrulama / kalite
- `index.html` JS'i `node --check` ile parse edilebilir olmalı (script bloğunu çıkarıp kontrol et).
- Yerelde `python3 -m http.server` ile aç; 4 sekme, para birimi geçişi, ekle/düzenle/sat/güncelle, grafikler çalışmalı.
- Mevcut çalışan davranışı **bozma**; refaktörde geriye dönük migration sağla.
- Hiçbir şey yatırım tavsiyesi değildir notu kalsın.

## 9. Güvenlik
- GitHub PAT / n8n kimlik bilgileri **kullanıcıya aittir**, koda/commit'e gömülmez (env/n8n credential store).
- `prices.json` herkese açık olabilir (sadece fiyatlar); holding adetleri/maliyetleri commit edilmez (tarayıcıda kalır).

---

## 10. ⬇️ CLAUDE CODE'A YAPIŞTIRILACAK PROMPT

````
Bu klasördeki `index.html` çalışan bir kişisel portföy panosu (tek dosya, vanilla JS + Chart.js).
Tam bağlam `CLAUDE_CODE_BRIEF.md` dosyasında. Önce ikisini de oku, sonra şunları eksiksiz yap:

1) DEPLOY: index.html'i kök olacak şekilde repo'yu hazırla. README varsa koru. `gh` CLI ile
   public repo oluştur, push et ve GitHub Pages'i (main / root) aç. Yayın URL'sini bana bildir.
   `gh auth` yoksa bana söyle; kimlik bilgilerini sen isteme/saklama.

2) CANLI FİYAT (n8n + TEFAS/Yahoo): Brief Bölüm 7 Faz 2'ye göre:
   - Pano `Güncelle` akışına "Otomatik (prices.json)" seçeneği ekle: `./prices.json` oku,
     RATES + holding fiyatlarını doldur, snapshot kaydet. Manuel giriş korunarak.
   - `prices.json` şemasını (brief'teki) oluştur ve örnek bir dosya ekle.
   - İçe aktarılabilir `n8n-workflow.json` üret: Cron → Yahoo/TEFAS HTTP → prices.json derle →
     GitHub'a PUT (token n8n credential, koda gömme).

3) FIFO DEFTERİ: Pozisyon modelini brief Faz 3'teki transaction (TX) + FIFO modeline çevir,
   mevcut HOLDINGS'ten migration yaz, satışta FIFO realize K/Z üret, işlem geçmişi görünümü ekle.
   Mevcut UI ve hesapları bozma.

4) PROJEKSİYON ENDPOINT: brief Bölüm 4'teki projectSeries() fonksiyonunu bağımsız modül olarak da sun.

Kurallar: Tasarım sistemini (koyu tema, turuncu vurgu, yeşil/kırmızı) ve localStorage persistence'ı koru.
index.html'i sıfırdan yazma; üzerine inşa et. Her fazdan sonra `node --check` ile JS'i doğrula ve
yerelde test et. Kimlik bilgilerini koda gömme. Sonunda yayın URL'sini ve eklenen dosyaları özetle.
````

> Tek seferde hepsini istemezsen prompt'tan ilgili maddeyi silip ver; her faz bağımsız çalışır.
