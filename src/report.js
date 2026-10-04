import fs from "node:fs";
import path from "node:path";

export async function annotatePage(page, defects, outPath) {
  await page.evaluate((defects) => {
    const old = document.getElementById("visproof-overlay");
    if (old) old.remove();
    const W = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const H = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("id", "visproof-overlay");
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:999999;";
    defects.forEach((d, i) => {
      const b = d.box;
      if (!b) return;
      const isErr = d.severity === "error";
      const stroke = isErr ? "#ef4444" : d.severity === "warn" ? "#f59e0b" : "#3b82f6";
      const g = document.createElementNS(svgNS, "g");
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(b.x));
      rect.setAttribute("y", String(b.y));
      rect.setAttribute("width", String(Math.max(b.w, 2)));
      rect.setAttribute("height", String(Math.max(b.h, 2)));
      rect.setAttribute("fill", isErr ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)");
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", "3");
      g.appendChild(rect);
      const cx = Math.max(b.x - 11, 0);
      const cy = Math.max(b.y - 11, 0);
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", String(cx + 11));
      circle.setAttribute("cy", String(cy + 11));
      circle.setAttribute("r", "11");
      circle.setAttribute("fill", stroke);
      g.appendChild(circle);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", String(cx + 11));
      text.setAttribute("y", String(cy + 15));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("font-family", "sans-serif");
      text.textContent = String(i + 1);
      g.appendChild(text);
      svg.appendChild(g);
    });
    document.body.appendChild(svg);
  }, defects);
  await page.screenshot({ path: outPath, fullPage: true });
  return outPath;
}

export async function writeReports(defects, screenshots, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(defects, null, 2));
  for (const s of screenshots || []) {
    const src = s.file;
    const dest = path.join(outDir, path.basename(src));
    if (path.resolve(src) !== path.resolve(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  const rows = defects
    .map((d, i) => {
      const color = d.severity === "error" ? "#ef4444" : d.severity === "warn" ? "#f59e0b" : "#3b82f6";
      const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<tr><td>${i + 1}</td><td><span style="display:inline-block;padding:2px 8px;border-radius:999px;color:#fff;background:${color}">${esc(d.severity)}</span></td><td>${esc(d.rule)}</td><td>${esc(d.viewport)}</td><td><code>${esc(d.selector)}</code></td><td>${esc(d.detail)}</td></tr>`;
    })
    .join("\n");
  const imgs = (screenshots || [])
    .map((s) => {
      const base = path.basename(s.file);
      const esc = (v) => String(v ?? "").replace(/</g, "&lt;");
      return `<h3>${esc(s.label)}</h3><img src="${esc(base)}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px" />`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>visproof report</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#fff;color:#0f172a}header{padding:20px 24px;border-bottom:1px solid #e2e8f0}main{padding:24px;max-width:1100px;margin:0 auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}code{font-size:12px}</style>
</head>
<body>
<header><h1>visproof report</h1><p>${defects.length} defects</p></header>
<main>
<h2>Defects</h2>
<table><thead><tr><th>#</th><th>Severity</th><th>Rule</th><th>Viewport</th><th>Selector</th><th>Detail</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No defects</td></tr>'}</tbody></table>
<h2>Evidence</h2>
${imgs}
</main>
</body>
</html>`;
  const htmlPath = path.join(outDir, "report.html");
  fs.writeFileSync(htmlPath, html);
  return { jsonPath, htmlPath };
}
