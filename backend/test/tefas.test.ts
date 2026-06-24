import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { fetchTefasFund } from "../src/tefas";

describe("fetchTefasFund", () => {
  it("returns latest fiyat for a fund", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir", () =>
        HttpResponse.json({
          errorCode: null,
          errorMessage: null,
          resultList: [
            { tarih: "2026-06-23", fiyat: 3.04 },
            { tarih: "2026-06-24", fiyat: 3.05 },
          ],
        })
      )
    );
    const price = await fetchTefasFund("AFA");
    expect(price).toBe(3.05);
  });

  it("throws fund_not_found when resultList is empty", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir", () =>
        HttpResponse.json({ errorCode: null, errorMessage: null, resultList: [] })
      )
    );
    await expect(fetchTefasFund("XXX")).rejects.toThrow("fund_not_found");
  });
});
