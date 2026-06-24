import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { fetchYahooQuote } from "../src/yahoo";

describe("fetchYahooQuote", () => {
  it("returns price and currency for a valid Yahoo symbol", async () => {
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS", () =>
        HttpResponse.json({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 332.0,
                  currency: "TRY",
                },
              },
            ],
            error: null,
          },
        })
      )
    );

    const quote = await fetchYahooQuote("THYAO.IS");
    expect(quote).toEqual({ price: 332.0, currency: "TRY" });
  });

  it("throws symbol_not_found when Yahoo returns empty result", async () => {
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/XYZ.IS", () =>
        HttpResponse.json({ chart: { result: null, error: { code: "Not Found" } } })
      )
    );
    await expect(fetchYahooQuote("XYZ.IS")).rejects.toThrow("symbol_not_found");
  });

  it("throws yahoo_http_429 when rate-limited", async () => {
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/RATE.IS", () =>
        HttpResponse.json({}, { status: 429 })
      )
    );
    await expect(fetchYahooQuote("RATE.IS")).rejects.toThrow("yahoo_http_429");
  });

  it("throws on unsupported currency", async () => {
    server.use(
      http.get("https://query1.finance.yahoo.com/v8/finance/chart/JPY.T", () =>
        HttpResponse.json({
          chart: {
            result: [{ meta: { regularMarketPrice: 100, currency: "JPY" } }],
            error: null,
          },
        })
      )
    );
    await expect(fetchYahooQuote("JPY.T")).rejects.toThrow("yahoo_unsupported_currency_JPY");
  });
});
