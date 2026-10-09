import fs from "node:fs";
import path from "node:path";

export const GALLERY_README = `# Component gallery

One standalone HTML fixture per component. Component name is the file basename without extension.

- card.html -> card
- navbar.html -> navbar
- form.html -> form
- table.html -> table

## Add a component

Add a new fixture file in this directory, for example \`badge.html\`. Keep it standalone with inline CSS only and no external resources. Use only the design palette so palette checks stay quiet. The next gallery check picks it up automatically in sorted filename order.

## Remove a component

Delete its fixture file. Its baseline entries stay in the shared baselines store until re-baselined; they no longer affect gallery check.

## Approve per-component baselines

Run the baseline command on the fixture file:

    visproof baseline gallery/card.html --out ./visproof-reports

This writes to the shared baselines store. Later gallery check runs compare each component against its own baseline and flag per-component visual drift. Re-baselining one component leaves the others intact.
`;

const CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Card</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; font-size: 16px; line-height: 1.6; }
.wrap { padding: 48px 24px; max-width: 720px; margin: 0 auto; }
.card { background: #f1f5f9; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; }
.card h2 { font-size: 24px; margin: 0 0 8px; color: #0f172a; line-height: 1.3; }
.card p { margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6; }
.btn { display: inline-block; padding: 14px 28px; background: #2563eb; color: #ffffff; border-radius: 8px; text-decoration: none; font-size: 16px; line-height: 1.5; min-width: 24px; min-height: 24px; }
</style>
</head>
<body>
<div class="wrap">
<div class="card">
<h2>Simple card</h2>
<p>This card uses wrapped text and generous spacing for reliable checks.</p>
<a class="btn" href="#start">Get started</a>
</div>
</div>
</body>
</html>
`;

const NAVBAR_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Navbar</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; font-size: 16px; line-height: 1.6; }
header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 12px; }
.logo { font-weight: 700; font-size: 20px; color: #0f172a; line-height: 1.5; }
nav { display: flex; gap: 8px; flex-wrap: wrap; }
nav a { display: inline-block; padding: 12px 16px; color: #0f172a; text-decoration: none; font-size: 16px; line-height: 1.6; }
main { padding: 48px 24px; max-width: 720px; margin: 0 auto; }
main h1 { font-size: 36px; margin: 0 0 12px; color: #0f172a; line-height: 1.2; }
main p { margin: 0; color: #475569; font-size: 16px; line-height: 1.6; }
</style>
</head>
<body>
<header>
<div class="logo">Acme</div>
<nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#docs">Docs</a></nav>
</header>
<main>
<h1>Navbar example</h1>
<p>Links wrap on narrow screens and stay large enough to tap.</p>
</main>
</body>
</html>
`;

const FORM_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Form</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; font-size: 16px; line-height: 1.6; }
.wrap { padding: 48px 24px; max-width: 560px; margin: 0 auto; }
h1 { font-size: 32px; margin: 0 0 12px; color: #0f172a; line-height: 1.2; }
.desc { margin: 0 0 24px; color: #475569; font-size: 16px; }
.field { margin: 0 0 16px; }
label { display: block; font-size: 16px; color: #0f172a; margin: 0 0 8px; line-height: 1.5; }
input, textarea { display: block; width: 100%; box-sizing: border-box; min-height: 44px; padding: 12px 16px; font-size: 16px; line-height: 1.5; color: #0f172a; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px; margin: 0 0 8px; }
textarea { min-height: 88px; }
.help { margin: 0 0 4px; color: #475569; font-size: 16px; line-height: 1.5; }
button { display: inline-block; padding: 14px 28px; background: #2563eb; color: #ffffff; border: 0; border-radius: 8px; font-size: 16px; line-height: 1.5; min-width: 24px; min-height: 24px; cursor: pointer; }
</style>
</head>
<body>
<div class="wrap">
<h1>Contact form</h1>
<p class="desc">Labels and help text use high contrast colors.</p>
<div class="field">
<label for="name">Name</label>
<input id="name" name="name" type="text" value="" />
<p class="help">Enter your full name.</p>
</div>
<div class="field">
<label for="email">Email</label>
<input id="email" name="email" type="text" value="" />
<p class="help">We never share your email.</p>
</div>
<div class="field">
<label for="msg">Message</label>
<textarea id="msg" name="msg"></textarea>
</div>
<button type="button">Send message</button>
</div>
</body>
</html>
`;

const TABLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Table</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; font-size: 16px; line-height: 1.6; }
.wrap { padding: 32px 24px; max-width: 800px; margin: 0 auto; }
h1 { font-size: 32px; margin: 0 0 12px; color: #0f172a; line-height: 1.2; }
.desc { margin: 0 0 16px; color: #475569; font-size: 16px; }
table { width: 100%; border-collapse: collapse; background: #ffffff; }
th, td { padding: 12px 16px; text-align: left; font-size: 16px; line-height: 1.5; border-bottom: 1px solid #e2e8f0; }
th { background: #f1f5f9; color: #0f172a; }
td { color: #475569; }
</style>
</head>
<body>
<div class="wrap">
<h1>Team table</h1>
<p class="desc">Short cell text keeps the table fluid on narrow screens.</p>
<table>
<thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
<tbody>
<tr><td>Ada</td><td>Eng</td><td>Active</td></tr>
<tr><td>Bo</td><td>Design</td><td>Active</td></tr>
<tr><td>Cy</td><td>Docs</td><td>Paused</td></tr>
</tbody>
</table>
</div>
</body>
</html>
`;

export const GALLERY_FIXTURES = [
  { name: "card", file: "card.html", html: CARD_HTML },
  { name: "navbar", file: "navbar.html", html: NAVBAR_HTML },
  { name: "form", file: "form.html", html: FORM_HTML },
  { name: "table", file: "table.html", html: TABLE_HTML },
];

export function initGalleryPackage(dir = "gallery") {
  if (fs.existsSync(dir)) {
    const err = new Error(`Target exists: ${dir}`);
    err.code = "EEXIST";
    throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const f of GALLERY_FIXTURES) {
    fs.writeFileSync(path.join(dir, f.file), f.html);
  }
  fs.writeFileSync(path.join(dir, "gallery.md"), GALLERY_README);
  return dir;
}

export function listGalleryFixtures(dir) {
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
  return entries.map((f) => ({
    component: path.basename(f, ".html"),
    file: path.join(dir, f),
  }));
}
