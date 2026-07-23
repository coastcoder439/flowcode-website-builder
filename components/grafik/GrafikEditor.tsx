"use client";

/*
 * GrafikEditor – das Bearbeitungs-Overlay der Seite /grafik-editor.
 *
 * WORKFLOW (Kundenvorgabe):
 *   scrollen → Grafik wählen/setzen/skalieren → Position auf den
 *   „Scroll-Keyframe" locken → weiter zur nächsten Stelle.
 *
 * Bedienung bewusst identisch zum Fluss-Editor:
 *   Klick auf Grafik  = auswählen
 *   Ziehen            = verschieben (Dokument-Koordinaten)
 *   Klick ohne Ziehen = „einloggen" (gelb) → Scrollrad skaliert statt zu
 *                       scrollen; ESC / erneuter Klick = ausloggen
 *
 * Ein Keyframe hält Scrollposition + Dokument-Position + Größe. Beim Ziehen
 * wird IMMER der Keyframe bearbeitet, der der aktuellen Scrollposition am
 * nächsten liegt — sonst würde man unbemerkt einen fremden Keyframe
 * verbiegen. „Keyframe hier setzen" legt an der aktuellen Scrollposition
 * einen neuen an (bzw. überschreibt den, der schon dort sitzt).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGrafiken } from "./GrafikContext";
import { GrafikObjektMenue } from "./GrafikObjektMenue";
import { GrafikInspector } from "./GrafikInspector";
import { GrafikKeyframeTimeline } from "./GrafikKeyframeTimeline";
import { SeiteTab } from "./GrafikSeiteTab";
import { GrafikTutorial, HilfeIcon, tutorialAlsGesehenMerken, tutorialNochNichtGesehen } from "./GrafikHilfe";
import {
  HilfeMenue,
  ProduktTutorial,
  produktTutorialAlsGesehenMerken,
  produktTutorialNochNichtGesehen,
} from "./ProduktTutorial";
import { GrafikExportPanel } from "./GrafikExportPanel";
import { useFlussObjekt } from "@/components/river/FlussObjektContext";
import { FlussObjektBild } from "@/components/river/FlussObjektBild";
import { ProfileSektion } from "@/components/river/sektionen/ProfileSektion";
import { BackdropAuswahl } from "@/components/backdrop/BackdropAuswahl";
import { useBackdropCtx } from "@/components/backdrop/BackdropContext";
import { useAktiveSeite } from "@/lib/aktive-seite";
import {
  WebsiteOgEbene,
  WebsiteOgObjekt,
  WebsiteOgOverlay,
  ogScannen,
  ogAlsGrafikErzeugen,
  type OgEintrag,
} from "./WebsiteOg";
import { EasingKurve } from "./EasingKurve";
import { EASING_DEFAULT } from "./easing";
import {
  idbGet,
  inOrdnerSchreiben,
  K_ORDNER,
  ordnerApiDa,
  ordnerDateien,
  ordnerHolen,
  ordnerWaehlen,
  presetsHolen,
  presetsSetzen,
  type OrdnerHandle,
} from "./grafik-store";
import {
  keyframesAusPreset,
  medienArt,
  presetAusGrafik,
  skaliereGrafikenFuerHoehe,
  zustandBei,
  VORHANG_GRAFIK_PREFIX,
  type AnimationsPreset,
  type Asset,
  type Grafik,
  type GrafikKeyframe,
  type GrafikSetup,
} from "./grafik-types";
import {
  istEditorChrome,
  rechteckAus,
  schneidenSich,
  shiftKlickToggle,
  volleAuswahl,
  type Rechteck,
} from "./grafik-mehrfachauswahl";
import { andereSnapBoxen, berechneSnap, tentativeBox, type SnapErgebnis } from "./grafik-snapping";
import "./grafik-editor.css";

const STORAGE_KEY = "wee-grafik-setups";
/** Bewegungs-Schwelle (px): darunter zählt pointerup als Klick (Lock). */
const KLICK_TOLERANZ_PX = 4;
/** Scrollrad: Skalierungs-Faktor pro Raste. */
const WHEEL_FAKTOR = 1.08;
const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
/** Zwei Keyframes gelten als „am selben Ort", wenn ihr Scroll-Abstand
 *  darunter liegt — dann wird überschrieben statt einen Zwilling anzulegen. */
const KF_SNAP_PX = 40;
/** Data-URL-Grenze: localStorage fasst ~5 MB, darüber warnen wir früh. */
const MAX_DATEI_BYTES = 1_200_000;
/** Einrasten (Snapping) beim Ziehen: Rastergröße in px (Viewport/Dokument —
 *  beide Räume sind für ein Delta identisch, s. grafik-snapping.ts) und
 *  Einrast-Schwelle. */
const SNAP_RASTER_PX = 20;
const SNAP_SCHWELLE_PX = 6;
/** Schritt der Pfeiltasten-Verschiebung — Umschalt = großer Schritt. */
const PFEIL_SCHRITT_PX = 1;
const PFEIL_SCHRITT_GROSS_PX = 10;

type Reiter =
  | "bibliothek"
  | "ebenen"
  | "bild"
  | "keyframes"
  | "setups"
  | "seite"
  | "hintergrund"
  | "export";

/* Reiter-Reihenfolge folgt der User-Reise (Bauvorlage §2, Welle 2b-2):
   Einrichten/Einfügen → Anordnen → Bearbeiten → Animieren → Seite → Hintergrund
   → Sichern → Veröffentlichen. Die internen `id`-Werte bleiben bewusst stabil
   („bild"/„keyframes"/„setups") — nur die sichtbaren Labels und die Reihenfolge
   ändern sich, damit die vielen `reiter === "…"`-Zweige unangetastet bleiben
   (additiv, kein Umbenennen im ganzen File). Zuordnung Label ↔ id:
     Objekt = id „bild" (kontextuell Grafik-Inspector ODER Fluss-Sektionen),
     Animation = id „keyframes", Speichern = id „setups". */
const REITER: { id: Reiter; label: string }[] = [
  { id: "bibliothek", label: "Bibliothek" },
  { id: "ebenen", label: "Ebenen" },
  { id: "bild", label: "Objekt" },
  { id: "keyframes", label: "Animation" },
  { id: "seite", label: "Seite" },
  { id: "hintergrund", label: "Hintergrund" },
  { id: "setups", label: "Speichern" },
  /* Letzter Reiter = letzter Schritt der Kette (Phase 3): erst wenn Grafiken
     + Fluss stehen, ergibt ein Export überhaupt Sinn. */
  { id: "export", label: "Export" },
];

/** Alle Formate, die der Editor annimmt — Bilder, Lottie und Video.
 *  .json = Lottie (Bodymovin/After Effects, Canva exportiert das ebenfalls). */
const BILD_ENDUNGEN = /\.(svg|png|apng|jpe?g|webp|gif|avif|json|lottie|mp4|webm)$/i;
/** Für den Datei-Dialog. */
const ACCEPT =
  ".svg,.png,.apng,.jpg,.jpeg,.webp,.gif,.avif,.json,.lottie,.mp4,.webm,image/*,video/mp4,video/webm,application/json";
/** Schutz gegen versehentliches Einlesen riesiger Ordner. */
const MAX_ASSETS = 300;
/** Bibliotheks-Ordner ab dieser Dateizahl starten eingeklappt — sonst wirkt
 *  z.B. ein Ordner mit 16 Baum-Varianten wie ein Wust. */
const ORDNER_AUFKLAPP_SCHWELLE = 6;

function ladeSetups(): Record<string, GrafikSetup> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, GrafikSetup>;
  } catch {
    return {};
  }
}

function neueId(): string {
  return `g${Date.now().toString(36)}${Math.floor(performance.now() * 1000) % 997}`;
}

/** true, wenn GERADE in einem Textfeld getippt wird — Tastenkürzel (Strg+Z,
 *  Entf, Esc, …) dürfen dann NICHT feuern, sonst würde z.B. Entf beim
 *  Umbenennen den Ebenennamen kaputt machen statt die Grafik zu löschen.
 *  Modul-Ebene (nicht pro Render neu gebaut) — von Tastatur-Shortcut UND
 *  Strg+V/Drop-Handler benutzt, damit es nur EINE Definition davon gibt. */
