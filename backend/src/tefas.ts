const TEFAS_URL = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo";

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export async function fetchTefasFund(code: string): Promise<number> {
  const today = new Date();
  const fortnightAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const body = new URLSearchParams({
    fontip: "YAT",
    sfontur: "",
    fonkod: code,
    fongrup: "",
    bastarih: fmtDate(fortnightAgo),
    bittarih: fmtDate(today),
    fonturkod: "",
    fonunvantip: "",
  });
  const res = await fetch(TEFAS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "portfoy-api/1.0",
    },
    body,
  });
  if (!res.ok) throw new Error(`tefas_http_${res.status}`);
  const data = (await res.json()) as { data: Array<{ TARIH: string; FIYAT: number }> };
  if (!data.data?.length) throw new Error("fund_not_found");
  return data.data[data.data.length - 1].FIYAT;
}
