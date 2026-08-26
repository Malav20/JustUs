import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT, "extension");
const DIST_DIR = path.join(EXT_DIR, "dist");
const ZIP_PATH = path.join(ROOT, "justus-extension.zip");

function buildExtension() {
  console.log("Building extension...");
  execSync("npm run build", { cwd: EXT_DIR, stdio: "inherit", env: process.env });
}

function zipDist() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error("extension/dist not found — run build first");
  }

  const manifest = path.join(DIST_DIR, "manifest.json");
  if (!fs.existsSync(manifest)) {
    throw new Error("extension/dist/manifest.json missing — build may have failed");
  }

  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  if (process.platform === "win32") {
    const distGlob = path.join(DIST_DIR, "*");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${distGlob}' -DestinationPath '${ZIP_PATH}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`zip -rq "${ZIP_PATH}" .`, { cwd: DIST_DIR, stdio: "inherit" });
  }

  const sizeKb = fs.statSync(ZIP_PATH).size / 1024;
  console.log(`✓ Created ${ZIP_PATH} (${sizeKb.toFixed(1)} KB)`);
}

const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  buildExtension();
}

zipDist();
