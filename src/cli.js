import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig, parseViewportString } from "./config.js";
import { ensureBrowser, resolveTarget } from "./render.js";
import { collectLayoutData, runAllChecks } from "./checks.js";
import { writeReports, annotatePage } from "./report.js";
import { initDesignPackage, loadTokens } from "./design.js";
import { baselineDir, baselineFileName, compareBaselineToCurrent, diffFileName, entryFor, mergeBaselineManifest, pageSlugFor, writeDiffPng } from "./baselines.js";

const program = new Command();
program.name("visproof").description("Headless visual QA for HTML pages").version("0.2.0");

program
  .command("init")
  .description("Scaffold a design package")
  .option("--dir <dir>", "target directory", "design-system")
  .action((opts) => {
    const dir = opts.dir || "design-system";
    if (fs.existsSync(dir)) {
      console.error(`Target exists: ${dir}`);
      process.exit(2);
    }
    initDesignPackage(dir);
    console.log(`Created ${dir}`);
  });

program
  .command("render")
  .description("Render HTML to screenshots")
  .argument("<html>", "local path or URL")
  .option("--viewport <vp>", "viewport WxH, e.g. 1440x900")
  .option("--out <dir>", "output directory")
  .action(async (html, opts) => {
    const config = loadConfig();
    let viewports;
    if (opts.viewport) {
      try {
        viewports = [parseViewportString(opts.viewport)];
      } catch {
        console.error(`Invalid viewport: ${opts.viewport}, expected WxH`);
        process.exit(2);
      }
    } else {
      viewports = config.viewports;
    }
    const outDir = opts.out || config.reportDir || "./visproof-reports";
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
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
      for (const vp of viewports) {
        const label = vp.label || `${vp.width}x${vp.height}`;
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
        const file = path.join(outDir, `${label}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.error(`Saved ${file}`);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  });

program
  .command("baseline")
  .description("Capture approved baseline screenshots")
  .argument("<html>", "local path or URL")
  .option("--viewport <vp>", "viewport WxH")
  .option("--out <dir>", "output directory")
  .action(async (html, opts) => {
    const config = loadConfig();
    let viewports;
    if (opts.viewport) {
      try {
        viewports = [parseViewportString(opts.viewport)];
      } catch {
        console.error(`Invalid viewport: ${opts.viewport}, expected WxH`);
        process.exit(2);
      }
    } else {
      viewports = config.viewports;
    }
    const outDir = opts.out || config.reportDir || "./visproof-reports";
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
    const bDir = baselineDir(outDir);
    fs.mkdirSync(bDir, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
      for (const vp of viewports) {
        const label = vp.label || `${vp.width}x${vp.height}`;
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
        const file = path.join(bDir, baselineFileName(slug, label));
        await page.screenshot({ path: file, fullPage: true });
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
    const entries = [];
    for (const vp of viewports) {
      const label = vp.label || `${vp.width}x${vp.height}`;
      const pngPath = path.join(bDir, baselineFileName(slug, label));
      entries.push(entryFor(label, pngPath, slug));
    }
    mergeBaselineManifest(outDir, slug, entries);
    console.error(`${entries.length} baselines written to ${bDir}`);
  });

async function runCheckFlow(html, opts, isGate) {
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
  const outDir = opts.out || config.reportDir || "./visproof-reports";
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
      const annotatedFile = path.join(outDir, `${label}.png`);
      await annotatePage(page, vpDefects, annotatedFile);
      screenshots.push({ label, file: annotatedFile, viewport: vp });
      if (vrEnabled) {
        const baselinePath = path.join(baselineDir(outDir), baselineFileName(slug, label));
        if (fs.existsSync(baselinePath)) {
          const diffPath = path.join(baselineDir(outDir), diffFileName(slug, label));
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
  if (isGate) {
    const errors = defects.filter((d) => d.severity === "error").length;
    if (errors === 0) {
      console.log(`PASS: 0 error defects (${defects.length} total)`);
      process.exit(0);
    } else {
      console.log(`FAIL: ${errors} error defects (${defects.length} total)`);
      process.exit(1);
    }
  } else {
    await writeReports(defects, screenshots, outDir);
    if (opts.json) {
      console.log(JSON.stringify(defects, null, 2));
    } else {
      const errors = defects.filter((d) => d.severity === "error").length;
      console.error(`Found ${defects.length} defects (${errors} errors). Reports in ${outDir}`);
    }
    const hasError = defects.some((d) => d.severity === "error");
    if (hasError) process.exit(1);
  }
}

program
  .command("check")
  .description("Check HTML for visual defects")
  .argument("<html>", "local path or URL")
  .option("--json", "print defect array to stdout")
  .option("--out <dir>", "output directory")
  .option("--viewport <vp>", "viewport WxH")
  .action(async (html, opts) => {
    await runCheckFlow(html, opts, false);
  });

program
  .command("gate")
  .description("Exit 0 iff zero error-severity defects")
  .argument("<html>", "local path or URL")
  .option("--viewport <vp>", "viewport WxH")
  .action(async (html, opts) => {
    await runCheckFlow(html, opts || {}, true);
  });

program.exitOverride();
try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err && (err.code === "commander.version" || err.code === "commander.helpDisplayed")) process.exit(0);
  if (err && err.code && String(err.code).startsWith("commander.")) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
