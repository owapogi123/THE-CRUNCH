import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd(), "VITE");
  const apiTarget: string = env.VITE_PROXY_TARGET || "http://localhost:5000";

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    server: {
      port: 5173,
      host: "localhost",
      strictPort: false,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, "/api"),
          ws: true,
          headers: {
            "ngrok-skip-browser-warning": "true",  // ← ADDED
          },
        },
      },
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      minify: "terser",
    },

    preview: {
      port: 4173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          headers: {
            "ngrok-skip-browser-warning": "true",  // ← ADDED
          },
        },
      },
    },
  };
});