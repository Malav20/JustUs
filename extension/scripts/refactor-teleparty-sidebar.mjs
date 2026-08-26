import fs from "fs";

const path = "C:/Vedora Labs/JustUs/extension/src/content/ui/teleparty-sidebar.ts";
let content = fs.readFileSync(path, "utf8");

// Replace render() body (lines 307-876) with compact version
const renderStart = content.indexOf("  private render() {");
const renderEnd = content.indexOf("  private bindEvents()", renderStart);
if (renderStart === -1 || renderEnd === -1) {
  console.error("Could not find render/bindEvents markers");
  process.exit(1);
}

const newRender = `  private render() {
    if (!this.shadow) return;

    this.shadow.innerHTML = \`<style>\${TELEPARTY_SIDEBAR_CSS}</style>\${buildTelepartySidebarHtml(this.userName, this.avatarColor)}\`;

    this.sidebarEl = this.shadow.getElementById("tp-sidebar-container");
    this.remoteVideoEl = this.shadow.getElementById("remote-feed") as HTMLVideoElement;
    this.localVideoEl = this.shadow.getElementById("local-feed") as HTMLVideoElement;
    this.chatFeedEl = this.shadow.getElementById("chat-feed-container");
    this.driftBadgeEl = this.shadow.getElementById("drift-badge");
    this.participantCountEl = this.shadow.getElementById("tp-participant-count");
    this.videoCallBoxEl = this.shadow.getElementById("tp-video-box-panel");
  }

`;

content = content.slice(0, renderStart) + newRender + content.slice(renderEnd);

// Add imports if missing
if (!content.includes("TELEPARTY_SIDEBAR_CSS")) {
  content = content.replace(
    'import { ChatMessage } from "../../shared/types";',
    `import { ChatMessage } from "../../shared/types";
import { TELEPARTY_SIDEBAR_CSS } from "./teleparty-sidebar-styles";
import { buildTelepartySidebarHtml } from "./teleparty-sidebar-template";
import { bindInstantTap } from "../../shared/touch";`
  );
}

fs.writeFileSync(path, content);
console.log("Updated teleparty-sidebar.ts render()");
