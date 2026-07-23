/*
 * scripts/lib/ts-ext-loader.mjs — I2-Fix (Node-Skript-Pfad).
 *
 * PROBLEM: Der reine Adapter lib/import/html-zu-puck.ts importiert seit N15
 * relativ `./fremdkoerper-filter` OHNE Datei-Endung (so will es tsc mit
 * moduleResolution "bundler" — eine `.ts`-Endung im Quelltext waere ohne
 * allowImportingTsExtensions ein tsc-Fehler; auch der Next-/Webpack-Pfad des
 * Browsers laeuft endungslos). Nodes NATIVER ESM-Resolver (unter
 * --experimental-transform-types, den unsere Import-Skripte fuer die
 * TS-Transform nutzen) macht aber KEINE Endungs-Probe und wirft daher
 * ERR_MODULE_NOT_FOUND. Das entfernte Flag --experimental-specifier-resolution
 * (Node < 24) gibt es nicht mehr.
 *
 * LOESUNG: Ein Modul-Customization-`resolve`-Hook, der NUR fuer den Node-Skript-
 * Pfad registriert wird (via `--import` im Selbst-Reexec von import-ben.mjs).
 * Er haengt an endungslose RELATIVE Specifier (`./x`, `../x`) `.ts` an, bevor
 * Node aufloest. Nicht-relative Specifier (node:*, npm-Pakete wie happy-dom /
 * @puckeditor/core) und bereits mit Endung versehene (`./html-zu-puck.ts`,
 * `./foo.json`) bleiben unberuehrt.
 *
 * ISOLATION: tsc, der Next-Dev-Server und der Browser-Bundle-Pfad sehen von
 * dieser Datei NICHTS — der Fix lebt ausschliesslich im eigenstaendigen
 * Node-Prozess. Quelltext-Endungen und tsconfig bleiben unveraendert.
 *
 * WARUM data:-URL als Hook-Modul: der `resolve`-Hook laeuft in einem eigenen
 * Loader-Thread (nicht im Haupt-Thread). Statt einer zweiten Datei betten wir
 * den kleinen Hook als data:-URL ein und registrieren ihn von hier aus. Diese
 * Datei selbst wird ueber `--import` im HAUPT-Thread ausgefuehrt.
 */

import { register } from "node:module";

/* Der eigentliche resolve-Hook (laeuft im Loader-Thread). Bewusst winzig und
   defensiv: nur endungslose relative Specifier werden umgeschrieben. */
const hookQuelle = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const segment = specifier.split("/").pop() ?? "";
    // "kein Punkt im letzten Pfad-Segment" = keine Datei-Endung → .ts anhaengen.
    if (segment.length > 0 && !segment.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
  }
  return nextResolve(specifier, context);
}
`;

register("data:text/javascript," + encodeURIComponent(hookQuelle), import.meta.url);
