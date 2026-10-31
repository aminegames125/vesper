import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: ["../.."] },
    watch: { ignored: ["**/src-tauri/**", "**/target/**"] },
  },
  build: { target: "es2023", chunkSizeWarningLimit: 700 },
  test: { environment: "node" },
});
