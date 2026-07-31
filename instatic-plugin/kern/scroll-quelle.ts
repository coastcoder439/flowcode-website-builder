/*
 * scroll-quelle.ts — DIE SCROLL-ACHSE (Teilaufgabe 1 von H4).
 *
 * ============================================================================
 * DIE ENTSCHEIDUNG: WORAUF BEZIEHT SICH DER FORTSCHRITT?
 * ============================================================================
 *
 * Instatic zeigt dieselbe Seite in DREI Welten, und nur eine davon scrollt so,
 * wie unser Renderkern es bisher annahm:
 *
 *   (A) DESIGN-Modus   mehrere Breakpoint-Frames nebeneinander, jeder auf die
 *                      volle Inhaltshoehe AUSGEROLLT. Der Frame scrollt GAR
 *                      NICHT — Beleg im Wirt-Code:
 *                        useIframeFrameAutoHeight.ts  (iframe.style.height =
 *                          resolveCanvasFrameHeight(...) je Mutation)
 *                        iframeBodyReset.ts:81-88     (html/body overflow:hidden,
 *                          body min-height: CANVAS_VIEWPORT_HEIGHT)
 *                      `100vh` ist dort auf 800 px gepinnt
 *                        (resolveViewportUnits.ts: CANVAS_VIEWPORT_HEIGHT = 800,
 *                         angewandt in IframeFrameSurface.tsx:633 — und zwar
 *                         UNBEDINGT, also auch im Live-Frame).
 *   (B) LIVE-Modus     EIN Frame in Realgroesse, der INTERN scrollt
 *                        (IframeFrameSurface.tsx:646 -> width/height 100%,
 *                         iframeBodyReset.ts:73-79 -> kein Auto-Height-Reset).
 *                      Same-origin srcDoc-iframe => contentWindow lesbar.
 *   (C) PUBLIZIERTE Seite  normales window-Scrollen.
 *
 * Damit ein Element in allen drei Welten an DERSELBEN Stelle steht, muessen
 * alle drei denselben Fortschritts-BEGRIFF benutzen. Kandidaten waren:
 *
 *   1. Anteil 0..1 von `scrollY / (scrollHeight - viewportHoehe)`  — VERWORFEN
 *   2. Anteil 0..1 von `scrollY / scrollHeight`                    — VERWORFEN
 *   3. Scrollstrecke in DOKUMENT-PIXELN                            — GEWAEHLT
 *
 * WARUM NICHT 1 (Anteil an der Scrollstrecke):
 *   `scrollHeight - viewportHoehe` ist die klassische "maxScroll"-Groesse. Sie
 *   haengt an der VIEWPORT-HOEHE, und die ist in jeder Welt eine andere:
 *   in (C) die echte Fensterhoehe, in (B) die Frame-Hoehe, in (A) existiert sie
 *   ueberhaupt nicht (der Frame ist ausgerollt -> maxScroll = 0 -> Division
 *   durch Null). Ein Anteil ist also KEINE welt-invariante Groesse. Zwei
 *   Welten mit gleicher Dokumenthoehe, aber Fensterhoehe 800 vs. 1000, haben
 *   maxScroll 2394 vs. 2194 — derselbe Anteil 0.5 landet auf 1197 bzw. 1097
 *   Dokument-Pixeln. Genau dieser Fehler ist in H4 gemessen (s. Bericht).
 *
 * WARUM NICHT 2 (Anteil an der Dokumenthoehe):
 *   Die Dokumenthoehe ist ebenfalls nicht welt-invariant. Sie aendert sich mit
 *   der Frame-BREITE (Umbruch) und — Instatic-spezifisch — mit der
 *   vh-Aufloesung: der Canvas rechnet `100vh` fest auf 800 px um, die echte
 *   Seite auf die Fensterhoehe des Besuchers. Eine Seite mit `min-height:100vh`
 *   ist im Canvas anders hoch als beim Besucher.
 *
 * WARUM 3 (Dokument-Pixel) — die gewaehlte Definition:
 *   Ein Keyframe traegt seine Scrollposition bereits als absolute
 *   Dokument-Pixel (`GrafikKeyframe.scrollY`, s. grafik-types.ts), und
 *   `zustandBei(g, scrollY)` ist eine REINE Funktion dieser Zahl. Bekommen
 *   alle drei Welten dieselbe Zahl, ist das Transform PER KONSTRUKTION
 *   identisch — es gibt keinen Kanal, ueber den Viewport-Hoehe, Zoom oder
 *   Frame-Geometrie einsickern koennten.
 *
 *   => `ScrollQuelle.fortschritt()` liefert DOKUMENT-PIXEL, niemals 0..1.
 *
 * WO 0..1 TROTZDEM VORKOMMT — UND WIE ES SICHER BLEIBT:
 *   Der Design-Frame scrollt nicht; dort steuert spaeter ein Regler den Wert,
 *   und ein Regler denkt naturgemaess in 0..1. Diese Umrechnung passiert
 *   AUSSCHLIESSLICH am Bedien-Rand (`setzeAnteil`) und immer gegen eine
 *   EXPLIZIT UEBERGEBENE Referenz-Spanne — nie gegen die Eigen-Geometrie des
 *   Frames. Die Regel, die die Welten zusammenhaelt:
 *
 *     Die virtuelle Quelle bekommt die Spanne der VEROEFFENTLICHTEN Seite
 *     (`docHoehe - Referenz-Viewport`), nicht die Hoehe des Design-Frames.
 *
 *   Wer sie stattdessen mit der ausgerollten Frame-Hoehe fuettert, baut sich
 *   die Drift selbst ein (in H4 mit Zahlen gezeigt).
 *
 * WAS DAMIT AUSDRUECKLICH NICHT BEHAUPTET IST:
 *   Die LAENGE der Achse ist nicht welt-invariant — nur die Bedeutung eines
 *   Punktes auf ihr. Welt C bei Fensterhoehe 1000 endet 200 px frueher als bei
 *   800. Deshalb gehoert zu jeder Quelle `spanne()` als eigene, ehrlich
 *   ausgewiesene Groesse: sie sagt, WIE WEIT diese Welt kommt, waehrend
 *   `fortschritt()` sagt, WO man ist.
 *
 * Diese Datei ist importfrei (kein React, kein Instatic-SDK) und laeuft
 * unveraendert im Editor-Iframe wie auf der publizierten Seite.
 */

