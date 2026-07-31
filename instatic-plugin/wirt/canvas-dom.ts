/*
 * canvas-dom.ts — BP-07: die DOM-Marker des Editor-Canvas.
 *
 * ============================================================================
 * WARUM DIESER PUNKT DER GEKAPSELTSTE IST
 * ============================================================================
 * Hier haengen wir an der volatilsten Flaeche des Wirts: `CanvasRoot.tsx` und
 * `IframeFrameSurface.tsx` wurden in 60 Tagen 15 bzw. 19 Mal geaendert. Genau
 * das meint Entscheidung E3 mit "distanziert bei DOM und Geometrie": vier
 * Strings, EINE Datei, und der Rest unseres Codes weiss nichts davon.
 *
 * Umgekehrt gilt: ein Bruch hier ist NICHT existenziell. Der Renderkern
 * (kern/) und der Schreibpfad (BP-01) haengen nicht an diesen Markern — nur
 * die Bedienung tut es. Deshalb ist die Bruch-Reaktion hier ein FALLBACK
 * (Editor-Flaeche ohne Overlay, einmal sichtbar gemeldet) und keine
 * Ausnahme, die alles anhaelt. Stille Degradierung ist trotzdem verboten:
 * `markerBericht()` liefert den Zustand, damit die UI ihn zeigen kann.
 *
 * ============================================================================
 * DIE GEOMETRIE DES CANVAS — DAS, WAS MAN LEICHT FALSCH MACHT
 * ============================================================================
 * Der Canvas ist KEIN flaches DOM. Er ist:
 *
 *   [data-instatic-canvas-root="true"]         <- Editor-Realm
 *     └─ [data-breakpoint-id="..."]  (Wrapper) <- Editor-Realm, pro Breakpoint
 *          └─ <iframe srcDoc>                  <- eigener Realm, same-origin
 *               └─ <body data-breakpoint-id>   <- IM Frame, gleicher Marker!
 *                    └─ [data-node-id="..."]   <- die gerenderten Nodes
 *
 * Zwei Fallen, beide im Wirt-Code belegt:
 *   1. `data-breakpoint-id` steht ZWEIMAL — am Wrapper im Editor-Realm
 *      (BreakpointFrame.tsx:218) und am <body> im Frame
 *      (iframeBodyReset.ts:69). Wer nicht sagt, welchen er meint, greift
 *      zufaellig den falschen Realm.
 *   2. `data-node-id` ist NICHT canvas-exklusiv — die Baum-Zeilen des
 *      DOM-Panels und der Import-Dialog tragen es auch
 *      (canvasNodeLookup.ts:5 sagt das ausdruecklich). Ein
 *      `document.querySelector('[data-node-id]')` im Editor-Realm findet
 *      deshalb mit hoher Wahrscheinlichkeit eine Panel-Zeile statt des
 *      Elements. Nodes werden AUSSCHLIESSLICH im Frame-Dokument gesucht.
 */

/**
 * Die vier Marker. Der Rest unseres Codes benutzt NUR diese Konstante —
 * kein zweiter String im Repo.
 */
export const CANVAS_MARKER = {
  /** Wurzel der Editor-Zeichenflaeche (CanvasRoot.tsx:431). Wert ist "true". */
  canvasWurzel: "data-instatic-canvas-root",
  /** "design" | "live" (CanvasRoot.tsx:433) — entscheidet, in welcher der drei
   *  Welten aus H4 wir gerade sind. */
  canvasAnsicht: "data-canvas-view",
  /** Breakpoint-Zuordnung. Steht im Editor-Realm am Wrapper
   *  (BreakpointFrame.tsx:218) UND im Frame am <body> (iframeBodyReset.ts:69). */
  breakpoint: "data-breakpoint-id",
  /** Ein gerenderter Node im Frame-Dokument (canvasNodeLookup.ts:48). */
  node: "data-node-id",
} as const;

/** Die Werte, die `data-canvas-view` annehmen kann (canvasSlice.ts:35). */
export type CanvasAnsicht = "design" | "live";

