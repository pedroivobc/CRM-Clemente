import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Site pronto da imobiliária. Consome só a API pública (/public/{key}/*);
// nada de autenticação, nada de módulos administrativos.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5175,
    proxy: {
      "/public": {
        target: process.env.VITE_API_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
