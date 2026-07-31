/*
 * runtime.ts — die schlanke Laufzeit (Teilaufgabe 2 von H3a).
 *
 * WAS DAS IST — UND WAS NICHT
 * ---------------------------
 * Das ist NICHT der 1:1-Port von components/grafik/GrafikLayer.tsx. Bewusst.
 * GrafikLayer haengt an React, GrafikContext, GrafikMedium, buehne-doc und
 * einer CSS-Datei — alles Editor-Infrastruktur, die auf einer veroeffentlichten
 * Instatic-Seite nichts zu suchen hat. Fuer den Beweis der KETTE ist der
 * React-Mantel wertlos.
 *
 * Was ECHT uebernommen ist, ist der Teil, auf den es ankommt: das DATENMODELL
 * und die BEWEGUNGSMATHEMATIK. `zustandBei()`, `scrubFortschritt()`,
 * `grafikenFuerRendering()` und die kubische Bezier-Easing kommen unveraendert
 * aus kern/grafik-types.ts + kern/easing.ts (byteidentische Kopien der
 * Builder-Dateien, s. dortiger Diff-Beleg). Neu geschrieben ist nur die
 * Huelle: Anker aufloesen, rAF-Schleife, transform/opacity ins DOM.
 *
 * ZWEITER UNTERSCHIED ZU GrafikLayer — UND ER IST ABSICHT
 * ------------------------------------------------------
 * GrafikLayer legt eine EIGENE Ebene ueber die Seite und setzt jede Grafik als
 * absolut positioniertes Overlay auf die Dokument-Koordinate (x, y) — deshalb
 * dort `translate(-50%,-50%)` (der Keyframe sitzt auf dem MITTELPUNKT).
 *
 * Hier wird stattdessen ein Element BEWEGT, DAS DIE SEITE SELBST GERENDERT HAT.
 * Es bleibt im Layout-Fluss von Instatic; wir schreiben nur eine Transform
 * obendrauf. Damit sind Keyframe-x/y hier ein VERSATZ gegenueber der
 * natuerlichen Position des Elements, keine Dokument-Absolutkoordinate. Das ist
 * die einzige semantische Abweichung vom Overlay-Pfad und die richtige fuer
 * "der Wirt rendert, wir animieren".
 *
 * Keine Imports ausser dem eigenen Kern: kein React, kein Next, kein Puck,
 * kein Instatic-SDK.
 */

import { ankerElement, ankerKollisionen } from "./anker";
import { scrubFortschritt, zustandBei, type Grafik } from "./grafik-types";
import {
  fensterQuelle,
  iframeQuelle,
  virtuelleQuelle,
  anteilZuPixel,
  pixelZuAnteil,
  type ScrollQuelle,
} from "./scroll-quelle";

/** Die Config, die eine Seite der Laufzeit vorlegt. */
export interface FcankConfig {
  /** Schema-Version — bricht die Laufzeit lieber sichtbar als still. */
  version: 1;
  /** Die zu animierenden Grafiken. `Grafik.id` IST die Anker-Id:
   *  id "hero" wird zu class="fcank-hero" (s. kern/anker.ts). */
  grafiken: Grafik[];
}

/** Startoptionen. Ohne Angabe verhaelt sich die Laufzeit exakt wie in H3a. */
export interface FcankOptionen {
  /** Woher der Scroll-Fortschritt kommt (H4). Default: `fensterQuelle()` —
   *  also das bisherige `window.scrollY`-Verhalten, Welt C. */
  quelle?: ScrollQuelle;
  /** Zielelemente statt `document` woanders suchen — noetig, wenn die Laufzeit
   *  im Eltern-Realm laeuft und die Anker in einem Frame liegen. Default:
   *  `document` des eigenen Realms. */
  wurzel?: ParentNode;
}

/** Was `fcank.status()` fuer die Messung zurueckgibt. */
export interface FcankStatus {
  laeuft: boolean;
  reduziert: boolean;
  /** Stand auf der Scroll-Achse in DOKUMENT-PIXELN (H4: der kanonische Wert). */
  fortschritt: number;
  /** Groesster erreichbarer Fortschritt dieser Welt, in Dokument-Pixeln. */
  spanne: number;
  /** Derselbe Stand als 0..1 — NUR Anzeige. Nicht zwischen Welten austauschen:
   *  der Nenner (`spanne`) ist welt-abhaengig (s. scroll-quelle.ts). */
  anteil: number;
  /** Welche Quelle gerade treibt. */
  quelle: ScrollQuelle["art"] | null;
  /** Alias von `fortschritt` — haelt die H3a-Messskripte lauffaehig. */
  scrollY: number;
  /** Anker-Id -> aufgeloest? */
  anker: Record<string, boolean>;
  /** Anker-Ids, die MEHRFACH im Dokument vorkommen (H2-Duplizieren-Kollision). */
  kollisionen: Record<string, number>;
  /** Momentaufnahme des gerechneten Zustands je Grafik. */
  zustaende: Record<string, ReturnType<typeof zustandBei>>;
}

