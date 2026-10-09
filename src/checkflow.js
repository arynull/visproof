import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig, parseViewportString } from "./config.js";
import { ensureBrowser, resolveTarget } from "./render.js";
import { collectLayoutData, runAllChecks } from "./checks.js";
import { annotatePage } from "./report.js";
import { loadTokens } from "./design.js";
import { baselineDir, baselineFileName, compareBaselineToCurrent, diffFileName, pageSlugFor, writeDiffPng } from "./baselines.js";

export async function checkPage(html, opts = {}, { outDir, pngPrefix = "", baselineRoot = outDir } = {}) {
  const config = loadConfig();
  let viewports = config.viewports;
  if (opts.viewport) {
    try {
      viewports = [parseViewportString(opts.viewport)];
    } catch {
      console.error(`Invalid viewport: ${opts.viewport}, expected WxH`);
      process.exit(2);
    }
  }
  let target;
  try {
    target = resolveTarget(html);
  } catch {
    console.error(`File not found: ${html}`);
    process.exit(2);
  }
  try {
    await ensureBrowser();
  } catch {
    console.error("npx playwright install chromium");
    process.exit(2);
  }
  const slug = pageSlugFor(target);
  const designDir = config.designDir || "design-system";
  const tokens = loadTokens(designDir);
  const vrRaw = config.rules ? config.rules["visual-regression"] : undefined;
  let vrCfg = { level: "error", maxDiffPct: 0.1 };
  if (typeof vrRaw === "string") {
    vrCfg = { ...vrCfg, level: vrRaw };
  } else if (vrRaw && typeof vrRaw === "object") {
    if (typeof vrRaw.level === "string") vrCfg.level = vrRaw.level;
    if (vrRaw.maxDiffPct != null) vrCfg.maxDiffPct = Number(vrRaw.maxDiffPct);
  }
  const vrEnabled = vrCfg.level !== "off" && vrCfg.level !== "none";
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const defects = [];
  const screenshots = [];
  try {
    for (const vp of viewports) {
      const label = vp.label || `${vp.width}x${vp.height}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
      const elements = await collectLayoutData(page);
      const vpDefects = runAllChecks(elements, config, vp, tokens);
      defects.push(...vpDefects);
      const annotatedFile = path.join(outDir, `${pngPrefix}${label}.png`);
      await annotatePage(page, vpDefects, annotatedFile);
      screenshots.push({ label: `${pngPrefix}${label}`, file: annotatedFile, viewport: vp });
      if (vrEnabled) {
        const baselinePath = path.join(baselineDir(baselineRoot), baselineFileName(slug, label));
        if (fs.existsSync(baselinePath)) {
          const diffPath = path.join(baselineDir(baselineRoot), diffFileName(slug, label));
          try {
            writeDiffPng(baselinePath, annotatedFile, diffPath, {});
            const cmp = compareBaselineToCurrent(baselinePath, annotatedFile, {
              maxDiffPct: vrCfg.maxDiffPct,
            });
            if (cmp.regression) {
              const detail = cmp.dimensionMismatch
                ? `Baseline ${label} is ${cmp.baselineWidth}x${cmp.baselineHeight}, render is ${cmp.width}x${cmp.height} (dimensions differ)`
                : `${cmp.diffPct.toFixed(2)}% of pixels differ from approved baseline (${cmp.diffPixels} px)`;
              defects.push({
                rule: "visual-regression",
                severity: vrCfg.level,
                viewport: label,
                selector: "viewport",
                box: { x: 0, y: 0, w: cmp.width, h: cmp.height },
                detail,
                screenshot: path.resolve(diffPath),
              });
            }
            screenshots.push({ label: `diff-${slug}-${label}`, file: diffPath, viewport: vp });
          } catch {
            // ignore baseline diff failures
          }
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return { defects, screenshots, target, slug };
}
