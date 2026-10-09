# visproof

Headless visual QA for HTML pages. Renders pages with Chromium, runs deterministic geometry checks, and writes evidence for review.

## Install

Requires Node 20 or later.

    npm install -g visproof
    npx playwright install chromium

## Commands

visproof init [--dir design-system]

Scaffolds a design package (tokens.json, components.md, README.md) used for palette checks.

visproof render <html> [--viewport WxH] [--out dir]

Renders each configured viewport to a full-page PNG in the output directory (<out>/<label>.png).

visproof baseline <html> [--viewport WxH] [--out dir]

Captures approved baseline screenshots. This is the approve flow for visual regression:

    visproof baseline examples/good.html --out ./visproof-reports
    visproof check examples/good.html --out ./visproof-reports

baseline renders every configured viewport (or the --viewport override) exactly like render, but writes un-annotated screenshots to <out>/baselines/<page>-<label>.png (where <page> is a slug of the checked file name or page URL) and records them in <out>/baselines/baselines.json. Review the PNGs once, then keep them. One report directory can hold baselines for many pages; re-baselining one page leaves the others' entries intact. Later check and gate runs compare fresh renders against these approved images.

visproof check <html> [--viewport WxH] [--out dir] [--json]

Checks the page for visual defects, writes annotated screenshots (<out>/<label>.png), report.json, and report.html. Prints defect counts to stderr (or the defect array to stdout with --json). Exits 1 when any error-severity defect is found.

visproof gate <html> [--viewport WxH]

Exits 0 only when zero error-severity defects are found, otherwise exits 1. Prints PASS or FAIL to stdout. Use it to block deploys on regressions.

visproof gallery init [--dir gallery]

Scaffolds a component gallery (card, navbar, form, table fixtures + gallery.md).

visproof gallery check [--dir gallery] [--out dir] [--viewport WxH]

Checks every component fixture with the standard rule set, writes <out>/gallery/gallery-report.json + gallery-report.html with per-component sections, exits 1 on any error-severity defect.

## Visual-regression rule

When a baseline exists for a viewport, check and gate add pixel-diff evidence:

- The current render is compared against <out>/baselines/<page>-<label>.png.
- A diff image is written to <out>/baselines/diff-<page>-<label>.png and embedded in report.html.
- A visual-regression defect is reported when the share of differing pixels exceeds the configured threshold.

Configure it in .visproof.yml:

    rules:
      visual-regression:
        level: error
        maxDiffPct: 0.1

level controls severity (error, warn, info, or off to disable). Default is error.

maxDiffPct is the allowed difference in percent. 0.1 means 0.1% of pixels may differ before the check fails. Set a higher value for pages with animation or anti-aliasing noise, or off to skip pixel comparison while keeping geometry checks.

A dimension change always fails when the rule is enabled: if the baseline is 1440x900 but the render is a different size, the defect detail reports Baseline 1440x900 is <bw>x<bh>, render is <w>x<h> (dimensions differ).

## Baseline directory layout

    visproof-reports/
      1440x900.png
      390x844.png
      report.json
      report.html
      baselines/
        good-1440x900.png
        good-390x844.png
        baselines.json
        diff-good-1440x900.png
        diff-good-390x844.png

- baselines/<page>-<label>.png — approved renders, one per page per viewport.
- baselines/baselines.json — manifest with page, label, file, width, height, sha256, and approvedAt per entry.
- baselines/diff-<page>-<label>.png — pixel diff written on every compared run, embedded in the report as diff-<page>-<label> evidence.

## Re-baseline after intentional change

When a visual change is intentional, re-approve it:

    visproof baseline examples/good.html --out ./visproof-reports
    visproof check examples/good.html --out ./visproof-reports
    visproof gate examples/good.html

Inspect the new baseline PNGs, commit or archive them with your release, then require gate to pass before deploy.

## Component gallery and per-component drift

Fixtures are standalone HTML pages, one per component. The component name is the fixture basename without extension.

Approve a component baseline with the baseline command on the fixture file:

    visproof baseline gallery/card.html --out ./visproof-reports

Gallery check uses the shared <out>/baselines store, keyed by fixture slug — the same store the baseline command writes to. Later gallery check runs flag per-component visual drift. Re-baselining one component leaves the others intact.

## Configuration

Create .visproof.yml in the working directory:

    viewports:
      - 1440x900
      - 390x844
    reportDir: ./visproof-reports
    designDir: design-system
    rules:
      text-overflow: error
      element-collision: error
      clipped-content: error
      low-contrast:
        level: warn
        minRatio: 4.5
      small-tap-target:
        level: warn
        minSize: 24
      off-viewport: error
      off-palette: info
      visual-regression:
        level: error
        maxDiffPct: 0.1

Omitted keys fall back to the defaults above. reportDir is the default --out directory; designDir points at tokens.json for palette checks.

## Reports

check writes report.json (defect array with rule, severity, viewport, selector, box, detail, and optional screenshot) and report.html (defect table plus annotated screenshots and diff images).
