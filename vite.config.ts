import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5198,
    proxy: {
      "/api": "http://127.0.0.1:5199",
      "/ws": { target: "ws://127.0.0.1:5199", ws: true },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
    cssCodeSplit: true,
    // Ресурси (шрифти) — окремими файлами: сувора CSP без data: у font-src
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Важкі бібліотеки — окремими чанками, щоб кешувались і не гальмували старт
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@xterm")) return "xterm";
          if (id.includes("sql.js")) return "sqljs";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react")) return "react";
        },
      },
    },
  },
});
