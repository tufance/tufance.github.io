import { beforeEach, describe, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { getPortfolio, upsertPortfolio } from "../src/store";

let mf: Miniflare;
let db: D1Database;

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch: () => new Response('') }",
    d1Databases: { DB: "test-db" },
  });
  db = await mf.getD1Database("DB");
  await db.exec(
    "CREATE TABLE portfolios (email TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);"
  );
});

describe("getPortfolio", () => {
  it("returns null for unknown user", async () => {
    expect(await getPortfolio(db, "x@y.com")).toBeNull();
  });

  it("returns row for known user", async () => {
    await db.prepare("INSERT INTO portfolios VALUES (?, ?, ?)")
      .bind("x@y.com", '{"k":1}', "2026-06-27T00:00:00Z").run();
    const row = await getPortfolio(db, "x@y.com");
    expect(row).toEqual({ data: '{"k":1}', updated_at: "2026-06-27T00:00:00Z" });
  });
});

describe("upsertPortfolio", () => {
  it("inserts when row absent", async () => {
    const ts = await upsertPortfolio(db, "x@y.com", '{"a":1}');
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const row = await getPortfolio(db, "x@y.com");
    expect(row?.data).toBe('{"a":1}');
  });

  it("overwrites when row present", async () => {
    await upsertPortfolio(db, "x@y.com", '{"v":1}');
    await upsertPortfolio(db, "x@y.com", '{"v":2}');
    const row = await getPortfolio(db, "x@y.com");
    expect(row?.data).toBe('{"v":2}');
  });
});
