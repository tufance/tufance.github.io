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
