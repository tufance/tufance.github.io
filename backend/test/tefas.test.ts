import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { fetchTefasFund } from "../src/tefas";

describe("fetchTefasFund", () => {
  it("returns latest FIYAT for a fund", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/DB/BindHistoryInfo", () =>
        HttpResponse.json({
          data: [
            { TARIH: "23.06.2026", FIYAT: 3.04 },
            { TARIH: "24.06.2026", FIYAT: 3.05 },
          ],
        })
      )
    );
    const price = await fetchTefasFund("AFA");
    expect(price).toBe(3.05);
  });

  it("throws fund_not_found when data is empty", async () => {
    server.use(
      http.post("https://www.tefas.gov.tr/api/DB/BindHistoryInfo", () =>
        HttpResponse.json({ data: [] })
      )
    );
    await expect(fetchTefasFund("XXX")).rejects.toThrow("fund_not_found");
  });
});
