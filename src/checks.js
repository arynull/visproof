export async function collectLayoutData(page) {
  return await page.evaluate(() => {
    function segPath(el) {
      const tag = el.tagName.toLowerCase();
      let name = tag;
      if (el.id) name += `#${el.id}`;
      else if (typeof el.className === "string" && el.className.trim()) {
        const c = el.className.trim().split(/\s+/)[0];
        if (c) name += `.${c}`;
      }
      if (el.parentElement) {
        const sibs = Array.from(el.parentElement.children).filter((x) => x.tagName === el.tagName);
        if (sibs.length > 1) name += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      return name;
    }
    function cssPath(el) {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 8) {
        parts.unshift(segPath(cur));
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }
    const out = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "head", "meta", "link", "title", "noscript"].includes(tag)) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (rect.width === 0 || rect.height === 0) continue;
      let hasText = false;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.textContent.trim().length > 0) {
          hasText = true;
          break;
        }
      }
      const isInteractive = tag === "a" || tag === "button" || tag === "input" || el.getAttribute("role") === "button";
      let overflowHiddenAncestor = null;
      let p = el.parentElement;
      while (p) {
        const ps = getComputedStyle(p);
        if (ps.overflow === "hidden" || ps.overflowX === "hidden" || ps.overflowY === "hidden") {
          const r = p.getBoundingClientRect();
          overflowHiddenAncestor = { x: r.x, y: r.y, w: r.width, h: r.height, selector: cssPath(p) };
          break;
        }
        p = p.parentElement;
      }
      out.push({
        selector: cssPath(el),
        tag,
        isInteractive,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        fontSize: parseFloat(style.fontSize) || 16,
        color: style.color,
        backgroundColor: style.backgroundColor,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        hasText,
        overflowHiddenAncestor,
        textOverflow: style.textOverflow,
      });
    }
    return out;
  });
}

export function getViewportInfo(viewport) {
  if (!viewport) return { width: 1440, height: 900, label: "1440x900" };
  if (typeof viewport === "string") {
    const m = viewport.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (m) return { width: Number(m[1]), height: Number(m[2]), label: `${m[1]}x${m[2]}` };
    return { width: 1440, height: 900, label: viewport };
  }
  const w = Number(viewport.width || 1440);
  const h = Number(viewport.height || 900);
  return { width: w, height: h, label: viewport.label || `${w}x${h}` };
}

export function getViewportLabel(viewport) {
  return getViewportInfo(viewport).label;
}

function ruleLevel(cfg, fallback) {
  if (typeof cfg === "string") return cfg;
  if (cfg && typeof cfg === "object" && typeof cfg.level === "string") return cfg.level;
  return fallback;
}

export function parseColor(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  if (s === "" || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
  }
  if ((m = s.match(/^#([0-9a-f]{6})$/))) {
    const h = m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  if ((m = s.match(/^rgba?\(\s*([^)]+)\)/))) {
    const parts = m[1].split(",").map((x) => x.trim());
    if (parts.length < 3) return null;
    const num = (v) => {
      if (v.endsWith("%")) return Math.round((Number(v.slice(0, -1)) / 100) * 255);
      return Number(v);
    };
    const r = num(parts[0]);
    const g = num(parts[1]);
    const b = num(parts[2]);
    let a = 1;
    if (parts.length >= 4) a = Number(parts[3]);
    if ([r, g, b, a].some((x) => Number.isNaN(x))) return null;
    return { r, g, b, a };
  }
  const named = {
    white: "#ffffff",
    black: "#000000",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
  };
  if (named[s]) return parseColor(named[s]);
  return null;
}

function toWhite(c) {
  if (!c) return null;
  if (c.a >= 1) return { r: c.r, g: c.g, b: c.b, a: 1 };
  return {
    r: Math.round(c.r * c.a + 255 * (1 - c.a)),
    g: Math.round(c.g * c.a + 255 * (1 - c.a)),
    b: Math.round(c.b * c.a + 255 * (1 - c.a)),
    a: 1,
  };
}

function lin(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(rgb) {
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(fgStr, bgStr) {
  const fg = toWhite(parseColor(fgStr));
  const bg = toWhite(parseColor(bgStr));
  if (!fg || !bg) return null;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function normalizeToHex(str) {
  const c = parseColor(str);
  if (!c) return null;
  const o = toWhite(c);
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(o.r)}${h(o.g)}${h(o.b)}`.toLowerCase();
}

function rectOf(el) {
  return el.rect || el.box || null;
}

export function detectTextOverflow(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "error");
  if (level === "off" || level === "none") return [];
  const label = getViewportLabel(viewport);
  const out = [];
  for (const el of elements) {
    if (!el.hasText) continue;
    const sw = el.scrollWidth ?? 0;
    const cw = el.clientWidth ?? 0;
    if (sw > cw + 2) {
      if ((el.textOverflow || "") === "ellipsis") continue;
      const r = rectOf(el);
      if (!r) continue;
      out.push({
        rule: "text-overflow",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Text overflows: scrollWidth ${sw} > clientWidth ${cw}`,
      });
    }
  }
  return out;
}

