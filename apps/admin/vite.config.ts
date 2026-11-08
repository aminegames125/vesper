import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The panel is served by the server at /admin/, and talks to it on the same origin.
// In development it runs on its own port and reaches a local server at 127.0.0.1:8484.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 1430,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8484",
        // The server refuses requests whose Origin differs from its own address. In development the
        // page is on another port, so the proxy drops the browser's cross-site markers.
        configure: (proxy) => {
          const emitter = proxy as unknown as {
            on: (
              event: string,
              listener: (req: { removeHeader(name: string): void }) => void,
            ) => void;
          };
          emitter.on("proxyReq", (req) => {
            req.removeHeader("origin");
            req.removeHeader("sec-fetch-site");
            req.removeHeader("referer");
          });
        },
      },
    },
  },
  build: { target: "es2023", chunkSizeWarningLimit: 600 },
});
