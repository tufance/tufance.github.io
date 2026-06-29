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