export function detectElementCollision(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "error");
  if (level === "off" || level === "none") return [];
  const label = getViewportLabel(viewport);
  const out = [];
  const els = elements.filter((e) => e.hasText && rectOf(e));
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i];
      const b = els[j];
      if (a.selector && b.selector) {
        if (a.selector === b.selector) continue;
        if (b.selector.startsWith(a.selector + " >") || a.selector.startsWith(b.selector + " >")) continue;
      }
      const ra = rectOf(a);
      const rb = rectOf(b);
      const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
      const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
      if (ox > 4 && oy > 4) {
        out.push({
          rule: "element-collision",
          severity: level,
          viewport: label,
          selector: `${a.selector} <-> ${b.selector}`,
          box: { ...ra },
          detail: `Text elements overlap by ${Math.round(ox)}x${Math.round(oy)}px`,
        });
      }
    }
  }
  return out;
}
export const detectCollisions = detectElementCollision;

export function detectClippedContent(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "error");
  if (level === "off" || level === "none") return [];
  const label = getViewportLabel(viewport);
  const out = [];
  for (const el of elements) {
    const anc = el.overflowHiddenAncestor;
    if (!anc) continue;
    if (el.selector && anc.selector && el.selector === anc.selector) continue;
    const r = rectOf(el);
    if (!r) continue;
    if (r.x < anc.x - 2 || r.y < anc.y - 2 || r.x + r.w > anc.x + anc.w + 2 || r.y + r.h > anc.y + anc.h + 2) {
      out.push({
        rule: "clipped-content",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Content extends beyond overflow:hidden ancestor ${anc.selector}`,
      });
    }
  }
  return out;
}

export function detectLowContrast(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "warn");
  if (level === "off" || level === "none") return [];
  const minRatio = ruleConfig && typeof ruleConfig === "object" && ruleConfig.minRatio != null ? Number(ruleConfig.minRatio) : 4.5;
  const label = getViewportLabel(viewport);
  const out = [];
  for (const el of elements) {
    if (!el.hasText) continue;
    const ratio = contrastRatio(el.color, el.backgroundColor);
    if (ratio == null) continue;
    if (ratio < minRatio) {
      const r = rectOf(el);
      if (!r) continue;
      out.push({
        rule: "low-contrast",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Contrast ${ratio.toFixed(2)}:1 below ${minRatio}:1 (${el.color} on ${el.backgroundColor})`,
      });
    }
  }
  return out;
}

