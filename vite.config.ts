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
  build: { outDir: "dist" },
});
