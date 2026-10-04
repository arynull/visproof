import fs from "node:fs";
import path from "node:path";

export function defaultTokens() {
  return {
    colors: {
      white: "#ffffff",
      "slate-900": "#0f172a",
      "slate-600": "#475569",
      "slate-100": "#f1f5f9",
      "slate-200": "#e2e8f0",
      "blue-600": "#2563eb",
      "blue-700": "#1d4ed8",
      "green-600": "#16a34a",
    },
    typeScale: { base: 16, small: 14, h3: 24, h2: 36, h1: 48, body: 16 },
    spacing: [0, 4, 8, 12, 16, 24, 32, 48, 64],
    radii: { sm: "4px", md: "8px", lg: "12px" },
    shadows: { sm: "0 1px 2px rgba(0,0,0,0.05)", md: "0 4px 6px rgba(0,0,0,0.1)" },
  };
}

export function initDesignPackage(dir = "design-system") {
  if (fs.existsSync(dir)) {
    const err = new Error(`Target exists: ${dir}`);
    err.code = "EEXIST";
    throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify(defaultTokens(), null, 2) + "\n");
  fs.writeFileSync(
    path.join(dir, "components.md"),
    `# Components\n\n## Button\n- Minimum size 24x24px (44px preferred).\n- Use \`blue-600\` background with white text.\n- Border radius 8px, padding 14px 28px.\n\n## Card\n- Background \`slate-100\`, padding 24px, radius 12px.\n- Heading \`slate-900\`, body \`slate-600\`.\n\n## Heading\n- H1 48px, H2 36px, H3 24px, color \`slate-900\`.\n- Keep headlines wrapped, never fixed-width nowrap.\n\n## Form\n- Inputs min-height 44px, labels \`slate-900\` 16px.\n- Help text \`slate-600\` with 4.5:1 contrast minimum.\n`
  );
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `# Design system\n\nTokens in \`tokens.json\` define the allowed palette, type scale, spacing, radii and shadows.\n\n- Keep page colors within \`colors\` so checks stay quiet.\n- Follow \`components.md\` for button, card, heading and form usage.\n`
  );
  return dir;
}

export function loadTokens(dir = "design-system") {
  try {
    const file = path.join(dir, "tokens.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