interface Gebunden {
  g: Grafik;
  el: HTMLElement;
}

const GLOBAL_CONFIG_SCHLUESSEL = "FCANK_CONFIG";

function istConfig(wert: unknown): wert is FcankConfig {
  if (!wert || typeof wert !== "object") return false;
  const c = wert as Partial<FcankConfig>;
  return c.version === 1 && Array.isArray(c.grafiken);
}

/** Baut den Transform-String. Reihenfolge wie in GrafikLayer: Spiegeln ganz
 *  rechts, damit es in der UNROTIERTEN Eigengeometrie des Elements wirkt. */
function transformString(z: ReturnType<typeof zustandBei>, g: Grafik): string {
  const sx = g.spiegelX ? -1 : 1;
  const sy = g.spiegelY ? -1 : 1;
  return (
    `translate3d(${z.x.toFixed(1)}px, ${z.y.toFixed(1)}px, 0)` +
    ` scale(${z.scale.toFixed(3)})` +
    ` rotate(${z.rotation.toFixed(1)}deg)` +
    ` scaleX(${sx}) scaleY(${sy})`
  );
}

class FcankLaufzeit {
  private config: FcankConfig | null = null;
  private gebunden: Gebunden[] = [];
  private abmelden: (() => void) | null = null;
  private quelle: ScrollQuelle | null = null;
  private wurzel: ParentNode = document;
  private reduziert = false;

  /** Startet (oder ersetzt) die Animation. Idempotent: ein zweiter Aufruf
   *  stoppt sauber und bindet neu — kein zweites Abo.
   *
   *  H4: Die Scroll-Achse kommt jetzt von aussen. Ohne `optionen.quelle` ist
   *  das `fensterQuelle()`, also bit-fuer-bit das H3a-Verhalten. */
  start(config: unknown, optionen: FcankOptionen = {}): void {
    if (!istConfig(config)) {
      console.error("[fcank] Config ungueltig oder falsche Version — Start abgebrochen.", config);
      return;
    }
    this.stop();
    this.config = config;
    this.wurzel = optionen.wurzel ?? document;
    this.quelle = optionen.quelle ?? fensterQuelle();
    this.reduziert =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.binden();

    /* prefers-reduced-motion: kein Abo, nur der Zustand am ERSTEN Keyframe —
       die Grafik steht ruhig an ihrer Ausgangsposition (dieselbe Regel wie in
       GrafikLayer). */
    if (this.reduziert) {
      this.schreibe(this.config.grafiken[0]?.keyframes[0]?.scrollY ?? 0);
      return;
    }

    /* Erst einmal auf Stand bringen, dann abonnieren. Die lesenden Quellen
       melden nur bei AENDERUNG; ohne diesen ersten Schreibvorgang staende ein
       Element bis zur ersten Scroll-Bewegung untransformiert da. */
    this.schreibe(this.quelle.fortschritt());
    this.abmelden = this.quelle.abonniere((px) => this.schreibe(px));
  }

  stop(): void {
    this.abmelden?.();
    this.abmelden = null;
    this.quelle = null;
    this.gebunden = [];
  }

  /** Anker EINMAL aufloesen (nicht pro Frame — dieselbe Regel wie die
   *  Anker-Map in GrafikLayer). Fehlende Anker werden LAUT gemeldet, nie
   *  still geschluckt: ein stiller Fehlschlag ist genau der Fehlermodus,
   *  den H2 als teuersten identifiziert hat. */
  private binden(): void {
    const fehlend: string[] = [];
    this.gebunden = [];
    for (const g of this.config?.grafiken ?? []) {
      const el = ankerElement(g.id, this.wurzel);
      /* `instanceof HTMLElement` prueft gegen den HTMLElement-Konstruktor DIESES
         Realms. Liegt der Anker in einem Iframe (Laufzeit im Eltern-Realm),
         stammt das Element aus einem anderen Realm und faellt durch. Deshalb
         wird gegen den Konstruktor des BESITZENDEN Dokuments geprueft. */
      if (!istHtmlElement(el)) {
        fehlend.push(g.id);
        continue;
      }
      this.gebunden.push({ g, el });
    }
    if (fehlend.length > 0) {
      console.warn(`[fcank] Anker nicht gefunden: ${fehlend.join(", ")} (erwartet: class="fcank-<id>")`);
    }
    const doppelt = ankerKollisionen(this.wurzel);
    if (Object.keys(doppelt).length > 0) {
      console.warn("[fcank] Anker-Id mehrfach im Dokument (H2-Duplizieren-Kollision):", doppelt);
    }
  }

