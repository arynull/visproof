import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const DEFAULT_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 390, height: 844, label: "390x844" },
];

export const DEFAULT_RULES = {
  "text-overflow": { level: "error" },
  "element-collision": { level: "error" },
  "clipped-content": { level: "error" },
  "low-contrast": { level: "warn", minRatio: 4.5 },
  "small-tap-target": { level: "warn", minSize: 24 },
  "off-viewport": { level: "error" },
  "off-palette": { level: "info" },
  "visual-regression": { level: "error", maxDiffPct: 0.1 },
};

export const DEFAULT_CONFIG = {
  viewports: DEFAULT_VIEWPORTS,
  rules: DEFAULT_RULES,
  reportDir: "./visproof-reports",
  designDir: "design-system",
};

export function parseViewportString(str) {
  const m = String(str).trim().match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) throw new Error(`Invalid viewport: ${str}`);
  const width = Number(m[1]);
  const height = Number(m[2]);
  return { width, height, label: `${width}x${height}` };
}

export function normalizeViewport(v) {
  if (typeof v === "string") return parseViewportString(v);
  if (v && typeof v === "object" && v.width && v.height) {
    return { width: Number(v.width), height: Number(v.height), label: v.label || `${v.width}x${v.height}` };
  }
  throw new Error(`Invalid viewport: ${JSON.stringify(v)}`);
}

function normalizeRuleValue(v) {
  if (typeof v === "string") return { level: v };
  if (v && typeof v === "object") return { ...v };
  return {};
}

export function normalizeRules(rules) {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_RULES)) {
    out[k] = { ...v };
  }
  if (rules && typeof rules === "object") {
    for (const [k, v] of Object.entries(rules)) {
      const n = normalizeRuleValue(v);
      out[k] = { ...(out[k] || {}), ...n };
    }
  }
  return out;
}

export function loadConfig(cwd = process.cwd()) {
  const base = {
    viewports: DEFAULT_VIEWPORTS.map((v) => ({ ...v })),
    rules: normalizeRules({}),
    reportDir: DEFAULT_CONFIG.reportDir,
    designDir: DEFAULT_CONFIG.designDir,
  };
  const file = path.join(cwd, ".visproof.yml");
  if (!fs.existsSync(file)) return base;
  let raw = {};
  try {
    raw = yaml.load(fs.readFileSync(file, "utf-8")) || {};
  } catch {
    return base;
  }
  if (Array.isArray(raw.viewports) && raw.viewports.length > 0) {
    try {
      base.viewports = raw.viewports.map(normalizeViewport);
    } catch {
      base.viewports = DEFAULT_VIEWPORTS.map((v) => ({ ...v }));
    }
  }
  if (raw.rules && typeof raw.rules === "object") {
    base.rules = normalizeRules(raw.rules);
  }
  if (typeof raw.reportDir === "string" && raw.reportDir.length > 0) base.reportDir = raw.reportDir;
  if (typeof raw.designDir === "string" && raw.designDir.length > 0) base.designDir = raw.designDir;
  if (typeof raw.reportdir === "string") base.reportDir = raw.reportdir;
  return base;
}
