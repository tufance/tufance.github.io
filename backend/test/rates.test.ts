import { describe, it, expect, vi } from "vitest";
import { buildRates } from "../src/rates";
import type { YahooQuote } from "../src/types";

describe("buildRates", () => {
  it("assembles all six rates from the right Yahoo symbols", async () => {
    const yahoo = vi.fn(async (symbol: string): Promise<YahooQuote> => {
      const map: Record<string, YahooQuote> = {
        "TRY=X":    { price: 46.46,    currency: "TRY" },
        "EURTRY=X": { price: 52.95,    currency: "TRY" },
        "GC=F":     { price: 4127.5,   currency: "USD" },
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