  private schreibe(fortschritt: number): void {
    for (const { g, el } of this.gebunden) {
      const z = zustandBei(g, fortschritt);
      el.style.transform = transformString(z, g);
      el.style.opacity = z.opacity.toFixed(3);
      /* scrub bleibt Teil des Datenmodells (Lottie/Video im alten Kern). Hier
         ohne Medien-Griff nur als Messwert verfuegbar, nicht als Wirkung. */
      void scrubFortschritt;
    }
  }

  status(): FcankStatus {
    const anker: Record<string, boolean> = {};
    const zustaende: Record<string, ReturnType<typeof zustandBei>> = {};
    const px = this.quelle?.fortschritt() ?? 0;
    const spanne = this.quelle?.spanne() ?? 0;
    for (const g of this.config?.grafiken ?? []) {
      const treffer = this.gebunden.find((b) => b.g.id === g.id);
      anker[g.id] = Boolean(treffer);
      zustaende[g.id] = zustandBei(g, px);
    }
    return {
      laeuft: this.abmelden !== null,
      reduziert: this.reduziert,
      fortschritt: px,
      spanne,
      anteil: pixelZuAnteil(px, spanne),
      quelle: this.quelle?.art ?? null,
      scrollY: px,
      anker,
      kollisionen: ankerKollisionen(this.wurzel),
      zustaende,
    };
  }
}

/** Realm-sichere HTMLElement-Pruefung (s. binden()). */
function istHtmlElement(el: unknown): el is HTMLElement {
  if (el === null || typeof el !== "object") return false;
  const kandidat = el as { ownerDocument?: Document | null };
  const fremd = kandidat.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
  if (fremd && el instanceof fremd.HTMLElement) return true;
  return el instanceof HTMLElement;
}

const laufzeit = new FcankLaufzeit();

/** Oeffentliche Oberflaeche auf `window.fcank`.
 *
 *  Die Quellen-Fabriken haengen bewusst MIT dran: eine Editor-Flaeche (oder,
 *  wie in H4, ein Messskript) laeuft ohne Modul-System im fremden Realm und
 *  kann nichts importieren — sie muss sich ihre Quelle vom Bundle geben
 *  lassen, sonst gaebe es zwei Implementierungen derselben Achse. */
const oberflaeche = {
  start: (config: unknown, optionen?: FcankOptionen) => laufzeit.start(config, optionen),
  stop: () => laufzeit.stop(),
  status: () => laufzeit.status(),
  /** Die drei Welten als Fabriken — s. kern/scroll-quelle.ts. */
  quellen: {
    fenster: fensterQuelle,
    iframe: iframeQuelle,
    virtuell: virtuelleQuelle,
  },
  /** Umrechnung Regler <-> Dokument-Pixel, damit die UI dieselbe benutzt. */
  anteilZuPixel,
  pixelZuAnteil,
  version: 1 as const,
};

declare global {
  interface Window {
    fcank?: typeof oberflaeche;
    FCANK_CONFIG?: unknown;
  }
}

window.fcank = oberflaeche;

/* Auto-Start: die Config darf VOR dem Bundle als `window.FCANK_CONFIG` liegen
   (so macht es das Site-Script in H3a). Liegt keine da, passiert nichts — die
   Seite kann spaeter `fcank.start(...)` rufen. `dom-ready` ist die
   Instatic-Default-Timing-Einstellung fuer Site-Scripts; der zusaetzliche
   readyState-Check macht das Bundle unabhaengig davon auch bei `immediate`
   korrekt. */
function autostart(): void {
  const config = (window as unknown as Record<string, unknown>)[GLOBAL_CONFIG_SCHLUESSEL];
  if (config !== undefined) laufzeit.start(config);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autostart, { once: true });
} else {
  autostart();
}

export { laufzeit };
