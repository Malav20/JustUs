import fs from "fs";

const sidebarPath = "C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar.ts";
const content = fs.readFileSync(sidebarPath, "utf8");

const bindStart = content.indexOf("  private bindEvents() {");
const bindEnd = content.indexOf("  private escapeHtml", bindStart);
if (bindStart === -1 || bindEnd === -1) {
  console.error("bindEvents markers not found");
  process.exit(1);
}

const bindBody = content.slice(bindStart, bindEnd).replace("  private bindEvents() {", "export function bindTelepartySidebarEvents(sidebar: TelepartySidebarUI) {");

const eventsFile = `import {
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";
import { CONFIG } from "../../shared/constants";
import { bindInstantTap } from "../../shared/touch";
import type { TelepartySidebarUI } from "./teleparty-sidebar";

${bindBody.replace(/this\./g, "sidebar.")}
`;

fs.writeFileSync("C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar-events.ts", eventsFile);

const newSidebar =
  content.slice(0, bindStart) +
  `  private bindEvents() {
    bindTelepartySidebarEvents(this);
  }

` +
  content.slice(bindEnd);

if (!newSidebar.includes("bindTelepartySidebarEvents")) {
  const importLine = 'import { bindTelepartySidebarEvents } from "./teleparty-sidebar-events";';
  const updated = newSidebar.replace(
    'import { bindInstantTap } from "../../shared/touch";',
    `import { bindInstantTap } from "../../shared/touch";
${importLine}`
  );
  fs.writeFileSync(sidebarPath, updated);
} else {
  fs.writeFileSync(sidebarPath, newSidebar);
}

console.log("Extracted bindEvents");
