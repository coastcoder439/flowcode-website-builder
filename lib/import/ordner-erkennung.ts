/*
 * lib/import/ordner-erkennung.ts — REINE, deterministische Ordner-Klassifikation
 * fuer den Website-Import (docs/plan-analyse/lens-import.md §3-Schritt-VI/-VII).
 *
 * WARUM eigenes Modul: die beiden Erkenner lagen bisher lokal in
 * app/editor/SeitenImport.tsx (einer "use client"-Komponente) und waren damit
 * weder exportiert noch aus einem Node-Unit-Test heraus pruefbar. Sie sind aber
 * pure Funktionen ueber der Datei-Pfad-Liste eines gewaehlten Ordners — genau
 * die Art Logik, die einen eigenen, testbaren Baustein verdient. SeitenImport.tsx
 * importiert sie jetzt von hier; der Test scripts/tests/ordner-erkennung.test.mjs
 * belegt beide Zweige (M9).
 *
 * REIN: keine Aussenwelt (kein DOM/Netz/FS/Storage) — nur `map.keys()` wird
 * gelesen. Gleiche Eingabe -> gleiche Ausgabe. Der `File`-Wert der Map wird nie
 * angefasst; die Signatur bleibt `Map<string, File>` nur, weil der Aufrufer
 * ohnehin diese Struktur (aus dem File-System-Access-Import) haelt.
 */

/** Welle 5a: erkennt eine eigene GEBAUTE Next-Seite an der `_next/`-Struktur im
 *  Ordner (out/). Dann ist „Styles uebernehmen" + Freeze sinnvoll (per Default an). */
export function hatNextStruktur(map: Map<string, File>): boolean {
  for (const pfad of map.keys()) {
    if (pfad === "_next" || pfad.startsWith("_next/") || pfad.includes("/_next/")) return true;
  }
  return false;
}

/** M9 (lens-import.md §3-Schritt-VII): erkennt einen NEXT-QUELLCODE-Ordner —
 *  also ein ungebautes Projekt, das der Nutzer statt des fertigen `out/`-Ordners
 *  gewaehlt hat. Kennzeichen: `package.json` UND (eine `app/`-Struktur ODER eine
 *  `next.config.*`). Solche Ordner haben keine HTML, brauchen aber eine andere,
 *  handlungsleitende Meldung als ein voellig leerer/website-freier Ordner. */
export function istNextQuellordner(map: Map<string, File>): boolean {
  let hatPackageJson = false;
  let hatAppOrdner = false;
  let hatNextConfig = false;
  for (const pfad of map.keys()) {
    const p = pfad.toLowerCase();
    if (p === "package.json" || p.endsWith("/package.json")) hatPackageJson = true;
    if (p === "app" || p.startsWith("app/") || p.includes("/app/")) hatAppOrdner = true;
    if (/(^|\/)next\.config\.(js|mjs|cjs|ts)$/.test(p)) hatNextConfig = true;
  }
  return hatPackageJson && (hatAppOrdner || hatNextConfig);
}
