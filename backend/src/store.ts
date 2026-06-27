export interface StoredRow {
  data: string;
  updated_at: string;
}

export async function getPortfolio(db: D1Database, email: string): Promise<StoredRow | null> {
  const row = await db
    .prepare("SELECT data, updated_at FROM portfolios WHERE email = ?")
    .bind(email)
    .first<StoredRow>();
  return row ?? null;
}

export async function upsertPortfolio(
  db: D1Database,
  email: string,
  dataJson: string
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO portfolios (email, data, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
    )
    .bind(email, dataJson, now)
    .run();
  return now;
}
