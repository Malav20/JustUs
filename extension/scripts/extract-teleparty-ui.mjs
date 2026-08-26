import fs from "fs";

const sidebarPath = "C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar.ts";
const lines = fs.readFileSync(sidebarPath, "utf8").split(/\r?\n/);

const css = lines
  .slice(311, 765)
  .join("\n")
  .replace(/^      /gm, "")
  .replace(/^<style>\s*/, "")
  .replace(/\s*<\/style>\s*$/, "")
  .trim();

fs.writeFileSync(
  "C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar-styles.ts",
  `export const TELEPARTY_SIDEBAR_CSS = \`${css}\`;\n`
);

const html = lines
  .slice(766, 875)
  .join("\n")
  .replace(/^      /gm, "")
  .trim()
  .replace(/\$\{this\.avatarColor\}/g, "${avatarColor}")
  .replace(/\$\{this\.userName\.charAt\(0\)\.toUpperCase\(\)\}/g, "${userName.charAt(0).toUpperCase()}");

fs.writeFileSync(
  "C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar-template.ts",
  `export function buildTelepartySidebarHtml(userName: string, avatarColor: string): string {\n  return \`${html}\`;\n}\n`
);

console.log("Extracted CSS lines:", css.split("\n").length);
