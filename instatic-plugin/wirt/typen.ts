/*
 * typen.ts — die Instatic-TYPEN, die unser Code kennt.
 *
 * Reine `export type`-Weiterleitung: verschwindet beim Kompilieren restlos und
 * zieht zur Laufzeit KEINE Zeile Instatic-Code. Existiert trotzdem, weil
 * Typ-Importe auch Beruehrungspunkte sind — bricht `PageNode`, bricht unser
 * Code beim Bauen, und dann soll an EINER Stelle stehen, wo das herkommt.
 *
 * Regel: unser Code importiert Instatic-Typen NUR von hier, nie direkt.
 * Durchgesetzt von scripts/70-wirt-smoke.mjs (Pruefung `import-gate`).
 *
 * Volatilitaet der Traegerdateien (60 Tage vor dem Pin, s. wirt/vertraege.ts):
 *   src/core/page-tree/*            page/pageNode/siteDocument — mittel
 *   src/core/files/schemas.ts       SiteFile — stabil (1)
 *   src/core/page-tree/styleRule.ts StyleRule — mittel
 */

export type {
  Page,
  PageNode,
  SiteDocument,
  SiteShell,
} from "../../instatic/src/core/page-tree";

export type { StyleRule } from "../../instatic/src/core/page-tree/styleRule";

export type { SiteFile, SiteFileType } from "../../instatic/src/core/files/schemas";
