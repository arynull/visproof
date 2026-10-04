import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export async function ensureBrowser() {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (err) {
    const e = new Error("Chromium is missing. Run: npx playwright install chromium");
    e.cause = err;
    throw e;
  }
}

export function resolveTarget(input) {
  if (/^https?:\/\//i.test(String(input))) {
    return { kind: "url", url: String(input) };
  }
  const abs = path.resolve(String(input));
  if (!fs.existsSync(abs)) {
    const err = new Error(`File not found: ${input}`);
    err.code = "ENOENT";
    throw err;
  }
  return { kind: "file", url: "file://" + abs, path: abs };
}
