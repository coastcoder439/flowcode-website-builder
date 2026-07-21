/*
 * wee-site-sw.js – Service Worker fuer den "Ordner öffnen"-Backdrop-Modus
 * (components/backdrop/ordner-serve.ts). Registriert mit scope "/wee-site/"
 * (s. dort): faengt jede fetch-Anfrage unter /wee-site/ ab und beantwortet
 * sie aus dem Cache Storage "wee-site" — die Dateien kommen NICHT vom
 * Server (der kennt einen clientseitig gepickten Ordner gar nicht), sondern
 * wurden vorher per ordnerInCacheLaden() dort abgelegt.
 *
 * Bewusst PLAIN JS (kein TS-Compile-Schritt): liegt in public/, wird von
 * Next.js beim Static Export unveraendert 1:1 in den Ausgabe-Root kopiert
 * (Next fasst public/-Dateien nie an) und muss deshalb bereits reines,
 * direkt lauffaehiges Browser-JS sein.
 */

const CACHE_NAME = "wee-site";
const SCOPE_PREFIX = "/wee-site/";

self.addEventListener("install", () => {
  // Sofort aktivieren statt auf das Schliessen aller alten Tabs zu warten —
  // der Ordner-Backdrop wird direkt nach der Registrierung gebraucht.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Bereits offene Clients (falls vorhanden) sofort uebernehmen, statt erst
  // beim naechsten Laden zu greifen.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE_PREFIX)) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Verzeichnis-Index: "/wee-site/" -> index.html.
      const pfad = url.pathname === SCOPE_PREFIX ? `${SCOPE_PREFIX}index.html` : url.pathname;
      // ignoreSearch: gecachte Dateien sind ohne Query-String abgelegt
      // (s. ordnerInCacheLaden) — referenziert die Seite selbst z.B. eine
      // Cache-Busting-Query ("style.css?v=2"), soll das trotzdem treffen.
      const treffer = await cache.match(pfad, { ignoreSearch: true });
      if (treffer) return treffer;
      return new Response(`Nicht im Ordner-Cache gefunden: ${pfad}`, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })(),
  );
});
