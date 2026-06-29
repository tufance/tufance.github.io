# Spec: Modül 1 — İşlem Defteri + FIFO/Ağırlıklı Ortalama

**Tarih:** 2026-06-27
**Status:** Approved → ready for plan
**İlgili faz:** CLAUDE_CODE_BRIEF Faz 3 (kısaltılmış: sadece algoritma + veri modeli; İşlemler UI'ı Modül 2)

## Hedef

Pozisyon-bazlı modeli işlem-bazlı (TX) modele dönüştür. Tek `code+type+region` için birden fazla alım yapıldığında bunları otomatik birleştir, **FIFO** veya **Ağırlıklı Ortalama** maliyet yöntemini globalde seç. Pozisyonlar TX log'undan yeniden hesaplanır; toggle anlık.

## Karar Özeti

| Karar | Seçim | Gerekçe |
|---|---|---|
| Veri modeli | TX log; pozisyonlar derived | Tek doğru kaynak, geçmiş silinmez |
| Cost method UI | Header dropdown | Sürekli görünür, hızlı toggle |
| Migration | Otomatik (her holding → 1 BUY tx) | Mevcut veri kaybolmaz |
| Düzenleme | Çoklu-TX pozisyonlarda gizli (Modül 1) | TX edit UI'ı Modül 2 |
| Algoritma kaynağı | `backend/src/positions.ts` + frontend'e kopyala | Test edilebilir; v1 için DRY < hız |

## Veri Modeli

### `Transaction` tipi
```typescript
interface Transaction {
  id: string;
  date: string;                                  // ISO "YYYY-MM-DD"
  side: "buy" | "sell";
  type: "fon" | "hisse" | "etf" | "doviz" | "altin" | "kripto";
  region: "yurtici" | "yurtdisi" | null;
  code: string;                                   // THYAO, USD, AFA, …
  name: string;
  qty: number;
  price: number;                                  // birim fiyat (TL)
  fromCash?: boolean;                             // sadece buy'larda anlamlı
  bmAtCost?: { gold: number; usd: number; bist: number } | null;
}
```

### `Position` tipi (derived)
```typescript
interface Position {
  id: string;                                     // synthetic: `${type}-${code}-${region|""}`
  type, region, code, name;                       // group key
  qty: number;                                    // remaining lot
  unitCost: number;                               // method'a göre hesaplanmış
  price: number | null;                           // RATES / API'den dolar
  buyDate: string;                                // FIFO: en eski lot; Wavg: ilk alım
  bmAtCost: { gold, usd, bist } | null;
  realizedPnL: number;                            // bu sembolden satışlar toplamı
  txCount: number;                                // kaç TX'ten oluşuyor (UI için)
}
```

### `Sale` tipi (derived, mevcut UI için)
```typescript
interface Sale {
  date, code, name, qty, price;
  proceeds: number;                                // qty*price
  pnl: number;                                     // realized P/L (method'a göre)
}
```

### Persistence

Yeni alan: `transactions`. Eski `holdings` ve `sales` derived olarak yine yazılır (transition için backward-compat).

```json
{
  "transactions": [...],     // YENİ — source of truth
  "costMethod": "fifo",      // YENİ — state içinde
  "holdings": [...],         // derived; eski kod hâlâ okuyabilsin diye yazıyoruz
  "sales": [...],            // derived
  "cash": 0,
  "schemaVersion": 2         // bump
}
```

Load akışı:
1. Blob'da `transactions` varsa → onu source-of-truth al, derived'leri yeniden hesapla.
2. `transactions` yoksa ama `holdings` varsa → her holding için 1 BUY tx üret, derived'leri yeniden hesapla.
3. İkisi de yoksa → boş state.

## Algoritma

### FIFO

```typescript
function fifoForCode(txs: Transaction[]): {
  qty: number; unitCost: number; buyDate: string;
  bmAtCost: BM|null; realizedPnL: number;
  sales: Sale[];
} {
  const sorted = txs.slice().sort(byDate);
  const lots: Array<{qty: number; price: number; date: string; bm: BM|null}> = [];
  let realizedPnL = 0;
  const sales: Sale[] = [];

  for (const tx of sorted) {
    if (tx.side === "buy") {
      lots.push({ qty: tx.qty, price: tx.price, date: tx.date, bm: tx.bmAtCost ?? null });
    } else {
      let remaining = tx.qty;
      let costRemoved = 0;
      while (remaining > 0 && lots.length > 0) {
        const oldest = lots[0];
        const used = Math.min(remaining, oldest.qty);
        costRemoved += used * oldest.price;
        oldest.qty -= used;
        remaining -= used;
        if (oldest.qty === 0) lots.shift();
      }
      const proceeds = tx.qty * tx.price;
      const pnl = proceeds - costRemoved;
      realizedPnL += pnl;
      sales.push({ date: tx.date, code: tx.code, name: tx.name, qty: tx.qty, price: tx.price, proceeds, pnl });
    }
  }

  const remainingQty = lots.reduce((s, l) => s + l.qty, 0);
  const remainingCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const unitCost = remainingQty > 0 ? remainingCost / remainingQty : 0;

  return {
    qty: remainingQty,
    unitCost,
    buyDate: lots[0]?.date ?? sorted.find(t => t.side === "buy")?.date ?? "",
    bmAtCost: lots[0]?.bm ?? null,
    realizedPnL,
    sales,
  };
}
```

### Ağırlıklı Ortalama

```typescript
function wavgForCode(txs: Transaction[]): {...} {
  const sorted = txs.slice().sort(byDate);
  let qty = 0, totalCost = 0, realizedPnL = 0;
  let firstBuyDate = "", firstBuyBm: BM|null = null;
  const sales: Sale[] = [];

  for (const tx of sorted) {
    if (tx.side === "buy") {
      if (qty === 0) { firstBuyDate = tx.date; firstBuyBm = tx.bmAtCost ?? null; }
      qty += tx.qty;
      totalCost += tx.qty * tx.price;
    } else {
      const avgCost = qty > 0 ? totalCost / qty : 0;
      const sellQty = Math.min(tx.qty, qty);
      const costRemoved = sellQty * avgCost;
      const proceeds = sellQty * tx.price;
      const pnl = proceeds - costRemoved;
      realizedPnL += pnl;
      qty -= sellQty;
      totalCost -= costRemoved;
      if (qty <= 0) { qty = 0; totalCost = 0; }     // floating-point guard
      sales.push({ date: tx.date, code: tx.code, name: tx.name, qty: tx.qty, price: tx.price, proceeds, pnl });
    }
  }

  return {
    qty,
    unitCost: qty > 0 ? totalCost / qty : 0,
    buyDate: firstBuyDate,
    bmAtCost: firstBuyBm,
    realizedPnL,
    sales,
  };
}
```

### `computePositions(transactions, method)` çağrı arayüzü

```typescript
function computePositions(
  transactions: Transaction[],
  method: "fifo" | "wavg"
): { positions: Position[]; sales: Sale[] } {
  // group by (type + code + region)
  // run algo per group
  // collect positions (qty > 0) and merged sales
}
```

Tek çağrıyla hem `HOLDINGS` hem `SALES` türetilir. State değişiminde tek bir `recomputeFromTransactions()` çağrılır.

## Frontend Entegrasyonu

### Header dropdown

```html
<div class="user-chip">
  <select id="costMethodSel" class="seg-select">
    <option value="fifo">FIFO</option>
    <option value="wavg">Ağırlıklı Ortalama</option>
  </select>
  · <span id="userEmail">—</span> · <a href="/auth/logout">Çıkış</a>
</div>
```

`change` event → `state.costMethod = e.target.value; recomputeFromTransactions(); save(); renderTab();`

### `saveAdd` handler (BUY)

Eski: `HOLDINGS.push({...})` direkt.
Yeni:
```js
TRANSACTIONS.push({
  id: id(), date: buyDate, side: "buy",
  type, region, code, name, qty,
  price: unitCost,
  fromCash: fundingMode === "cash",
  bmAtCost: { ...bmNow() }
});
recomputeFromTransactions();
```

### `confirmSell` handler (SELL)

Eski: holding sil, CASH ekle, SALES ekle.
Yeni:
```js
const h = HOLDINGS.find(x => x.id === sellingId);
TRANSACTIONS.push({
  id: id(), date: new Date().toISOString().slice(0,10),
  side: "sell",
  type: h.type, region: h.region, code: h.code, name: h.name,
  qty: h.qty, price: h.price
});
CASH += h.qty * h.price;
recomputeFromTransactions();
```

### Düzenle akışı

`Position.txCount > 1` ise rendering'de Düzenle butonunu **gizle**:
```js
${pos.txCount === 1 ? `<button data-edit="${pos.id}">Düzenle</button>` : ''}
```

Tek TX'li pozisyonlarda mevcut Düzenle akışı korunur; ilgili TX'in alanlarını günceller. Multi-TX edit Modül 2.

### Migration

`hydrate(data)` içinde:
```js
if (data?.transactions) {
  TRANSACTIONS = data.transactions;
} else if (data?.holdings?.length) {
  TRANSACTIONS = data.holdings.map(h => ({
    id: id(), date: h.buyDate, side: "buy",
    type: h.type, region: h.region, code: h.code, name: h.name,
    qty: h.qty, price: h.unitCost,
    bmAtCost: h.bmAtCost ?? null
  }));
} else {
  TRANSACTIONS = [];
}
recomputeFromTransactions();
```

### `dumpState` (save için)

```js
function dumpState() {
  return {
    transactions: TRANSACTIONS,
    costMethod: state.costMethod,
    holdings: HOLDINGS,        // derived, write for backward compat
    sales: SALES,              // derived
    cash: CASH, contrib: CONTRIB, goals: GOALS, snaps: SNAPS,
    savTarget: SAV_TARGET, mileDates: MILE_DATES, proj: PROJ,
    state, schemaVersion: 2
  };
}
```

## Test Stratejisi

### Backend `positions.ts` unit tests (vitest)

- **FIFO:**
  1. Tek BUY → qty + unitCost = price
  2. İki BUY (farklı fiyat) → unitCost = weighted avg
  3. BUY + tam SELL → qty=0, realizedPnL doğru
  4. BUY + kısmi SELL → kalan qty + kalan unitCost (oldest lot consumed)
  5. İki BUY + bir SELL → FIFO sırası doğru (en eski lot tüketildi)
  6. BUY + SELL > kalan qty → safe degrade (qty=0, kalan SELL ignore)
  7. Sadece BUY → buyDate = ilk BUY tarihi

- **Wavg:**
  1. Tek BUY → unitCost = price
  2. İki BUY → unitCost = weighted average
  3. BUY + kısmi SELL → unitCost değişmedi, qty azaldı
  4. BUY + tam SELL → qty=0, realizedPnL doğru
  5. Mixed buy-sell sequence → final state doğru

- **`computePositions` aggregator:**
  1. Aynı kod farklı type → ayrı positions
  2. Yurtiçi/yurtdışı aynı kod → ayrı positions
  3. Sadece sell var (geçersiz state) → qty=0 (filtrelenir)

### Frontend
- node --check parse OK
- Manuel browser test: ekle/sat/yöntem değiştir, render doğru kalmalı.

## Out of Scope (Modül 2 için)

- İşlemler sekmesi (TX list UI)
- Per-asset detay görünüm (TX geçmişi)
- Bireysel TX düzenleme/silme UI
- Tarih seçici "Sat" akışında
- SALES ekranındaki gösterimde maliyet yöntemi açıklaması ("FIFO ile hesaplandı")

## Riskler

1. **Floating-point birikimi:** Wavg'da `qty -= sellQty` → guard ekledim (`qty <= 0 → 0`). FIFO'da lot.qty -= used ile aynı risk; benzer guard koy.
2. **Migration tekrarlanmasın:** Bir kere TRANSACTIONS oluştuktan sonra her load'da `data.transactions`'tan okumalı, `data.holdings`'ten değil.
3. **`schemaVersion: 2` migration:** Yeni alan eklemek backward-compat, ama eski versiyonda açılan pano yeni schema'yı okuyamaz — gerek olmadığı için sorun değil (tek kullanıcılı).
