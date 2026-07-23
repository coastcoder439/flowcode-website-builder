/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gleiches Deployment-Modell wie die Hauptseite: reiner Static Export,
  // keine Server-Features zur Laufzeit.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // trailingSlash gilt fuer die exportierten Seiten-URLs; ohne skip wuerde
  // Next jeden API-POST ohne End-Schraegstrich erst per 308 umleiten
  // (jede Liste-/Lade-/Loesch-Interaktion feuert doppelt).
  skipTrailingSlashRedirect: true,

  // `next build` und `next dev` teilen sich sonst BEIDE den .next-Ordner —
  // ein Build neben einem laufenden Dev-Server ueberschreibt dessen Dateien
  // und legt ihn mit 500ern lahm (routes-manifest.json weg). Mit
  //   NEXT_DIST_DIR=.next-build npm run build
  // baut der Build in einen eigenen Ordner und stoert niemanden.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
