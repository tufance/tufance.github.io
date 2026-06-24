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
