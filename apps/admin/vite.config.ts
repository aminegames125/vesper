import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The panel is served by the server at /admin/, and talks to it on the same origin.
// In development it runs on its own port and reaches a local server at 127.0.0.1:8484.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: { port: 1430, proxy: { "/api": "http://127.0.0.1:8484" } },
  build: { target: "es2023", chunkSizeWarningLimit: 600 },
});
