/*
 * lib/import/fremdkoerper-filter.ts — N15 (docs/plan-analyse/lens-import.md
 * §3-Schritt-II): REINE, deterministische Vorstufe des HTML->Puck-Imports, die
 * bekannte Hosting-/Vorschau-Fremdkoerper aus dem Roh-HTML entfernt UND das
 * zugrunde liegende Framework erkennt.
 *
 * WARUM: Bens Next-Export (test-sites/wee-website-v3/out/index.html) traegt in
 * SEINEM eigenen Markup ein Passwort-Gate (<div class="site-gate" …>) direkt vor
 * dem naechsten <script>. Ohne diese Stufe landet das Gate in einem HtmlBlock
 * und wuerde als sichtbares „Passwort eingeben"-Overlay mitexportiert. Das ist
 * kein Seiteninhalt, sondern Zugangsschutz der nicht-oeffentlichen Bereit-
 * stellung — es gehoert VOR dem Mapping raus, transparent geflaggt.
 *
 * REIN: nur `DOMParser` als Aussenwelt (parst, fuehrt nichts aus — <script> im
 * geparsten Dokument laeuft nicht), kein Netz/FS/Storage. Gleiche Eingabe ->
 * gleiche Ausgabe. Der Filter kennt eine KONSERVATIVE, benannte Selektor-Liste
 * (nie ein generisches „alle Dialoge entfernen") und dokumentiert je Eintrag,
 * WARUM er als Fremdkoerper gilt.
 *
 * SSR-sicher: ohne DOMParser (Server-Prerender) unveraendert zurueck. Der ganze
 * Import-Flow lebt ohnehin clientseitig (File System Access), erkenntFramework
 * ist eine reine Zeichenketten-Pruefung und arbeitet ueberall.
 */

/* ---- Typen ---- */

/** Eine benannte Fremdkoerper-Regel: CSS-Selektor + Begruendung fuers Flagging. */
interface FremdkoerperRegel {
  selector: string;
  beschreibung: string;
}

/** Ein tatsaechlich entfernter Fremdkoerper (fliesst in den Import-Bericht). */
export interface EntfernterFremdkoerper {
  selector: string;
  beschreibung: string;
}

export interface FremdkoerperErgebnis {
  html: string;
  entfernt: EntfernterFremdkoerper[];
}

export type FrameworkTyp = "next-static" | "unbekannt";

export interface FrameworkErkennung {
  typ: FrameworkTyp;
  /** Die konkret gefundenen Marker (leer bei „unbekannt"). */
  marker: string[];
}

/* ---- Fremdkoerper-Katalog (konservativ, benannt, begruendet) ----
 * REIHENFOLGE ist bedeutsam: die spezifischste Regel zuerst. Ein bereits
 * entfernter Knoten ist danach aus dem Baum geloest und wird von einer breiteren
 * Fallback-Regel nicht erneut getroffen — so bleibt genau EIN Flag pro echtem
 * Fremdkoerper (kein Doppelzaehlen desselben Gates). */
const FREMDKOERPER_SELEKTOREN: FremdkoerperRegel[] = [
  {
    selector: ".site-gate",
    beschreibung:
      "Passwort-/Vorschau-Gate: Zugangsschutz-Overlay der nicht-oeffentlichen Bereitstellung, kein Seiteninhalt. Bliebe es stehen, wuerde ein sichtbares Passwort-Modal mitexportiert.",
  },
  {
    selector: '[role="dialog"][aria-label*="Passwort"]',
    beschreibung:
      "Passwortschutz-Dialog (generischer Fallback zur Klassen-Regel): ein modaler Zugangs-Dialog der Hosting-/Vorschau-Ebene, nicht Teil der eigentlichen Seite.",
  },
  {
    selector: "vercel-live-feedback",
    beschreibung:
      "Vercel-Live-Feedback-Leiste: von der Vorschau-Plattform injiziertes Kommentar-/Feedback-Werkzeug — gehoert nicht in die exportierte Seite.",
  },
  {
    selector: 'iframe[src*="vercel.live"]',
    beschreibung:
      "Vercel-Live-Rahmen: eingebetteter iframe des Vorschau-Feedback-Widgets (vercel.live) — Plattform-Fremdkoerper, kein Seiteninhalt.",
  },
];

/* ---- Framework-Marker ----
 * Bewusst /_next/static/ und NICHT #__next: der Next App Router (Default seit 13)
 * emittiert #__next/#__NEXT_DATA__ NICHT mehr, aber /_next/static/ bleibt ueber
 * die Versionen stabil (docs/import-endlevel.md §4). */
const NEXT_STATIC_MARKER = "/_next/static/";

/* ------------------------------------------------------------------ */
/* Framework-Erkennung (reine Zeichenketten-Pruefung)                  */
/* ------------------------------------------------------------------ */

/**
 * Erkennt das Framework anhand stabiler Marker im Roh-HTML. Steuert spaeter die
 * Import-Strategie; hier nur Diagnose fuer den Bericht.
 */
export function erkenntFramework(html: string): FrameworkErkennung {
  const marker: string[] = [];
  if (html.includes(NEXT_STATIC_MARKER)) marker.push(NEXT_STATIC_MARKER);
  return { typ: marker.length > 0 ? "next-static" : "unbekannt", marker };
}

/* ------------------------------------------------------------------ */
/* Fremdkoerper-Filter                                                 */
/* ------------------------------------------------------------------ */

/**
 * Entfernt bekannte Hosting-/Gate-Fremdkoerper aus dem Roh-HTML und meldet jeden
 * Treffer mit Selektor + Begruendung. Rein/deterministisch (nur DOMParser).
 *
 * SSR/ohne DOMParser: gibt die Eingabe unveraendert zurueck (entfernt: []).
 */
export function entferneFremdkoerper(html: string): FremdkoerperErgebnis {
  if (typeof DOMParser === "undefined") return { html, entfernt: [] };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const entfernt: EntfernterFremdkoerper[] = [];

  for (const regel of FREMDKOERPER_SELEKTOREN) {
    let treffer: Element[];
    try {
      treffer = Array.from(doc.querySelectorAll(regel.selector));
    } catch {
      /* Ungueltiger Selektor (sollte bei fixem Katalog nie passieren) —
         defensiv ueberspringen, nie den Import sprengen. */
      continue;
    }
    for (const el of treffer) {
      /* Bereits (als Nachfahre eines frueheren Treffers) aus dem Baum geloest?
         Dann nichts tun — verhindert Doppelzaehlung desselben Fremdkoerpers. */
      if (!el.isConnected) continue;
      el.remove();
      entfernt.push({ selector: regel.selector, beschreibung: regel.beschreibung });
    }
  }

  /* Wenn nichts entfernt wurde, die Original-Zeichenkette zurueckgeben (keine
     Serialisierungs-Normalisierung ohne Grund). */
  if (entfernt.length === 0) return { html, entfernt };

  return { html: doc.documentElement.outerHTML, entfernt };
}
