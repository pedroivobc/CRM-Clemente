import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Landing pública do produto — one-pager estático que virá do domínio raiz
// (ex: clemente.app). Nada de auth, nada de API. É a porta de entrada
// pública para o corretor autônomo que ainda não conhece o produto.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5180 },
});