function istEingabeFokussiert(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

/** Index des Keyframes, der dieser Scrollposition am nächsten liegt. */
function naechsterKfIndex(g: Grafik, scrollY: number): number {
  let best = 0;
  let bestD = Infinity;
  g.keyframes.forEach((k, i) => {
    const d = Math.abs(k.scrollY - scrollY);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/* --- Element-ID-Anker (Welle 3b, s. docs/editor-vereinheitlichung.md §8/3b) --
 * Setz-Seite des Ankers: das nächstliegende getaggte `[data-og-id]`-Element als
 * drift-feste Referenz eines Keyframes ermitteln. Die Auflösungs-/Render-Seite
 * steckt in grafik-types.grafikenFuerRendering + GrafikLayer.
 */

/** Vertikale Suchreichweite für den Element-ID-Anker: liegt kein getaggtes
 *  Element näher als 1,5 Bildschirmhöhen am Keyframe, bleibt der Keyframe ohne
 *  Anker (rein absolut) — sonst würde ein weit entferntes Element als „Anker"
 *  gewählt, dessen Bewegung mit dem Keyframe nichts zu tun hat. */
const ANKER_MAX_ABSTAND_VH = 1.5;

/** Anker-Felder „leeren": jede Positions-/Zeit-Änderung AUSSER „Hier locken"
 *  und Drag-Ende löst einen bestehenden Anker, damit die geänderten Absolut-
 *  werte NICHT vom (nun veralteten) Anker überschrieben werden — sonst „klebt"
 *  der Keyframe an seiner alten Stelle (grafikenFuerRendering lässt den Anker
 *  gewinnen). Neu-Ankern passiert bewusst nur an den beiden benannten
 *  Setz-Punkten (Spec §8/3b Punkt 2). Flach in den Keyframe gemischt
 *  ({ ...k, ...ANKER_LEER }) verschwinden die drei Felder sauber. */
const ANKER_LEER: Pick<GrafikKeyframe, "ankerId" | "ankerDy" | "ankerScrollDy"> = {
  ankerId: undefined,
  ankerDy: undefined,
  ankerScrollDy: undefined,
};

/** Ermittelt den drift-festen Anker für einen Keyframe an Dokument-y (`yDoc`)
 *  und Trigger-Scrollhöhe (`scrollYDoc`): das vertikal nächstliegende
 *  `[data-og-id]`-Element (Abstand yDoc ↔ Element-Dokument-Oberkante), sofern
 *  innerhalb `ANKER_MAX_ABSTAND_VH` · Bildschirmhöhe. Liefert die drei
 *  Anker-Felder ODER — wenn kein Element nah genug ist — `ANKER_LEER` (explizit
 *  „kein Anker", damit der Aufrufer sie flach mischen und einen ALTEN Anker
 *  sauber überschreiben kann). Reine Nutzer-Geste (Hier-locken/Drag-Ende): ein
 *  querySelectorAll ist hier unkritisch (NICHT pro Frame, anders als der
 *  Render-Pfad in GrafikLayer). */
function ankerFelderFuer(
  yDoc: number,
  scrollYDoc: number,
): Pick<GrafikKeyframe, "ankerId" | "ankerDy" | "ankerScrollDy"> {
  if (typeof document === "undefined") return ANKER_LEER;
  const sy = window.scrollY;
  const grenze = window.innerHeight * ANKER_MAX_ABSTAND_VH;
  let besteId: string | null = null;
  let besterTop = 0;
  let bestAbstand = Infinity;
  const gesehen = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-og-id]").forEach((el) => {
    const id = el.getAttribute("data-og-id");
    if (!id || gesehen.has(id)) return;
    gesehen.add(id);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const top = r.top + sy;
    const abstand = Math.abs(top - yDoc);
    if (abstand < bestAbstand) {
      bestAbstand = abstand;
      besteId = id;
      besterTop = top;
    }
  });
  if (besteId === null || bestAbstand > grenze) return ANKER_LEER;
  return { ankerId: besteId, ankerDy: yDoc - besterTop, ankerScrollDy: scrollYDoc - besterTop };
}

/** Höhen-Normalisierungsfaktor beim Laden eines Setups (Robustheits-Fix):
 *  aktuelle Dokumenthöhe ÷ die Höhe, gegen die die Keyframes autoriert
 *  wurden (meta.docH, s. lokalSpeichern/speichern unten — dort NUR zur
 *  Nachvollziehbarkeit erfasst, hier erstmals tatsächlich ausgewertet).
 *  Fehlt eine gültige autorierte Höhe (ältere Setups, docH=0), gilt
 *  faktor=1 — unverändertes Altverhalten statt eines Ladefehlers. */
function hoehenFaktor(autoriertDocH: number | undefined | null): number {
  if (!autoriertDocH || autoriertDocH <= 0) return 1;
  const aktuelleDocH = document.documentElement.scrollHeight;
  if (!Number.isFinite(aktuelleDocH) || aktuelleDocH <= 0) return 1;
  return aktuelleDocH / autoriertDocH;
}

/** Kurzer Statuszeilen-Zusatz, wenn eine Höhen-Anpassung gegriffen hat
 *  (faktor=1 = nichts zu vermelden, häufigster Fall). */
function hoehenHinweis(faktor: number): string {
  return faktor === 1 ? "" : ` · Höhe angepasst ×${faktor.toFixed(2)}`;
}

/** SVGs sind schon Vektor – „In SVG umwandeln" ergibt dort keinen Sinn. */
function istSvgName(name: string): boolean {
  return /\.svg$/i.test(name);
}

/** <basis>.svg, mit Zähler bei Namenskollision – verhindert, dass eine
 *  zweite Vektorisierung derselben Quelle eine vorherige SVG-Datei (im Pool
 *  UND im verbundenen Ordner, s. inOrdnerSchreiben überschreibt gleiche
 *  Namen kommentarlos) still ersetzt. */
function eindeutigerSvgName(quellName: string, pool: Asset[]): string {
  const punkt = quellName.lastIndexOf(".");
  const basis = punkt > 0 ? quellName.slice(0, punkt) : quellName;
  const namen = new Set(pool.map((a) => a.name));
  let name = `${basis}.svg`;
  let n = 2;
  while (namen.has(name)) {
    name = `${basis}-${n}.svg`;
    n++;
  }
  return name;
}

/** Antwortform von /api/vektorisieren. Bewusst lokal dupliziert statt aus
 *  der Route importiert: dieses Client-Modul soll nicht am Server-only-
 *  Modulgraphen (sharp u.a.) hängen. Muss zu VektorisierenAntwort in
 *  app/api/vektorisieren/route.ts passen. */
interface VektorAntwort {
  svg: string;
  gruppen: { name: string; farbe: string; pfade: number }[];
  breite: number;
  hoehe: number;
  dauerMs: number;
  herunterskaliert?: { vonBreite: number; vonHoehe: number };
}

/** Antwortform von /api/assets ({ aktion: "liste" }). Aus demselben Grund
 *  wie VektorAntwort lokal dupliziert statt importiert (s.o.). Muss zu
 *  AssetEintrag/liste() in app/api/assets/route.ts passen. */
interface AssetListeEintrag {
  name: string;
  pfad: string;
  url: string;
  ordner: string;
  groesse: number;
}
interface AssetListeAntwort {
  assets: AssetListeEintrag[];
  wurzel: string;
  abgeschnitten: boolean;
}

/** Antwortform von /api/assets ({ aktion: "schreibe", ... }). */
interface AssetSchreibenAntwort {
  name: string;
  pfad: string;
  url: string;
  ordner: string;
}

/** Antwortformen von /api/abbild — lokal dupliziert statt importiert, aus
 *  demselben Grund wie oben (dieses Client-Modul soll nicht am Server-only-
 *  Modulgraphen haengen). Muss zu app/api/abbild/route.ts passen. */
interface AbbildListenEintrag {
  name: string;
  gespeichert: string;
  grafikenAnzahl: number;
  poolAnzahl: number;
}
interface AbbildListeAntwort {
  abbilder: AbbildListenEintrag[];
}
/** Nur die Felder, die der Client tatsaechlich liest — $doc/$koordinaten/
 *  version stehen zusaetzlich in der Datei, werden hier nicht gebraucht. */
interface AbbildDateiForm {
  name: string;
  gespeichert: string;
  meta: { viewportW: number; viewportH: number; docH: number };
  grafiken: Grafik[];
  pool: Asset[];
  /** Optional: aeltere Abbilder ohne Uebernahme-Feature haben dieses Feld
     nicht — beim Laden dann als "nichts uebernommen" behandeln. */
  uebernommen?: string[];
}
interface AbbildLadeAntwort {
  name: string;
  abbild: AbbildDateiForm;
}
interface AbbildSpeichernAntwort {
  name: string;
  pfad: string;
  gespeichert: string;
}
interface AbbildLoeschenAntwort {
  name: string;
  geloescht: boolean;
}
interface AbbildStandardAntwort {
  pfad: string;
  grafikenAnzahl: number;
}

export function GrafikEditor() {
  const ctx = useGrafiken();
  /* /editor (Welle 2b-1): der Fluss ist ein Objekt in DIESEM Panel. Auf der
     alten Route (Redirect) fehlt der Provider → null → alle Fluss-Zweige
     unten sind No-Ops, der Grafik-Editor bleibt exakt wie zuvor. */
  const flussObjekt = useFlussObjekt();
  /* Stabiler Zugriff auf das Fluss-Objekt aus dem Fenster-Pointer-Effekt
     (Alt+Klick, s.u.) — ohne flussObjekt in dessen Abhängigkeiten aufzunehmen
     (das würde die Pointer-Listener bei jedem Context-Wechsel neu an-/abmelden). */
  const flussObjektRef = useRef(flussObjekt);
  flussObjektRef.current = flussObjekt;
  /* Backdrop-Zustand (nur auf /editor vorhanden) — bei Wechsel wird die
     Ist-Stand-Liste neu gescannt (die getaggten Landing-Elemente werden dann
     durch die fremde Seite ersetzt bzw. kommen zurück). Null-tolerant. */
  const backdropCtx = useBackdropCtx();
  /* Website-OG (AP-D, Welle 3a, s. WebsiteOg.tsx): getaggte Landing-Elemente
     als eigene „Ist-Stand"-Ebene. Lokaler Oberflächenzustand wie auswahl/
     tauschQuelle — kein Verlauf, keine Projektdaten. */
  const [ogListe, setOgListe] = useState<OgEintrag[]>([]);
  const [ogAuswahl, setOgAuswahl] = useState<string | null>(null);
  const [ogStatus, setOgStatus] = useState("");
  /* Welle 5b: die aktive Website ist die Default-Buehne des Animators (statt
     der WEE-Demo-Landing, s. app/editor/page.tsx). Der Name selbst wird hier
     NICHT verarbeitet — er dient nur als Rescan-Ausloeser: wechselt die aktive
     Seite, montiert die Buehne neu und der Ist-Stand muss frisch eingelesen
     werden (Welle 5c, s. OG-Scan-Effekt unten). */
  const aktiveSeite = useAktiveSeite();
  /* Welle 5c: manueller Rescan der Ist-Stand-Liste („Neu einlesen"). Die Buehne
     (Puck-Seite) laedt asynchron; erhoeht der Knopf diesen Zaehler, laeuft der
     OG-Scan-Effekt erneut. */
  const [ogNeuEinlesenNonce, setOgNeuEinlesenNonce] = useState(0);
  const [reiter, setReiter] = useState<Reiter>("bibliothek");
  const [setups, setSetups] = useState<Record<string, GrafikSetup>>({});
  /** Abbilder, die wirklich auf der Platte liegen (abbilder/*.json via
   *  /api/abbild) — getrennt von `setups` (Browserspeicher), damit das Panel
   *  zeigen kann, WO ein Setup tatsaechlich liegt. */
  const [serverAbbilder, setServerAbbilder] = useState<AbbildListenEintrag[]>([]);
  const [name, setName] = useState("setup-1");
  const [status, setStatus] = useState("");
  /** Einstiegs-Tutorial: offen beim allerersten Besuch (s. Effekt unten) UND
   *  jederzeit über den „? Hilfe"-Knopf im Panel-Kopf wieder aufrufbar. */
  const [tutorialOffen, setTutorialOffen] = useState(false);
  /** Produkt-Onboarding (Welle 5d, §10/5d): eigener Latch, laeuft beim ersten
   *  Besuch VOR dem Animator-Tutorial und ist danach ueber das „?"-Kopf-Menue
   *  einzeln aufrufbar (s. ProduktTutorial.tsx). */
  const [produktTutorialOffen, setProduktTutorialOffen] = useState(false);
  /** Merkt, dass das Produkt-Tutorial gerade als AUTOMATISCHE Erst-Besuch-Kette
   *  laeuft — dann folgt nach dem Schliessen das Animator-Tutorial. Bei manuellem
   *  Aufruf ueber das Kopf-Menue bleibt es aus (kein ungewolltes Nachladen). */
  const produktAutoKetteRef = useRef(false);
  const [scrollY, setScrollY] = useState(0);
  /** true, solange eine Datei über der Seite schwebt (Drop-Hinweis). */
  const [dropAktiv, setDropAktiv] = useState(false);
  /** Erste Ebene eines Tausch-Vorgangs („⇄" gedrückt, wartet auf die zweite). */
  const [tauschQuelle, setTauschQuelle] = useState<string | null>(null);
  /** Asset-POOL: verfügbare Grafiken (aus PC-Ordner/Dateien) — unabhängig
   *  davon, ob schon etwas auf der Seite platziert ist. */
  const [pool, setPool] = useState<Asset[]>([]);
  const [poolFilter, setPoolFilter] = useState("");
  /** Animations-Presets ("voranimierte Assets", IndexedDB K_PRESETS) — in der
   *  Bibliothek unter „Presets" gelistet, im Reiter Animation gespeichert.
   *  Reine Zusatz-Bibliothek: unabhängig von platzierten Grafiken/Setups. */
  const [presets, setPresets] = useState<AnimationsPreset[]>([]);
  const ordnerRef = useRef<HTMLInputElement>(null);
  /** Verbundener PC-Ordner. Der Handle liegt in IndexedDB und überlebt den
   *  Neustart — die Bibliothek wird daraus GELESEN statt gespeichert.
   *  Dadurch gibt es für Assets KEINE Größengrenze mehr. */
  const [ordner, setOrdner] = useState<OrdnerHandle | null>(null);
  /** true = Ordner ist gemerkt, aber der Browser will noch ein Klick-OK. */
  const [ordnerWartet, setOrdnerWartet] = useState(false);
  /* Vektorisieren: Regler-Werte (Defaults aus der Aufgabenbeschreibung) +
     Ladezustand (blockiert Mehrfachklicks, zeigt das Overlay). */
  const [vektorMaxFarben, setVektorMaxFarben] = useState(8);
  const [vektorMinFlaeche, setVektorMinFlaeche] = useState(40);
  const [vektorGlaettung, setVektorGlaettung] = useState(0.5);
  const [vektorisiertLaeuft, setVektorisiertLaeuft] = useState(false);
  /* Freistellen (Hintergrund entfernen, s. GrafikInspector.tsx): gleiches
     Lade-/Sperrmuster wie vektorisiertLaeuft oben. freistellenFortschritt
     zeigt den Download-Fortschritt des KI-Modells beim allerersten Lauf
     (s. freistellen weiter unten). */
  const [freistellenLaeuft, setFreistellenLaeuft] = useState(false);
  const [freistellenFortschritt, setFreistellenFortschritt] = useState("");
  const dragRef = useRef<{
    id: string;
    kfIndex: number;
    startX: number;
    startY: number;
    ausgangX: number;
    ausgangY: number;
    bewegt: boolean;
    /** Zustand VOR dem Zug (bei pointerdown gemerkt) — der Verlaufseintrag
     *  wird erst bei pointerup geschrieben (Ein-Zug-EIN-Schritt, s. onUp),
     *  braucht dafür aber den ALTEN Stand, nicht den dann schon aktuellen. */
    vorZugGrafiken: Grafik[];
    vorZugUebernommen: string[];
  } | null>(null);
  /* --- Mehrfachauswahl: Gruppen-Zug + Auswahl-Rechteck (additiv) ---------
     Eigene Refs statt Erweiterung von dragRef oben: dragRef bleibt dadurch
     GENAU der bisherige Einzel-Zug-Pfad, unangetastet — der Fenster-Effekt
     unten prüft einfach ZUERST diese neuen Refs, bevor er auf dragRef
     zurückfällt (s. Kommentar dort). */
  const gruppenDragRef = useRef<{
    startX: number;
    startY: number;
    bewegt: boolean;
    /** Welches Mitglied unter dem Zeiger gegriffen wurde — liefert die
     *  Snap-Box für die Einrast-Berechnung (die übrigen Mitglieder fahren
     *  nur denselben Versatz mit, s. Kommentar in onMove). */
    fuehrendId: string;
    mitglieder: { id: string; kfIndex: number; ausgangX: number; ausgangY: number }[];
    vorZugGrafiken: Grafik[];
    vorZugUebernommen: string[];
  } | null>(null);
  const rubberBandRef = useRef<{
    startX: number;
    startY: number;
    bewegt: boolean;
    /** Shift beim Start gedrückt = zur bestehenden Auswahl HINZUFÜGEN statt
     *  sie zu ersetzen (Ausgangsstand hier gemerkt, damit jede Zug-Bewegung
     *  vom SELBEN Ausgangspunkt aus neu kombiniert statt zu akkumulieren). */
    additiv: boolean;
    ausgangAuswahl: string | null;
    ausgangAuswahlMehr: string[];
  } | null>(null);
  /** Sichtbares Auswahl-Rechteck (Viewport-px) — nur fürs Rendern, die
   *  eigentliche Zug-Geometrie steckt in rubberBandRef. */
  const [rubberBand, setRubberBand] = useState<Rechteck | null>(null);
  /** Umschalter „Einrasten" im Panel — Default AN (s. Auftrag). Lokaler
   *  State (kein Verlauf/keine Projektdaten), gleiche Kategorie wie
   *  dropAktiv/tauschQuelle oben. */
  const [einrastenAktiv, setEinrastenAktiv] = useState(true);
  /** Aktive Snap-Hilfslinien (Viewport-px) während eines Zugs — null = keine
   *  (Einrasten aus ODER gerade nichts getroffen). */
  const [snapLinien, setSnapLinien] = useState<SnapErgebnis | null>(null);
  /** Vor-Zug-Stand für einen laufenden Keyframe-Zeitleisten-Zug (s.
   *  GrafikKeyframeTimeline.tsx onZugStart/onZugEnde) — analog zu
   *  dragRef.vorZugGrafiken, nur separat, weil der Zug dort nicht über den
   *  Fenster-Pointer-Effekt läuft (eigene Pointer-Capture-Handler in der
   *  Marker-Komponente). */
  const zeitleisteVorZugRef = useRef<Grafik[] | null>(null);
  const dateiRef = useRef<HTMLInputElement>(null);
  /** Wenn gesetzt: die nächste Datei ERSETZT diese Grafik (Keyframes bleiben). */
  const ersetzenRef = useRef<string | null>(null);
  /** Wenn gesetzt: die nächste Datei/das nächste Bibliotheks-Asset setzt NUR
   *  an diesem EINEN Keyframe einen srcOverride (G3, s. Reiter „Keyframes")
   *  — im Unterschied zu ersetzenRef (tauscht die ganze Grafik). React-State
   *  statt Ref: der Bibliothek-Reiter zeigt währenddessen einen Hinweis-
   *  Banner (s. dort), braucht also ein Re-Render. Die beiden Mechanismen
   *  räumen sich gegenseitig ab (s. jeweilige onClick-Handler), damit nie
   *  eine halb angefangene Auswahl die andere kapert. */
  const [kfBildZiel, setKfBildZiel] = useState<{ grafikId: string; kfIndex: number } | null>(
    null,
  );

  useEffect(() => {
    const alle = ladeSetups();
    setSetups(alle);
    /* Bibliothek des zuletzt gespeicherten Setups automatisch wiederherstellen
       — sonst wäre der eingelesene Asset-Ordner nach jedem Reload weg und
       „Speichern" hätte für die Bibliothek keinen Nutzen. Die PLATZIERTEN
       Grafiken kommen weiterhin aus grafik.config.json (der Live-Stand der
       Landing) und werden hier bewusst NICHT überschrieben. */
    const namen = Object.keys(alle);
    if (namen.length === 0) return;
    const letztes = namen
      .map((n) => alle[n])
      .sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1))[0];
    if (letztes?.pool?.length) {
      setPool(letztes.pool.map((a) => ({ ...a })));
      setName(letztes.name);
    }
  }, []);

  /* Animations-Presets aus IndexedDB laden (überleben den Reload, s.
     grafik-store K_PRESETS). Eigener Effekt, weil asynchron und unabhängig von
     den localStorage-Setups oben. Fehlschlag = einfach leere Liste (kein
     harter Fehler — die Bibliothek zeigt dann den Leer-Hinweis). */
  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const geladen = await presetsHolen();
        if (!tot) setPresets(geladen);
      } catch {
        /* still: Presets sind optionaler Komfort, kein Editor-Kernzustand. */
      }
    })();
    return () => {
      tot = true;
    };
  }, []);

  /* Server-Bibliothek (public/-Ordner des Projekts, s. app/api/assets/
     route.ts) beim Oeffnen automatisch laden — ganz ohne Klick und ohne den
     absoluten Pfad, den der Ordner-Dialog unten braucht (der bleibt als
     Ruackfallebene bestehen, z.B. fuer Assets ausserhalb von public/).
     Bereits vorhandene Pool-Eintraege (wiederhergestelltes Setup s.o.) haben
     Vorrang: bei Namensgleichheit gewinnt der bestehende Eintrag. */
  useEffect(() => {
    let tot = false;
    setStatus("Lade Bilder…");
    void (async () => {
      try {
        const res = await fetch("/api/assets/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aktion: "liste" }),
        });
        const daten = (await res.json()) as AssetListeAntwort | { fehler: string };
        if (tot) return;
        if (!res.ok || "fehler" in daten) {
          setStatus(
            `Server-Bibliothek nicht geladen (${"fehler" in daten ? daten.fehler : res.statusText}) — Ordner-Dialog nutzen`,
          );
          return;
        }
        setPool((alt) => {
          const bekannt = new Set(alt.map((a) => a.name));
          /* Eigene, kollisionsfreie ID statt neueId(): die baut auf
             Date.now()+performance.now() auf und faellt bei einer SYNCHRONEN
             Schleife ueber viele Eintraege leicht auf dieselbe Millisekunde
             herein (doppelte React-Keys). pfad ist laut Server eindeutig. */
          const ergaenzung: Asset[] = daten.assets
            .filter((a) => !bekannt.has(a.name))
            .map((a) => ({
              id: `srv:${a.pfad}`,
              name: a.name,
              src: a.url,
              art: medienArt(a.name),
              ordner: a.ordner,
            }));
          return ergaenzung.length ? [...alt, ...ergaenzung] : alt;
        });
        setStatus(
          daten.assets.length > 0
            ? `${daten.assets.length} Assets aus dem Projektordner geladen`
            : "Keine Assets im Projektordner gefunden — Ordner-Dialog nutzen",
        );
      } catch (error) {
        if (tot) return;
        setStatus(
          `Server-Bibliothek nicht geladen (${error instanceof Error ? error.message : "unbekannter Fehler"}) — Ordner-Dialog nutzen`,
        );
      }
    })();
    return () => {
      tot = true;
    };
  }, []);

  /* Scrollposition fürs Panel (Keyframe-Anzeige) — gedrosselt über rAF. */
  useEffect(() => {
    let raf = 0;
    let letzter = -1;
    const tick = () => {
      if (window.scrollY !== letzter) {
        letzter = window.scrollY;
        setScrollY(letzter);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Tutorial beim ALLERERSTEN Besuch automatisch zeigen (Merker in
     localStorage) — danach nie wieder von selbst, nur noch über den
     Kopf-Knopf. Reihenfolge (Welle 5d, §10/5d): das Produkt-Tutorial läuft
     VOR dem Animator-Tutorial. Ist es noch nicht gesehen, öffnet es zuerst und
     merkt sich die AUTO-Kette (produktAutoKetteRef); das Animator-Tutorial
     folgt dann beim Schließen. Ist das Produkt-Tutorial schon gesehen, greift
     unverändert die bisherige Animator-Auto-Anzeige. */
  useEffect(() => {
    if (produktTutorialNochNichtGesehen()) {
      produktAutoKetteRef.current = true;
      setProduktTutorialOffen(true);
    } else if (tutorialNochNichtGesehen()) {
      setTutorialOffen(true);
    }
  }, []);

  /** Schließen merkt IMMER "gesehen" — egal ob per Knopf, Esc oder Klick auf
   *  den Hintergrund (alle drei Wege rufen onSchliessen auf). */
  const tutorialSchliessen = () => {
    tutorialAlsGesehenMerken();
    setTutorialOffen(false);
  };

  /** Produkt-Tutorial schließen: Latch setzen; lief es als automatische
   *  Erst-Besuch-Kette, folgt jetzt das Animator-Tutorial (falls auch das noch
   *  nicht gesehen wurde). Beim manuellen Aufruf über das Kopf-Menue bleibt die
   *  Kette aus. */
  const produktTutorialSchliessen = () => {
    produktTutorialAlsGesehenMerken();
    setProduktTutorialOffen(false);
    if (produktAutoKetteRef.current) {
      produktAutoKetteRef.current = false;
      if (tutorialNochNichtGesehen()) setTutorialOffen(true);
    }
  };

  const grafiken = ctx?.grafiken ?? [];
  const aktiv = grafiken.find((g) => g.id === ctx?.auswahl) ?? null;
  /* Aktuell ausgewähltes OG-Element (Website-Ist-Stand) — steuert den
     Objekt-Reiter + das Bühnen-Overlay. Durch den Ausschluss-Effekt nie
     zeitgleich mit einer Grafik-Auswahl/Fluss-Fokus gesetzt. */
  const ogAktiv = ogAuswahl ? ogListe.find((o) => o.id === ogAuswahl) ?? null : null;

  const setzeGrafiken = useCallback(
    (neu: Grafik[]) => {
      ctx?.setGrafiken(neu);
    },
    [ctx],
  );

  /** Ändert einen Keyframe der aktiven Grafik. */
  const patchKf = useCallback(
    (id: string, kfIndex: number, patch: Partial<GrafikKeyframe>) => {
      setzeGrafiken(
        grafiken.map((g) =>
          g.id !== id
            ? g
            : {
                ...g,
                keyframes: g.keyframes.map((k, i) => (i === kfIndex ? { ...k, ...patch } : k)),
              },
        ),
      );
    },
    [grafiken, setzeGrafiken],
  );

  /* --- Puck-Seiten-Modus (Welle 4c, docs/editor-vereinheitlichung.md §9/4c) --
     Liegt eine eigene Seite als Backdrop-Buehne (art "puck-seite"), ist der
     Animator im „Puck-Seiten-Modus": die Bausteine dieser Seite tragen
     data-og-id="puck:<id>", der 3b-Anker-Mechanismus verankert Keyframes an
     ihnen, und die Animation wird direkt IN die Seite gespeichert statt in ein
     Abbild. `puckSeiteName` = der aktive Seiten-Name ODER null. */
  const puckSeiteName =
    backdropCtx?.backdrop?.art === "puck-seite" ? backdropCtx.backdrop.quelle : null;

  /** Schreibt das aktuelle Grafik-Abbild ins anim-Feld der aktiven Puck-Seite
   *  (Welle 4c(3)). Read-modify-write mit Konflikt-Stempel: erst die Seite
   *  frisch laden (data + gespeichert), dann mit unveraenderter data + neuem
   *  anim zurueckschreiben (erwartetGespeichert = frischer Stand). */
  const animInSeiteSpeichern = useCallback(async () => {
    if (!puckSeiteName) return;
    setStatus(`Speichere Animation in Seite „${puckSeiteName}“…`);
    try {
      const ladeRes = await fetch("/api/puck-seite/lade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: puckSeiteName }),
      });
      const geladen = (await ladeRes.json()) as { data?: unknown; gespeichert?: string; fehler?: string };
      if (!ladeRes.ok || !geladen.data) {
        throw new Error(geladen.fehler ?? `Laden fehlgeschlagen (HTTP ${ladeRes.status})`);
      }
      const res = await fetch("/api/puck-seite/speichere", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: puckSeiteName,
          data: geladen.data,
          erwartetGespeichert: geladen.gespeichert,
          anim: { grafiken, uebernommen: ctx?.uebernommen ?? [] },
        }),
      });
      const daten = (await res.json()) as { fehler?: string };
      if (res.status === 409) {
        setStatus("Konflikt: Seite wurde zwischenzeitlich geändert — Bühne neu wählen und erneut speichern.");
        return;
      }
      if (!res.ok) throw new Error(daten.fehler ?? res.statusText);
      setStatus(
        `Animation in Seite „${puckSeiteName}“ gespeichert (${grafiken.length} Grafik(en)) — eine Datei = Seite + Animation.`,
      );
    } catch (error) {
      setStatus(
        `Animation-Speichern fehlgeschlagen (${error instanceof Error ? error.message : "unbekannt"})`,
      );
    }
  }, [puckSeiteName, grafiken, ctx]);

  /* --- Website-OG (AP-D, Welle 3a) ------------------------------------- */

  /* Ist-Stand-Liste beim Start, bei Backdrop-Wechsel, bei Wechsel der aktiven
     Website (Welle 5b/5c) UND auf „Neu einlesen" (manueller Nonce) neu aus dem
     DOM lesen. Per rAF, damit die Landing bzw. die neue Bühne erst gerendert ist.
     Findet der erste Frame noch nichts (dev-Hydration hängt die Landing-Sektionen
     minimal später ein; die Puck-Seiten-Bühne lädt sogar asynchron per fetch +
     <Render>), wird ein paar Sekunden lang nachgefasst — im Bild-Backdrop-Modus
     (dort gibt es legitim keine getaggten Elemente) läuft das einfach ins Leere
     aus. Reicht das nicht (sehr langsames Laden), holt der Knopf „Neu einlesen"
     in der Ist-Stand-Gruppe die Liste jederzeit nach. */
  useEffect(() => {
    let abbruch = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    /* Zuletzt gesetzte Ist-Stand-SIGNATUR (Menge der ids, nicht bloß die
       Anzahl): die Puck-Seiten-Bühne lädt asynchron per fetch + <Render> und
       TAUSCHT die getaggten Elemente aus (WEE-Landing → geladene aktive Seite).
       Würde nur die Anzahl verglichen, bliebe eine gleich lange, aber inhaltlich
       VERALTETE Liste stehen (frühere Landing-Einträge statt Bens Bausteinen) —
       ein Klick darauf fände sein Element dann nicht mehr. Deshalb über die
       id-Signatur vergleichen. Der Zustand wird nur bei ECHTER Änderung
       geschrieben (Backdrop-Bild-Modus: dauerhaft leer → keine Re-Renders). */
    let signatur = " ";
    const scan = () => {
      if (abbruch) return;
      const liste = ogScannen();
      const neueSignatur = liste.map((o) => o.id).join("|");
      if (neueSignatur !== signatur) {
        signatur = neueSignatur;
        setOgListe(liste);
      }
      /* Das ganze 4-s-Fenster über nachfassen (nicht nur solange leer), damit
         der Wechsel Landing → asynchron gerenderte Puck-Seite auch dann erfasst
         wird, wenn die alte Liste noch kurz im DOM stand. Im Bild-Backdrop-
         Modus (dauerhaft 0 getaggte Elemente) läuft es leer aus; die Signatur
         bleibt konstant, es entstehen keine Re-Renders. */
      if (performance.now() - start < 4000) {
        timer = setTimeout(scan, 150);
      }
    };
    timer = setTimeout(scan, 0);
    return () => {
      abbruch = true;
      if (timer) clearTimeout(timer);
    };
  }, [backdropCtx?.backdrop, aktiveSeite, ogNeuEinlesenNonce]);

  /* Welle 5c: fällt das aktuell gewählte OG-Element aus der frisch eingelesenen
     Liste (Bühnen-Wechsel — die veralteten Landing-Einträge verschwinden), die
     Auswahl leeren. Sonst zeigten Objekt-Reiter und Bühnen-Overlay einen
     „nicht gefunden"-Rest eines nicht mehr gerenderten Elements. */
  useEffect(() => {
    if (ogAuswahl && !ogListe.some((o) => o.id === ogAuswahl)) setOgAuswahl(null);
  }, [ogListe, ogAuswahl]);

  /* Gegenseitige Ausschließlichkeit (Spec §8/3a): sobald eine Grafik
     ausgewählt ODER der Fluss fokussiert ist, verliert die OG-Auswahl. Der
     umgekehrte Weg (OG wählen leert Grafik/Fluss) steht in ogWaehlen unten. */
  useEffect(() => {
    if (ctx?.auswahl || flussObjekt?.fokus) setOgAuswahl(null);
  }, [ctx?.auswahl, flussObjekt?.fokus]);

  /* --- Welle 4c(3): anim-Feld einer Puck-Seite in den Animator laden --------
     Wird eine Seite als Buehne gewaehlt (puckSeiteName wechselt auf einen
     Namen), ihr gespeichertes Animations-Abbild automatisch uebernehmen. ctx +
     grafiken-Anzahl liegen in einem Ref, damit der Effekt NUR an puckSeiteName
     haengt (ctx-Value wird bei jedem Render neu erzeugt — als Dep wuerde der
     Effekt sonst dauerlaufen). Bestaetigungs-Hinweis, wenn der Animator schon
     Grafiken traegt (Spec: nicht ungefragt ueberschreiben). */
  const puckLadeRef = useRef<{ ctx: typeof ctx; grafikenAnzahl: number }>({ ctx, grafikenAnzahl: 0 });
  puckLadeRef.current = { ctx, grafikenAnzahl: grafiken.length };
  useEffect(() => {
    if (!puckSeiteName) return;
    let abbruch = false;
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/lade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: puckSeiteName }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { anim?: { grafiken?: Grafik[]; uebernommen?: string[] } };
        if (abbruch) return;
        const anim = json.anim;
        if (!anim || !Array.isArray(anim.grafiken) || anim.grafiken.length === 0) return;
        const c = puckLadeRef.current.ctx;
        if (!c) return;
        if (
          puckLadeRef.current.grafikenAnzahl > 0 &&
          !window.confirm(
            `Die Seite „${puckSeiteName}“ bringt eine gespeicherte Animation mit ` +
              `(${anim.grafiken.length} Grafik(en)). Den aktuellen Animator-Stand dadurch ersetzen?`,
          )
        ) {
          return;
        }
        c.setGrafiken(anim.grafiken);
        c.setUebernommen(anim.uebernommen ?? []);
        c.resetHistory();
        setStatus(`Animation aus Seite „${puckSeiteName}“ geladen (${anim.grafiken.length} Grafik(en)).`);
      } catch {
        /* Route nicht erreichbar → Animator-Stand bleibt unveraendert. */
      }
    })();
    return () => {
      abbruch = true;
    };
    // ctx/grafiken bewusst NICHT in den Deps (s.o., via Ref) — nur puckSeiteName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puckSeiteName]);

  /** OG-Element auswählen: Grafik-Auswahl + Fluss-Fokus räumen (Ausschluss),
   *  dann markieren; `scroll` zeigt es auf der Bühne (Liste ja, Alt+Klick
   *  nein — es liegt schon unter dem Zeiger). */
  const ogWaehlen = useCallback(
    (id: string, scroll: boolean) => {
      ctx?.setAuswahl(null);
      ctx?.setAuswahlMehr([]);
      ctx?.setGelockt(false);
      flussObjekt?.setFokus(false);
      setOgStatus("");
      setOgAuswahl(id);
      if (scroll) {
        document
          .querySelector<HTMLElement>(`[data-og-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [ctx, flussObjekt],
  );

  /** „In den Builder holen" (nur bild|svg): erzeugt die Kopie über dem
   *  Original (s. ogAlsGrafikErzeugen) und wählt sie als normale Grafik aus —
   *  wodurch die OG-Auswahl über den Ausschluss-Effekt oben automatisch endet. */
  const ogInBuilder = useCallback(
    (eintrag: OgEintrag) => {
      if (!ctx) return;
      const id = `og:${eintrag.id}`;
      if (grafiken.some((g) => g.id === id)) {
        setOgStatus(`„${eintrag.element || eintrag.id}" ist bereits im Builder.`);
        return;
      }
      const ergebnis = ogAlsGrafikErzeugen(eintrag, grafiken.length + 1);
      if ("fehler" in ergebnis) {
        setOgStatus(ergebnis.fehler);
        return;
      }
      ctx.commit("Website-Element übernommen");
      ctx.setGrafiken([...grafiken, ergebnis.grafik]);
      ctx.setAuswahl(ergebnis.grafik.id);
      setStatus(`Kopie liegt über dem Original — im Reiter „Ebenen"/„Keyframes" weiterbearbeiten.`);
    },
    [ctx, grafiken],
  );

  /* Eingeloggte Grafik: Scrollrad skaliert (Seiten-Scroll blockiert). */
  useEffect(() => {
    if (!ctx?.gelockt || !aktiv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const i = naechsterKfIndex(aktiv, window.scrollY);
      const faktor = e.deltaY < 0 ? WHEEL_FAKTOR : 1 / WHEEL_FAKTOR;
      const neu = Math.min(MAX_SCALE, Math.max(MIN_SCALE, aktiv.keyframes[i].scale * faktor));
      ctx.commit("Skaliert", `wheel:${aktiv.id}:${i}`);
      patchKf(aktiv.id, i, { scale: neu });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.setGelockt(false);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx, aktiv, patchKf]);

  /* Auswahl + Drag direkt auf den Grafiken der Seite: EIN Listener am
     Fenster (die Grafik-Ebene selbst ist pointer-events:none, damit die
     echte Seite bedienbar bleibt) — Treffer über data-grafik-id.
     ERWEITERT um Mehrfachauswahl + Einrasten (additiv, s.
     grafik-mehrfachauswahl.ts/grafik-snapping.ts): Shift+Klick toggelt eine
     ID in der Mehrfachauswahl (kein Zug in dieser Geste). Ziehen eines
     BEREITS mehrfach-ausgewählten Mitglieds bewegt die GANZE Gruppe
     (gruppenDragRef). Ziehen auf leerem Canvas (außerhalb der Editor-Chrome)
     zieht ein Auswahl-Rechteck auf (rubberBandRef). Der bisherige
     EINZEL-Zug-Pfad (dragRef, ganz unten in onDown/onMove/onUp) bleibt dabei
     BYTE-FÜR-BYTE derselbe wie vorher — er greift nur, wenn WEDER Shift NOCH
     ein Gruppen-/Rechteck-Fall zutrifft. */
  useEffect(() => {
    if (!ctx) return;

    const onDown = (e: PointerEvent) => {
      /* Alt+Klick: Element der Original-Website auswählen (Ist-Stand, Spec
         §8/3a). Die Grafik-Ebene ist pointer-events:none, also IST e.target
         schon das getroffene Seiten-Element (elementFromPoint-Kette); closest
         läuft zum nächsten getaggten Vorfahren hoch. Nur außerhalb der
         Editor-Chrome; trifft es, wird NUR ausgewählt, kein Zug gestartet. */
      if (e.altKey) {
        if (istEditorChrome(e.target)) return;
        const ogId = (e.target as Element | null)
          ?.closest?.("[data-og-id]")
          ?.getAttribute("data-og-id");
        if (ogId) {
          e.preventDefault();
          ctx.setAuswahl(null);
          ctx.setAuswahlMehr([]);
          ctx.setGelockt(false);
          flussObjektRef.current?.setFokus(false);
          setOgStatus("");
          setOgAuswahl(ogId);
        }
        return;
      }
      const el = (e.target as HTMLElement | null)?.closest?.("[data-grafik-id]");
      if (!el) {
        /* Leerer Canvas: außerhalb der Editor-Chrome (Panel, Objektmenü,
           Overlays, Tutorial, Hilfe-Popover) startet ein Auswahl-Rechteck.
           Innerhalb der Chrome exakt das bisherige Nichts-tun. */
        if (istEditorChrome(e.target)) return;
        e.preventDefault();
        rubberBandRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          bewegt: false,
          additiv: e.shiftKey,
          ausgangAuswahl: ctx.auswahl,
          ausgangAuswahlMehr: ctx.auswahlMehr,
        };
        return;
      }
      const id = el.getAttribute("data-grafik-id");
      if (!id) return;
      const g = grafiken.find((x) => x.id === id);
      if (!g) return;
      e.preventDefault();

      /* Shift+Klick: NUR die Mehrfachauswahl toggeln, kein Zug in dieser
         Geste — ein nachfolgender EINFACHER Zug auf einem ausgewählten
         Mitglied bewegt dann die Gruppe (s.u.). */
      if (e.shiftKey) {
        const ergebnis = shiftKlickToggle(ctx.auswahl, ctx.auswahlMehr, id);
        ctx.setAuswahl(ergebnis.auswahl);
        ctx.setAuswahlMehr(ergebnis.auswahlMehr);
        return;
      }

      const voll = volleAuswahl(ctx.auswahl, ctx.auswahlMehr);
      if (voll.length > 1 && voll.includes(id)) {
        /* Gruppen-Zug: id ist Teil einer bestehenden Mehrfachauswahl (>1
           Elemente). Primäre Auswahl bleibt UNVERÄNDERT (nicht auf `id`
           umgesetzt) — Objektmenü/Inspector "flackern" so nicht beim
           Greifen eines beliebigen Gruppenmitglieds. Ist das gegriffene
           Mitglied gesperrt, passiert nichts (weder Zug noch
           Auswahländerung) — bewusst zurückhaltend, statt eine mühsam
           gebaute Mehrfachauswahl beim versehentlichen Klick auf ein
           gesperrtes Element zu zerstören. */
        if (g.gesperrt) return;
        const mitglieder: { id: string; kfIndex: number; ausgangX: number; ausgangY: number }[] = [];
        for (const mid of voll) {
          const mg = grafiken.find((x) => x.id === mid);
          if (!mg || mg.gesperrt) continue;
          const kfIndex = naechsterKfIndex(mg, window.scrollY);
          mitglieder.push({
            id: mid,
            kfIndex,
            ausgangX: mg.keyframes[kfIndex].x,
            ausgangY: mg.keyframes[kfIndex].y,
          });
        }
        if (mitglieder.length === 0) return;
        gruppenDragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          bewegt: false,
          fuehrendId: id,
          mitglieder,
          vorZugGrafiken: grafiken,
          vorZugUebernommen: ctx.uebernommen,
        };
        return;
      }

      /* Genau der bisherige Weg — unverändert: Klick ohne Shift setzt IMMER
         die Einzelauswahl (und räumt eine evtl. Mehrfachauswahl ab). */
      ctx.setAuswahl(id);
      ctx.setAuswahlMehr([]);
      /* Gesperrte Ebene: auswaehlbar (um sie zu entsperren), aber nicht
         verschiebbar — genau dafuer ist die Sperre da. */
      if (g.gesperrt) return;
      const kfIndex = naechsterKfIndex(g, window.scrollY);
      dragRef.current = {
        id,
        kfIndex,
        startX: e.clientX,
        startY: e.clientY,
        ausgangX: g.keyframes[kfIndex].x,
        ausgangY: g.keyframes[kfIndex].y,
        bewegt: false,
        vorZugGrafiken: grafiken,
        vorZugUebernommen: ctx.uebernommen,
      };
    };

    /** Tentative Box + Einrasten für EIN Element an einer gedachten
     *  Dokument-Mitte — gemeinsam vom Einzel- UND Gruppen-Zug genutzt.
     *  Schreibt die aktiven Hilfslinien direkt in snapLinien-State. */
    const einrasten = (id: string, mitteXDoc: number, mitteYDoc: number): { dx: number; dy: number } => {
      const el = document.querySelector<HTMLElement>(`[data-grafik-id="${id}"]`);
      if (!el) {
        setSnapLinien(null);
        return { dx: 0, dy: 0 };
      }
      const box = tentativeBox(el, mitteXDoc, mitteYDoc, window.scrollX, window.scrollY);
      const ergebnis = berechneSnap(
        box,
        andereSnapBoxen(id),
        { breite: window.innerWidth, hoehe: window.innerHeight },
        SNAP_RASTER_PX,
        SNAP_SCHWELLE_PX,
      );
      setSnapLinien(ergebnis.vertikaleLinien.length || ergebnis.horizontaleLinien.length ? ergebnis : null);
      return { dx: ergebnis.dx, dy: ergebnis.dy };
    };

    const onMove = (e: PointerEvent) => {
      const rb = rubberBandRef.current;
      if (rb) {
        const dx = e.clientX - rb.startX;
        const dy = e.clientY - rb.startY;
        if (!rb.bewegt && Math.hypot(dx, dy) < KLICK_TOLERANZ_PX) return;
        rb.bewegt = true;
        const rechteck = rechteckAus(rb.startX, rb.startY, e.clientX, e.clientY);
        setRubberBand(rechteck);
        const getroffen = grafiken
          .filter((g) => !g.versteckt)
          .filter((g) => {
            const anker = document.querySelector<HTMLElement>(`[data-grafik-id="${g.id}"]`);
            return anker ? schneidenSich(rechteck, anker.getBoundingClientRect()) : false;
          })
          .map((g) => g.id);
        const basis = rb.additiv ? volleAuswahl(rb.ausgangAuswahl, rb.ausgangAuswahlMehr) : [];
        const kombiniert = [...new Set([...basis, ...getroffen])];
        ctx.setAuswahl(kombiniert[0] ?? null);
        ctx.setAuswahlMehr(kombiniert.slice(1));
        return;
      }

      const gd = gruppenDragRef.current;
      if (gd) {
        const dx0 = e.clientX - gd.startX;
        const dy0 = e.clientY - gd.startY;
        if (!gd.bewegt && Math.hypot(dx0, dy0) < KLICK_TOLERANZ_PX) return;
        gd.bewegt = true;
        let dx = dx0;
        let dy = dy0;
        if (einrastenAktiv) {
          const fuehrend = gd.mitglieder.find((m) => m.id === gd.fuehrendId);
          if (fuehrend) {
            const snap = einrasten(fuehrend.id, fuehrend.ausgangX + dx0, fuehrend.ausgangY + dy0);
            dx += snap.dx;
            dy += snap.dy;
          }
        } else {
          setSnapLinien(null);
        }
        setzeGrafiken(
          grafiken.map((g) => {
            const m = gd.mitglieder.find((x) => x.id === g.id);
            if (!m) return g;
            return {
              ...g,
              keyframes: g.keyframes.map((k, i) =>
                /* Anker während des Ziehens lösen (s. Einzel-Zug oben) — je
                   Mitglied am Zug-Ende neu verankert. */
                i === m.kfIndex ? { ...k, x: m.ausgangX + dx, y: m.ausgangY + dy, ...ANKER_LEER } : k,
              ),
            };
          }),
        );
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.bewegt && Math.hypot(dx, dy) < KLICK_TOLERANZ_PX) return;
      d.bewegt = true;
      let endX = d.ausgangX + dx;
      let endY = d.ausgangY + dy;
      if (einrastenAktiv) {
        const snap = einrasten(d.id, endX, endY);
        endX += snap.dx;
        endY += snap.dy;
      } else {
        setSnapLinien(null);
      }
      /* Anker (Welle 3b) während des Ziehens lösen: die Live-Position soll dem
         Cursor folgen, nicht am alten Anker kleben. Am Zug-Ende (onUp) wird neu
         verankert. */
      patchKf(d.id, d.kfIndex, { x: endX, y: endY, ...ANKER_LEER });
    };

    const onUp = () => {
      const rb = rubberBandRef.current;
      rubberBandRef.current = null;
      if (rb) {
        setRubberBand(null);
        return;
      }

      const gd = gruppenDragRef.current;
      gruppenDragRef.current = null;
      if (gd) {
        if (gd.bewegt) {
          setSnapLinien(null);
          /* Anker (Welle 3b) je verschobenem Mitglied am Zug-Ende neu
             bestimmen — nächstliegendes getaggtes Element als drift-feste
             Referenz (während des Ziehens war der Anker gelöst, s. onMove). */
          setzeGrafiken(
            grafiken.map((g) => {
              const m = gd.mitglieder.find((x) => x.id === g.id);
              const k = m ? g.keyframes[m.kfIndex] : undefined;
              if (!m || !k) return g;
              const anker = ankerFelderFuer(k.y, k.scrollY);
              return {
                ...g,
                keyframes: g.keyframes.map((kk, i) => (i === m.kfIndex ? { ...kk, ...anker } : kk)),
              };
            }),
          );
          ctx.commit("Gruppe verschoben", undefined, {
            grafiken: gd.vorZugGrafiken,
            uebernommen: gd.vorZugUebernommen,
          });
        }
        return;
      }

      const d = dragRef.current;
      dragRef.current = null;
      if (d && !d.bewegt) ctx.setGelockt(!ctx.gelockt);
      /* EIN Zug = EIN Verlaufsschritt: der Eintrag wird erst HIER (beim
         Loslassen) geschrieben, mit dem bei pointerdown gemerkten
         Vor-Zug-Stand — nicht bei jedem pointermove (sonst waeren es
         Dutzende Schritte fuer einen einzigen Zug). */
      if (d && d.bewegt) {
        setSnapLinien(null);
        /* Anker (Welle 3b) am Zug-Ende neu bestimmen: der Keyframe liegt jetzt
           woanders (während des Ziehens war der Anker gelöst, s. onMove). Basiert
           auf dem live gezogenen Stand (grafiken) — dieselbe Ein-Zug-Rebase wie
           kfZeitleisteZugEnde, nur zusätzlich mit den Anker-Feldern. */
        const gz = grafiken.find((x) => x.id === d.id);
        const kz = gz?.keyframes[d.kfIndex];
        if (kz) {
          const anker = ankerFelderFuer(kz.y, kz.scrollY);
          setzeGrafiken(
            grafiken.map((x) =>
              x.id === d.id
                ? {
                    ...x,
                    keyframes: x.keyframes.map((kk, i) =>
                      i === d.kfIndex ? { ...kk, ...anker } : kk,
                    ),
                  }
                : x,
            ),
          );
        }
        ctx.commit("Verschoben", undefined, {
          grafiken: d.vorZugGrafiken,
          uebernommen: d.vorZugUebernommen,
        });
      }
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [ctx, grafiken, patchKf, setzeGrafiken, einrastenAktiv]);

  /* --- Bibliothek ------------------------------------------------------ */

  /** Übernimmt eine Datei aus JEDER Quelle (Dateidialog, Strg+V, Drag&Drop).
   *  posViewport = Ablageort in Viewport-Koordinaten (Drop-Punkt), sonst
   *  Bildmitte. */
  const dateiUebernehmen = useCallback(
    async (f: File, posViewport?: { x: number; y: number }) => {
      /* Endung ODER MIME zaehlt: Lottie kommt als .json (MIME application/json)
         und Video als .mp4 — ein reiner image/*-Test wuerde beide abweisen. */
      if (!BILD_ENDUNGEN.test(f.name) && !f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        setStatus(`„${f.name || "Zwischenablage"}": Format nicht unterstützt`);
        return;
      }
      if (f.size > MAX_DATEI_BYTES) {
        setStatus(
          `Zu groß (${Math.round(f.size / 1024)} kB, max ${MAX_DATEI_BYTES / 1024} kB)`,
        );
        return;
      }
      const src = await alsDataUrl(f);
      const dateiName = f.name || `canva-${Date.now()}.png`;

      /* Ist ein Ordner verbunden, wandert die Datei DORTHIN — damit ist sie
         dauerhaft da (kein Browser-Speicherlimit) und taucht in der
         Bibliothek auf, statt nur an dieser einen Grafik zu hängen. */
      if (ordner) {
        try {
          await inOrdnerSchreiben(ordner, dateiName, f);
          setPool((alt) =>
            alt.some((a) => a.name === dateiName)
              ? alt
              : [...alt, { id: neueId(), name: dateiName, src, art: medienArt(dateiName, f.type) }],
          );
        } catch {
          setStatus("Konnte nicht in den Ordner schreiben — Grafik nur im Browser");
        }
      }

      /* Frame-spezifischer Bildtausch (G3): hat Vorrang vor ersetzenRef —
         beide werden beim Bewaffnen gegenseitig genullt (s. Auslöser-Stellen
         unten), daher ist hier eigentlich höchstens EINER gesetzt; die
         Reihenfolge ist trotzdem defensiv (spezifischstes Ziel zuerst). */
      const kfZiel = kfBildZiel;
      if (kfZiel) {
        setKfBildZiel(null);
        ctx?.commit("Keyframe-Bild getauscht");
        patchKf(kfZiel.grafikId, kfZiel.kfIndex, { srcOverride: src });
        setReiter("keyframes");
        setStatus(`„${dateiName}" nur für diesen Keyframe gesetzt`);
        return;
      }

      const ersetzt = ersetzenRef.current;
      ersetzenRef.current = null;
      if (ersetzt) {
        /* AUSTAUSCHEN: nur die Datei, Keyframes/Größe bleiben. */
        ctx?.commit("Datei ausgetauscht");
        setzeGrafiken(
          grafiken.map((g) => (g.id === ersetzt ? { ...g, src, name: dateiName } : g)),
        );
        setStatus(`„${dateiName}" ausgetauscht (Keyframes behalten)`);
        return;
      }

      /* NEU: Keyframe an der aktuellen Scrollposition, Ablage am Drop-Punkt
         bzw. mittig im Bild — in DOKUMENT-Koordinaten. */
      const id = neueId();
      const kf: GrafikKeyframe = {
        scrollY: window.scrollY,
        x: window.scrollX + (posViewport?.x ?? window.innerWidth / 2),
        y: window.scrollY + (posViewport?.y ?? window.innerHeight / 2),
        scale: 1,
        opacity: 1,
        rotation: 0,
      };
      const art = medienArt(dateiName, f.type);
      ctx?.commit("Grafik gesetzt");
      setzeGrafiken([
        ...grafiken,
        {
          id,
          name: dateiName,
          src,
          art,
          breitePx: 240,
          z: grafiken.length + 1,
          /* Zeitbasierte Medien starten als Endlosschleife — der Scroll-Scrub
             ist eine bewusste Entscheidung, kein Default. */
          ...(art !== "bild" ? { modus: "loop" as const } : {}),
          keyframes: [kf],
        },
      ]);
      ctx?.setAuswahl(id);
      setReiter("keyframes");
      setStatus(`„${dateiName}" gesetzt — platzieren & „Hier locken"`);
    },
    [ctx, grafiken, setzeGrafiken, kfBildZiel, patchKf],
  );

  const dateiGewaehlt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await dateiUebernehmen(f);
  };

  /* --- Asset-Pool (Bibliothek) ---------------------------------------- */

  /* Blob statt File: readAsDataURL akzeptiert beides, und die Vektorisieren-
     Funktion erzeugt das SVG-Ergebnis als Blob (keine echte Datei vom
     Dateisystem) – ein Parametertyp deckt beide Faelle ab. */
  const alsDataUrl = (f: Blob) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });

  /** Dateien in den Pool aufnehmen (aus Ordner ODER Mehrfachauswahl).
   *  Doppelte Namen werden übersprungen, damit wiederholtes Öffnen
   *  desselben Ordners den Pool nicht aufbläht. */
  const inPool = useCallback(
    async (dateien: File[]) => {
      const bilder = dateien.filter(
        (f) => f.type.startsWith("image/") || BILD_ENDUNGEN.test(f.name),
      );
      if (bilder.length === 0) {
        setStatus("Keine Bilder/SVGs gefunden");
        return;
      }
      const neu: Asset[] = [];
      let zuGross = 0;
      for (const f of bilder.slice(0, MAX_ASSETS)) {
        if (f.size > MAX_DATEI_BYTES) {
          zuGross++;
          continue;
        }
        neu.push({
          id: neueId(),
          name: f.name,
          src: await alsDataUrl(f),
          art: medienArt(f.name, f.type),
        });
      }
      setPool((alt) => {
        const bekannt = new Set(alt.map((a) => a.name));
        return [...alt, ...neu.filter((a) => !bekannt.has(a.name))];
      });
      setStatus(
        `${neu.length} Assets in der Bibliothek${zuGross ? ` · ${zuGross} zu groß übersprungen` : ""}`,
      );
    },
    [],
  );

  /** Bibliothek aus dem verbundenen Ordner (neu) einlesen. */
  const ordnerLesen = useCallback(
    async (h: OrdnerHandle) => {
      const dateien = await ordnerDateien(h, MAX_ASSETS);
      /* NUR die Ordner-Dateien erneuern, nicht den ganzen Pool leeren:
         sonst wischt ein automatisch wieder verbundener Ordner beim Start
         die vom Server geladenen Projekt-Bilder (u.a. die 16 Bäume) weg.
         Unterscheidbar am src — Server liefert URLs ("/curtain/..."),
         der Ordner liefert Data-URLs. */
      setPool((alt) => alt.filter((a) => a.src.startsWith("/")));
      await inPool(dateien);
      setOrdner(h);
      setOrdnerWartet(false);
    },
    [inPool],
  );

  /** Ordner verbinden: Handle wird in IndexedDB gemerkt und übersteht den
   *  Neustart. Ohne die API (Firefox/Safari) Fallback auf Ordner-Upload. */
  const ordnerOeffnen = async () => {
    if (!ordnerApiDa()) {
      ordnerRef.current?.click();
      return;
    }
    try {
      const h = await ordnerWaehlen();
      if (h) await ordnerLesen(h);
    } catch {
      /* Abgebrochen — kein Fehlerfall. */
    }
  };

  /** Gemerkten Ordner nach einem Klick freischalten (requestPermission
   *  braucht zwingend eine Nutzergeste — deshalb ein eigener Knopf). */
  const ordnerFreischalten = async () => {
    const h = await ordnerHolen(true);
    if (h) await ordnerLesen(h);
    else setStatus("Zugriff verweigert — Ordner neu verbinden");
  };

  /* Beim Start still prüfen, ob der gemerkte Ordner noch freigegeben ist.
     Wenn ja: Bibliothek ist sofort wieder da. Wenn der Browser nachfragen
     will, blenden wir den Freischalt-Knopf ein (ein Klick statt Ordner-
     neu-Suchen). */
  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        /* Liegt überhaupt ein Ordner in IndexedDB? */
        const gemerkt = await idbGet<OrdnerHandle>(K_ORDNER);
        if (tot || !gemerkt) return;
        /* Still prüfen — requestPermission braucht eine Nutzergeste und
           würde hier scheitern. */
        const frei = await ordnerHolen(false);
        if (tot) return;
        if (frei) await ordnerLesen(frei);
        else setOrdnerWartet(true);
      } catch {
        /* kein gemerkter Ordner / kein Zugriff — Editor läuft normal weiter */
      }
    })();
    return () => {
      tot = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordnerGewaehlt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    e.target.value = "";
    await inPool(fs);
  };

  /** Asset aus dem Pool auf die Seite setzen: mittig im Bild, mit einem
   *  Keyframe an der aktuellen Scrollposition. */
  const platziere = (a: Asset) => {
    const id = neueId();
    const kf: GrafikKeyframe = {
      scrollY: window.scrollY,
      x: window.scrollX + window.innerWidth / 2,
      y: window.scrollY + window.innerHeight / 2,
      scale: 1,
      opacity: 1,
      rotation: 0,
    };
    ctx?.commit("Grafik gesetzt");
    setzeGrafiken([
      ...grafiken,
      {
        id,
        name: a.name,
        src: a.src,
        art: a.art,
        breitePx: 240,
        z: grafiken.length + 1,
        ...(a.art !== "bild" ? { modus: "loop" as const } : {}),
        keyframes: [kf],
      },
    ]);
    ctx?.setAuswahl(id);
    setStatus(`„${a.name}" gesetzt — platzieren & „Hier locken"`);
  };

  /* --- Animations-Presets ("voranimierte Assets") ----------------------
   * Speichern (Reiter Animation) → normiertes Keyframe-Set in die Bibliothek.
   * Anwenden (Bibliothek) → an der aktuellen Position der gewählten Grafik
   * instanziieren. Reine Zusatz-Bibliothek, unabhängig von Grafik-Setups. */

  /** Die Bewegung der AKTIVEN Grafik als Preset sichern (braucht ≥2 Keyframes —
   *  eine Bewegung entsteht erst zwischen zwei Punkten). Namens-Prompt im
   *  Hausmuster; leere Eingabe/Abbruch = nichts tun. */
  const presetSpeichern = async () => {
    if (!aktiv || aktiv.keyframes.length < 2) return;
    const eingabe = window.prompt(
      "Name für das Animations-Preset:",
      `${aktiv.name}-Animation`,
    );
    if (eingabe === null) return; // Abgebrochen
    const n = eingabe.trim();
    if (!n) return;
    const id = `p${Date.now().toString(36)}${Math.floor(performance.now() * 1000) % 997}`;
    const neu = presetAusGrafik(aktiv, id, n, new Date().toISOString());
    const liste = [...presets, neu];
    try {
      /* Erst persistieren, dann State setzen — so bleibt die Anzeige
         konsistent zum tatsächlich Gespeicherten (kein "gespeichert"-Status
         ohne echtes Schreiben, Muster wie loesche* unten). */
      await presetsSetzen(liste);
      setPresets(liste);
      setStatus(`Preset „${n}" gespeichert (${neu.frames.length} Frames) — in der Bibliothek unter „Presets"`);
    } catch (error) {
      setStatus(
        `Preset konnte nicht gespeichert werden (${error instanceof Error ? error.message : "unbekannter Fehler"})`,
      );
    }
  };

  /** Ein Preset auf die AKTIVE Grafik anwenden: dessen Keyframes ersetzen die
   *  bestehenden, verankert am aktuellen ersten Keyframe der Grafik (Position/
   *  Scroll-Lage bleiben, die Bewegung kommt aus dem Preset). Vorher EIN
   *  Commit → ein Strg+Z stellt den alten Zustand wieder her (im confirm-Text
   *  erwähnt). Ohne Auswahl nur ein Hinweis (kein stiller No-Op). */
  const presetAnwenden = (preset: AnimationsPreset) => {
    if (!aktiv) {
      setStatus("Erst eine Grafik auswählen, dann das Preset anklicken.");
      return;
    }
    const bestaetigt = window.confirm(
      `Preset „${preset.name}" auf „${aktiv.name}" anwenden?\n\n` +
        "Die bestehenden Keyframes dieser Grafik werden ersetzt. " +
        "Ein Strg+Z macht das rückgängig.",
    );
    if (!bestaetigt) return;
    const anker = aktiv.keyframes[0];
    const neueKf = keyframesAusPreset(preset, anker);
    ctx?.commit(`Preset „${preset.name}" angewandt`);
    setzeGrafiken(grafiken.map((g) => (g.id === aktiv.id ? { ...g, keyframes: neueKf } : g)));
    setStatus(
      `Preset „${preset.name}" angewandt (${neueKf.length} Keyframes) — Strg+Z macht es rückgängig`,
    );
  };

  /** Ein Preset aus der Bibliothek löschen (fragt nach). */
  const presetLoeschen = async (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`Preset „${p.name}" wirklich löschen?`)) return;
    const liste = presets.filter((x) => x.id !== id);
    try {
      await presetsSetzen(liste);
      setPresets(liste);
      setStatus(`Preset „${p.name}" gelöscht`);
    } catch (error) {
      setStatus(
        `Preset konnte nicht gelöscht werden (${error instanceof Error ? error.message : "unbekannter Fehler"})`,
      );
    }
  };

  /* --- Vektorisieren (Raster → SVG) ------------------------------------
   * Ruft die Server-Route auf (sharp + Kern-Algorithmus, s.
   * app/api/vektorisieren/route.ts). Wird sowohl aus der Bibliothek (pro
   * Asset) als auch aus den Ebenen (fuer die ausgewaehlte Grafik) benutzt —
   * deshalb hier zentral statt zweimal. Das Ergebnis-SVG kommt ZUSAETZLICH
   * in die Bibliothek (Quelle bleibt unangetastet) und wird, falls ein
   * Ordner verbunden ist, gleich mitgeschrieben — sonst waere es nach dem
   * naechsten Reload wieder weg (die Bibliothek besteht dann nur aus dem,
   * was im Ordner liegt, s. ordnerLesen). */
  const vektorisieren = useCallback(
    async (quelle: { name: string; src: string }) => {
      if (vektorisiertLaeuft) return;
      setVektorisiertLaeuft(true);
      setStatus("Wird vektorisiert…");
      try {
        /* Server-Assets (s. Auto-Laden der Bibliothek) haben KEINE Data-URL
           als src, sondern eine direkte /pfad-URL (spart Base64 + Größenlimit,
           s. Asset.src-Kommentar in grafik-types.ts) — /api/vektorisieren
           verlangt aber zwingend eine Data-URL. Deshalb hier bei Bedarf erst
           nachladen und umwandeln; ein Fehlschlag faellt in den catch unten. */
        const quellDataUrl = quelle.src.startsWith("data:")
          ? quelle.src
          : await alsDataUrl(await (await fetch(quelle.src)).blob());

        /* Mit Slash am Ende: next.config.mjs setzt projektweit
           trailingSlash:true, ohne Slash kaeme erst ein 308-Redirect. */
        const res = await fetch("/api/vektorisieren/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataUrl: quellDataUrl,
            optionen: {
              maxFarben: vektorMaxFarben,
              minFlaechePx: vektorMinFlaeche,
              glaettung: vektorGlaettung,
            },
          }),
        });
        const daten = (await res.json()) as VektorAntwort | { fehler: string };
        if (!res.ok || "fehler" in daten) {
          setStatus(
            `Vektorisieren fehlgeschlagen: ${"fehler" in daten ? daten.fehler : res.statusText}`,
          );
          return;
        }

        const svgBlob = new Blob([daten.svg], { type: "image/svg+xml" });
        const svgSrc = await alsDataUrl(svgBlob);
        const neuerName = eindeutigerSvgName(quelle.name, pool);

        /* Ordner-Schreibfehler soll die erfolgreiche Vektorisierung nicht
           verschlucken — nur als Zusatzhinweis an den finalen Status haengen
           statt ihn zu ueberschreiben. */
        let ordnerHinweis = "";
        if (ordner) {
          try {
            await inOrdnerSchreiben(ordner, neuerName, svgBlob);
          } catch {
            ordnerHinweis = " · Ordner-Schreiben fehlgeschlagen";
          }
        }

        /* Zusaetzlich (bzw. wenn KEIN Ordner verbunden ist: als einziger Weg)
           auf den Server schreiben (public/vektor/, s. app/api/assets/
           route.ts) — nur so uebersteht das SVG einen Neustart auf JEDEM
           Rechner, nicht nur dem, der gerade einen Ordner verbunden hat.
           Schlaegt das fehl, bleibt die Data-URL als Quelle stehen (Ergebnis
           geht nicht verloren, liegt dann aber nur im Browser). */
        let assetSrc = svgSrc;
        let assetOrdner: string | undefined;
        let serverHinweis = "";
        try {
          const schreibRes = await fetch("/api/assets/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aktion: "schreibe", name: neuerName, dataUrl: svgSrc }),
          });
          const schreibDaten = (await schreibRes.json()) as AssetSchreibenAntwort | { fehler: string };
          if (schreibRes.ok && !("fehler" in schreibDaten)) {
            assetSrc = schreibDaten.url;
            assetOrdner = schreibDaten.ordner;
          } else {
            serverHinweis = " · Server-Schreiben fehlgeschlagen";
          }
        } catch {
          serverHinweis = " · Server-Schreiben fehlgeschlagen";
        }

        setPool((alt) => [
          ...alt,
          { id: neueId(), name: neuerName, src: assetSrc, art: "bild", ordner: assetOrdner },
        ]);

        const pfadeGesamt = daten.gruppen.reduce((summe, g) => summe + g.pfade, 0);
        const skaliertHinweis = daten.herunterskaliert
          ? ` · verkleinert von ${daten.herunterskaliert.vonBreite}×${daten.herunterskaliert.vonHoehe}px`
          : "";
        setStatus(
          `${daten.gruppen.length} Gruppen, ${pfadeGesamt} Pfade, ${Math.round(daten.dauerMs)} ms${skaliertHinweis}${ordnerHinweis}${serverHinweis}`,
        );
      } catch (error) {
        setStatus(
          `Vektorisieren fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
        );
      } finally {
        setVektorisiertLaeuft(false);
      }
    },
    [ordner, pool, vektorMaxFarben, vektorMinFlaeche, vektorGlaettung, vektorisiertLaeuft],
  );

  /* --- Freistellen (Hintergrund entfernen) ------------------------------
   * Läuft KOMPLETT im Browser über @imgly/background-removal (AGPL-Lizenz,
   * s. LICENSE.md dort) — keine eigene Server-Route nötig, passt damit auch
   * zum reinen Static-Export dieses Projekts (next.config.mjs
   * output:"export", von dem app/api/* im Dev-Betrieb ohnehin schon eine
   * Ausnahme ist). Dynamischer Import: die Bibliothek zieht bei Bedarf ein
   * ONNX-Modell nach (per Default von IMG.LYs CDN, s. Inspector-Hinweis) —
   * das soll nicht ungefragt im Haupt-Bundle jeder Editor-Seite mitladen.
   * Ersetzt NUR die src der PLATZIERTEN Grafik (wie „Datei ersetzen") — die
   * Bibliothek bleibt unangetastet. */
  const freistellen = useCallback(
    async (g: Grafik) => {
      if (freistellenLaeuft || vektorisiertLaeuft) return;
      setFreistellenLaeuft(true);
      setFreistellenFortschritt("");
      setStatus("Hintergrund wird entfernt…");
      try {
        const { removeBackground } = await import("@imgly/background-removal");
        const blob = await removeBackground(g.src, {
          progress: (schluessel, aktuell, gesamt) => {
            if (gesamt > 0) {
              setFreistellenFortschritt(`Lädt ${schluessel}: ${Math.round((aktuell / gesamt) * 100)}%`);
            }
          },
        });
        const src = await alsDataUrl(blob);
        ctx?.commit("Freigestellt");
        setzeGrafiken(grafiken.map((x) => (x.id === g.id ? { ...x, src } : x)));
        setStatus(`„${g.name}" freigestellt`);
      } catch (error) {
        setStatus(
          `Freistellen fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
        );
      } finally {
        setFreistellenLaeuft(false);
        setFreistellenFortschritt("");
      }
    },
    [ctx, grafiken, setzeGrafiken, freistellenLaeuft, vektorisiertLaeuft],
  );

  /* Während Freistellen läuft (Async-Lücke, beim ersten Modell-Download bis
     zu mehreren Sekunden): Entf/Strg+Z/Strg+Y sollen NICHT die Grafik unter
     dem Ladeschirm weglöschen oder den Verlauf verändern — das Ergebnis
     würde sonst am Ende auf einem veralteten grafiken-Stand landen (s.
     freistellen oben: setzeGrafiken liest grafiken aus dem Closure zum
     Zeitpunkt des Klicks). Das Overlay blockt bereits alle Klicks (volle
     Fläche, s. gre-vektor-overlay), hier zusätzlich defensiv die Tastatur —
     Capture-Phase, damit das VOR dem window-Listener der globalen Kürzel
     weiter unten greift (Capture läuft komplett vor jeder Bubble-Phase). */
  useEffect(() => {
    if (!freistellenLaeuft) return;
    const blocken = (e: KeyboardEvent) => {
      const strg = e.ctrlKey || e.metaKey;
      if (
        e.key === "Delete" ||
        e.key === "Backspace" ||
        (strg && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y"))
      ) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", blocken, { capture: true });
    return () => document.removeEventListener("keydown", blocken, { capture: true });
  }, [freistellenLaeuft]);

  /* Strg+V und Drag&Drop: der schnelle Canva-Weg (in Canva Element kopieren
     bzw. Export herüberziehen). Canva selbst lässt sich NICHT einbetten —
     es sendet X-Frame-Options: SAMEORIGIN. */
  useEffect(() => {
    if (!ctx) return;

    const onPaste = (e: ClipboardEvent) => {
      if (istEingabeFokussiert(e.target)) return;
      const f = Array.from(e.clipboardData?.files ?? [])[0];
      if (!f) return;
      e.preventDefault();
      void dateiUebernehmen(f);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropAktiv(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropAktiv(false);
    };
    const onDrop = (e: DragEvent) => {
      const f = Array.from(e.dataTransfer?.files ?? [])[0];
      setDropAktiv(false);
      if (!f) return;
      e.preventDefault();
      void dateiUebernehmen(f, { x: e.clientX, y: e.clientY });
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [ctx, dateiUebernehmen]);

  const loeschen = (id: string) => {
    /* EIN Commit vor BEIDEN Aenderungen (grafiken + ggf. uebernommen unten)
       — sonst wuerde Rueckgaengig nur die Haelfte wiederherstellen. */
    ctx?.commit("Ebene gelöscht");
    setzeGrafiken(grafiken.filter((g) => g.id !== id));
    if (ctx?.auswahl === id) ctx.setAuswahl(null);
    /* Baum-Uebernahme mit aufraeumen, falls diese Grafik einen Vorhang-Platz
       ersetzt hat (s. VORHANG_GRAFIK_PREFIX) — sonst bliebe der Platz fuer
       immer leer: der Vorhang wuerde ihn wegen des uebernommen-Eintrags
       weiter ueberspringen, obwohl keine Ersatz-Grafik mehr da ist. Gleiches
       Aufraeumen wie beim dedizierten "Zurück an den Vorhang"-Knopf (s.
       GrafikSeiteTab.tsx), nur hier fuer den generischen Loeschen-Weg. */
    if (ctx && id.startsWith(VORHANG_GRAFIK_PREFIX)) {
      const vorhangId = id.slice(VORHANG_GRAFIK_PREFIX.length);
      ctx.setUebernommen(ctx.uebernommen.filter((v) => v !== vorhangId));
    }
    setStatus("Grafik gelöscht");
  };

  /** Löscht MEHRERE Ebenen als EINEN Verlaufsschritt — für Entf bei aktiver
   *  Mehrfachauswahl (s. Fenster-Pointer-Effekt oben). Bei genau EINER id
   *  wird bewusst die bestehende `loeschen` wiederverwendet (identisches
   *  Verhalten wie bisher, kein zweiter Code-Pfad fürs Alltägliche) — die
   *  Mehrfach-Variante läuft nur an, wenn wirklich >1 Ebenen betroffen sind. */
  const loescheMehrere = (ids: string[]) => {
    if (ids.length <= 1) {
      if (ids[0]) loeschen(ids[0]);
      ctx?.setAuswahlMehr([]);
      return;
    }
    const idSet = new Set(ids);
    ctx?.commit("Mehrere Ebenen gelöscht");
    setzeGrafiken(grafiken.filter((g) => !idSet.has(g.id)));
    ctx?.setAuswahl(null);
    ctx?.setAuswahlMehr([]);
    if (ctx) {
      const weg = new Set(
        ids
          .filter((id) => id.startsWith(VORHANG_GRAFIK_PREFIX))
          .map((id) => id.slice(VORHANG_GRAFIK_PREFIX.length)),
      );
      if (weg.size > 0) ctx.setUebernommen(ctx.uebernommen.filter((v) => !weg.has(v)));
    }
    setStatus(`${ids.length} Grafiken gelöscht`);
  };

  /** Verschiebt die GESAMTE aktuelle Auswahl (primär + Mehrfach) um (dx, dy)
   *  Pixel — Pfeiltasten-Nudge, EIN Commit pro Tastendruck (über die Gruppe
   *  "nudge" mit schnellen Folgedrücken zusammengefasst, s.
   *  GrafikContext.commit). Gesperrte Mitglieder bleiben unangetastet. */
  const verschiebeAuswahlUmPixel = (dx: number, dy: number) => {
    if (!ctx) return;
    const ids = volleAuswahl(ctx.auswahl, ctx.auswahlMehr);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    ctx.commit(ids.length > 1 ? "Gruppe verschoben" : "Verschoben", "nudge");
    setzeGrafiken(
      grafiken.map((g) => {
        if (!idSet.has(g.id) || g.gesperrt) return g;
        const kfIndex = naechsterKfIndex(g, window.scrollY);
        return {
          ...g,
          /* Nudge löst einen bestehenden Anker (Welle 3b): nur „Hier locken"
             und Drag-Ende ankern neu (s. ANKER_LEER) — sonst würde die
             genudgte Position vom alten Anker überschrieben. */
          keyframes: g.keyframes.map((k, i) =>
            i === kfIndex ? { ...k, x: k.x + dx, y: k.y + dy, ...ANKER_LEER } : k,
          ),
        };
      }),
    );
  };

  const umbenennen = (id: string, neu: string) => {
    /* Gruppiert: jeder Tastendruck im Namensfeld feuert onChange — ohne
       Gruppe waere ein 10-Zeichen-Name 10 Verlaufsschritte. */
    ctx?.commit("Umbenannt", `rename:${id}`);
    setzeGrafiken(grafiken.map((g) => (g.id === id ? { ...g, name: neu } : g)));
  };

  /** TAUSCHEN von zwei platzierten Ebenen: die Grafiken wechseln den Platz,
   *  ihre Keyframes/Groesse/Reihenfolge bleiben, wo sie sind. Praktisch, wenn
   *  zwei Elemente an der falschen Stelle sitzen — statt beide neu zu setzen.
   *  Getauscht wird alles, was zur DATEI gehoert (src/art/modus/name), nicht
   *  was zur POSITION gehoert (keyframes/z/breitePx). */
  const tauscheMit = (idA: string, idB: string) => {
    const a = grafiken.find((g) => g.id === idA);
    const b = grafiken.find((g) => g.id === idB);
    if (!a || !b || idA === idB) return;
    ctx?.commit("Getauscht");
    setzeGrafiken(
      grafiken.map((g) => {
        if (g.id === idA) return { ...g, src: b.src, art: b.art, modus: b.modus, name: b.name };
        if (g.id === idB) return { ...g, src: a.src, art: a.art, modus: a.modus, name: a.name };
        return g;
      }),
    );
    setTauschQuelle(null);
    setStatus(`„${a.name}" ⇄ „${b.name}" getauscht (Positionen bleiben)`);
  };

  /** ERSETZEN durch ein Asset aus der Bibliothek: die Ebene behaelt ihren
   *  Platz, bekommt aber eine andere Grafik. */
  const ersetzeDurchAsset = (id: string, a: Asset) => {
    ctx?.commit("Ebene ersetzt");
    setzeGrafiken(
      grafiken.map((g) =>
        g.id === id
          ? { ...g, src: a.src, art: a.art, name: a.name, ...(a.art !== "bild" ? { modus: g.modus ?? ("loop" as const) } : {}) }
          : g,
      ),
    );
    setStatus(`Ebene durch „${a.name}" ersetzt (Position bleibt)`);
  };

  /** Duplizieren: gleiche Datei, eigene Keyframes — praktisch, wenn dieselbe
   *  Grafik an mehreren Stellen der Seite auftauchen soll. */
  const duplizieren = (id: string) => {
    const g = grafiken.find((x) => x.id === id);
    if (!g) return;
    const neuId = neueId();
    ctx?.commit("Dupliziert");
    setzeGrafiken([
      ...grafiken,
      {
        ...g,
        id: neuId,
        name: `${g.name} (Kopie)`,
        z: grafiken.length + 1,
        keyframes: g.keyframes.map((k) => ({ ...k, x: k.x + 40, y: k.y + 40 })),
      },
    ]);
    ctx?.setAuswahl(neuId);
    setStatus("Dupliziert");
  };

  /** Zeichenreihenfolge: tauscht z mit dem Nachbarn (richtung -1 = nach
   *  hinten, +1 = nach vorn). Die Liste wird nach z sortiert gehalten. */
  const verschiebeZ = (id: string, richtung: -1 | 1) => {
    const sortiert = [...grafiken].sort((a, b) => a.z - b.z);
    const i = sortiert.findIndex((g) => g.id === id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= sortiert.length) return;
    const zI = sortiert[i].z;
    sortiert[i] = { ...sortiert[i], z: sortiert[j].z };
    sortiert[j] = { ...sortiert[j], z: zI };
    ctx?.commit(richtung > 0 ? "Nach vorn" : "Nach hinten");
    setzeGrafiken(sortiert.sort((a, b) => a.z - b.z));
    setStatus(richtung > 0 ? "Nach vorn" : "Nach hinten");
  };

  /** Sichtbarkeit umschalten — eigene Funktion statt Inline-Handler, weil
   *  sowohl der Reiter „Ebenen" ALS AUCH das schwebende Objektmenü (s.
   *  GrafikObjektMenue.tsx) denselben Knopf brauchen (nicht nachbauen). */
  const umschalteVersteckt = (id: string) => {
    const g = grafiken.find((x) => x.id === id);
    ctx?.commit(g?.versteckt ? "Eingeblendet" : "Ausgeblendet");
    setzeGrafiken(grafiken.map((x) => (x.id === id ? { ...x, versteckt: !x.versteckt } : x)));
  };

  /** Sperre umschalten — gleicher Grund wie umschalteVersteckt oben. */
  const umschalteGesperrt = (id: string) => {
    const g = grafiken.find((x) => x.id === id);
    ctx?.commit(g?.gesperrt ? "Entsperrt" : "Gesperrt");
    setzeGrafiken(grafiken.map((x) => (x.id === id ? { ...x, gesperrt: !x.gesperrt } : x)));
  };

  /** Horizontal spiegeln umschalten — reine Anzeige-Transform (s.
   *  GrafikLayer.tsx), gleiches Commit-Muster wie umschalteVersteckt/
   *  umschalteGesperrt oben. */
  const umschalteSpiegelX = (id: string) => {
    const g = grafiken.find((x) => x.id === id);
    ctx?.commit(g?.spiegelX ? "Spiegelung horizontal entfernt" : "Horizontal gespiegelt");
    setzeGrafiken(grafiken.map((x) => (x.id === id ? { ...x, spiegelX: !x.spiegelX } : x)));
  };

  /** Vertikal spiegeln umschalten — s. umschalteSpiegelX. */
  const umschalteSpiegelY = (id: string) => {
    const g = grafiken.find((x) => x.id === id);
    ctx?.commit(g?.spiegelY ? "Spiegelung vertikal entfernt" : "Vertikal gespiegelt");
    setzeGrafiken(grafiken.map((x) => (x.id === id ? { ...x, spiegelY: !x.spiegelY } : x)));
  };

  /** Tausch-Modus fürs schwebende Objektmenü: bewaffnet dieselbe
   *  tauschQuelle-Logik wie der ⇄-Knopf im Reiter „Ebenen" (dort schließt
   *  ein Klick auf eine ZWEITE Ebene den Tausch ab) und springt gleich auf
   *  diesen Reiter, sonst sähe Leon weder den Hinweis-Banner noch die
   *  zweite Ebene zum Anklicken. */
  const tauschenStarten = (id: string) => {
    if (tauschQuelle === id) {
      setTauschQuelle(null);
      return;
    }
    setTauschQuelle(id);
    setReiter("ebenen");
  };

  /* --- Keyframes ------------------------------------------------------- */

  /** „Hier locken": aktuelle Scrollposition + aktueller Zustand als Keyframe.
   *  Liegt schon einer in Reichweite, wird er überschrieben. */
  const keyframeSetzen = () => {
    if (!aktiv) return;
    const y = window.scrollY;
    const z = zustandBei(aktiv, y);
    const treffer = aktiv.keyframes.findIndex((k) => Math.abs(k.scrollY - y) <= KF_SNAP_PX);
    /* Element-ID-Anker (Welle 3b): das nächstliegende getaggte Element als
       drift-feste Referenz ZUSÄTZLICH zu den Absolutwerten festhalten. Bei
       Überschreiben eines vorhandenen Keyframes ersetzt der neue Anker den
       alten (neu deckt die Anker-Felder vollständig, s. ankerFelderFuer). */
    const neu: GrafikKeyframe = { ...z, scrollY: y, ...ankerFelderFuer(z.y, y) };
    const kfs =
      treffer >= 0
        ? aktiv.keyframes.map((k, i) => (i === treffer ? neu : k))
        : [...aktiv.keyframes, neu].sort((a, b) => a.scrollY - b.scrollY);
    ctx?.commit(treffer >= 0 ? "Keyframe überschrieben" : "Keyframe gesetzt");
    setzeGrafiken(grafiken.map((g) => (g.id === aktiv.id ? { ...g, keyframes: kfs } : g)));
    setStatus(treffer >= 0 ? `Keyframe @${y} überschrieben` : `Keyframe @${y} gesetzt`);
  };

  const keyframeLoeschen = (i: number) => {
    if (!aktiv || aktiv.keyframes.length <= 1) {
      setStatus("Letzter Keyframe bleibt (sonst wäre die Grafik ortlos)");
      return;
    }
    ctx?.commit("Keyframe gelöscht");
    setzeGrafiken(
      grafiken.map((g) =>
        g.id === aktiv.id ? { ...g, keyframes: g.keyframes.filter((_, k) => k !== i) } : g,
      ),
    );
  };

  /** Kopiert Keyframe i an die AKTUELLE Scrollposition (inkl. easing und
   *  srcOverride) — praktisch, um einen Zwischenzustand als Ausgangspunkt für
   *  eine neue Stelle zu nehmen statt ihn von Null zu bauen. Liegt dort schon
   *  ein Keyframe in Reichweite (KF_SNAP_PX), wird er überschrieben statt
   *  verdoppelt — exakt dasselbe Verhalten wie „Hier locken" (keyframeSetzen). */
  const kfDuplizieren = (i: number) => {
    if (!aktiv) return;
    const quelle = aktiv.keyframes[i];
    const y = window.scrollY;
    const treffer = aktiv.keyframes.findIndex((k) => Math.abs(k.scrollY - y) <= KF_SNAP_PX);
    /* Kopie an neuer Scroll-/Position: ein evtl. Anker (Welle 3b) der Quelle
       passt hier nicht mehr (andere scrollY) → lösen. Neu ankern per Drag-Ende/
       „Hier locken". easing/srcOverride der Quelle bleiben dagegen erhalten. */
    const kopie: GrafikKeyframe = { ...quelle, scrollY: y, ...ANKER_LEER };
    const kfs =
      treffer >= 0
        ? aktiv.keyframes.map((k, idx) => (idx === treffer ? kopie : k))
        : [...aktiv.keyframes, kopie].sort((a, b) => a.scrollY - b.scrollY);
    ctx?.commit(treffer >= 0 ? "Keyframe überschrieben" : "Keyframe kopiert");
    setzeGrafiken(grafiken.map((g) => (g.id === aktiv.id ? { ...g, keyframes: kfs } : g)));
    setStatus(treffer >= 0 ? `Keyframe @${y} überschrieben` : `Keyframe kopiert @${y}`);
  };

  const springeZu = (y: number) => window.scrollTo({ top: y, behavior: "smooth" });

  /* --- Keyframe-Zeitleiste (GrafikKeyframeTimeline.tsx) -----------------
     Additiv zur bestehenden Keyframe-Liste (.gre-liste unten) — DERSELBE
     Ein-Zug-EIN-Commit-Rhythmus wie der Canvas-Zug oben: Start merkt den
     Vor-Zug-Stand, Bewegung patcht live ohne Commit, Ende sortiert die
     Keyframes neu (die Reihenfolge muss nach scrollY sortiert bleiben, s.
     grafik-types.ts) und committet EINMAL. */
  const kfZeitleisteZugStart = useCallback(() => {
    zeitleisteVorZugRef.current = grafiken;
  }, [grafiken]);

  const kfZeitleisteZugBewegung = useCallback(
    (kfIndex: number, neuY: number) => {
      if (!aktiv) return;
      /* Marker verschiebt die Trigger-Scrollhöhe → ankerScrollDy wäre veraltet:
         Anker (Welle 3b) lösen, sonst „springt" der Keyframe im Render an seine
         alte scrollY zurück. */
      patchKf(aktiv.id, kfIndex, { scrollY: neuY, ...ANKER_LEER });
    },
    [aktiv, patchKf],
  );

  const kfZeitleisteZugEnde = useCallback(
    (kfIndex: number, neuY: number) => {
      if (!aktiv) return;
      const vor = zeitleisteVorZugRef.current;
      zeitleisteVorZugRef.current = null;
      const sortiert = [...aktiv.keyframes]
        /* Anker (Welle 3b) lösen (s. kfZeitleisteZugBewegung) — die neue scrollY
           gilt jetzt absolut. */
        .map((k, i) => (i === kfIndex ? { ...k, scrollY: neuY, ...ANKER_LEER } : k))
        .sort((a, b) => a.scrollY - b.scrollY);
      ctx?.commit(
        "Keyframe verschoben",
        undefined,
        vor ? { grafiken: vor, uebernommen: ctx.uebernommen } : undefined,
      );
      setzeGrafiken(grafiken.map((g) => (g.id === aktiv.id ? { ...g, keyframes: sortiert } : g)));
      setStatus(`Keyframe verschoben @${neuY}`);
    },
    [aktiv, grafiken, setzeGrafiken, ctx],
  );

  /* --- Setups (= "Abbilder") --------------------------------------------
     Speichern/Laden/Auflisten gehen an /api/abbild — das schreibt ECHTE
     Dateien unter abbilder/ (s. dort). Der Browserspeicher (STORAGE_KEY)
     bleibt NUR die Rückfallebene, wenn die Route mal nicht antwortet
     (Server aus, Netzwerkfehler) — der Editor darf nie hart scheitern. */

  /** Reine Browserspeicher-Ablage — die Rückfallebene UND der Lesepfad für
   *  Setups, die es (noch) nur lokal gibt (z.B. aus einer Sitzung, in der
   *  die Route nicht erreichbar war). */
  const lokalSpeichern = (n: string) => {
    const alle: Record<string, GrafikSetup> = {
      ...ladeSetups(),
      [n]: {
        name: n,
        gespeichert: new Date().toISOString(),
        meta: {
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          docH: document.documentElement.scrollHeight,
        },
        grafiken,
        pool,
        uebernommen: ctx?.uebernommen ?? [],
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
      setSetups(alle);
    } catch {
      setStatus(
        "Speicher voll — Setup exportieren, dann alte Setups löschen oder Assets verkleinern",
      );
    }
  };

  /** Serverseitige Abbild-Liste (abbilder/*.json) neu einlesen — nach jedem
   *  Speichern/Löschen, damit das Panel den Platten-Stand zeigt. */
  const ladeServerListe = useCallback(async () => {
    try {
      const res = await fetch("/api/abbild/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "liste" }),
      });
      const daten = (await res.json()) as AbbildListeAntwort | { fehler: string };
      if (!res.ok || "fehler" in daten) return;
      setServerAbbilder(daten.abbilder);
    } catch {
      /* Route nicht erreichbar — Panel zeigt dann nur die Browser-Setups. */
    }
  }, []);

  useEffect(() => {
    void ladeServerListe();
  }, [ladeServerListe]);

  const speichern = async () => {
    if (!name.trim()) return;
    const n = name.trim();
    const abbild = {
      meta: {
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        docH: document.documentElement.scrollHeight,
      },
      grafiken,
      /* Bibliothek gehört dazu — sonst wäre der Asset-Ordner nach jedem
         Reload weg (Kundenvorgabe: „wenn ja muss das rein"). */
      pool,
      /* Vom Vorhang uebernommene Plaetze gehoeren zum Zustand dazu — sonst
         wuerden nach einem Neuladen alle uebernommenen Baeume DOPPELT
         dastehen (Vorhang zeichnet sie wieder, weil er von der Uebernahme
         nichts mehr wuesste). */
      uebernommen: ctx?.uebernommen ?? [],
    };
    try {
      const res = await fetch("/api/abbild/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "speichere", name: n, abbild }),
      });
      const daten = (await res.json()) as AbbildSpeichernAntwort | { fehler: string };
      if (!res.ok || "fehler" in daten) {
        throw new Error("fehler" in daten ? daten.fehler : res.statusText);
      }
      setStatus(
        `gespeichert: ${daten.pfad} · ${grafiken.length} platziert · ${pool.length} in der Bibliothek`,
      );
      await ladeServerListe();
    } catch (error) {
      /* Rückfallebene: Browserspeicher wie vor der Umstellung — aber klar
         als Notlösung markiert, damit sichtbar bleibt, dass es NICHT auf
         der Platte liegt. */
      lokalSpeichern(n);
      setStatus(
        `Route nicht erreichbar (${error instanceof Error ? error.message : "unbekannter Fehler"}) — nur im Browser gespeichert („${n}")`,
      );
    }
  };

  /** Übernimmt ein geladenes Setup (Platte ODER Browserspeicher) in den
   *  Editor-Zustand — ein Weg fuer beide Quellen. */
  const anwenden = (
    n: string,
    neueGrafiken: Grafik[],
    neuerPool?: Asset[],
    neueUebernommen?: string[],
    autoriertDocH?: number,
  ) => {
    setName(n);
    ctx?.setAuswahl(null);
    /* Kompletter Setup-Wechsel — ein Rückgängig über die Grenze hinweg
       würde in einen fremden Stand springen, das ist kein "Schritt
       zurück" mehr, sondern nur verwirrend. */
    ctx?.resetHistory();
    /* Höhen-Normalisierung: autoriertDocH ist die Dokumenthöhe, gegen die
       scrollY/y der Keyframes gesetzt wurden — weicht die AKTUELLE Seite
       davon ab (anderer Viewport/Inhalt seit dem Speichern), würden die
       rohen Werte an der falschen relativen Scrollposition landen (s.
       skaliereGrafikenFuerHoehe, grafik-types.ts). faktor=1 (kein
       autoriertDocH oder unveränderte Höhe) lässt alles wie bisher. */
    const faktor = hoehenFaktor(autoriertDocH);
    setzeGrafiken(
      skaliereGrafikenFuerHoehe(
        neueGrafiken.map((g) => ({ ...g, keyframes: g.keyframes.map((k) => ({ ...k })) })),
        faktor,
      ),
    );
    /* Kein pool-Feld (aeltere lokale Setups): Bibliothek unangetastet lassen
       statt sie zu leeren — sonst verlöre man beim Laden seinen Asset-Ordner. */
    if (neuerPool) setPool(neuerPool.map((a) => ({ ...a })));
    /* Kein uebernommen-Feld (aeltere Setups/Abbilder ohne dieses Feature):
       als "nichts uebernommen" behandeln statt den Vorhang-Zustand stehen zu
       lassen — sonst wuerde ein alter Baum aus einem VORHERIGEN Setup als
       "uebernommen" haengen bleiben, obwohl das gerade geladene Setup gar
       keine solche Grafik mehr enthaelt. */
    ctx?.setUebernommen(neueUebernommen ? [...neueUebernommen] : []);
    return faktor;
  };

  const laden = async (n: string, quelle: "platte" | "browser") => {
    if (quelle === "browser") {
      const s = ladeSetups()[n];
      if (!s) return;
      const faktor = anwenden(n, s.grafiken, s.pool, s.uebernommen, s.meta?.docH);
      setStatus(
        `„${n}" geladen (Browser) · ${s.grafiken.length} platziert · ${s.pool?.length ?? 0} Assets${hoehenHinweis(faktor)}`,
      );
      return;
    }
    try {
      const res = await fetch("/api/abbild/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "lade", name: n }),
      });
      const daten = (await res.json()) as AbbildLadeAntwort | { fehler: string };
      if (!res.ok || "fehler" in daten) {
        throw new Error("fehler" in daten ? daten.fehler : res.statusText);
      }
      const faktor = anwenden(
        n,
        daten.abbild.grafiken,
        daten.abbild.pool,
        daten.abbild.uebernommen,
        daten.abbild.meta?.docH,
      );
      setStatus(
        `„${n}" geladen (Platte) · ${daten.abbild.grafiken.length} platziert · ${daten.abbild.pool?.length ?? 0} Assets${hoehenHinweis(faktor)}`,
      );
    } catch (error) {
      setStatus(
        `Konnte „${n}" nicht von der Platte laden (${error instanceof Error ? error.message : "unbekannter Fehler"})`,
      );
    }
  };

  const setupLoeschen = (n: string) => {
    if (!window.confirm(`„${n}" wirklich aus dem Browserspeicher löschen?`)) return;
    const alle = ladeSetups();
    delete alle[n];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
    setSetups(alle);
    setStatus(`„${n}" gelöscht (Browser)`);
  };

  /** Löscht eine Datei unter abbilder/ — NIE ohne Rückfrage (Kundenvorgabe). */
  const loescheVonPlatte = async (n: string) => {
    if (
      !window.confirm(
        `„${n}" wirklich von der Platte löschen (abbilder/${n}.json)? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/abbild/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "loesche", name: n }),
      });
      const daten = (await res.json()) as AbbildLoeschenAntwort | { fehler: string };
      if (!res.ok || "fehler" in daten) {
        throw new Error("fehler" in daten ? daten.fehler : res.statusText);
      }
      setStatus(`„${n}" gelöscht (Platte)`);
      await ladeServerListe();
    } catch (error) {
      setStatus(`Löschen fehlgeschlagen (${error instanceof Error ? error.message : "unbekannter Fehler"})`);
    }
  };

  /** Schreibt den AKTUELLEN Editor-Stand nach grafik.config.json — das ist
   *  die Datei, die die echte Landing anzeigt (s. GrafikContext.tsx). Kein
   *  pool: die Landing kennt keine Bibliothek, nur platzierte Grafiken. Auch
   *  hier eine Rückfrage — das überschreibt den LIVE-Stand der echten Seite. */
  const alsStandardSetzen = async () => {
    if (
      !window.confirm(
        "Aktuellen Stand als Standard der Landing setzen? Das überschreibt grafik.config.json.",
      )
    ) {
      return;
    }
    const abbild = {
      meta: {
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        docH: document.documentElement.scrollHeight,
      },
      grafiken,
      /* Muss mit nach grafik.config.json — sonst wuerde die echte Landing
         uebernommene Baeume wieder DOPPELT zeigen (Vorhang zeichnet sie neu,
         GrafikLayer zeigt zusaetzlich die Builder-Grafik). */
      uebernommen: ctx?.uebernommen ?? [],
    };
    try {
      const res = await fetch("/api/abbild/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "standard", abbild }),
      });
      const daten = (await res.json()) as AbbildStandardAntwort | { fehler: string };
      if (!res.ok || "fehler" in daten) {
        throw new Error("fehler" in daten ? daten.fehler : res.statusText);
      }
      setStatus(`Standard gesetzt: ${daten.pfad} · ${daten.grafikenAnzahl} platziert`);
    } catch (error) {
      setStatus(
        `Als Standard setzen fehlgeschlagen (${error instanceof Error ? error.message : "unbekannter Fehler"})`,
      );
    }
  };

  const exportieren = () => {
    const alle = ladeSetups();
    const blob = new Blob([JSON.stringify(alle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grafik-setups.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Export: ${Object.keys(alle).length} Setups (nur Browser)`);
  };

  /* --- Verlauf (Undo/Redo) ---------------------------------------------
     Eigene Funktionen statt Inline-Logik im Tastatur-Effekt/Knopf-Handler:
     beide Aufrufer (Kopf-Knöpfe ↶↷ UND Strg+Z/Strg+Y) sollen exakt dieselbe
     Statuszeilen-Meldung bekommen (nicht nachbauen).

     DISPATCH NACH FOKUS (Welle 2c-1, Bauvorlage §3): hat auf /editor das
     Fluss-Objekt den Bearbeitungs-Fokus, wirken Rückgängig/Wiederholen auf den
     eigenen FLUSS-Verlauf, sonst wie bisher auf den Grafik-Verlauf. EINE
     Dispatch-Stelle für Kopf-Knopf UND Strg+Z/Y — der globale Tastatur-Handler
     ruft genau diese Funktionen (kein zweiter Shortcut-Handler). Ohne
     FlussObjekt-Provider (alte Route) ist flussObjekt null → immer Grafik. */
  const rueckgaengigMachen = () => {
    if (flussObjekt?.fokus && flussObjekt.steuerung) {
      const label = flussObjekt.steuerung.verlauf.undo();
      if (label) setStatus(`Rückgängig (Fluss): ${label}`);
      return;
    }
    const label = ctx?.undo();
    if (label) setStatus(`Rückgängig: ${label}`);
  };

  const wiederholenMachen = () => {
    if (flussObjekt?.fokus && flussObjekt.steuerung) {
      const label = flussObjekt.steuerung.verlauf.redo();
      if (label) setStatus(`Wiederhergestellt (Fluss): ${label}`);
      return;
    }
    const label = ctx?.redo();
    if (label) setStatus(`Wiederhergestellt: ${label}`);
  };

  /* Globale Tastaturkürzel: Strg+Z / Strg+Shift+Z / Strg+Y (Verlauf),
     Entf/Backspace (Auswahl löschen), Esc (Auswahl aufheben). Bewusst GANZ
     UNTEN platziert (nach loeschen() & Co.) — const-Deklarationen sind nicht
     hoisted, ein Effekt weiter oben würde beim Rendern mit einem
     ReferenceError abstürzen. Feuert NIE, während in einem Textfeld
     getippt wird (s. istEingabeFokussiert) — sonst würde z.B. Entf beim
     Umbenennen die Grafik statt eines Zeichens löschen. */
  useEffect(() => {
    if (!ctx) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (istEingabeFokussiert(e.target)) return;
      const strg = e.ctrlKey || e.metaKey;
      if (strg && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) wiederholenMachen();
        else rueckgaengigMachen();
        return;
      }
      if (strg && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        wiederholenMachen();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && ctx.auswahl) {
        e.preventDefault();
        /* Additiv: bei aktiver Mehrfachauswahl löscht Entf ALLE (EIN
           Verlaufsschritt) — s. loescheMehrere. Ohne Mehrfachauswahl (der
           Normalfall) ist volleAuswahl(...) === [ctx.auswahl], loescheMehrere
           delegiert dann 1:1 an die unveränderte loeschen(id). */
        loescheMehrere(volleAuswahl(ctx.auswahl, ctx.auswahlMehr));
        return;
      }
      /* Pfeiltasten: NEUE Fähigkeit (gab es bisher gar nicht), additiv —
         greift nur, wenn etwas ausgewählt ist, sonst bleibt das normale
         Tastaturverhalten (z.B. Seiten-Scroll) unangetastet. Verschiebt die
         volle Auswahl (Einzel oder Mehrfach, s. verschiebeAuswahlUmPixel). */
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        ctx.auswahl
      ) {
        e.preventDefault();
        const schritt = e.shiftKey ? PFEIL_SCHRITT_GROSS_PX : PFEIL_SCHRITT_PX;
        const dx = e.key === "ArrowLeft" ? -schritt : e.key === "ArrowRight" ? schritt : 0;
        const dy = e.key === "ArrowUp" ? -schritt : e.key === "ArrowDown" ? schritt : 0;
        verschiebeAuswahlUmPixel(dx, dy);
        return;
      }
      if (e.key === "Escape") {
        ctx.setAuswahl(null);
        ctx.setAuswahlMehr([]);
        ctx.setGelockt(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ctx, loeschen, loescheMehrere, verschiebeAuswahlUmPixel, rueckgaengigMachen, wiederholenMachen]);

  /* /editor: Grafik-Auswahl und Fluss-Fokus schließen sich gegenseitig aus
     (Bauvorlage §1: „Grafik-Auswahl hebt Fluss-Fokus auf und umgekehrt").
     Diese Richtung: sobald eine Grafik ausgewählt ist, verliert der Fluss den
     Fokus. Die Gegenrichtung (Fluss wählen → Grafik-Auswahl leeren) passiert
     imperativ im Klick-Handler des Fluss-Ebenen-Eintrags. Ohne
     FlussObjekt-Provider (alte Route) ist flussObjekt null → No-Op. */
  const flussSetFokus = flussObjekt?.setFokus;
  const flussHatFokus = flussObjekt?.fokus;
  useEffect(() => {
    if (ctx?.auswahl && flussHatFokus && flussSetFokus) flussSetFokus(false);
  }, [ctx?.auswahl, flussHatFokus, flussSetFokus]);

  if (!ctx) return null;

  /* Kopf-Knöpfe ↶↷ (Welle 2c-1, Bauvorlage §3c): bei Fluss-Fokus richtet sich
     die Verfügbarkeit nach dem FLUSS-Verlauf (jetzt scharf statt disabled wie in
     2b-2), sonst nach dem Grafik-Verlauf. */
  const flussVerlauf = flussObjekt?.steuerung?.verlauf;
  const kannRueckgaengig = flussHatFokus ? !!flussVerlauf?.canUndo : ctx.canUndo;
  const kannWiederholen = flussHatFokus ? !!flussVerlauf?.canRedo : ctx.canRedo;

  const aktivKfIndex = aktiv ? naechsterKfIndex(aktiv, scrollY) : -1;
  /** Nur Rasterbilder (kein SVG) lassen sich sinnvoll vektorisieren — steuert
   *  den Vektor-Abschnitt im Reiter „Bild" (s. GrafikInspector.tsx). */
  const bildIstVektorisierbar = !!aktiv && aktiv.art === "bild" && !istSvgName(aktiv.name);
  /* Freistellen braucht dieselbe Voraussetzung (Rasterbild, kein SVG) — ein
     SVG hat i.d.R. schon keinen "Hintergrund" im Rasterbild-Sinn. */
  const kannFreistellen = bildIstVektorisierbar;

  /* Bibliothek gruppiert nach Asset.ordner (nur Server-Assets haben das
     Feld, s. Auto-Laden oben) — sonst waeren z.B. 16 Baum-Varianten ein
     einziger Wust. Ordner-Dialog-Assets (kein ordner-Feld) bleiben in
     poolOhneOrdner, also unveraendert im flachen Raster wie bisher. */
  const poolGefiltert = pool.filter((a) =>
    a.name.toLowerCase().includes(poolFilter.toLowerCase()),
  );
  const poolOhneOrdner = poolGefiltert.filter((a) => !a.ordner);
  const poolGruppenMap = new Map<string, Asset[]>();
  for (const a of poolGefiltert) {
    if (!a.ordner) continue;
    const liste = poolGruppenMap.get(a.ordner);
    if (liste) liste.push(a);
    else poolGruppenMap.set(a.ordner, [a]);
  }
  const poolGruppen = [...poolGruppenMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  /* Setups-Reiter: Server-Abbilder (Platte) und Browser-Setups getrennt
     halten, aber nichts doppelt zeigen, falls ein Name auf beiden Seiten
     existiert (z.B. ein altes Browser-Setup, das inzwischen auch gespeichert
     wurde) — dann gewinnt die Platte. */
  const lokaleSetupNamen = Object.keys(setups)
    .filter((n) => !serverAbbilder.some((a) => a.name === n))
    .sort();

  /** Ein Bibliotheks-Eintrag — als Funktion statt Inline-JSX, weil sowohl
   *  die ungruppierten Assets als auch jede Ordner-Gruppe dasselbe Karten-
   *  Layout brauchen (Klick zum Setzen/Ersetzen, Vektorisieren, Entfernen). */
  const poolEintrag = (a: Asset) => (
    <div key={a.id} className="gre-pool-item-wrap">
      <button
        className="gre-pool-item"
        onClick={() => {
          /* G3: waehrend ein Keyframe-Bildtausch bewaffnet ist, setzt ein
             Klick hier NUR den srcOverride dieses einen Keyframes — die
             normale Ersetzen/Setzen-Bedeutung ruht solange (s. kfBildZiel). */
          if (kfBildZiel) {
            ctx?.commit("Keyframe-Bild getauscht");
            patchKf(kfBildZiel.grafikId, kfBildZiel.kfIndex, { srcOverride: a.src });
            setKfBildZiel(null);
            setReiter("keyframes");
            setStatus(`Bild für Keyframe gesetzt (nur dieser Keyframe) — „${a.name}"`);
            return;
          }
          if (aktiv) ersetzeDurchAsset(aktiv.id, a);
          else platziere(a);
        }}
        title={
          kfBildZiel
            ? `„${a.name}" nur für diesen Keyframe setzen`
            : aktiv
              ? `„${aktiv.name}" durch „${a.name}" ersetzen (Position bleibt) — Auswahl aufheben zum Neusetzen`
              : `${a.name} — klicken zum Setzen`
        }
      >
        {a.art === "bild" ? (
          <img src={a.src} alt="" />
        ) : (
          <span className="gre-pool-icon">{a.art === "lottie" ? "◆" : "▶"}</span>
        )}
        <span>{a.name}</span>
      </button>
      {a.art === "bild" && !istSvgName(a.name) && (
        <button
          className="gre-pool-vektor"
          onClick={() => void vektorisieren(a)}
          disabled={vektorisiertLaeuft}
          title="In SVG umwandeln (Farbflächen als eigene Pfade)"
        >
          ⬡
        </button>
      )}
      <button
        className="gre-pool-weg"
        onClick={() => setPool(pool.filter((x) => x.id !== a.id))}
        title="Aus der Bibliothek entfernen"
      >
        ✕
      </button>
    </div>
  );

  return (
    <>
    <div className="gre-panel">
      <div className="gre-kopf">
        <strong>Grafik-Editor</strong>
        {/* Undo/Redo dispatchen nach Fokus (Welle 2c-1, Bauvorlage §3): bei
            Fluss-Fokus auf den eigenen Fluss-Verlauf (jetzt scharf statt der
            2b-2-Sperre), sonst auf den Grafik-Verlauf. Der Title zeigt den
            Kontext. onClick unverändert — die Fokus-Weiche steckt in
            rueckgaengigMachen/wiederholenMachen (EINE Dispatch-Stelle). */}
        <div className="gre-verlauf">
          <button
            className="gre-verlauf-btn"
            onClick={rueckgaengigMachen}
            disabled={!kannRueckgaengig}
            title={flussHatFokus ? "Rückgängig – Fluss (Strg+Z)" : "Rückgängig (Strg+Z)"}
          >
            ↶
          </button>
          <button
            className="gre-verlauf-btn"
            onClick={wiederholenMachen}
            disabled={!kannWiederholen}
            title={
              flussHatFokus
                ? "Wiederholen – Fluss (Strg+Umschalt+Z / Strg+Y)"
                : "Wiederholen (Strg+Umschalt+Z / Strg+Y)"
            }
          >
            ↷
          </button>
        </div>
        {/* Welle 5d (§10/5d): Der frühere einzelne „? Hilfe"-Knopf öffnete nur
            das Animator-Tutorial. Jetzt ein kleines Auswahl-Menue — Produkt-Tour
            ODER Animator-Anleitung einzeln aufrufbar (s. ProduktTutorial.tsx). */}
        <HilfeMenue
          onProdukt={() => setProduktTutorialOffen(true)}
          onAnimator={() => setTutorialOffen(true)}
        />
        {/* Kreuz-Link „← Fluss" entfällt (Welle 2a): Grafik- und Fluss-Editor
            liegen jetzt gemeinsam auf /editor, ein Editor-Wechsel-Link zeigte
            nur auf die tote Trennung (Inventar §4.3). Das Fluss-Panel ist auf
            derselben Route oben rechts direkt sichtbar. */}
      </div>
      <div className="gre-scroll">scrollY {Math.round(scrollY)}</div>

      {/* Additiv: Umschalter fürs Einrasten beim Ziehen (Viewport-Mitte,
          Raster, andere Grafiken) — gilt tab-unabhängig für JEDEN Zug auf
          dem Canvas, deshalb hier oben statt in einem einzelnen Reiter.
          Default AN. */}
      <div className="gre-checkbox-row">
        <label htmlFor="gre-einrasten">🧲 Einrasten beim Ziehen</label>
        <input
          id="gre-einrasten"
          type="checkbox"
          checked={einrastenAktiv}
          onChange={(e) => setEinrastenAktiv(e.target.checked)}
        />
      </div>

      {/* Echte Tab-Semantik (Bauvorlage §2c / a11y): role=tablist/tab + ein
          gemeinsames role=tabpanel darunter. aria-selected markiert den aktiven
          Reiter (behebt den 2a-Befund „Tabs ohne active-Attribut"); alle Tabs
          steuern DASSELBE Panel („gre-tab-panel"), das per aria-labelledby auf
          den gerade aktiven Tab zeigt — so bleibt aria-controls immer auflösbar,
          obwohl stets nur der aktive Panel-Inhalt im DOM steht. */}
      {/* Roving-Tabindex (APG-Tablist, Welle 2b-2 / a11y): nur der aktive Reiter
          ist im Tab-Stop (tabIndex 0), die übrigen -1. Pfeiltasten wechseln den
          Reiter und ziehen den Fokus mit; Home/End springen an die Enden — der
          zuvor fehlende „ArrowLeft/ArrowRight nicht verdrahtet"-Befund. */}
      <div
        className="gre-tabs"
        role="tablist"
        aria-label="Editor-Bereiche"
        onKeyDown={(e) => {
          const idx = REITER.findIndex((r) => r.id === reiter);
          if (idx < 0) return;
          let ziel = idx;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            ziel = (idx + 1) % REITER.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            ziel = (idx - 1 + REITER.length) % REITER.length;
          } else if (e.key === "Home") {
            ziel = 0;
          } else if (e.key === "End") {
            ziel = REITER.length - 1;
          } else {
            return;
          }
          e.preventDefault();
          const zielId = REITER[ziel].id;
          setReiter(zielId);
          // Die Tab-Buttons bleiben alle gemountet (key=r.id), der Ziel-Knopf
          // existiert also schon — Fokus direkt nachziehen.
          document.getElementById(`gre-tab-${zielId}`)?.focus();
        }}
      >
        {REITER.map((r) => (
          <button
            key={r.id}
            id={`gre-tab-${r.id}`}
            role="tab"
            aria-selected={reiter === r.id}
            aria-controls="gre-tab-panel"
            tabIndex={reiter === r.id ? 0 : -1}
            className={`gre-tab${reiter === r.id ? " gre-tab--aktiv" : ""}`}
            onClick={() => setReiter(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Versteckte Datei-Eingaben: Einzeldatei (auch fürs Austauschen) und
          Ordner-Fallback für Browser ohne File System Access API. */}
      <input ref={dateiRef} type="file" accept={ACCEPT} onChange={dateiGewaehlt} hidden />
      <input
        ref={ordnerRef}
        type="file"
        multiple
        // @ts-expect-error – webkitdirectory ist Standard in Chromium/WebKit,
        // aber nicht in den React-Typen. Fallback für showDirectoryPicker.
        webkitdirectory=""
        onChange={ordnerGewaehlt}
        hidden
      />

      {/* Gemeinsames Tab-Panel: hält immer nur den Inhalt des aktiven Reiters.
          Eigene Flex-Spalte (gre-tab-panel), damit der 8px-Abstand der
          Panel-Kinder erhalten bleibt, obwohl jetzt ein Wrapper dazwischenliegt.
          aria-labelledby zeigt auf den aktiven Tab (s. Kommentar an der
          Tab-Leiste). */}
      <div
        className="gre-tab-panel"
        role="tabpanel"
        id="gre-tab-panel"
        aria-labelledby={`gre-tab-${reiter}`}
      >
      {reiter === "bibliothek" && (
        <>
          <div className="gre-reiter-kopf">
            <span>Bibliothek</span>
            <HilfeIcon
              label="Bibliothek"
              text="Alle deine Bilder, Videos und Animationen — unabhängig davon, ob schon etwas auf der Seite liegt. Klick auf ein Bild setzt es mittig ins Bild. Bilder kommen automatisch aus dem Projektordner, oder du verbindest einen eigenen Ordner, fügst mit Strg+V aus Canva ein, oder ziehst eine Datei direkt auf die Seite."
            />
          </div>
          <div className="gre-hilfe">
            Deine Assets — auch ohne dass etwas auf der Seite liegt. Klick auf ein Asset setzt es
            mittig ins Bild.
          </div>
          {kfBildZiel && (
            <div className="gre-tausch-hinweis">
              🖼 Bild für diesen Keyframe wählen — Asset anklicken oder „+ Datei"
              <button onClick={() => setKfBildZiel(null)}>Abbrechen</button>
            </div>
          )}
          {ordnerWartet && (
            <button className="gre-freischalten" onClick={ordnerFreischalten}>
              🔓 Ordner „{ordner?.name ?? "gemerkt"}" freischalten
            </button>
          )}
          {ordner && !ordnerWartet && (
            <div className="gre-verbunden">
              📁 verbunden: <b>{ordner.name}</b>
              <button onClick={() => void ordnerLesen(ordner)} title="Ordner neu einlesen">
                ⟳
              </button>
            </div>
          )}
          <div className="gre-row">
            <button onClick={ordnerOeffnen} title="Ordner vom PC verbinden (bleibt gemerkt)">
              📁 Ordner
            </button>
            <button
              onClick={() => {
                ersetzenRef.current = null;
                setKfBildZiel(null);
                dateiRef.current?.click();
              }}
              title="Einzelne Datei"
            >
              + Datei
            </button>
            <button
              className="gre-canva"
              onClick={() => window.open("https://www.canva.com/", "_blank", "noopener")}
              title="Canva in neuem Tab öffnen (eingeloggt) — dort Element kopieren oder exportieren"
            >
              Canva ↗
            </button>
          </div>
          {pool.length > 0 && (
            <input
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              placeholder={`${pool.length} Assets durchsuchen…`}
            />
          )}
          {pool.length === 0 ? (
            <div className="gre-leer">
              Bibliothek leer. „📁 Ordner" wählen — oder Strg+V / Datei auf die Seite ziehen.
            </div>
          ) : (
            <>
              {poolOhneOrdner.length > 0 && (
                <div className="gre-pool">{poolOhneOrdner.map(poolEintrag)}</div>
              )}
              {poolGruppen.map(([ordnerName, dateien]) => (
                <details
                  key={ordnerName}
                  className="gre-pool-gruppe"
                  open={dateien.length <= ORDNER_AUFKLAPP_SCHWELLE}
                >
                  <summary>
                    {ordnerName} <span className="gre-gruppe-anzahl">({dateien.length})</span>
                  </summary>
                  <div className="gre-pool">{dateien.map(poolEintrag)}</div>
                </details>
              ))}
            </>
          )}
          <div className="gre-hilfe">
            Aus Canva: Element <b>kopieren</b> → <b>Strg+V</b>. Oder Datei auf die Seite{" "}
            <b>ziehen</b> (landet dort, wo du loslässt).
          </div>

          {/* Presets — „voranimierte Assets" (Bauvorlage §4). Eigene Sektion
              UNTER den Asset-Gruppen: gespeicherte Bewegungs-Abläufe, die sich
              auf die ausgewählte Grafik anwenden lassen. a11y: eigene
              Überschrift (aria-labelledby), fokussierbare Knöpfe mit Labels. */}
          <section className="gre-preset-sektion" aria-labelledby="gre-preset-titel">
            <div className="gre-reiter-kopf">
              <span id="gre-preset-titel">Presets</span>
              <HilfeIcon
                label="Presets"
                text={`Gespeicherte Animations-Abläufe (voranimierte Assets). Wähle eine Grafik aus und klick ein Preset — dessen Bewegung wird an der aktuellen Position der Grafik übernommen und ersetzt deren Keyframes (Strg+Z macht das rückgängig). Neue Presets speicherst du im Reiter „Animation".`}
              />
            </div>
            {presets.length === 0 ? (
              <div className="gre-leer">Noch keine Presets — speichere eins im Reiter Animation.</div>
            ) : (
              <div className="gre-liste">
                {presets.map((p) => (
                  <div key={p.id} className="gre-row">
                    <button
                      className="gre-lade gre-preset-lade"
                      onClick={() => presetAnwenden(p)}
                      title={
                        aktiv
                          ? `„${p.name}" auf „${aktiv.name}" anwenden — ersetzt deren Keyframes (Strg+Z macht es rückgängig)`
                          : "Erst eine Grafik auswählen, dann anwenden"
                      }
                    >
                      {p.thumbSrc ? (
                        <img src={p.thumbSrc} alt="" className="gre-preset-thumb" />
                      ) : (
                        <span className="gre-pool-icon">◆</span>
                      )}
                      <span className="gre-preset-name">{p.name}</span>
                      <span className="gre-meta gre-preset-meta">{p.frames.length} Frames</span>
                    </button>
                    <button
                      onClick={() => void presetLoeschen(p.id)}
                      title="Preset löschen (fragt nach)"
                      aria-label={`Preset „${p.name}" löschen`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {reiter === "ebenen" && (
        <>
          <div className="gre-reiter-kopf">
            <span>Ebenen</span>
            <HilfeIcon
              label="Ebenen"
              text="Alles, was gerade auf der Seite platziert ist. Klick wählt eine Grafik aus, Ziehen verschiebt sie. Über die kleinen Knöpfe kannst du sie verstecken, sperren, nach vorn/hinten schieben, verdoppeln, mit einer anderen tauschen, die Datei austauschen oder löschen."
            />
          </div>
          <div className="gre-hilfe">
            Was auf der Seite liegt. Klick = auswählen · Ziehen = verschieben · Klick ohne Ziehen =
            einloggen (gelb) → Scrollrad skaliert · ESC = ausloggen
            <br />
            <b>⇄</b> tauscht zwei Ebenen (Positionen bleiben) · <b>📄</b> ersetzt nur die Datei
            <br />
            Unten unter <b>Website (Ist-Stand)</b> stehen die Elemente, die schon auf der
            Original-Seite sind. Klick markiert eines · <b>Alt+Klick</b> direkt auf der Seite wählt
            das getroffene Element aus.
          </div>
          {tauschQuelle && (
            <div className="gre-tausch-hinweis">
              ⇄ „{grafiken.find((g) => g.id === tauschQuelle)?.name}" — jetzt die zweite Ebene
              anklicken
              <button onClick={() => setTauschQuelle(null)}>Abbrechen</button>
            </div>
          )}
          {/* „In SVG umwandeln" lebt jetzt ausschließlich im Reiter „Bild"
             (Inspector) — in der Ebenen-Liste gehört es logisch nicht hin. */}
          {grafiken.length === 0 && (
            <div className="gre-leer">
              Noch nichts platziert — in der Bibliothek ein Asset anklicken.
            </div>
          )}
          <div className="gre-liste">
            {/* Fluss als OBJEKT zuoberst (Bauvorlage §1/§2, nur auf /editor):
                Auswahl = Fluss-Fokus. Setzt den Fokus und leert zugleich die
                Grafik-Auswahl (gegenseitiger Ausschluss). Ohne Provider (alte
                Route) fehlt der Eintrag ganz. */}
            {flussObjekt && (
              <div className="gre-fluss-eintrag-zeile">
                <button
                  type="button"
                  className={`gre-asset gre-fluss-eintrag${flussObjekt.fokus ? " gre-asset--aktiv" : ""}`}
                  aria-pressed={flussObjekt.fokus}
                  onClick={() => {
                    flussObjekt.setFokus(true);
                    ctx.setAuswahl(null);
                    ctx.setAuswahlMehr([]);
                    ctx.setGelockt(false);
                  }}
                  title="Fluss auswählen — Knoten auf der Seite bearbeiten; Wasser, Front, Nebel und Profile im Reiter Bild"
                >
                  <span className="gre-fluss-eintrag-name">🌊 Fluss</span>
                  <span className="gre-meta">
                    {flussObjekt.steuerung?.nodes?.length ?? 0} Knoten
                  </span>
                </button>
                <HilfeIcon
                  label="Fluss (Ebene)"
                  text={`Der Fluss ist ein eigenes Objekt, das ganz oben in den Ebenen liegt. Ein Klick wählt ihn aus (Wasser-Akzent + gelber Rand = fokussiert) und hebt zugleich jede Grafik-Auswahl auf — erst dann sind die Knoten-Punkte auf der Seite anfassbar und der Reiter „Bild" zeigt seine Eigenschaften. Die Zahl dahinter nennt die Menge der Punkte, die den Verlauf bilden.`}
                />
              </div>
            )}
            {[...grafiken]
              .sort((a, b) => b.z - a.z)
              .map((g) => (
                <div
                  key={g.id}
                  className={`gre-asset${ctx.auswahl === g.id ? " gre-asset--aktiv" : ""}`}
                >
                  <div className="gre-row">
                    <button
                      className="gre-thumb"
                      onClick={() => ctx.setAuswahl(g.id)}
                      title="Auswählen"
                    >
                      <img src={g.src} alt="" />
                    </button>
                    <input
                      className="gre-name"
                      value={g.name}
                      onChange={(e) => umbenennen(g.id, e.target.value)}
                      title="Name ändern"
                    />
                  </div>
                  <div className="gre-row">
                    <span className="gre-meta">
                      {g.art === "bild" ? "🖼" : g.art === "lottie" ? "◆" : "▶"} {g.keyframes.length}{" "}
                      KF · z{g.z}
                    </span>
                    <button
                      onClick={() => umschalteVersteckt(g.id)}
                      title={g.versteckt ? "Einblenden" : "Ausblenden"}
                    >
                      {g.versteckt ? "🚫" : "👁"}
                    </button>
                    <button
                      onClick={() => umschalteGesperrt(g.id)}
                      title={g.gesperrt ? "Entsperren" : "Sperren (gegen Verrutschen)"}
                    >
                      {g.gesperrt ? "🔒" : "🔓"}
                    </button>
                    <button onClick={() => verschiebeZ(g.id, 1)} title="Nach vorn">
                      ▲
                    </button>
                    <button onClick={() => verschiebeZ(g.id, -1)} title="Nach hinten">
                      ▼
                    </button>
                    <button onClick={() => duplizieren(g.id)} title="Duplizieren">
                      ⧉
                    </button>
                    <button
                      className={tauschQuelle === g.id ? "gre-tausch-aktiv" : undefined}
                      onClick={() =>
                        tauschQuelle === null
                          ? setTauschQuelle(g.id)
                          : tauschQuelle === g.id
                            ? setTauschQuelle(null)
                            : tauscheMit(tauschQuelle, g.id)
                      }
                      title={
                        tauschQuelle === null
                          ? "Mit einer anderen Ebene tauschen — dann die zweite anklicken"
                          : tauschQuelle === g.id
                            ? "Tausch abbrechen"
                            : "Hiermit tauschen (Positionen bleiben)"
                      }
                    >
                      ⇄
                    </button>
                    <button
                      onClick={() => {
                        ersetzenRef.current = g.id;
                        setKfBildZiel(null);
                        dateiRef.current?.click();
                      }}
                      title="Datei ersetzen (Position/Keyframes bleiben)"
                    >
                      📄
                    </button>
                    <button onClick={() => loeschen(g.id)} title="Löschen">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
          {/* „Website (Ist-Stand)" (AP-D, Welle 3a): die getaggten Elemente der
              Original-Seite als eigene, eingeklappte Ebenen-Gruppe. Auswahl
              hier = OG-Auswahl (schließt Grafik-/Fluss-Auswahl aus, s.
              ogWaehlen). Reine Anzeige/Auswahl — die Seite selbst bleibt
              unberührt. */}
          <WebsiteOgEbene
            liste={ogListe}
            auswahl={ogAuswahl}
            onWaehlen={(id) => ogWaehlen(id, true)}
            /* Welle 5c: die Bühne (aktive Puck-Seite) lädt asynchron — der
               Knopf liest die Ist-Stand-Liste bei Bedarf neu ein. */
            onNeuEinlesen={() => setOgNeuEinlesenNonce((n) => n + 1)}
            /* Die Bühne trägt taggbare Elemente, wenn eine Seite darauf liegt:
               ein Puck-Seiten-Backdrop, ODER (kein expliziter Backdrop) die
               aktive Website als Default-Bühne, ODER gar kein Backdrop = Landing.
               Nur Bild-/HTML-/Ordner-Backdrops können nie taggen → dort bleibt
               die leere Gruppe (samt „Neu einlesen") aus. */
            buehneKannTaggen={
              !backdropCtx?.backdrop ||
              backdropCtx.backdrop.art === "puck-seite" ||
              backdropCtx.backdrop.art === "demo-landing"
            }
          />
        </>
      )}

      {/* Reiter „Bild" – EIN Ort für alles zur ausgewählten Grafik: Größe,
          Vektor-Umwandlung, Datei-Aktionen (s. GrafikInspector.tsx). Eigener
          Reiter statt Einbettung im Reiter „Ebenen": Leon nennt es wörtlich
          ein „eigenes Edit-Fenster für das Bild" — ein dedizierter Reiter
          bildet das direkter ab. „In SVG umwandeln" lebt AUSSCHLIESSLICH
          hier (der frühere Knopf in der Ebenen-Liste wurde entfernt, er
          gehörte dort logisch nicht hin). */}
      {reiter === "bild" &&
        (ogAktiv ? (
          /* OG-Auswahl (Website-Ist-Stand): der „Bild"-Reiter zeigt die
             Basis-Infos des getaggten Original-Elements + „In den Builder
             holen" (nur bild|svg). Vorrang, weil OG-Auswahl den Grafik-/
             Fluss-Fokus ausschließt (s. ogWaehlen). */
          <WebsiteOgObjekt
            eintrag={ogAktiv}
            status={ogStatus}
            onInBuilder={
              ogAktiv.typ === "bild" || ogAktiv.typ === "svg"
                ? () => ogInBuilder(ogAktiv)
                : undefined
            }
          />
        ) : flussObjekt?.fokus && flussObjekt.steuerung ? (
          /* Fluss-Fokus (nur /editor): der „Bild"-Reiter ist kontextuell und
             zeigt die Fluss-Eigenschaften (Bauvorlage §2) statt des
             Grafik-Inspectors. */
          <FlussObjektBild steuerung={flussObjekt.steuerung} />
        ) : (
        <>
          <div className="gre-reiter-kopf">
            <span>Bild</span>
            <HilfeIcon
              label="Bild"
              text="Alles zur ausgewählten Grafik an einem Ort: Größe, Vektor-Umwandlung (Raster → SVG) und Datei-Aktionen (tauschen, ersetzen, duplizieren, Reihenfolge, aus-/einblenden, sperren, löschen)."
            />
          </div>
          {!aktiv && <div className="gre-leer">Erst eine Grafik auswählen.</div>}
          {aktiv && (
            <GrafikInspector
              grafik={aktiv}
              scrollY={scrollY}
              tauschAktiv={tauschQuelle === aktiv.id}
              onLoeschen={() => loeschen(aktiv.id)}
              onTauschen={() => tauschenStarten(aktiv.id)}
              onDateiErsetzen={() => {
                ersetzenRef.current = aktiv.id;
                setKfBildZiel(null);
                dateiRef.current?.click();
              }}
              onDuplizieren={() => duplizieren(aktiv.id)}
              onNachVorn={() => verschiebeZ(aktiv.id, 1)}
              onNachHinten={() => verschiebeZ(aktiv.id, -1)}
              onAusblenden={() => umschalteVersteckt(aktiv.id)}
              onSperren={() => umschalteGesperrt(aktiv.id)}
              onBreiteAendern={(px) => {
                ctx?.commit("Grundbreite geändert", `breite:${aktiv.id}`);
                setzeGrafiken(
                  grafiken.map((g) => (g.id === aktiv.id ? { ...g, breitePx: px } : g)),
                );
              }}
              onSpiegelnX={() => umschalteSpiegelX(aktiv.id)}
              onSpiegelnY={() => umschalteSpiegelY(aktiv.id)}
              onZuschneidenAnwenden={(dataUrl, breiteNeuPx) => {
                ctx?.commit("Zugeschnitten");
                setzeGrafiken(
                  grafiken.map((g) =>
                    g.id === aktiv.id ? { ...g, src: dataUrl, breitePx: breiteNeuPx } : g,
                  ),
                );
                setStatus("Zugeschnitten");
              }}
              kannVektorisieren={bildIstVektorisierbar}
              vektorisiertLaeuft={vektorisiertLaeuft}
              onVektorisieren={() => void vektorisieren(aktiv)}
              vektorMaxFarben={vektorMaxFarben}
              onVektorMaxFarbenAendern={setVektorMaxFarben}
              vektorMinFlaeche={vektorMinFlaeche}
              onVektorMinFlaecheAendern={setVektorMinFlaeche}
              vektorGlaettung={vektorGlaettung}
              onVektorGlaettungAendern={setVektorGlaettung}
              kannFreistellen={kannFreistellen}
              freistellenLaeuft={freistellenLaeuft}
              onFreistellen={() => void freistellen(aktiv)}
              ankerId={aktivKfIndex >= 0 ? aktiv.keyframes[aktivKfIndex]?.ankerId ?? null : null}
              onAnkerLoesen={() => {
                if (aktivKfIndex < 0) return;
                /* „frei positionieren" (Welle 3b, Spec §8/3b Punkt 4): Anker-
                   Felder des aktuellen Keyframes entfernen, EIN Undo-Commit. Die
                   Absolutwerte x/y/scrollY bleiben — die Grafik bleibt an Ort und
                   Stelle, nur nicht mehr an das Element gekoppelt. */
                ctx?.commit("Anker gelöst");
                setzeGrafiken(
                  grafiken.map((g) =>
                    g.id === aktiv.id
                      ? {
                          ...g,
                          keyframes: g.keyframes.map((k, i) =>
                            i === aktivKfIndex ? { ...k, ...ANKER_LEER } : k,
                          ),
                        }
                      : g,
                  ),
                );
                setStatus("Anker gelöst — frei positioniert");
              }}
            />
          )}
        </>
        ))}

      {reiter === "keyframes" && (
        <>
          <div className="gre-reiter-kopf">
            <span>Keyframes</span>
            <HilfeIcon
              label="Keyframes"
              text={`Hier legst du fest, WO und WIE GROSS eine Grafik beim Scrollen erscheint. Scrolle an eine Stelle, schiebe/skaliere die Grafik dorthin und klicke „Hier locken" — das merkt sich Position und Größe für genau diese Scroll-Höhe. Mit mehreren solcher Punkte wandert die Grafik beim Scrollen von einem zum nächsten.`}
            />
          </div>
          {!aktiv && <div className="gre-leer">Erst eine Grafik auswählen.</div>}
          {aktiv && (
            <>
              <div className="gre-hilfe">
                Scrolle an die Stelle, schiebe/skaliere die Grafik — dann „Hier locken". Mehrere
                Keyframes = die Grafik wandert beim Scrollen dazwischen.
              </div>
              <div className="gre-row">
                <button onClick={keyframeSetzen}>◉ Hier locken (scrollY {Math.round(scrollY)})</button>
                <HilfeIcon
                  label="Hier locken"
                  text="Merkt sich die aktuelle Scroll-Höhe zusammen mit Position, Größe, Deckkraft und Drehung der Grafik. Genau das ist ein Keyframe. Liegt an dieser Stelle schon einer, wird er überschrieben statt verdoppelt."
                />
              </div>

              {/* Nur zeitbasierte Medien: wie die Animation laeuft. "Scroll"
                  haengt den Abspielkopf zwischen erstem und letztem Keyframe
                  an den Scroll — hochscrollen spielt rueckwaerts. */}
              {aktiv.art !== "bild" && (
                <div className="gre-block">
                  <div className="gre-regler-kopf">
                    <span>Abspielen ({aktiv.art})</span>
                    <HilfeIcon
                      label="Abspielmodus"
                      text={`Legt fest, wie eine Animation oder ein Video läuft: „Schleife" spielt endlos, egal wie du scrollst. „Scroll" hängt den Abspielkopf an deinen Scroll-Fortschritt zwischen erstem und letztem Keyframe — hoch- und runterscrollen spult vor und zurück. „Standbild" zeigt nur das erste Bild, ohne zu laufen.`}
                    />
                  </div>
                  <div className="gre-tabs">
                    {(
                      [
                        { id: "loop", label: "Schleife" },
                        { id: "scrub", label: "Scroll" },
                        { id: "still", label: "Standbild" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        className={`gre-tab${(aktiv.modus ?? "loop") === m.id ? " gre-tab--aktiv" : ""}`}
                        onClick={() => {
                          ctx?.commit("Abspielmodus geändert");
                          setzeGrafiken(
                            grafiken.map((g) => (g.id === aktiv.id ? { ...g, modus: m.id } : g)),
                          );
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {aktiv.modus === "scrub" && aktiv.keyframes.length < 2 && (
                    <div className="gre-leer">
                      Scroll-Scrub braucht 2 Keyframes — sie spannen die Strecke auf.
                    </div>
                  )}
                </div>
              )}
              <div className="gre-regler">
                <div className="gre-regler-kopf">
                  <span>
                    Grundbreite{" "}
                    <HilfeIcon
                      label="Grundbreite"
                      text="Die Breite der Grafik in Pixel bei normaler Größe (100%). Die Höhe passt sich automatisch im richtigen Seitenverhältnis an. Über die Keyframes kannst du sie an einzelnen Stellen zusätzlich hoch- oder runterskalieren."
                    />
                  </span>
                  <span className="gre-wert">{aktiv.breitePx}px</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={1200}
                  step={10}
                  value={aktiv.breitePx}
                  onChange={(e) => {
                    ctx?.commit("Grundbreite geändert", `breite:${aktiv.id}`);
                    setzeGrafiken(
                      grafiken.map((g) =>
                        g.id === aktiv.id ? { ...g, breitePx: Number(e.target.value) } : g,
                      ),
                    );
                  }}
                />
              </div>
              {aktivKfIndex >= 0 && (
                <>
                  <div className="gre-regler">
                    <div className="gre-regler-kopf">
                      <span>Deckkraft (KF {aktivKfIndex + 1})</span>
                      <span className="gre-wert">
                        {aktiv.keyframes[aktivKfIndex].opacity.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={aktiv.keyframes[aktivKfIndex].opacity}
                      onChange={(e) => {
                        ctx?.commit("Deckkraft geändert", `opacity:${aktiv.id}:${aktivKfIndex}`);
                        patchKf(aktiv.id, aktivKfIndex, { opacity: Number(e.target.value) });
                      }}
                    />
                  </div>
                  <div className="gre-regler">
                    <div className="gre-regler-kopf">
                      <span>Drehung (KF {aktivKfIndex + 1})</span>
                      <span className="gre-wert">
                        {Math.round(aktiv.keyframes[aktivKfIndex].rotation)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={aktiv.keyframes[aktivKfIndex].rotation}
                      onChange={(e) => {
                        ctx?.commit("Drehung geändert", `rotation:${aktiv.id}:${aktivKfIndex}`);
                        patchKf(aktiv.id, aktivKfIndex, { rotation: Number(e.target.value) });
                      }}
                    />
                  </div>

                  {/* G1: sichtbare, verstellbare Verlaufskurve zum NÄCHSTEN
                      Keyframe (s. easing.ts/EasingKurve.tsx/zustandBei). */}
                  <div className="gre-block">
                    <div className="gre-regler-kopf">
                      <span>Verlauf zum nächsten Keyframe (KF {aktivKfIndex + 1})</span>
                      <HilfeIcon
                        label="Verlauf"
                        text="Wie die Grafik ZWISCHEN diesem und dem nächsten Keyframe wandert — an den Griffen ziehen verbiegt die Kurve, dadurch wird der Übergang am Anfang/Ende schneller oder langsamer statt gleichförmig. Ohne eigene Kurve gilt ein weicher Standard-Verlauf (ease-in-out)."
                      />
                    </div>
                    <EasingKurve
                      value={aktiv.keyframes[aktivKfIndex].easing ?? EASING_DEFAULT}
                      onChange={(next) => {
                        ctx?.commit("Kurve geändert", `easing:${aktiv.id}:${aktivKfIndex}`);
                        patchKf(aktiv.id, aktivKfIndex, { easing: next });
                      }}
                    />
                  </div>

                  {/* G3: frame-spezifischer Bildtausch NUR an diesem
                      Keyframe (s. srcOverride in grafik-types.ts). */}
                  <div className="gre-block">
                    <div className="gre-regler-kopf">
                      <span>Bild an diesem Keyframe (KF {aktivKfIndex + 1})</span>
                      <HilfeIcon
                        label="Bild an diesem Keyframe"
                        text="Tauscht das Bild NUR an dieser Scrollposition aus — die Grafik zeigt sonst ihr normales Bild, wechselt aber genau an diesem Keyframe zu einem anderen (z.B. ein anderer Ausdruck/Zustand mitten im Scroll). Harter Wechsel an der Keyframe-Grenze, kein Überblenden."
                      />
                    </div>
                    <div className="gre-row">
                      <button
                        onClick={() => {
                          ersetzenRef.current = null;
                          setKfBildZiel({ grafikId: aktiv.id, kfIndex: aktivKfIndex });
                          setReiter("bibliothek");
                          setStatus(
                            "Bild für diesen Keyframe wählen — Bibliothek anklicken oder + Datei",
                          );
                        }}
                        title="Öffnet die Bibliothek/Datei-Auswahl — gilt nur für diesen einen Keyframe"
                      >
                        🖼 Bild tauschen
                      </button>
                      {aktiv.keyframes[aktivKfIndex].srcOverride && (
                        <button
                          onClick={() => {
                            ctx?.commit("Keyframe-Bild zurückgesetzt");
                            patchKf(aktiv.id, aktivKfIndex, { srcOverride: undefined });
                            setStatus("Zeigt an diesem Keyframe wieder das normale Bild");
                          }}
                          title="Zeigt an diesem Keyframe wieder das normale Bild der Grafik"
                        >
                          ↺ Zurücksetzen
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Zeitleiste — additiv zur Liste unten (die bleibt
                  unverändert). Klick springt/wählt, Ziehen verschiebt die
                  scrollY des Markers (EIN Commit beim Loslassen). */}
              <div className="gre-block">
                <div className="gre-regler-kopf">
                  <span>Zeitleiste</span>
                  <HilfeIcon
                    label="Zeitleiste"
                    text="Alle Keyframes dieser Grafik entlang ihrer Scroll-Spanne. Klick auf einen Marker springt dorthin, Ziehen verschiebt seine Scrollposition."
                  />
                </div>
                <GrafikKeyframeTimeline
                  grafik={aktiv}
                  aktivKfIndex={aktivKfIndex}
                  onWaehle={springeZu}
                  onZugStart={kfZeitleisteZugStart}
                  onZugBewegung={kfZeitleisteZugBewegung}
                  onZugEnde={kfZeitleisteZugEnde}
                />
              </div>

              <div className="gre-liste">
                {aktiv.keyframes.map((k, i) => (
                  <div key={i} className={`gre-row${i === aktivKfIndex ? " gre-row--aktiv" : ""}`}>
                    <button
                      className="gre-lade"
                      onClick={() => springeZu(k.scrollY)}
                      title={k.ankerId ? `Verankert an ${k.ankerId} (Welle 3b)` : undefined}
                    >
                      KF {i + 1} · y{Math.round(k.scrollY)} · {k.scale.toFixed(2)}×
                      {k.srcOverride ? " · 🖼" : ""}
                      {/* Element-ID-Anker (Welle 3b): kleines Symbol markiert
                          verankerte Keyframes. */}
                      {k.ankerId ? " · ⚓" : ""}
                    </button>
                    <button
                      onClick={() => kfDuplizieren(i)}
                      title="Keyframe hierher kopieren (aktuelle Scrollposition, inkl. Kurve & Bildtausch)"
                    >
                      ⧉
                    </button>
                    <button onClick={() => keyframeLoeschen(i)} title="Keyframe löschen">
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Als Preset speichern (Bauvorlage §4): die Bewegung dieser
                  Grafik als wiederverwendbares „voranimiertes Asset" in die
                  Bibliothek legen. Braucht ≥2 Keyframes — sonst gibt es keine
                  Bewegung zu speichern (dann disabled mit Erklär-Title). */}
              <div className="gre-block">
                <div className="gre-regler-kopf">
                  <span>
                    Als Preset speichern{" "}
                    <HilfeIcon
                      label="Als Preset speichern"
                      text={`Speichert den Bewegungs-Ablauf dieser Grafik (Positionen, Größe, Deckkraft, Drehung relativ zum ersten Keyframe; Scroll-Spanne normiert) als wiederverwendbares Animations-Preset. Es erscheint in der Bibliothek unter „Presets" und lässt sich dort auf jede andere ausgewählte Grafik anwenden — animieren einmal, wiederverwenden überall.`}
                    />
                  </span>
                </div>
                <button
                  onClick={() => void presetSpeichern()}
                  disabled={aktiv.keyframes.length < 2}
                  title={
                    aktiv.keyframes.length < 2
                      ? "Braucht mindestens 2 Keyframes — eine Bewegung entsteht erst zwischen zwei Punkten."
                      : "Bewegung als wiederverwendbares Preset in der Bibliothek speichern"
                  }
                >
                  💾 Als Preset speichern
                </button>
              </div>
            </>
          )}
        </>
      )}

      {reiter === "setups" && (
        <>
          <div className="gre-reiter-kopf">
            <span>Speichern</span>
            <HilfeIcon
              label="Speichern"
              text="Zwei getrennte Speicher — bewusst nicht vermischt: die Grafik-Setups (Abbilder deiner platzierten Grafiken + Bibliothek, server-first) und die Fluss-Profile (gespeicherte Fluss-Stände, nur im Browser). Jedes hat sein eigenes Speicher-Modell; beide bleiben nebeneinander erreichbar."
            />
          </div>

          {/* Block 1 — Grafik-Setups (Server-first, /api/abbild; localStorage
              nur Notlösung). Inhalt unverändert aus dem früheren „Setups"-Reiter
              (Inventar §1.F), nur in einen beschrifteten Block gefasst. */}
          <div className="gre-speichern-block">
            <div className="gre-block-titel">Grafik-Setups (Server)</div>
            <div className="gre-hilfe">
              Gespeichert werden alle Grafiken samt Keyframes und die Bibliothek — als Datei unter{" "}
              <code>abbilder/</code>. Ohne Verbindung zur Route: nur im Browser (Notlösung, deutlich
              markiert).
            </div>
            <div className="gre-row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Setup-Name" />
              <button onClick={() => void speichern()}>Speichern</button>
            </div>
            <div className="gre-liste">
              {serverAbbilder.length === 0 && lokaleSetupNamen.length === 0 && (
                <div className="gre-leer">Noch keine Setups gespeichert.</div>
              )}
              {serverAbbilder.map((a) => (
                <div key={`platte:${a.name}`} className="gre-row">
                  <button
                    className="gre-lade"
                    onClick={() => void laden(a.name, "platte")}
                    title={`abbilder/${a.name}.json`}
                  >
                    {a.name} ({a.grafikenAnzahl})
                  </button>
                  <span className="gre-meta">Platte</span>
                  <button onClick={() => void loescheVonPlatte(a.name)} title="Von der Platte löschen (fragt nach)">
                    ✕
                  </button>
                </div>
              ))}
              {lokaleSetupNamen.map((n) => (
                <div key={`browser:${n}`} className="gre-row">
                  <button
                    className="gre-lade"
                    onClick={() => void laden(n, "browser")}
                    title="Nur im Browser gespeichert (Notlösung)"
                  >
                    {n} ({setups[n].grafiken.length})
                  </button>
                  <span className="gre-meta">Browser</span>
                  <button onClick={() => setupLoeschen(n)} title="Aus dem Browserspeicher löschen (fragt nach)">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="gre-row">
              <button
                onClick={() => void alsStandardSetzen()}
                title="Schreibt den aktuellen Stand nach grafik.config.json — das zeigt die echte Landing (fragt nach)"
              >
                Als Standard setzen
              </button>
              <HilfeIcon
                label="Als Standard setzen"
                text="Schreibt den aktuellen Stand fest in die echte Website — der einzige Knopf hier, der die LIVE-Seite verändert (fragt vorher nach). Alles andere im Editor bleibt erst mal nur ein Entwurf, den nur du siehst."
              />
            </div>
            <div className="gre-row">
              <button onClick={exportieren}>Export JSON (Browser-Setups)</button>
            </div>
          </div>

          {/* Block 2 — Fluss-Profile (localStorage-only, eigenes Speicher-Modell
              — Inventar §4.2: bewusst NICHT auf das Server-Modell umgestellt).
              Dieselbe ProfileSektion wie im früheren Fluss-Reiter (§1.R), hier
              zentral im Speichern-Reiter zusammengeführt. Nur auf /editor
              vorhanden (dort liegt der FlussObjekt-Provider); auf der alten
              Route ist flussObjekt null → Block entfällt. Die rke-* Styles
              kommen aus river-kurs-editor.css (auf /editor global geladen). */}
          {flussObjekt?.steuerung && (
            <div className="gre-speichern-block">
              <div className="gre-block-titel">
                Fluss-Profile (lokal)
                <HilfeIcon
                  label="Fluss-Profile"
                  text={`Ein Profil = ein gespeicherter Fluss-Stand (Kurve, Animation UND eingefrorene Geometrie/Farben). Namen eintippen + „Speichern" legt ihn im Browser ab; ein Klick auf einen Listeneintrag lädt ihn sofort live, „✕" löscht ihn. „Als JSON exportieren" gibt eine selbsttragende Datei (per „Importieren" überall wieder ladbar), „Als SVG exportieren" nur den Fluss-Körper ohne Laufzeit-Partikel.`}
                />
              </div>
              <ProfileSektion
                name={flussObjekt.steuerung.name}
                setName={flussObjekt.steuerung.setName}
                verlaeufe={flussObjekt.steuerung.verlaeufe}
                importRef={flussObjekt.steuerung.importRef}
                speichern={flussObjekt.steuerung.speichern}
                laden={flussObjekt.steuerung.laden}
                verlaufLoeschen={flussObjekt.steuerung.verlaufLoeschen}
                exportieren={flussObjekt.steuerung.exportieren}
                dateiImportiert={flussObjekt.steuerung.dateiImportiert}
                alsSvgExportieren={flussObjekt.steuerung.alsSvgExportieren}
              />
            </div>
          )}

          {/* Block 3 — Animation in die aktive Puck-Seite speichern (Welle 4c(3)).
              Nur sichtbar im Puck-Seiten-Modus (eine eigene Seite liegt als
              Bühne). Schreibt das aktuelle Grafik-Abbild ins anim-Feld der Seite
              → EINE Datei = Seite + Animation. Bewusst getrennt vom Grafik-Setup
              (Server-Abbild) darüber: hier landet die Animation AN der Seite. */}
          {puckSeiteName && (
            <div className="gre-speichern-block">
              <div className="gre-block-titel">
                Animation in Seite (Puck-Seiten-Modus)
                <HilfeIcon
                  label="Animation in Seite"
                  text={`Die aktuelle Bühne ist deine eigene Seite „${puckSeiteName}“. „Animation in Seite speichern“ legt deine platzierten Scroll-Grafiken direkt in DIESE Seite (anim-Feld) — beim nächsten Öffnen als Bühne sind sie wieder da. Anker (data-og-id="puck:…") halten die Grafiken an den Bausteinen der Seite.`}
                />
              </div>
              <div className="gre-hilfe">
                Bühne: <code>{puckSeiteName}</code> · {grafiken.length} Grafik(en) im Animator.
              </div>
              <div className="gre-row">
                <button onClick={() => void animInSeiteSpeichern()}>
                  Animation in Seite speichern
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {reiter === "seite" && (
        <>
          <div className="gre-reiter-kopf">
            <span>Seite</span>
            <HilfeIcon
              label="Seite"
              text={`Grafiken, die die Seite selbst zeichnet (die Vorhang-Bäume) — nicht der Builder. Klick auf einen Baum holt ihn an seiner AKTUELLEN Stelle „in den Builder" — dort frei bearbeitbar wie jede andere Grafik. Nochmal klicken gibt ihn zurück an den Vorhang. Die Vorhang-Datei selbst wird dabei nie verändert.`}
            />
          </div>
          <SeiteTab />
        </>
      )}

      {reiter === "hintergrund" && <BackdropAuswahl />}

      {reiter === "export" && (
        <GrafikExportPanel
          grafiken={grafiken}
          /* Risiko 3: der Fluss kommt DIREKT aus dem Context (aktueller Stand)
             — kein stiller Verlust über die localStorage-Brücke. Nur wenn ein
             Fluss-Objekt vorhanden ist (auf /editor); sonst bleibt localStorage
             die einzige Quelle (Fallback im Panel). Der Geber baut den Verlauf
             erst beim Export-Klick (aktueller Live-Stand). */
          flussVerlaufGeber={
            flussObjekt?.steuerung
              ? () => flussObjekt.steuerung?.baueAktuellenVerlauf() ?? null
              : undefined
          }
          /* Welle 3c: aktuelle Auswahl nur zum Vorwählen im Einzelelement-Export. */
          auswahlId={ctx.auswahl ?? undefined}
          /* Welle 4c(4): im Puck-Seiten-Modus liefert der Geber das Markup der
             Render-Bühne (innerHTML des data-fc-puck-buehne-Containers, inkl.
             data-og-ids) — der „Ganze Seite"-Export fusioniert es dann mit dem
             Animations-Overlay in EIN Dokument. Außerhalb des Modus: undefined
             → unveränderter Seiten-Export (leere Bühne). */
          seitenMarkupGeber={
            puckSeiteName
              ? () => document.querySelector<HTMLElement>("[data-fc-puck-buehne]")?.innerHTML ?? null
              : undefined
          }
        />
      )}
      </div>
      {/* Ende role=tabpanel — die folgenden Overlays/Indikatoren gehören zu
          KEINEM Reiter (sie zeigen den globalen Editor-Zustand) und stehen
          deshalb bewusst außerhalb des Tab-Panels. */}

      {ctx.gelockt && aktiv && <div className="gre-lock">🔒 eingeloggt — Scrollrad skaliert</div>}
      {dropAktiv && <div className="gre-drop">Loslassen = hier ablegen</div>}
      {status && <div className="gre-status">{status}</div>}

      {(vektorisiertLaeuft || freistellenLaeuft) && (
        <div className="gre-vektor-overlay" role="status" aria-live="polite">
          <div className="gre-vektor-box">
            <div className="gre-vektor-spinner" aria-hidden="true" />
            <div>{vektorisiertLaeuft ? "Wird vektorisiert…" : "Wird freigestellt…"}</div>
            <div className="gre-vektor-hinweis">
              {vektorisiertLaeuft
                ? "Das kann ein paar Sekunden dauern"
                : freistellenFortschritt ||
                  "Beim ersten Mal wird ein KI-Modell geladen (bis zu ~80 MB) — das kann dauern"}
            </div>
          </div>
        </div>
      )}
    </div>
    {/* Schwebendes Objektmenü direkt an der ausgewählten Grafik — bewusst
        AUSSERHALB von .gre-panel (eigene Datei GrafikObjektMenue.tsx, s.
        dort) und deshalb hier als Geschwister-Element im Fragment, nicht als
        Kind: position:fixed würde zwar auch innerhalb von .gre-panel korrekt
        am Viewport positionieren (kein transform auf .gre-panel, das einen
        eigenen Containing Block erzeugen würde), aber als echtes Geschwister
        bleibt das robust, falls .gre-panel später mal ein transform bekommt. */}
    {aktiv && (
      <GrafikObjektMenue
        grafik={aktiv}
        tauschAktiv={tauschQuelle === aktiv.id}
        onLoeschen={() => loeschen(aktiv.id)}
        onTauschen={() => tauschenStarten(aktiv.id)}
        onDateiErsetzen={() => {
          ersetzenRef.current = aktiv.id;
          setKfBildZiel(null);
          dateiRef.current?.click();
        }}
        onDuplizieren={() => duplizieren(aktiv.id)}
        onNachVorn={() => verschiebeZ(aktiv.id, 1)}
        onNachHinten={() => verschiebeZ(aktiv.id, -1)}
        onAusblenden={() => umschalteVersteckt(aktiv.id)}
        onSperren={() => umschalteGesperrt(aktiv.id)}
        onHierLocken={keyframeSetzen}
      />
    )}
    {/* Mehrfachauswahl: Auswahl-Rechteck (Rubber-Band) waehrend des Ziehens
        auf leerem Canvas — reine Anzeige, die Auswahl selbst setzt bereits
        der Fenster-Pointer-Effekt live (s. dort). */}
    {rubberBand && (
      <div
        className="gre-rubberband"
        style={{
          left: rubberBand.left,
          top: rubberBand.top,
          width: rubberBand.right - rubberBand.left,
          height: rubberBand.bottom - rubberBand.top,
        }}
      />
    )}
    {/* Einrasten: Hilfslinien waehrend eines Zugs, wenn eine Kante trifft. */}
    {snapLinien && (
      <div className="gre-snap-overlay" aria-hidden="true">
        {snapLinien.vertikaleLinien.map((x, i) => (
          <div key={`v${i}`} className="gre-snap-linie gre-snap-linie--v" style={{ left: x }} />
        ))}
        {snapLinien.horizontaleLinien.map((y, i) => (
          <div key={`h${i}`} className="gre-snap-linie gre-snap-linie--h" style={{ top: y }} />
        ))}
      </div>
    )}
    {/* Outline-Overlay des ausgewählten Website-Ist-Stand-Elements — eigene
        Ebene, pointer-events:none, z-index unter dem Panel (s. WebsiteOg.tsx /
        grafik-editor.css). Nur bei OG-Auswahl. */}
    {ogAuswahl && <WebsiteOgOverlay ogId={ogAuswahl} />}
    <GrafikTutorial offen={tutorialOffen} onSchliessen={tutorialSchliessen} />
    {/* Welle 5d (§10/5d): Produkt-Onboarding — eigener Latch, läuft beim ersten
        Besuch VOR dem Animator-Tutorial. */}
    <ProduktTutorial offen={produktTutorialOffen} onSchliessen={produktTutorialSchliessen} />
    </>
  );
}
