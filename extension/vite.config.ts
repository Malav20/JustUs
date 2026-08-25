import { defineConfig, build } from "vite";
import { resolve } from "path";
import fs from "fs";

export default defineConfig({
  plugins: [
    {
      name: "build-extension-bundles",
      async closeBundle() {
        console.log("[Vite] Building standalone IIFE content script without ES imports...");

        // Build standalone content.js as an IIFE (zero imports)
        await build({
          configFile: false,
          build: {
            emptyOutDir: false,
            outDir: resolve(__dirname, "dist"),
            lib: {
              entry: resolve(__dirname, "src/content/index.ts"),
              name: "JustUsContent",
              formats: ["iife"],
              fileName: () => "content.js",
            },
            rollupOptions: {
              output: {
                extend: true,
                inlineDynamicImports: true,
              },
            },
          },
          resolve: {
            alias: {
              "@": resolve(__dirname, "src"),
            },
          },
        });

        // Copy manifest.json
        const manifestPath = resolve(__dirname, "manifest.json");
        const distPath = resolve(__dirname, "dist/manifest.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          manifest.action.default_popup = "src/popup/popup.html";
          fs.writeFileSync(distPath, JSON.stringify(manifest, null, 2));
        }

        // Copy injected.js
        const injectedSrc = resolve(__dirname, "src/content/injected.js");
        if (fs.existsSync(injectedSrc)) {
          fs.mkdirSync(resolve(__dirname, "dist/src/content"), { recursive: true });
          fs.copyFileSync(injectedSrc, resolve(__dirname, "dist/injected.js"));
          fs.copyFileSync(injectedSrc, resolve(__dirname, "dist/src/content/injected.js"));
          console.log("[Vite] Successfully copied injected.js to dist");
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js";
          return "[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
