import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { SYNC } from "./sync-core";

/**
 * Ensures party-overlay sync-math.js stays aligned with sync-core.ts constants.
 */
describe("sync-core parity with party-overlay", () => {
  it("SYNC constants match apps/web/party-overlay/modules/sync-math.js", () => {
    const overlayMathPath = path.resolve(
      __dirname,
      "../../../apps/web/party-overlay/modules/sync-math.js"
    );
    const source = fs.readFileSync(overlayMathPath, "utf8");

    for (const [key, value] of Object.entries(SYNC)) {
      expect(source).toContain(`${key}: ${value}`);
    }
  });
});