/** Wie die Quelle ihren Wert bezieht — nur zur Diagnose/Anzeige. */
export type ScrollQuellenArt = "fenster" | "iframe" | "virtuell";

/**
 * Die Scroll-Achse, aus Sicht des Renderkerns.
 *
 * Drei Faehigkeiten, mehr braucht die Laufzeit nicht:
 *   fortschritt()  — wo stehen wir (Dokument-Pixel)
 *   spanne()       — wie weit reicht diese Welt (Dokument-Pixel, 0 = keine Strecke)
 *   abonniere()    — sag Bescheid, wenn sich der Wert aendert
 */
export interface ScrollQuelle {
  readonly art: ScrollQuellenArt;
  /** Aktueller Stand auf der Scroll-Achse, in DOKUMENT-PIXELN. */
  fortschritt(): number;
  /** Groesster erreichbarer `fortschritt()` dieser Welt, in Dokument-Pixeln.
   *  0 bedeutet "diese Welt hat keine eigene Scrollstrecke" (Design-Frame). */
  spanne(): number;
  /** Meldet Aenderungen. Rueckgabe = Abmelder. Mehrfach-Abos sind erlaubt. */
  abonniere(hoerer: (px: number) => void): () => void;
}

/** Eine von aussen gesetzte Achse (Welt A: Regler/Scrubber statt Scrollen). */
export interface VirtuelleScrollQuelle extends ScrollQuelle {
  /** Direkt in Dokument-Pixeln setzen — der kanonische Weg. */
  setzePixel(px: number): void;
  /** Bequemlichkeit fuer Regler: 0..1 wird MIT DER GESETZTEN SPANNE
   *  multipliziert. Genau hier entscheidet sich, ob Welt A zu Welt C passt —
   *  s. Kopfkommentar. */
  setzeAnteil(anteil: number): void;
  /** Referenz-Spanne nachtraeglich setzen (z.B. wenn die Zielseite ihre
   *  Dokumenthoehe erst nach dem Laden kennt). */
  setzeSpanne(px: number): void;
}

