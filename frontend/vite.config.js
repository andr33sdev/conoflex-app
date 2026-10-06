import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://66.97.34.163:3001",
        changeOrigin: true,
        secure: false,
      },
      "/auth": {
        target: "http://66.97.34.163:3001",
        changeOrigin: true,
        secure: false,
      },
      "/imagenes": {
        target: "http://66.97.34.163:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
