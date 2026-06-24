import { fetchYahooQuote } from "./yahoo";
import { fetchTefasFund } from "./tefas";
import { buildRates } from "./rates";
import type { Env, PriceEntry, PricesResponse, Rates } from "./types";

function corsHeaders(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

const SYMBOL_RE = /^[A-Z0-9.\-=]+$/;

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && SYMBOL_RE.test(s));
}

async function handlePrices(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const yahooSymbols = parseSymbols(url.searchParams.get("yahoo"));
  const tefasFunds = parseSymbols(url.searchParams.get("tefas"));

  const errors: Record<string, string> = {};
  let rates: Rates | null = null;
  try {
    rates = await buildRates(fetchYahooQuote);
  } catch (e) {
    errors._rates = (e as Error).message || "upstream_error";
  }

  const yahooResults = await Promise.allSettled(
    yahooSymbols.map((sym) => fetchYahooQuote(sym).then((q) => [sym, q] as const))
  );
  const tefasResults = await Promise.allSettled(
    tefasFunds.map((code) => fetchTefasFund(code).then((p) => [code, p] as const))
  );

  const prices: Record<string, PriceEntry> = {};
  for (const r of yahooResults) {
    if (r.status === "fulfilled") {
      const [sym, q] = r.value;
      const entry: PriceEntry = { price: q.price, currency: q.currency, source: "yahoo" };
      if (q.currency === "USD" && rates) entry.tryEquiv = q.price * rates.usdtry;
      else if (q.currency === "EUR" && rates) entry.tryEquiv = q.price * rates.eurtry;
      prices[sym] = entry;
    } else {
      const sym = yahooSymbols[yahooResults.indexOf(r)];
      errors[sym] = (r.reason?.message as string) ?? "upstream_error";
    }
  }
  for (const r of tefasResults) {
    if (r.status === "fulfilled") {
      const [code, p] = r.value;
      prices[code] = { price: p, currency: "TRY", source: "tefas" };
    } else {
      const code = tefasFunds[tefasResults.indexOf(r)];
      errors[code] = (r.reason?.message as string) ?? "upstream_error";
    }
  }

  const body: PricesResponse = {
    updatedAt: new Date().toISOString(),
    rates,
    prices,
    errors,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      ...corsHeaders(env),
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/prices") {
      return new Response("not_found", { status: 404, headers: corsHeaders(env) });
    }
    if (request.method !== "GET") {
      return new Response("method_not_allowed", { status: 405, headers: corsHeaders(env) });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    let response = await cache.match(cacheKey);
    if (response) return response;

    response = await handlePrices(request, env);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