export function detectSmallTapTarget(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "warn");
  if (level === "off" || level === "none") return [];
  const minSize = ruleConfig && typeof ruleConfig === "object" && ruleConfig.minSize != null ? Number(ruleConfig.minSize) : 24;
  const vp = getViewportInfo(viewport);
  if (vp.width > 600) return [];
  const label = vp.label;
  const out = [];
  for (const el of elements) {
    if (!el.isInteractive) continue;
    const r = rectOf(el);
    if (!r) continue;
    if (r.w === 0 || r.h === 0) continue;
    if (r.w < minSize || r.h < minSize) {
      out.push({
        rule: "small-tap-target",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Tap target ${Math.round(r.w)}x${Math.round(r.h)}px smaller than ${minSize}px`,
      });
    }
  }
  return out;
}

export function detectOffViewport(elements, ruleConfig = {}, viewport) {
  const level = ruleLevel(ruleConfig, "error");
  if (level === "off" || level === "none") return [];
  const vp = getViewportInfo(viewport);
  const label = vp.label;
  const out = [];
  for (const el of elements) {
    const r = rectOf(el);
    if (!r) continue;
    if (r.w === 0 || r.h === 0) continue;
    if (r.x + r.w < -8 || r.x > vp.width + 8 || r.y + r.h < -8) {
      out.push({
        rule: "off-viewport",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Element fully outside viewport ${vp.width}x${vp.height}`,
      });
    }
  }
  return out;
}

export function detectOffPalette(elements, ruleConfig = {}, viewport, tokens) {
  const level = ruleLevel(ruleConfig, "info");
  if (level === "off" || level === "none") return [];
  if (!tokens || !tokens.colors) return [];
  const label = getViewportLabel(viewport);
  const palette = new Set(
    Object.values(tokens.colors).map((c) => normalizeToHex(c)).filter(Boolean).map((s) => s.toLowerCase())
  );
  const out = [];
  for (const el of elements) {
    const r = rectOf(el);
    if (!r) continue;
    const fg = normalizeToHex(el.color);
    if (fg && !palette.has(fg.toLowerCase())) {
      out.push({
        rule: "off-palette",
        severity: level,
        viewport: label,
        selector: el.selector,
        box: { ...r },
        detail: `Color ${fg} not in design tokens`,
      });
      continue;
    }
    const bgParsed = parseColor(el.backgroundColor);
    if (bgParsed && bgParsed.a > 0.05) {
      const bg = normalizeToHex(el.backgroundColor);
      if (bg && !palette.has(bg.toLowerCase())) {
        out.push({
          rule: "off-palette",
          severity: level,
          viewport: label,
          selector: el.selector,
          box: { ...r },
          detail: `Background ${bg} not in design tokens`,
        });
      }
    }
  }
  return out;
}

function normRule(rules, key, fallback) {
  const v = rules ? rules[key] : undefined;
  if (typeof v === "string") return { level: v };
  if (v && typeof v === "object") return v;
  return { level: fallback };
}

export function runAllChecks(elements, config, viewport, tokens) {
  const rules = (config && config.rules) || {};
  const vp = getViewportInfo(viewport);
  const out = [];
  out.push(...detectTextOverflow(elements, { level: "error", ...normRule(rules, "text-overflow", "error") }, vp));
  out.push(...detectElementCollision(elements, { level: "error", ...normRule(rules, "element-collision", "error") }, vp));
  out.push(...detectClippedContent(elements, { level: "error", ...normRule(rules, "clipped-content", "error") }, vp));
  out.push(...detectLowContrast(elements, { level: "warn", minRatio: 4.5, ...normRule(rules, "low-contrast", "warn") }, vp));
  out.push(...detectSmallTapTarget(elements, { level: "warn", minSize: 24, ...normRule(rules, "small-tap-target", "warn") }, vp));
  out.push(...detectOffViewport(elements, { level: "error", ...normRule(rules, "off-viewport", "error") }, vp));
  out.push(...detectOffPalette(elements, { level: "info", ...normRule(rules, "off-palette", "info") }, vp, tokens));
  return out;
}
export const runChecks = runAllChecks;
export const checkLayout = runAllChecks;
