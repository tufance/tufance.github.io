import { fetchYahooQuote } from "./yahoo";
import { fetchTefasFund } from "./tefas";
import { buildRates } from "./rates";
import { readUserEmail } from "./auth";
import { getPortfolio, upsertPortfolio } from "./store";
import type { Env, PriceEntry, PricesResponse, Rates, PortfolioResponse } from "./types";

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

const SYMBOL_RE = /^[A-Z0-9.\-=]+$/;

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(s => s.length > 0 && SYMBOL_RE.test(s));
}

async function handlePrices(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const yahooSymbols = parseSymbols(url.searchParams.get("yahoo"));
  const tefasFunds = parseSymbols(url.searchParams.get("tefas"));

  const errors: Record<string, string> = {};
  let rates: Rates | null = null;
  try { rates = await buildRates(fetchYahooQuote); }
  catch (e) { errors._rates = (e as Error).message || "upstream_error"; }

  const [yahooResults, tefasResults] = await Promise.all([
    Promise.allSettled(yahooSymbols.map(sym => fetchYahooQuote(sym).then(q => [sym, q] as const))),
    Promise.allSettled(tefasFunds.map(code => fetchTefasFund(code).then(p => [code, p] as const))),
  ]);

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

  const body: PricesResponse = { updatedAt: new Date().toISOString(), rates, prices, errors };
  return jsonResponse(body, 200, { "cache-control": "public, max-age=60" });
}

async function handleGetData(request: Request, env: Env): Promise<Response> {
  const email = readUserEmail(request);
  if (!email) return new Response("unauthorized", { status: 401 });
  const row = await getPortfolio(env.DB, email);
  const body: PortfolioResponse = {
    email,
    data: row ? JSON.parse(row.data) : null,
    updatedAt: row?.updated_at ?? null,
  };
  return jsonResponse(body);
}

async function handlePutData(request: Request, env: Env): Promise<Response> {
  const email = readUserEmail(request);
  if (!email) return new Response("unauthorized", { status: 401 });
  let payload: { data?: unknown };
  try { payload = await request.json(); }
  catch { return jsonResponse({ error: "invalid_json" }, 400); }
  if (!payload || typeof payload.data !== "object" || payload.data === null) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const dataJson = JSON.stringify(payload.data);
  const updatedAt = await upsertPortfolio(env.DB, email, dataJson);
  return jsonResponse({ updatedAt });
}

function handleAuthLogin(env: Env): Response {
  if (!env.CF_TEAM_NAME || !env.CF_ACCESS_AUD) {
    return new Response("access_not_configured", { status: 503 });
  }
  const target = `https://${env.CF_TEAM_NAME}.cloudflareaccess.com/cdn-cgi/access/login/${env.CF_ACCESS_AUD}?redirect_url=/`;
  return Response.redirect(target, 302);
}

function handleAuthLogout(request: Request): Response {
  const origin = new URL(request.url).origin;
  return Response.redirect(`${origin}/cdn-cgi/access/logout`, 302);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/prices") {
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      let response = await cache.match(cacheKey);
      if (response) return response;
      response = await handlePrices(request);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    if (path === "/data") {
      if (request.method === "GET") return handleGetData(request, env);
      if (request.method === "PUT") return handlePutData(request, env);
      return new Response("method_not_allowed", { status: 405 });
    }

    if (path === "/auth/login") return handleAuthLogin(env);
    if (path === "/auth/logout") return handleAuthLogout(request);

    return env.ASSETS.fetch(request);
  },
};
