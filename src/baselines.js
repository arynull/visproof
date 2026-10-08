import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export function baselineDir(outDir) {
  return path.join(outDir, "baselines");
}

export function readBaselineManifest(outDir) {
  try {
    const file = path.join(baselineDir(outDir), "baselines.json");
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw;
  } catch {
    return [];
  }
}

export function writeBaselineManifest(outDir, entries) {
  const dir = baselineDir(outDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "baselines.json");
  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\n");
}

function slugify(s) {
  const out = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "page";
}

export function pageSlugFor(target) {
  try {
    const t = target || {};
    if (t.kind === "url" && typeof t.url === "string") {
      const u = new URL(t.url);
      return slugify(u.hostname + u.pathname);
    }
    const raw = typeof t.path === "string" && t.path ? t.path : String(t.url || "");
    return slugify(path.basename(raw).replace(/\.[^.]*$/, ""));
  } catch {
    return "page";
  }
}

export function baselineFileName(slug, label) {
  return `${slug}-${label}.png`;
}

export function diffFileName(slug, label) {
  return `diff-${slug}-${label}.png`;
}

export function mergeBaselineManifest(outDir, pageSlug, newEntries) {
  const kept = readBaselineManifest(outDir).filter((e) => e && e.page !== pageSlug);
  kept.push(...(newEntries || []));
  writeBaselineManifest(outDir, kept);
}

export function entryFor(label, pngPath, page) {
  const bytes = fs.readFileSync(pngPath);
  const img = PNG.sync.read(bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const entry = {
    label,
    file: path.basename(pngPath),
    width: img.width,
    height: img.height,
    sha256,
    approvedAt: new Date().toISOString(),
  };
  if (typeof page === "string" && page) entry.page = page;
  return entry;
}

export function writeDiffPng(baselinePngPath, currentPngPath, diffOutPath, { threshold } = {}) {
  const img1 = PNG.sync.read(fs.readFileSync(baselinePngPath));
  const img2 = PNG.sync.read(fs.readFileSync(currentPngPath));
  const th = threshold ?? 0.1;
  if (img1.width !== img2.width || img1.height !== img2.height) {
    const width = img2.width;
    const height = img2.height;
    const diff = new PNG({ width, height });
    img2.data.copy(diff.data);
    fs.mkdirSync(path.dirname(diffOutPath), { recursive: true });
    fs.writeFileSync(diffOutPath, PNG.sync.write(diff));
    const totalPixels = width * height;
    return { diffPixels: totalPixels, totalPixels, diffPct: 100, width, height };
  }
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: th });
  fs.mkdirSync(path.dirname(diffOutPath), { recursive: true });
  fs.writeFileSync(diffOutPath, PNG.sync.write(diff));
  const totalPixels = width * height;
  const diffPct = totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100;
  return { diffPixels, totalPixels, diffPct, width, height };
}

export function compareBaselineToCurrent(baselinePngPath, currentPngPath, { threshold, maxDiffPct } = {}) {
  const baseline = PNG.sync.read(fs.readFileSync(baselinePngPath));
  const current = PNG.sync.read(fs.readFileSync(currentPngPath));
  const baselineWidth = baseline.width;
  const baselineHeight = baseline.height;
  const width = current.width;
  const height = current.height;
  const totalPixels = width * height;
  if (baselineWidth !== width || baselineHeight !== height) {
    return {
      regression: true,
      dimensionMismatch: true,
      diffPixels: totalPixels,
      totalPixels,
      diffPct: 100,
      width,
      height,
      baselineWidth,
      baselineHeight,
    };
  }
  const th = threshold ?? 0.1;
  const max = maxDiffPct ?? 0.1;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold: th });
  const diffPct = totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100;
  return {
    regression: diffPct > max,
    dimensionMismatch: false,
    diffPixels,
    totalPixels,
    diffPct,
    width,
    height,
    baselineWidth,
    baselineHeight,
  };
}
