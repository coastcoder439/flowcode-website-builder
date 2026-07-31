/*
 * anker-vertrag.ts — BP-03: DER ANKER-VERTRAG (Wirt-Schicht).
 *
 * ============================================================================
 * WAS DIESER PUNKT KAPSELT
 * ============================================================================
 * Die Frage "wie erkennt unsere Laufzeit das Element, das Instatic gerendert
 * hat?" — und sie hat genau eine Antwort: eine CSS-Klasse `fcank-<ankerId>`.
 *
 * Der Wirt traegt sie, weil `injectNodeClassIds` in
 * `src/core/publisher/renderNode.ts:196` BEDINGUNGSLOS fuer jeden Node laeuft.
 * Direkt daneben steht der Kontrast, der zeigt, wie fragil das ist:
 *
 *     const withClasses = injectNodeClassIds(output.html, node.classIds, config.site)
 *     const withStyles  = injectNodeInlineStyles(withClasses, ...)
 *     return config.annotateNodeIds ? injectNodeId(withStyles, node.id) : withStyles
 *                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^ genau DAS darf unserem Aufruf nie passieren
 *
 * `injectNodeId` haengt an einem Flag, das nur der Agenten-Pfad setzt — waere
 * unser Aufruf genauso verdrahtet, verloeren beliebige Node-Typen still ihren
 * Anker. Deshalb prueft die Smoke-Suite nicht, ob der Aufruf DA ist, sondern
 * ob er UNBEDINGT ist (bp03-injectclassids-unbedingt), und benutzt
 * `injectNodeId` als Positiv-Kontrolle (bp03-injectnodeid-bedingt-gegenprobe).
 *
 * ============================================================================
 * WARUM DIESE DATEI SO KLEIN UND IMPORTFREI IST
 * ============================================================================
 * Sie wird in das Laufzeit-Bundle gebuendelt, das auf der VEROEFFENTLICHTEN
 * Seite laeuft (via kern/anker.ts). Dort gibt es kein React, kein Instatic,
 * keinen Katalog. Der Rest der Wirt-Schicht (wirt/vertraege.ts) bleibt
 * deshalb draussen — er ist Werkzeug, nicht Auslieferung.
 *
 * ============================================================================
 * WENN ER BRICHT
 * ============================================================================
 * Harte Fehlermeldung, kein Fallback. Der Attribut-Zweitweg (`data-og-id`)
 * deckt nachweislich nur 5 von ~11 Modultypen ab (H2 gemessen) und ist keine
 * Ersatzloesung, sondern Rueckwaertskompatibilitaet fuer Altdaten des alten
 * Builders. Reaktion auf einen Bruch: auf dem gepinnten Stand bleiben
 * (Entscheidung E4), Upgrade als eigenes Haeppchen.
 */

/** Praefix der Anker-Klasse. `fcank` = FlowCode-ANKer. */
export const ANKER_KLASSEN_PREFIX = "fcank-";

/**
 * Zweitweg fuer Altdaten des bestehenden Builders. NICHT der Hauptweg:
 * `htmlAttributes` ist in Instatic ein Opt-in je Modul — nur
 * container/text/image/button/link (+ body) emittieren es, auf
 * svg/video/list/outlet wird es still verworfen (H2 gemessen: 0 Treffer).
 */
export const ANKER_ATTRIBUT = "data-og-id";

/** Die Klasse, die ein Element tragen muss, um Anker `id` zu sein. */
export function ankerKlasse(id: string): string {
  return ANKER_KLASSEN_PREFIX + id;
}

/**
 * Der NAME der Instatic-Stilregel, die diese Klasse erzeugt.
 *
 * Wichtig und leicht zu verwechseln: der Node traegt nur `classIds`. Den
 * KLASSENNAMEN liefert erst `classNamesForClassIds(site.styleRules, classIds)`
 * beim Rendern (BP-02). Wir muessen also eine Regel mit genau diesem Namen
 * anlegen — nicht die Klasse an den Node schreiben.
 *
 * Es ist derselbe String wie `ankerKlasse()`; die eigene Funktion existiert,
 * damit die Aufrufstelle sagt, WELCHE der beiden Bedeutungen sie meint.
 */
export function ankerStyleRuleName(id: string): string {
  return ankerKlasse(id);
}

/*
 * BEWUSST NICHT HIER: die Umkehrung (Anker-Id aus einem DOM-Element lesen).
 *
 * Die Grenze laeuft zwischen VERTRAG und BENUTZUNG. Diese Datei sagt, wie die
 * Klasse heisst, die Instatic ausliefern muss — das ist der Vertrag mit dem
 * Wirt. Wie unsere Laufzeit sie im DOM wiederfindet (classList tokenweise,
 * Zweitweg ueber das Attribut, Kollisionszaehlung), ist unsere Sache und steht
 * in kern/anker.ts. Beides hier zu buendeln haette den Vertrag zu einer
 * DOM-Bibliothek gemacht und das ausgelieferte Bundle unnoetig veraendert.
 */