/** 0..1 -> Dokument-Pixel. Getrennt exportiert, damit die UI dieselbe
 *  Umrechnung benutzt wie die Quelle und nichts auseinanderlaeuft. */
export function anteilZuPixel(anteil: number, spanne: number): number {
  if (!Number.isFinite(anteil) || !Number.isFinite(spanne) || spanne <= 0) return 0;
  return Math.min(1, Math.max(0, anteil)) * spanne;
}

/** Dokument-Pixel -> 0..1. Bei Spanne 0 (Design-Frame) definitionsgemaess 0. */
export function pixelZuAnteil(px: number, spanne: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(spanne) || spanne <= 0) return 0;
  return Math.min(1, Math.max(0, px / spanne));
}

/**
 * Gemeinsame Melde-Mechanik fuer die beiden LESENDEN Quellen.
 *
 * Bewusst rAF-Abtastung statt eines `scroll`-Listeners — dieselbe Mechanik,
 * die der H3a-Beweis benutzt hat und die dort exakt getroffen hat. Ein
 * `scroll`-Listener wuerde alles verpassen, was die Position ohne Scroll-Event
 * verschiebt: Layout-Aenderungen im Editor, Frame-Resize, Zoomen, das
 * Ausrollen des Design-Frames. Abgetastet wird nur, solange jemand abonniert
 * hat, und gemeldet nur bei echter Aenderung.
 */
function rafAbo(
  lies: () => number,
  fensterFuerRaf: () => Window | null,
): (hoerer: (px: number) => void) => () => void {
  const hoerer = new Set<(px: number) => void>();
  let raf = 0;
  let letzter = Number.NaN;
  let laeuft = false;

  const tick = () => {
    const win = fensterFuerRaf();
    if (!win) {
      laeuft = false;
      raf = 0;
      return;
    }
    const px = lies();
    if (px !== letzter) {
      letzter = px;
      for (const h of hoerer) h(px);
    }
    raf = win.requestAnimationFrame(tick);
  };

  const starte = () => {
    if (laeuft) return;
    const win = fensterFuerRaf();
    if (!win) return;
    laeuft = true;
    letzter = Number.NaN;
    raf = win.requestAnimationFrame(tick);
  };

  const stoppe = () => {
    const win = fensterFuerRaf();
    if (raf && win) win.cancelAnimationFrame(raf);
    raf = 0;
    laeuft = false;
  };

  return (h) => {
    hoerer.add(h);
    starte();
    return () => {
      hoerer.delete(h);
      if (hoerer.size === 0) stoppe();
    };
  };
}

/** Scrollstrecke eines Fensters in Dokument-Pixeln (nie negativ). */
function spanneVonFenster(win: Window): number {
  const doc = win.document?.documentElement;
  if (!doc) return 0;
  return Math.max(0, doc.scrollHeight - win.innerHeight);
}

/**
 * WELT C — die publizierte Seite. Das bisherige Verhalten des Renderkerns,
 * jetzt nur noch eine von drei Quellen.
 *
 * Laeuft die Laufzeit INNERHALB des Live-Frames (so injiziert Instatic
 * Site-Scripts, s. RuntimeScriptInjector.tsx), ist `window` dort das
 * Iframe-Fenster — dann deckt diese Quelle Welt B gleich mit ab. In H4 ist
 * genau diese Gleichheit gemessen worden (`fenster` innen == `iframe` aussen).
 */
