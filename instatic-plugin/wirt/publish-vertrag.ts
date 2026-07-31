/*
 * publish-vertrag.ts — die REINEN DATEN von BP-05 und BP-06.
 *
 * Getrennt von wirt/publish.ts, weil publish.ts echten Instatic-Server-Code
 * importiert (Publisher + esbuild-Bundler). Die Smoke-Suite muss diese Werte
 * lesen koennen, OHNE dabei den halben Wirt zu laden — sonst waere sie kein
 * Sekunden-Test mehr, und ein Ladefehler im Wirt wuerde die Suite mitreissen,
 * statt ihn als Befund zu melden.
 *
 * Importfrei. publish.ts re-exportiert von hier, damit es genau eine
 * Definition gibt.
 */

/** BP-05: die HTTP-Route, die denselben publishPage()-Pfad nimmt. Fallback,
 *  derzeit nicht benutzt (verlangt eine Admin-Session). */
export const PREVIEW_ROUTE = "/admin/api/cms/runtime/preview";

/**
 * BP-06: die Betriebsart, die Instatic einem `SiteFile { type: 'script' }`
 * von sich aus gibt (DEFAULT_SCRIPT_RUNTIME_CONFIG, runtimeConfig.ts:44).
 *
 * Wir setzen sie NICHT — wir bekommen sie geschenkt. Genau deshalb steht sie
 * hier: aendert der Wirt einen dieser Werte, rendert die Seite weiterhin
 * fehlerfrei und unser Script laeuft nur nicht mehr (oder zu frueh). Ein
 * STILLER Bruch, und stille Brueche sind in diesem Projekt der teuerste
 * Fehlermodus (H1). Die Suite vergleicht diese Kopie gegen den Klon.
 */
export const ERWARTETE_SCRIPT_BETRIEBSART = {
  enabled: true,
  runInCanvas: true,
  format: "module",
  placement: "body-end",
  timing: "dom-ready",
} as const;

/** Die Datei-Id, unter der unsere Laufzeit im Site-Dokument liegt. */
export const LAUFZEIT_DATEI_ID = "fcank-runtime-file";

/** Ihr Pfad im virtuellen Site-Dateibaum. */
export const LAUFZEIT_DATEI_PFAD = "src/fcank-runtime.js";
