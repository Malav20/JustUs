/**
 * Concatenates party-overlay source modules into public/party-overlay.js.
 * Each module must stay under 500 lines. Order matters — shared state lives in the IIFE closure.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const modulesDir = path.join(webRoot, "party-overlay", "modules");
const outFile = path.join(webRoot, "public", "party-overlay.js");

const MODULE_ORDER = [
  "bootstrap.js",
  "player-detect.js",
  "player-controls.js",
  "ui-styles-a.js",
  "ui-styles-b.js",
  "ui-shell.js",
  "livekit.js",
  "event-log.js",
  "drawer.js",
  "sync-channel.js",
  "sync-math.js",
  "sync-handlers.js",
  "watchers.js",
  "auto-join.js",
  "lifecycle.js",
];

const header = `// JustUS iOS / Android / iPadOS Injected Watch Party Overlay
// Built from apps/web/party-overlay/modules — run: npm run build:overlay
// Playback-sync thresholds match extension/src/shared/sync-core.ts (change both together).

`;

function splitSourceIfNeeded() {
  const monolith = path.join(webRoot, "public", "party-overlay.js");
  if (!fs.existsSync(monolith)) return;
  if (fs.existsSync(path.join(modulesDir, "bootstrap.js"))) return;

  const lines = fs.readFileSync(monolith, "utf8").split(/\r?\n/);
  const ranges = [
    [1, 101],
    [102, 143],
    [144, 400],
    [401, 700],
    [701, 919],
    [920, 1303],
    [1304, 1679],
    [1680, 1728],
    [1729, 1935],
    [1936, 2200],
    [2201, 2420],
    [2421, 2467],
    [2468, 2523],
    [2524, lines.length],
  ];

  fs.mkdirSync(modulesDir, { recursive: true });
  MODULE_ORDER.forEach((name, i) => {
    const [start, end] = ranges[i];
    const chunk = lines.slice(start - 1, end).join("\n");
    fs.writeFileSync(path.join(modulesDir, name), chunk);
    console.log(`  wrote ${name} (${end - start + 1} lines)`);
  });
}

function build() {
  splitSourceIfNeeded();

  const parts = [header];
  for (const name of MODULE_ORDER) {
    const filePath = path.join(modulesDir, name);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing module: ${filePath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, "utf8");
    const lineCount = content.split(/\r?\n/).length;
    if (lineCount > 500) {
      console.warn(`WARNING: ${name} has ${lineCount} lines (max 500 recommended)`);
    }
    parts.push(content);
    if (!content.endsWith("\n")) parts.push("\n");
  }

  // Ensure IIFE closes
  const body = parts.join("");
  const closed = body.trimEnd().endsWith("})();") ? body : body + "\n})();\n";
  fs.writeFileSync(outFile, closed);
  const totalLines = closed.split(/\r?\n/).length;
  console.log(`Built ${outFile} (${totalLines} lines, ${MODULE_ORDER.length} modules)`);
}

build();
