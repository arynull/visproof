import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig, parseViewportString } from "./config.js";
import { ensureBrowser, resolveTarget } from "./render.js";
import { writeReports, writeGalleryReport } from "./report.js";
import { initDesignPackage } from "./design.js";
import { checkPage } from "./checkflow.js";
import { initGalleryPackage, listGalleryFixtures } from "./gallery.js";
import { baselineDir, baselineFileName, entryFor, mergeBaselineManifest, pageSlugFor } from "./baselines.js";

const program = new Command();
program.name("visproof").description("Headless visual QA for HTML pages").version("0.3.0");

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
  const outDir = opts.out || loadConfig().reportDir || "./visproof-reports";
  const r = await checkPage(html, opts, { outDir });
  const defects = r.defects;
  const screenshots = r.screenshots;
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
    const total = defects.length;
    const errors = defects.filter((d) => d.severity === "error").length;
    const shown = opts.limit ? defects.slice(0, opts.limit) : defects;
    if (opts.json) {
      console.log(JSON.stringify(shown, null, 2));
    }
    console.error(`Found ${total} defects (${errors} errors). Reports in ${outDir}`);
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
  .option("--limit <n>", "cap number of defects listed (default: show all)")
  .action(async (html, opts) => {
    if (opts.limit !== undefined) {
      const n = Number(opts.limit);
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`Invalid limit: ${opts.limit}, expected a positive integer`);
        process.exit(2);
      }
      opts.limit = n;
    }
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

const gallery = program.command("gallery").description("Component gallery QA");

gallery
  .command("init")
  .description("Scaffold a component gallery")
  .option("--dir <dir>", "target directory", "gallery")
  .action((opts) => {
    const dir = opts.dir || "gallery";
    if (fs.existsSync(dir)) {
      console.error(`Target exists: ${dir}`);
      process.exit(2);
    }
    initGalleryPackage(dir);
    console.log(`Created ${dir}`);
  });

gallery
  .command("check")
  .description("Check every component fixture")
  .option("--dir <dir>", "gallery directory", "gallery")
  .option("--out <dir>", "output directory")
  .option("--viewport <vp>", "viewport WxH")
  .action(async (opts) => {
    const dir = opts.dir || "gallery";
    if (!fs.existsSync(dir)) {
      console.error(`Gallery not found: ${dir}`);
      process.exit(2);
    }
    const fixtures = listGalleryFixtures(dir);
    if (fixtures.length === 0) {
      console.error(`No fixtures in ${dir}`);
      process.exit(2);
    }
    const config = loadConfig();
    const outDir = opts.out || config.reportDir || "./visproof-reports";
    const galleryOut = path.join(outDir, "gallery");
    fs.mkdirSync(galleryOut, { recursive: true });
    const results = [];
    for (const f of fixtures) {
      const r = await checkPage(f.file, opts, { outDir: galleryOut, pngPrefix: `${f.component}-`, baselineRoot: outDir });
      const errors = r.defects.filter((d) => d.severity === "error").length;
      const warns = r.defects.filter((d) => d.severity === "warn").length;
      const infos = r.defects.filter((d) => d.severity === "info").length;
      const fixtureRel = path.relative(process.cwd(), path.resolve(f.file));
      results.push({ component: f.component, fixture: fixtureRel, errors, warns, infos, defects: r.defects });
    }
    await writeGalleryReport(results, galleryOut);
    for (const res of results) {
      console.error(`${res.component}: ${res.errors} errors, ${res.warns} warns`);
    }
    const hasError = results.some((res) => res.errors > 0);
    if (hasError) process.exit(1);
    else process.exit(0);
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
