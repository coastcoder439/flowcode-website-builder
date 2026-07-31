/*
 * anker.ts — DER ANKER-VERTRAG (Teilaufgabe 1 von H3a).
 *
 * WAS SICH GEGENUEBER DEM ALTEN BUILDER AENDERT
 * ---------------------------------------------
 * Der bestehende Renderkern (components/grafik/GrafikLayer.tsx, ankerMapBauen)
 * sucht seine Anker per HTML-Attribut:  doc.querySelectorAll("[data-og-id]").
 * Auf einer Instatic-Seite traegt dieser Weg nicht: `htmlAttributes` ist in
 * Instatic ein OPT-IN JE MODUL — nur container/text/image/button/link (+ body)
 * emittieren es. Auf svg/video/list/outlet/loop wird das Attribut gespeichert
 * und beim Publish STILL VERWORFEN (gemessen in H2: 0 Treffer im HTML).
 *
 * CSS-Klassen kommen dagegen universell durch: `injectNodeClassIds` laeuft in
 * instatic/src/core/publisher/renderNode.ts:196 BEDINGUNGSLOS fuer jeden Node —
 * anders als `injectNodeId`, das an `config.annotateNodeIds` haengt (nur im
 * Agenten-Pfad true). Gemessen am selben SVG-Node: data-og-id 0 Treffer,
 * class="fcank-svg" 1 Treffer.
 *
 * => HAUPTWEG IST AB HIER DIE KLASSEN-KONVENTION `fcank-<ankerId>`.
 *    Beispiel: class="fcank-hero"  ->  Anker-Id "hero".
 *
 * Der Attribut-Weg bleibt als ZWEITWEG erhalten (Rueckwaertskompatibilitaet zu
 * bestehenden Setups des alten Builders, die `data-og-id` gesetzt haben). Beide
 * Wege liefern denselben Anker-Id-Raum; die Klasse gewinnt bei Konflikt, weil
 * sie der Weg ist, den Instatic garantiert ausliefert.
 *
 * Diese Datei ist bewusst importfrei (kein React, kein Next, kein Instatic-SDK)
 * — sie ist reine DOM-Konvention und laeuft im Editor-Canvas genau wie auf der
 * veroeffentlichten Seite.
 */

/** Praefix der Anker-Klasse. `fcank` = FlowCode-ANKer. */
export const ANKER_KLASSEN_PREFIX = "fcank-";

/** Zweitweg (Altdaten des bestehenden Builders). */
export const ANKER_ATTRIBUT = "data-og-id";

/**
 * Grob-Selektor, um KANDIDATEN einzusammeln, ohne das ganze Dokument zu
 * durchlaufen. `[class*=...]` ist ein Substring-Match und daher absichtlich zu
 * weit gefasst (er trifft z.B. auch "nicht-fcank-x") — die echte Pruefung
 * macht `ankerIdVonElement` ueber classList, also tokenweise.
 */
export const ANKER_KANDIDATEN_SELEKTOR = `[class*="${ANKER_KLASSEN_PREFIX}"],[${ANKER_ATTRIBUT}]`;

/** CSS.escape mit Fallback fuer alte Umgebungen (nur Zeichen, die in einem
 *  Klassen-Token ueberhaupt vorkommen duerfen, muessen ueberleben). */
function cssEscape(wert: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(wert);
  return wert.replace(/[^a-zA-Z0-9_-]/g, (z) => `\\${z}`);
}

/** Attribut-Werte muessen fuer den Selektor gequotet/escaped werden. */
function attrEscape(wert: string): string {
  return wert.replace(/["\\]/g, (z) => `\\${z}`);
}

/** Die Klasse, die ein Element tragen muss, um Anker `id` zu sein. */
export function ankerKlasse(id: string): string {
  return ANKER_KLASSEN_PREFIX + id;
}

/** Der Selektor fuer GENAU einen Anker — Klasse (Hauptweg) ODER Attribut
 *  (Zweitweg). Beide in EINEM Selektor, damit ein einziger querySelector
 *  reicht. */
export function ankerSelektor(id: string): string {
  return `.${cssEscape(ankerKlasse(id))},[${ANKER_ATTRIBUT}="${attrEscape(id)}"]`;
}

/**
 * Liest die Anker-Id AUS einem Element — Klasse zuerst, Attribut als Zweitweg.
 * Tokenweise ueber classList (kein Substring-Raten): nur ein echtes
 * Klassen-Token, das mit `fcank-` beginnt und danach noch Zeichen hat, zaehlt.
 * Traegt ein Element mehrere fcank-Klassen, gewinnt die erste — mehr als ein
 * Anker pro Element ist kein sinnvoller Zustand.
 */
export function ankerIdVonElement(el: Element): string | null {
  const liste = el.classList;
  for (let i = 0; i < liste.length; i++) {
    const token = liste[i];
    if (token.length > ANKER_KLASSEN_PREFIX.length && token.startsWith(ANKER_KLASSEN_PREFIX)) {
      return token.slice(ANKER_KLASSEN_PREFIX.length);
    }
  }
  const attr = el.getAttribute(ANKER_ATTRIBUT);
  return attr && attr.length > 0 ? attr : null;
}

/**
 * Loest EINEN Anker auf. Der Normalfall im Betrieb: die Runtime kennt die Ids
 * aus ihrer Config und braucht keinen Dokument-Scan.
 */
export function ankerElement(id: string, wurzel: ParentNode = document): Element | null {
  return wurzel.querySelector(ankerSelektor(id));
}

/**
 * Sammelt ALLE Anker des Dokuments in eine Map (Ersatz fuer das
 * `querySelectorAll("[data-og-id]")` in GrafikLayer.ankerMapBauen). Der erste
 * Treffer je Id gewinnt — dieselbe Regel wie bisher (`if (map.has(id)) return`),
 * die auch die bekannte Duplizieren-Kollision aus H2 stabil (statt zufaellig)
 * aufloest.
 */
export function ankerElementeSammeln(wurzel: ParentNode = document): Map<string, Element> {
  const map = new Map<string, Element>();
  wurzel.querySelectorAll(ANKER_KANDIDATEN_SELEKTOR).forEach((el) => {
    const id = ankerIdVonElement(el);
    if (id && !map.has(id)) map.set(id, el);
  });
  return map;
}

/**
 * Findet Anker-Ids, die MEHRFACH im Dokument vorkommen — die in H2 belegte
 * Duplizieren-Kollision (`duplicateNode` uebernimmt Props/Klassen woertlich).
 * Hier nur GEMESSEN und gemeldet, nicht geheilt: die Heilung gehoert in die
 * Editor-Flaeche (H7), nicht in die Laufzeit.
 */
export function ankerKollisionen(wurzel: ParentNode = document): Record<string, number> {
  const zaehler: Record<string, number> = {};
  wurzel.querySelectorAll(ANKER_KANDIDATEN_SELEKTOR).forEach((el) => {
    const id = ankerIdVonElement(el);
    if (!id) return;
    zaehler[id] = (zaehler[id] ?? 0) + 1;
  });
  const doppelt: Record<string, number> = {};
  for (const [id, n] of Object.entries(zaehler)) if (n > 1) doppelt[id] = n;
  return doppelt;
}
