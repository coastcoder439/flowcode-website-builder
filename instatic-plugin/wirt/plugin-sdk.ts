/*
 * plugin-sdk.ts — BP-08: die Plugin-SDK-Flaechen, ueber die H7 seine
 * Editor-UI montiert.
 *
 * ============================================================================
 * NOCH UNGENUTZT — UND TROTZDEM HIER
 * ============================================================================
 * Dieser Punkt wird erst in H7 wirklich benutzt, denn eine Plugin-Installation
 * verlangt in Instatic eine Passwort-Wiedereingabe (Step-Up-Auth). Diese Grenze
 * ist fuer Agenten nicht automatisierbar und soll es auch nicht sein
 * (Plan §7). Er steht trotzdem schon in der Wirt-Schicht, weil H6 die Frage
 * beantworten soll "bricht uns ein Instatic-Update?" — und ein Bruch AN EINER
 * FLAECHE, DIE WIR ERST MORGEN BENUTZEN, kostet genauso viel wie einer an einer
 * heutigen. Nur merkt man ihn ohne diese Datei erst in H7.
 *
 * ============================================================================
 * DIE AUSNAHME VON DER KAPSELUNGSREGEL
 * ============================================================================
 * `@instatic/host-ui` darf direkt importiert werden (Entscheidung E3). Grund
 * ist nicht Bequemlichkeit: es ist die EINZIGE Wirt-Flaeche mit einem eigenen
 * Paritaets-Gate-Test der Plattform
 * (`src/__tests__/architecture/plugin-host-ui-runtime-parity.test.ts`) — sie
 * kann also gar nicht still auseinanderlaufen, ohne dass Instatics eigene
 * Test-Suite rot wird. Fuer alle anderen Flaechen gibt es keine solche Zusage,
 * deshalb laufen sie durch diese Datei.
 *
 * ============================================================================
 * BERECHTIGUNGEN SIND TEIL DES VERTRAGS
 * ============================================================================
 * Jede Registrierung ist berechtigungsgesteuert (`assertPluginPermission` in
 * core/plugins/runtime.ts). Fehlt die Berechtigung, WIRFT die Registrierung —
 * ausser bei `palette.*`, wo sie still zum No-Op wird. Deshalb faengt
 * `montiereEditorFlaechen` je Flaeche einzeln ab und BERICHTET, was montiert
 * wurde: eine fehlende Berechtigung ist ein Betriebszustand ("Operator hat
 * editor.canvas nicht erteilt"), kein Programmfehler, darf aber nie still
 * bleiben.
 */

/** Die vier Flaechen, an denen H7 haengt — maschinenlesbar fuer die Suite. */
export const PLUGIN_SDK_FLAECHEN = {
  panel: {
    aufruf: "api.editor.panels.register",
    berechtigung: "editor.panels",
    wirtDatei: "src/core/plugin-sdk/types/editorApi.ts",
    /** Der Wirt erzwingt den Namensraum bei der Registrierung. */
    idPraefixPflicht: true,
  },
  overlay: {
    aufruf: "api.editor.canvas.registerOverlay",
    berechtigung: "editor.canvas",
    wirtDatei: "src/core/plugin-sdk/types/canvasOverlays.ts",
    idPraefixPflicht: true,
  },
  storeLesen: {
    aufruf: "api.editor.store.read",
    berechtigung: "editor.store.read",
    wirtDatei: "src/core/plugins/runtime.ts",
    idPraefixPflicht: false,
  },
  knotenRechteck: {
    aufruf: "useCanvasNodeRect (aus @instatic/host-hooks)",
    berechtigung: "editor.store.read",
    wirtDatei: "src/admin/plugin-host-hooks/index.ts",
    idPraefixPflicht: false,
  },
} as const;

/** Die Modulnamen der Import-Map (public/runtime/*.js). */
export const HOST_MODULE = {
  /** Hooks — laeuft ueber unsere Kapselung. */
  hooks: "@instatic/host-hooks",
  /** UI-Bausteine — DARF direkt importiert werden (E3, s. Kopfkommentar). */
  ui: "@instatic/host-ui",
  sdk: "@instatic/plugin-sdk",
} as const;

/** Die Hooks, die `@instatic/host-hooks` fuer uns bereitstellen muss. */
export const BENOETIGTE_HOST_HOOKS = ["useEditorStore", "useCanvasNodeRect"] as const;

