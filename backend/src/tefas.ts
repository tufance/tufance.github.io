// TEFAS migrated to a Next.js app in 2026. The old /api/DB/BindHistoryInfo endpoint
// was disabled (HTTP 404 ERR-006). The new endpoint is the Next.js proxy route that
// forwards to tefasws.takasbank.com.tr/fug/fonport/portal/service.
const TEFAS_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir";

export async function fetchTefasFund(code: string): Promise<number> {
  const res = await fetch(TEFAS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/plain, */*",
      "origin": "https://www.tefas.gov.tr",
      "referer": `https://www.tefas.gov.tr/tr/fon/${code}`,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ fonKodu: code, periyod: 1 }),
  });
  if (!res.ok) throw new Error(`tefas_http_${res.status}`);
  const data = (await res.json()) as {
    errorCode: string | null;
    errorMessage: string | null;
    resultList: Array<{ tarih: string; fiyat: number }>;
  };
  if (!data.resultList?.length) throw new Error("fund_not_found");
  return data.resultList[data.resultList.length - 1].fiyat;
}
