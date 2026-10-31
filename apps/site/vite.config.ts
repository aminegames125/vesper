import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served by GitHub Pages at https://aminegames125.github.io/vesper/
export default defineConfig({
  base: "/vesper/",
  plugins: [react()],
  server: { port: 1440 },
  build: { target: "es2023", chunkSizeWarningLimit: 600 },
});
