import { describe, it, expect } from "vitest";
import { readUserEmail } from "../src/auth";

describe("readUserEmail", () => {
  it("returns email from Cf-Access-Authenticated-User-Email header", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "tufan@example.com" }
    });
    expect(readUserEmail(req)).toBe("tufan@example.com");
  });

  it("returns null when header missing", () => {
    const req = new Request("https://x/");
    expect(readUserEmail(req)).toBeNull();
  });

  it("returns null for empty string", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "" }
    });
    expect(readUserEmail(req)).toBeNull();
  });

  it("trims whitespace", () => {
    const req = new Request("https://x/", {
      headers: { "Cf-Access-Authenticated-User-Email": "  tufan@example.com  " }
    });
    expect(readUserEmail(req)).toBe("tufan@example.com");
  });
});
