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
      },
      "/auth": {
        target: "http://66.97.34.163:3001",
        changeOrigin: true,
      },
    },
  },
});