/** CSS-Attributwert sicher escapen (Node-Ids sind nanoid, aber nie raten). */
function attrEscape(wert: string): string {
  return wert.replace(/["\\]/g, (z) => `\\${z}`);
}

/**
 * BP-07/1 — die Canvas-Wurzel. `null`, wenn wir nicht im Editor sind ODER der
 * Marker verschwunden ist; beides ist fuer den Aufrufer dasselbe (kein
 * Overlay), deshalb kein Wurf.
 */
export function findeCanvasWurzel(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${CANVAS_MARKER.canvasWurzel}="true"]`);
}

/**
 * BP-07/2 — welche der drei Welten aus H4 zeigt der Canvas gerade?
 * `null` = Marker weg oder unbekannter Wert. Ein unbekannter Wert wird NICHT
 * auf "design" geraten: Entscheidung E2 macht Design zum Werkzeugmodus, und
 * ein falsch geratener Modus wuerde Keyframes an der falschen Achse setzen.
 */
export function liesCanvasAnsicht(doc: Document = document): CanvasAnsicht | null {
  const wurzel = findeCanvasWurzel(doc);
  const wert = wurzel?.getAttribute(CANVAS_MARKER.canvasAnsicht);
  return wert === "design" || wert === "live" ? wert : null;
}

/**
 * BP-07/3 — der Iframe eines Breakpoints, aus dem EDITOR-Realm gesucht.
 * Das ist der Eingang fuer `iframeQuelle()` aus kern/scroll-quelle.ts (Welt B).
 *
 * Ohne `breakpointId` wird der erste Frame genommen — im Live-Modus gibt es
 * per Konstruktion nur einen (CanvasLiveSurface.tsx:167).
 */
export function findeBreakpointFrame(
  breakpointId?: string,
  doc: Document = document,
): HTMLIFrameElement | null {
  const wurzel = findeCanvasWurzel(doc) ?? doc;
  const wrapperSelektor = breakpointId
    ? `[${CANVAS_MARKER.breakpoint}="${attrEscape(breakpointId)}"]`
    : `[${CANVAS_MARKER.breakpoint}]`;
  for (const wrapper of wurzel.querySelectorAll(wrapperSelektor)) {
    const frame = wrapper.querySelector("iframe");
    if (frame instanceof HTMLIFrameElement) return frame;
  }
  return null;
}

/**
 * BP-07/4 — ein gerenderter Node.
 *
 * Gesucht wird IMMER im Frame-Dokument, nie im Editor-Realm (s. Falle 2 im
 * Kopfkommentar). Faellt der Frame-Zugriff aus (fremde Herkunft, Frame noch
 * nicht geladen), ist die Antwort `null` — NIEMALS ein Ausweichtreffer aus
 * dem Editor-Realm, der dann eine Panel-Zeile waere.
 */
export function findeNodeElement(
  nodeId: string,
  breakpointId?: string,
  doc: Document = document,
): HTMLElement | null {
  const frame = findeBreakpointFrame(breakpointId, doc);
  const frameDoc = frameDokument(frame);
  if (!frameDoc) return null;
  return frameDoc.querySelector<HTMLElement>(
    `[${CANVAS_MARKER.node}="${attrEscape(nodeId)}"]`,
  );
}

/** Same-origin-Zugriff mit ehrlichem Fehlschlag statt stillem `null`-Raten. */
function frameDokument(frame: HTMLIFrameElement | null): Document | null {
  if (!frame) return null;
  try {
    return frame.contentDocument ?? null;
  } catch {
    return null;
  }
}

/**
 * Zustandsbericht fuer die Editor-Flaeche. Die UI zeigt daraus eine sichtbare
 * Meldung, statt still ohne Overlay dazustehen — die Regel aus H1/H2: ein
 * stiller Fehlschlag ist der teuerste.
 */
export function markerBericht(doc: Document = document): {
  canvasWurzel: boolean;
  ansicht: CanvasAnsicht | null;
  frames: number;
  frameLesbar: boolean;
  tragfaehig: boolean;
} {
  const wurzel = findeCanvasWurzel(doc);
  const frames = wurzel
    ? wurzel.querySelectorAll(`[${CANVAS_MARKER.breakpoint}] iframe`).length
    : 0;
  const frameLesbar = frameDokument(findeBreakpointFrame(undefined, doc)) !== null;
  const ansicht = liesCanvasAnsicht(doc);
  return {
    canvasWurzel: wurzel !== null,
    ansicht,
    frames,
    frameLesbar,
    /* Tragfaehig heisst: Overlay positionierbar UND Nodes auffindbar. */
    tragfaehig: wurzel !== null && frames > 0 && frameLesbar,
  };
}
