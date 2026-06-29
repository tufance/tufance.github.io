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
    expect(r.realizedPnL).toBe(3000);
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
    expect(r.unitCost).toBeCloseTo(63.333, 2);
    expect(r.realizedPnL).toBe(1500);
  });

  it("two buys + sell that crosses lots: oldest exhausted, second touched", () => {
    const r = fifoForCode([
      buy("2026-01-01", 100, 50),
      buy("2026-02-01", 100, 70),
      sell("2026-03-01", 150, 80),
    ]);
    expect(r.qty).toBe(50);
    expect(r.unitCost).toBe(70);
    expect(r.realizedPnL).toBe(3500);
  });

  it("sell larger than holdings: safe degrade", () => {
    const r = fifoForCode([buy("2026-01-01", 100, 50), sell("2026-02-01", 200, 80)]);
    expect(r.qty).toBe(0);
    expect(r.realizedPnL).toBe(3000);
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
    expect(r.unitCost).toBeCloseTo(60, 6);
    expect(r.realizedPnL).toBe(1000);
  });

  it("full sell: qty=0", () => {
    const r = wavgForCode([buy("2026-01-01", 100, 50), sell("2026-02-01", 100, 80)]);
    expect(r.qty).toBe(0);
    expect(r.realizedPnL).toBe(3000);
  });

  it("buy + sell + buy: avg recalculates only on buys", () => {
    const r = wavgForCode([
      buy("2026-01-01", 100, 50),
      sell("2026-02-01", 50, 80),
      buy("2026-03-01", 100, 80),
    ]);
    expect(r.qty).toBe(150);
    expect(r.unitCost).toBeCloseTo((50 * 50 + 100 * 80) / 150, 2);
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
    const a = { ...buy("2026-01-01", 100, 50, "AAPL"), region: "yurtdisi" as const, type: "hisse" as const };
    const b = { ...buy("2026-01-01", 100, 50, "AAPL"), region: "yurtici" as const, type: "hisse" as const };
    const r = computePositions([a, b], "fifo");
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
