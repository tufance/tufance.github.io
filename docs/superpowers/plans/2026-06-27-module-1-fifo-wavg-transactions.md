# Modül 1: FIFO/Wavg Transaction Model — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Position-bazlı modeli işlem (TX) bazlıya çevir; FIFO ve Wavg cost method'unu globalde toggle yap; mevcut UI hiç bozulmadan çalışsın.

## Çalışma dizini

`/Users/tufancetiner/tufance.github.io/` — branch `main`, commit-only (controller commit'ler).

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `backend/src/positions.ts` (yeni) | `Transaction`, `Position`, `Sale` tipleri + `fifoForCode`, `wavgForCode`, `computePositions` |
| `backend/test/positions.test.ts` (yeni) | 15 unit test |
| `backend/public/index.html` (modify) | TX state, recompute, header dropdown, BUY/SELL handler değişimi, migration |

## Task 1: `positions.ts` backend module + tests

**Files:**
- Create: `backend/src/positions.ts`
- Create: `backend/test/positions.test.ts`

### Step 1: Write failing test `backend/test/positions.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { fifoForCode, wavgForCode, computePositions } from "../src/positions";
import type { Transaction } from "../src/positions";

const buy = (date: string, qty: number, price: number, code = "X"): Transaction => ({
  id: "t" + date + qty, date, side: "buy", type: "hisse", region: "yurtici",
  code, name: code, qty, price, bmAtCost: { gold: 1, usd: 1, bist: 1 },
});
const sell = (date: string, qty: number, price: number, code = "X"): Transaction => ({
  id: "s" + date + qty, date, side: "sell", type: "hisse", region: "yurtici",
  code, name: code, qty, price,
});

describe("fifoForCode", () => {
  it("single buy: qty + unitCost = price", () => {
    const r = fifoForCode([buy("2026-01-01", 100, 50)]);
    expect(r.qty).toBe(100);
    expect(r.unitCost).toBe(50);
    expect(r.realizedPnL).toBe(0);
    expect(r.buyDate).toBe("2026-01-01");
  });

  it("two buys at different prices: unitCost = weighted average", () => {
    const r = fifoForCode([buy("2026-01-01", 100, 50), buy("2026-02-01", 100, 70)]);
    expect(r.qty).toBe(200);
    expect(r.unitCost).toBe(60);
    expect(r.buyDate).toBe("2026-01-01");
  });

  it("buy + full sell: qty=0, realizedPnL correct", () => {
    const r = fifoForCode([buy("2026-01-01", 100, 50), sell("2026-03-01", 100, 80)]);
    expect(r.qty).toBe(0);
    expect(r.realizedPnL).toBe(3000); // (80-50)*100
    expect(r.sales).toHaveLength(1);
    expect(r.sales[0].pnl).toBe(3000);
  });

  it("buy + partial sell: oldest lot consumed first", () => {
    const r = fifoForCode([
      buy("2026-01-01", 100, 50),
      buy("2026-02-01", 100, 70),
      sell("2026-03-01", 50, 80),
    ]);
    expect(r.qty).toBe(150);
    // Remaining: 50 @ 50, 100 @ 70 → unitCost = (50*50 + 100*70) / 150 = 9500/150 = 63.333...
    expect(r.unitCost).toBeCloseTo(63.333, 2);
    // Realized: 50 sold from oldest lot @ 50 → (80-50)*50 = 1500
    expect(r.realizedPnL).toBe(1500);
  });

  it("two buys + sell that crosses lots: oldest exhausted, second touched", () => {
    const r = fifoForCode([
      buy("2026-01-01", 100, 50),
      buy("2026-02-01", 100, 70),
      sell("2026-03-01", 150, 80),
    ]);
    expect(r.qty).toBe(50);
    expect(r.unitCost).toBe(70); // only second lot remainder
    // Realized: 100@50 → (80-50)*100=3000; 50@70 → (80-70)*50=500 → total 3500
    expect(r.realizedPnL).toBe(3500);
  });

  it("sell larger than holdings: safe degrade", () => {
    const r = fifoForCode([buy("2026-01-01", 100, 50), sell("2026-02-01", 200, 80)]);
    expect(r.qty).toBe(0);
    expect(r.realizedPnL).toBe(3000); // only 100 consumed
  });

  it("only buys: buyDate is earliest buy", () => {
    const r = fifoForCode([buy("2026-02-01", 50, 100), buy("2026-01-15", 50, 100)]);
    expect(r.buyDate).toBe("2026-01-15");
  });
});

describe("wavgForCode", () => {
  it("single buy: unitCost = price", () => {
    const r = wavgForCode([buy("2026-01-01", 100, 50)]);
    expect(r.qty).toBe(100);
    expect(r.unitCost).toBe(50);
  });

  it("two buys: weighted average", () => {
    const r = wavgForCode([buy("2026-01-01", 100, 50), buy("2026-02-01", 100, 70)]);
    expect(r.qty).toBe(200);
    expect(r.unitCost).toBe(60);
  });

  it("partial sell does not change unitCost", () => {
    const r = wavgForCode([
      buy("2026-01-01", 100, 50),
      buy("2026-02-01", 100, 70),
      sell("2026-03-01", 50, 80),
    ]);
    expect(r.qty).toBe(150);
    expect(r.unitCost).toBeCloseTo(60, 6); // unchanged from pre-sell avg
    expect(r.realizedPnL).toBe(1000); // (80-60)*50
  });

  it("full sell: qty=0", () => {
    const r = wavgForCode([buy("2026-01-01", 100, 50), sell("2026-02-01", 100, 80)]);
    expect(r.qty).toBe(0);
    expect(r.realizedPnL).toBe(3000);
  });

  it("buy + sell + buy: avg recalculates only on buys", () => {
    const r = wavgForCode([
      buy("2026-01-01", 100, 50),
      sell("2026-02-01", 50, 80),     // avg stays 50
      buy("2026-03-01", 100, 80),     // new avg = (50*50 + 100*80) / 150
    ]);
    expect(r.qty).toBe(150);
    expect(r.unitCost).toBeCloseTo((50 * 50 + 100 * 80) / 150, 2); // 70
  });
});

describe("computePositions", () => {
  it("groups by type+code+region", () => {
    const txs: Transaction[] = [
      buy("2026-01-01", 100, 50, "AAA"),
      buy("2026-01-01", 50, 100, "BBB"),
    ];
    const r = computePositions(txs, "fifo");
    expect(r.positions).toHaveLength(2);
  });

  it("separates same code by region", () => {
    const txs: Transaction[] = [
      { ...buy("2026-01-01", 100, 50, "AAPL"), region: "yurtdisi", type: "hisse" },
      { ...buy("2026-01-01", 100, 50, "AAPL"), region: "yurtici", type: "hisse" },
    ];
    const r = computePositions(txs, "fifo");
    expect(r.positions).toHaveLength(2);
  });

  it("filters out fully-sold positions (qty=0)", () => {
    const txs: Transaction[] = [
      buy("2026-01-01", 100, 50, "AAA"),
      sell("2026-02-01", 100, 80, "AAA"),
    ];
    const r = computePositions(txs, "fifo");
    expect(r.positions).toHaveLength(0);
    expect(r.sales).toHaveLength(1);
  });
});
```

Run: `cd backend && npx vitest run test/positions.test.ts` — Expected FAIL (module missing).

### Step 2: Implementation `backend/src/positions.ts`

```typescript
export interface Transaction {
  id: string;
  date: string;
  side: "buy" | "sell";
  type: "fon" | "hisse" | "etf" | "doviz" | "altin" | "kripto";
  region: "yurtici" | "yurtdisi" | null;
  code: string;
  name: string;
  qty: number;
  price: number;
  fromCash?: boolean;
  bmAtCost?: { gold: number; usd: number; bist: number } | null;
}

export interface Sale {
  date: string;
  code: string;
  name: string;
  qty: number;
  price: number;
  proceeds: number;
  pnl: number;
}

export interface Position {
  id: string;
  type: Transaction["type"];
  region: Transaction["region"];
  code: string;
  name: string;
  qty: number;
  unitCost: number;
  price: number | null;
  buyDate: string;
  bmAtCost: { gold: number; usd: number; bist: number } | null;
  realizedPnL: number;
  txCount: number;
}

export interface CodeResult {
  qty: number;
  unitCost: number;
  buyDate: string;
  bmAtCost: { gold: number; usd: number; bist: number } | null;
  realizedPnL: number;
  sales: Sale[];
}

const EPS = 1e-9;

function byDate(a: Transaction, b: Transaction): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

export function fifoForCode(txs: Transaction[]): CodeResult {
  const sorted = txs.slice().sort(byDate);
  const lots: Array<{ qty: number; price: number; date: string; bm: { gold: number; usd: number; bist: number } | null }> = [];
  let realizedPnL = 0;
  const sales: Sale[] = [];

  for (const tx of sorted) {
    if (tx.side === "buy") {
      lots.push({ qty: tx.qty, price: tx.price, date: tx.date, bm: tx.bmAtCost ?? null });
    } else {
      let remaining = tx.qty;
      let costRemoved = 0;
      let consumed = 0;
      while (remaining > EPS && lots.length > 0) {
        const oldest = lots[0];
        const used = Math.min(remaining, oldest.qty);
        costRemoved += used * oldest.price;
        oldest.qty -= used;
        remaining -= used;
        consumed += used;
        if (oldest.qty <= EPS) lots.shift();
      }
      const proceeds = consumed * tx.price;
      const pnl = proceeds - costRemoved;
      realizedPnL += pnl;
      sales.push({
        date: tx.date, code: tx.code, name: tx.name,
        qty: tx.qty, price: tx.price, proceeds, pnl,
      });
    }
  }

  const remainingQty = lots.reduce((s, l) => s + l.qty, 0);
  const remainingCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const unitCost = remainingQty > 0 ? remainingCost / remainingQty : 0;
  const firstBuy = sorted.find(t => t.side === "buy");

  return {
    qty: remainingQty,
    unitCost,
    buyDate: lots[0]?.date ?? firstBuy?.date ?? "",
    bmAtCost: lots[0]?.bm ?? (firstBuy?.bmAtCost ?? null),
    realizedPnL,
    sales,
  };
}

export function wavgForCode(txs: Transaction[]): CodeResult {
  const sorted = txs.slice().sort(byDate);
  let qty = 0;
  let totalCost = 0;
  let realizedPnL = 0;
  let firstBuyDate = "";
  let firstBuyBm: { gold: number; usd: number; bist: number } | null = null;
  const sales: Sale[] = [];

  for (const tx of sorted) {
    if (tx.side === "buy") {
      if (qty === 0 && !firstBuyDate) {
        firstBuyDate = tx.date;
        firstBuyBm = tx.bmAtCost ?? null;
      }
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
      if (qty <= EPS) {
        qty = 0;
        totalCost = 0;
      }
      sales.push({
        date: tx.date, code: tx.code, name: tx.name,
        qty: tx.qty, price: tx.price, proceeds, pnl,
      });
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

function groupKey(t: Transaction): string {
  return `${t.type}|${t.code}|${t.region ?? ""}`;
}

export function computePositions(
  transactions: Transaction[],
  method: "fifo" | "wavg"
): { positions: Position[]; sales: Sale[] } {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const k = groupKey(tx);
    const list = groups.get(k);
    if (list) list.push(tx);
    else groups.set(k, [tx]);
  }

  const positions: Position[] = [];
  const allSales: Sale[] = [];
  const algo = method === "fifo" ? fifoForCode : wavgForCode;

  for (const [, txs] of groups) {
    const r = algo(txs);
    allSales.push(...r.sales);
    if (r.qty <= EPS) continue;
    const sample = txs[0];
    positions.push({
      id: `${sample.type}-${sample.code}-${sample.region ?? ""}`,
      type: sample.type,
      region: sample.region,
      code: sample.code,
      name: sample.name,
      qty: r.qty,
      unitCost: r.unitCost,
      price: null,
      buyDate: r.buyDate,
      bmAtCost: r.bmAtCost,
      realizedPnL: r.realizedPnL,
      txCount: txs.length,
    });
  }

  allSales.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { positions, sales: allSales };
}
```

### Step 3: Run tests
```bash
cd /Users/tufancetiner/tufance.github.io/backend
npx vitest run test/positions.test.ts
```
Expected: 15 passing.

### Step 4: Full suite + typecheck
```bash
npx vitest run
npx tsc --noEmit
```
Expected: 16 (existing) + 15 (positions) = 31 tests, typecheck clean.

### Step 5: Stage; controller commits
Subagent: `git add backend/src/positions.ts backend/test/positions.test.ts`
Controller commit: `backend(positions): fifo + wavg algorithms with 15 unit tests`

---

## Task 2: Frontend integration

**Files:**
- Modify: `backend/public/index.html`

This is the big lift. The subagent must:

### Step 1: Read current state

Find these globals in current `<script>`:
- `let HOLDINGS=[]`, `SALES=[]`, `state`
- `dumpState()`, `hydrate(data)`
- `saveAdd` onclick handler (BUY)
- `confirmSell` onclick handler (SELL)
- Where renderGroups renders `Düzenle` button

### Step 2: Add TRANSACTIONS state + cost method default

Near the existing `let HOLDINGS=[]…` line, ADD:

```javascript
let TRANSACTIONS = [];
```

In `state` initialization, add:
```javascript
let state={...existing..., costMethod: "fifo"};
```

If `state` is already defined, modify it to include `costMethod`.

### Step 3: Inline the positions logic

Paste this JS block somewhere logical (e.g., near other compute helpers):

```javascript
/* ===== TX → positions (FIFO / Wavg) — see backend/src/positions.ts ===== */
const POS_EPS = 1e-9;

function ___fifoForCode(txs){
  const sorted = txs.slice().sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
  const lots = [];
  let realizedPnL = 0;
  const sales = [];
  for (const tx of sorted) {
    if (tx.side === "buy") {
      lots.push({qty: tx.qty, price: tx.price, date: tx.date, bm: tx.bmAtCost || null});
    } else {
      let remaining = tx.qty, costRemoved = 0, consumed = 0;
      while (remaining > POS_EPS && lots.length > 0) {
        const oldest = lots[0];
        const used = Math.min(remaining, oldest.qty);
        costRemoved += used * oldest.price;
        oldest.qty -= used;
        remaining -= used;
        consumed += used;
        if (oldest.qty <= POS_EPS) lots.shift();
      }
      const proceeds = consumed * tx.price;
      const pnl = proceeds - costRemoved;
      realizedPnL += pnl;
      sales.push({date: tx.date, code: tx.code, name: tx.name, qty: tx.qty, price: tx.price, proceeds, pnl});
    }
  }
  const remQty = lots.reduce((s,l)=> s + l.qty, 0);
  const remCost = lots.reduce((s,l)=> s + l.qty * l.price, 0);
  const firstBuy = sorted.find(t => t.side === "buy");
  return {
    qty: remQty,
    unitCost: remQty > 0 ? remCost / remQty : 0,
    buyDate: (lots[0] && lots[0].date) || (firstBuy && firstBuy.date) || "",
    bmAtCost: (lots[0] && lots[0].bm) || (firstBuy && firstBuy.bmAtCost) || null,
    realizedPnL, sales
  };
}

function ___wavgForCode(txs){
  const sorted = txs.slice().sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
  let qty = 0, totalCost = 0, realizedPnL = 0;
  let firstBuyDate = "", firstBuyBm = null;
  const sales = [];
  for (const tx of sorted) {
    if (tx.side === "buy") {
      if (qty === 0 && !firstBuyDate) { firstBuyDate = tx.date; firstBuyBm = tx.bmAtCost || null; }
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
      if (qty <= POS_EPS) { qty = 0; totalCost = 0; }
      sales.push({date: tx.date, code: tx.code, name: tx.name, qty: tx.qty, price: tx.price, proceeds, pnl});
    }
  }
  return {
    qty,
    unitCost: qty > 0 ? totalCost / qty : 0,
    buyDate: firstBuyDate,
    bmAtCost: firstBuyBm,
    realizedPnL, sales
  };
}

function ___computePositions(transactions, method){
  const groups = new Map();
  for (const tx of transactions) {
    const k = `${tx.type}|${tx.code}|${tx.region || ""}`;
    if (groups.has(k)) groups.get(k).push(tx); else groups.set(k, [tx]);
  }
  const positions = [], allSales = [];
  const algo = method === "fifo" ? ___fifoForCode : ___wavgForCode;
  for (const txs of groups.values()) {
    const r = algo(txs);
    allSales.push(...r.sales);
    if (r.qty <= POS_EPS) continue;
    const s = txs[0];
    positions.push({
      id: `${s.type}-${s.code}-${s.region || ""}`,
      type: s.type, region: s.region, code: s.code, name: s.name,
      qty: r.qty, unitCost: r.unitCost,
      price: null,
      buyDate: r.buyDate, bmAtCost: r.bmAtCost,
      realizedPnL: r.realizedPnL, txCount: txs.length, dayPct: 0
    });
  }
  allSales.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
  return {positions, sales: allSales};
}

function recomputeFromTransactions(){
  const method = state.costMethod || "fifo";
  const {positions, sales} = ___computePositions(TRANSACTIONS, method);
  // preserve current price for matching holdings
  const oldByKey = new Map(HOLDINGS.map(h => [`${h.type}-${h.code}-${h.region || ""}`, h.price]));
  HOLDINGS = positions.map(p => ({ ...p, price: oldByKey.get(p.id) ?? null }));
  SALES = sales;
}
```

### Step 4: Modify `hydrate(data)`

Replace:
```javascript
HOLDINGS = data.holdings ?? [];
// ...
SALES = data.sales ?? [];
```

With:
```javascript
if (Array.isArray(data.transactions)) {
  TRANSACTIONS = data.transactions;
} else if (Array.isArray(data.holdings) && data.holdings.length) {
  // Migration: each holding → 1 BUY tx
  TRANSACTIONS = data.holdings.map(h => ({
    id: id(),
    date: h.buyDate || new Date().toISOString().slice(0,10),
    side: "buy",
    type: h.type, region: h.region || null,
    code: h.code, name: h.name,
    qty: h.qty, price: h.unitCost,
    bmAtCost: h.bmAtCost || null
  }));
} else {
  TRANSACTIONS = [];
}
if (data.costMethod === "fifo" || data.costMethod === "wavg") {
  state.costMethod = data.costMethod;
}
recomputeFromTransactions();
// HOLDINGS and SALES are now populated; rest of hydrate stays the same EXCEPT remove direct holdings/sales assignment
```

Make sure `data.holdings = []` no longer overrides our derived HOLDINGS. The simplest: remove those two lines entirely now.

Default `hydrate(null)` (empty state):
```javascript
if (!data) {
  TRANSACTIONS = []; HOLDINGS = []; SALES = [];
  CASH = 0; CONTRIB = []; GOALS = [];
  SNAPS = []; SAV_TARGET = {amount:1000,ccy:"USD"};
  MILE_DATES = {}; PROJ = {value:null,monthly:null,annual:10,years:10};
  return;
}
```

### Step 5: Modify `dumpState()`

```javascript
function dumpState(){
  return {
    transactions: TRANSACTIONS,
    costMethod: state.costMethod || "fifo",
    holdings: HOLDINGS, sales: SALES,    // derived; kept for backward compat
    cash: CASH, contrib: CONTRIB, goals: GOALS, snaps: SNAPS,
    savTarget: SAV_TARGET, mileDates: MILE_DATES,
    proj: PROJ, state: state, schemaVersion: 2
  };
}
```

### Step 6: saveAdd handler (BUY path)

Current handler creates a holding object directly. Replace the **non-edit** path:

Old:
```javascript
const newH = {id:id(),type:t,region,code,name,qty,unitCost,price,dayPct:0,buyDate,bmAtCost:{...bmNow()}};
const totalCost = qty * unitCost;
if (fundingMode === 'cash'){
  if (CASH >= totalCost){ ___finalizeAdd(newH, true); return; }
  pendingHolding = newH;
  document.getElementById('cashConfirmMsg').innerHTML = ...;
  document.getElementById('cashConfirmOverlay').classList.add('open');
  return;
}
___finalizeAdd(newH, false);
```

New (replace the `newH` construction + `___finalizeAdd` to push TX):

```javascript
const newTx = {
  id: id(), date: buyDate, side: "buy",
  type: t, region, code, name,
  qty, price: unitCost,
  fromCash: fundingMode === "cash",
  bmAtCost: { ...bmNow() }
};
const totalCost = qty * unitCost;
if (fundingMode === 'cash'){
  if (CASH >= totalCost){ ___finalizeBuy(newTx, true); return; }
  pendingTx = newTx;
  document.getElementById('cashConfirmMsg').innerHTML = `Kasada <b>${moneyTRY(CASH)}</b> var ama <b>${moneyTRY(totalCost)}</b> gerekiyor. Yeni yatırım olarak (kasaya dokunmadan) ekleyelim mi?`;
  document.getElementById('cashConfirmOverlay').classList.add('open');
  return;
}
___finalizeBuy(newTx, false);
```

Also replace `___finalizeAdd` with `___finalizeBuy`:

```javascript
function ___finalizeBuy(tx, fromCash) {
  TRANSACTIONS.push(tx);
  if (fromCash) { CASH -= tx.qty * tx.price; toast(`${moneyTRY(tx.qty*tx.price)} kasadan kullanıldı`); }
  else toast("Yatırım eklendi");
  recomputeFromTransactions();
  closeModal('addOverlay');
  save();
  renderTab();
}
let pendingTx = null;
```

Rename `pendingHolding` → `pendingTx` everywhere it's referenced. Update `cashConfirmContinue` handler:
```javascript
document.getElementById('cashConfirmContinue').onclick = ()=>{
  if (!pendingTx) return;
  ___finalizeBuy(pendingTx, false);
  pendingTx = null;
  closeModal('cashConfirmOverlay');
};
```

### Step 7: Edit path in saveAdd

Edit currently mutates a holding directly. In TX model, we edit the underlying TX (if single-tx position). When `editingId` is set, find the position, find its single TX, mutate that TX:

```javascript
if (editingId) {
  const h = HOLDINGS.find(x => x.id === editingId);
  if (!h) { closeModal('addOverlay'); return; }
  if (h.txCount !== 1) { toast("Çoklu işlemli pozisyon — Modül 2'de düzenlenebilir"); return; }
  // find single tx
  const tx = TRANSACTIONS.find(t => t.side === "buy" && t.type === h.type && t.code === h.code && (t.region || null) === (h.region || null));
  if (!tx) { toast("İşlem bulunamadı"); return; }
  Object.assign(tx, { type: t, region, code, name, qty, price: unitCost, date: buyDate });
  recomputeFromTransactions();
  // user-entered "Güncel fiyat" (price var, opsiyonel) → update HOLDINGS price
  const newPos = HOLDINGS.find(x => x.id === h.id);
  if (newPos && price !== null) newPos.price = price;
  closeModal('addOverlay'); save(); renderTab();
  toast("Yatırım güncellendi");
  return;
}
```

### Step 8: confirmSell handler

Old: removes holding, adds CASH, pushes SALES.
New: pushes SELL tx, adds CASH, recomputes.

```javascript
document.getElementById('confirmSell').onclick = ()=>{
  const h = HOLDINGS.find(x => x.id === sellingId);
  if (!h) return;
  const proceeds = valTRY(h);  // qty * price
  const sellTx = {
    id: id(), date: new Date().toISOString().slice(0,10),
    side: "sell", type: h.type, region: h.region, code: h.code, name: h.name,
    qty: h.qty, price: h.price
  };
  TRANSACTIONS.push(sellTx);
  CASH += proceeds;
  recomputeFromTransactions();
  closeModal('sellOverlay');
  save();
  renderTab();
  toast(`${h.code} satıldı · ${moneyTRY(proceeds)} nakde eklendi`);
};
```

Note: the sell tx records full qty (h.qty). This sells the entire position. If user wants partial sells, that's Modül 2.

### Step 9: renderGroups — Düzenle button conditional

Find the row-rendering line that emits `<button class="rowbtn" data-edit="${h.id}">Düzenle</button>`. Replace with:

```javascript
${h.txCount === 1 ? `<button class="rowbtn" data-edit="${h.id}">Düzenle</button>` : ''}
```

If `h.txCount` is undefined (legacy), default to 1 (allow edit). Use `(h.txCount ?? 1) === 1` for safety.

### Step 10: Header dropdown

In header HTML, modify `.user-chip`:

```html
<div class="user-chip">
  <select id="costMethodSel" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:12px;font-family:inherit">
    <option value="fifo">FIFO</option>
    <option value="wavg">Ağırlıklı Ortalama</option>
  </select>
  · <span id="userEmail">—</span> · <a href="/auth/logout">Çıkış</a>
</div>
```

JS wiring (in the wiring block):

```javascript
const sel = document.getElementById('costMethodSel');
sel.value = state.costMethod || "fifo";
sel.onchange = ()=>{
  state.costMethod = sel.value;
  recomputeFromTransactions();
  save();
  renderTab();
  toast(`Maliyet yöntemi: ${sel.value === "fifo" ? "FIFO" : "Ağırlıklı Ortalama"}`);
};
```

After boot completes (and `hydrate` set state.costMethod from storage), set `sel.value = state.costMethod` to reflect saved preference. This should be done in `boot()` after `hydrate(data)`:

```javascript
const sel = document.getElementById('costMethodSel');
if (sel) sel.value = state.costMethod || "fifo";
```

### Step 11: Verify JS parses
```bash
cd /Users/tufancetiner/tufance.github.io
node -e "const fs=require('fs');const html=fs.readFileSync('backend/public/index.html','utf8');const scripts=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]);require('fs').writeFileSync('/tmp/check.js',scripts.join('\\n;\\n'));"
node --check /tmp/check.js && echo OK
```

### Step 12: Stage; controller commits

Subagent: `git add backend/public/index.html`
Controller commit: `frontend: tx model + fifo/wavg cost methods + header dropdown`

---

## Task 3: Controller — deploy + browser test

- [ ] Controller commits both staged changes (Task 1 + Task 2)
- [ ] `cd backend && npx wrangler deploy`
- [ ] User does Cmd+Shift+R + verifies:
  - Migration: existing USD position still shows correctly
  - Dropdown toggle: FIFO ↔ Wavg, recomputes without page reload
  - Add: new BUY → position updates
  - Multi-buy same asset: aggregated into single row
  - Sell: full position sells, CASH grows
- [ ] If browser test passes: complete. If issue: fix subagent dispatch.

---

## Self-Review

- ✅ Spec coverage: data model (Task 1 types), algorithms (Task 1 funcs), aggregation (computePositions), frontend integration (Task 2), settings UI (Task 2 Step 10), migration (Task 2 Step 4).
- ✅ Tests: 15 unit covering FIFO 7, Wavg 5, aggregator 3.
- ✅ No placeholders: all step content concrete.
- ⚠️ Two implementations of same algo (TS backend + JS frontend) — duplication is intentional (v1, no bundler). Documented in spec.
- ⚠️ Multi-TX positions can't be edited via UI in Modül 1 — explicit, Modül 2 will add proper TX editing.
