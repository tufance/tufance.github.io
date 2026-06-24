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
  const SUPPORTED: YahooQuote["currency"][] = ["TRY", "USD", "EUR", "GBP"];
  if (!SUPPORTED.includes(meta.currency as YahooQuote["currency"])) {
    throw new Error(`yahoo_unsupported_currency_${meta.currency}`);
  }
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency as YahooQuote["currency"],
  };
}
