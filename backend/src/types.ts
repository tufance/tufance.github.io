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
  CF_TEAM_NAME: string;
  CF_ACCESS_AUD: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  DB: D1Database;
}

export interface PortfolioRow {
  email: string;
  data: string;
  updated_at: string;
}

export interface PortfolioResponse {
  email: string;
  data: Record<string, unknown> | null;
  updatedAt: string | null;
}
