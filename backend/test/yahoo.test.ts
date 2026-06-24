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
});
