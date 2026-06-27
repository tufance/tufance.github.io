const HEADER = "Cf-Access-Authenticated-User-Email";

export function readUserEmail(req: Request): string | null {
  const raw = req.headers.get(HEADER);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
