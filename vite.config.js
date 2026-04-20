import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiTarget = env.VITE_PROXY_TARGET || "http://localhost:5000";
    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src")
            }
        },
        server: {
            port: 5173,
            host: true,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    secure: false,
                    ws: true,
                    headers: {
                        "ngrok-skip-browser-warning": "true"
                    }
                }
            }
        },
        build: {
            outDir: "dist",
            sourcemap: false
        },
        preview: {
            port: 4173,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    secure: false
                }
            }
        }
    };
});