/** Minimal-Ausschnitt der Plugin-API, den wir benutzen. Struktureller Typ —
 *  wir tippen bewusst NICHT gegen `EditorPluginApi` aus dem Klon, damit ein
 *  Feld, das wir gar nicht anfassen, uns nicht bricht. */
export interface WirtPluginApi {
  plugin: { id: string };
  editor: {
    panels?: { register: (panel: unknown) => void };
    canvas?: { registerOverlay: (overlay: unknown) => void };
    store?: { read: () => unknown };
  };
}

export interface MontageErgebnis {
  /** Flaechen, die sitzen. */
  montiert: string[];
  /** Flaeche -> Grund. Fehlende Berechtigung ODER fehlende Wirt-Flaeche. */
  ausgefallen: Record<string, string>;
  /** Kann die Editor-Flaeche ueberhaupt bedient werden? Ohne Panel: nein. */
  bedienbar: boolean;
}

function fehlerText(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

/**
 * BP-08: montiert Panel und Overlay — jede Flaeche einzeln abgesichert.
 *
 * Die Rueckgabe ist kein Protokoll fuer die Konsole, sondern die Grundlage
 * fuer eine sichtbare Meldung in der UI. Der Fallback ist gestaffelt und in
 * wirt/vertraege.ts begruendet:
 *   kein Overlay  -> Panel bleibt, Keyframes ohne Overlay bedienbar
 *   kein Panel    -> H7 ist blockiert (bedienbar=false), das muss laut sein
 */
export function montiereEditorFlaechen(
  api: WirtPluginApi,
  flaechen: { panel?: unknown; overlay?: unknown },
): MontageErgebnis {
  const montiert: string[] = [];
  const ausgefallen: Record<string, string> = {};

  if (flaechen.panel !== undefined) {
    const register = api?.editor?.panels?.register;
    if (typeof register !== "function") {
      ausgefallen.panel = `Wirt-Flaeche ${PLUGIN_SDK_FLAECHEN.panel.aufruf} fehlt (Wirt-Bruch, nicht Berechtigung).`;
    } else {
      try {
        register(flaechen.panel);
        montiert.push("panel");
      } catch (fehler) {
        ausgefallen.panel = `${PLUGIN_SDK_FLAECHEN.panel.aufruf} abgelehnt (Berechtigung "${PLUGIN_SDK_FLAECHEN.panel.berechtigung}"?): ${fehlerText(fehler)}`;
      }
    }
  }

  if (flaechen.overlay !== undefined) {
    const register = api?.editor?.canvas?.registerOverlay;
    if (typeof register !== "function") {
      ausgefallen.overlay = `Wirt-Flaeche ${PLUGIN_SDK_FLAECHEN.overlay.aufruf} fehlt (Wirt-Bruch, nicht Berechtigung).`;
    } else {
      try {
        register(flaechen.overlay);
        montiert.push("overlay");
      } catch (fehler) {
        ausgefallen.overlay = `${PLUGIN_SDK_FLAECHEN.overlay.aufruf} abgelehnt (Berechtigung "${PLUGIN_SDK_FLAECHEN.overlay.berechtigung}"?): ${fehlerText(fehler)}`;
      }
    }
  }

  return {
    montiert,
    ausgefallen,
    bedienbar: flaechen.panel === undefined || montiert.includes("panel"),
  };
}

/**
 * BP-08: der Editor-Store aus der Plugin-API — der Wert, der in
 * `schreibeNodeProps()` (BP-01) hineingeht.
 *
 * Bewusst KEIN Fallback auf einen globalen Store-Zugriff: `store.read()` ist
 * berechtigungsgesteuert, und ein Umweg daran vorbei waere eine
 * Berechtigungsumgehung, kein Ausweichweg.
 */
export function holeEditorStore(api: WirtPluginApi): unknown {
  const read = api?.editor?.store?.read;
  if (typeof read !== "function") {
    throw new Error(
      `[fcank/wirt] BP-08: ${PLUGIN_SDK_FLAECHEN.storeLesen.aufruf} fehlt. ` +
        `Ohne Berechtigung "${PLUGIN_SDK_FLAECHEN.storeLesen.berechtigung}" kann das Plugin nichts schreiben.`,
    );
  }
  return read();
}
