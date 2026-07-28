/*
 * Service worker — modo PWA do painel.
 *
 * O objetivo aqui não é offline completo (o admin depende de dados frescos):
 * é 1) tornar o app instalável no celular do corretor, 2) cachar o shell
 * para abertura rápida em sinal ruim, 3) atualizar em segundo plano sem
 * pedir para o usuário limpar cache. Requisições à API nunca são cacheadas.
 */
const VERSION = "v1";
const APP_SHELL = "shell-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== APP_SHELL).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // API: sempre rede. Dados operacionais não podem ficar velhos escondidos.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/public/")) {
    return;
  }

  // Navegação HTML → tenta rede primeiro, cai no shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/")),
    );
    return;
  }

  // Assets estáticos (JS/CSS/imagens do próprio app) → cache first com refresh.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(APP_SHELL).then((cache) => cache.put(req, copy));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