export function fensterQuelle(win: Window = window): ScrollQuelle {
  const lies = () => win.scrollY;
  const abo = rafAbo(lies, () => win);
  return {
    art: "fenster",
    fortschritt: lies,
    spanne: () => spanneVonFenster(win),
    abonniere: abo,
  };
}

/**
 * WELT B — der Live-Frame, von AUSSEN gelesen (Editor-Realm greift in den
 * Frame). Same-origin ist durch Instatics `srcDoc`-Iframes gegeben
 * (IframeFrameSurface.tsx:96/641), trotzdem wird der Zugriff abgesichert:
 * ein fremdes Dokument darf nicht still 0 liefern, sondern meldet sich laut —
 * stilles Scheitern ist der Fehlermodus, den H1/H2 als teuersten belegt haben.
 *
 * Die rAF-Schleife laeuft im ELTERN-Fenster (dem des iframe-Elements), nicht
 * im Frame: ein verborgener oder gerade neu geladener Frame taktet
 * moeglicherweise nicht, das Elternfenster immer.
 */
export function iframeQuelle(iframe: HTMLIFrameElement): ScrollQuelle {
  let gewarnt = false;
  const fensterDrin = (): Window | null => {
    try {
      const w = iframe.contentWindow;
      /* Zugriffsprobe: bei fremder Herkunft wirft schon das Lesen. */
      void w?.document;
      return w ?? null;
    } catch (fehler) {
      if (!gewarnt) {
        gewarnt = true;
        console.error("[fcank] iframeQuelle: Frame ist nicht same-origin, Scroll nicht lesbar.", fehler);
      }
      return null;
    }
  };
  const lies = () => fensterDrin()?.scrollY ?? 0;
  const abo = rafAbo(lies, () => iframe.ownerDocument?.defaultView ?? null);
  return {
    art: "iframe",
    fortschritt: lies,
    spanne: () => {
      const w = fensterDrin();
      return w ? spanneVonFenster(w) : 0;
    },
    abonniere: abo,
  };
}

/**
 * WELT A — der Design-Frame. Er scrollt nicht, also gibt es nichts zu lesen:
 * der Fortschritt wird von aussen GESETZT (spaeter durch den Regler der
 * Editor-Flaeche, in H4 durch das Messskript).
 *
 * `spanne` ist hier keine Messung, sondern eine ANGABE — und das ist der
 * Punkt: sie muss die Spanne der Zielseite sein, nicht die des Frames.
 */
export function virtuelleQuelle(spanne = 0, start = 0): VirtuelleScrollQuelle {
  const hoerer = new Set<(px: number) => void>();
  let wert = Number.isFinite(start) ? start : 0;
  let strecke = Number.isFinite(spanne) && spanne > 0 ? spanne : 0;

  const melde = () => {
    for (const h of hoerer) h(wert);
  };

  return {
    art: "virtuell",
    fortschritt: () => wert,
    spanne: () => strecke,
    abonniere: (h) => {
      hoerer.add(h);
      h(wert); /* sofort auf Stand bringen — es gibt keinen Scroll, der es nachholt */
      return () => hoerer.delete(h);
    },
    setzePixel: (px) => {
      if (!Number.isFinite(px)) return;
      const neu = Math.max(0, px);
      if (neu === wert) return;
      wert = neu;
      melde();
    },
    setzeAnteil: (anteil) => {
      const neu = anteilZuPixel(anteil, strecke);
      if (neu === wert) return;
      wert = neu;
      melde();
    },
    setzeSpanne: (px) => {
      strecke = Number.isFinite(px) && px > 0 ? px : 0;
    },
  };
}
