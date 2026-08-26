import { defineConfig, loadEnv, build } from "vite";
import { resolve } from "path";
import fs from "fs";

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, resolve(__dirname, "../apps/web"), ""),
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
  };

  const defines = {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ""),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""),
    "process.env.NEXT_PUBLIC_LIVEKIT_URL": JSON.stringify(env.NEXT_PUBLIC_LIVEKIT_URL || ""),
    "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(env.NEXT_PUBLIC_APP_URL || "https://just-us-web.vercel.app"),
    "process.env": JSON.stringify({}),
    "process": JSON.stringify({ env: {} }),
  };

  return {
    base: "",
    define: defines,
    plugins: [
      {
        name: "build-extension-bundles",
        async closeBundle() {
          console.log("[Vite] Building standalone IIFE content script without ES imports...");

          // Build standalone content.js as an IIFE (zero imports)
          await build({
            configFile: false,
            define: defines,
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

        // Copy and flatten popup.html to root dist/popup.html with relative paths
        const popupSrc = resolve(__dirname, "dist/src/popup/popup.html");
        const popupDest = resolve(__dirname, "dist/popup.html");
        if (fs.existsSync(popupSrc)) {
          let html = fs.readFileSync(popupSrc, "utf-8");
          // Ensure all resource paths are direct relative to root dist/
          html = html.replace(/(src|href)=["'](?:(?:\.\.\/)+|\.\/|\/)?([^"']+)["']/g, '$1="./$2"');
          fs.writeFileSync(popupDest, html);
          console.log("[Vite] Successfully created root popup.html for mobile WebKit/Orion");
        }

        // Copy manifest.json
        const manifestPath = resolve(__dirname, "manifest.json");
        const distPath = resolve(__dirname, "dist/manifest.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          manifest.action.default_popup = "popup.html";
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
  };
});
