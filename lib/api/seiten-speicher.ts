/*
 * lib/api/seiten-speicher.ts — Persistenz-Kern fuer Puck-Seiten:
 * seiten/<name>.json im Projektwurzelverzeichnis (Schwester von abbilder/,
 * gleiches Muster; docs/agent-schnittstelle.md §5, Schritt 2).
 *
 * Geteilt von den vier /api/puck-seite/*-Routen und dem Import-Endpunkt —
 * damit Konflikt-Guard und Validierung EINMAL existieren, egal woher der
 * Schreibwunsch kommt (Editor, printed CLI, Paperclip-Worker).
 *
 * KONFLIKT-MODELL (agentensicher, "read-only by default"-Geist):
 * Eine existierende Seite wird nur ueberschrieben, wenn der Aufrufer den
 * ihm bekannten Stand mitliefert (erwartetGespeichert === gespeichert der
 * Datei) ODER ausdruecklich ueberschreibe:true sagt. Sonst 409 mit dem
 * aktuellen Stand — ein Agent kann dann neu laden statt blind zu clobbern.
 */

import { readdir, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
/* In App-Router-Route-Handlern loest "@puckeditor/core" ueber die
   react-server-Condition auf dist/rsc.js auf — die Node-faehige Oberflaeche
   (migrate/walkTree/..., docs/agent-schnittstelle.md §2.3 / puck-erweiterungsebene.md §2.3). */
import { migrate, type Data } from "@puckeditor/core";
import { AnfrageFehler } from "./server-helfer";
import { istRegistrierterTyp } from "@/lib/puck-registry";
import { istGrafik } from "./grafik-validierung";
import type { Grafik } from "@/components/grafik/grafik-types";

const SEITEN_ORDNER = resolve(process.cwd(), "seiten");
/* Papierkorb (U7, N2): geloeschte Seiten wandern hierher statt hart weg, so
   ist das Loeschen reversibel (POST /api/puck-seite/wiederherstelle bzw.
   Client-Undo). Unterordner von seiten/, mit fuehrendem Punkt, damit
   listeSeiten() (nur *.json in seiten/ selbst) ihn nie mitlistet und der
   Export ihn ignoriert (docs/plan-analyse/lens-undo.md §5). */
const PAPIERKORB_ORDNER = resolve(SEITEN_ORDNER, ".papierkorb");
export const SEITEN_VERSION = 1;
const MAX_SEITEN = 500;

/* Filesystem-sicherer Zeitstempel (kein ":" / "." — Windows-tauglich) und
   zugleich lexikografisch = chronologisch sortierbar, damit der juengste
   Papierkorb-Eintrag per String-Sortierung gefunden wird. Beispiel:
   2026-07-23T12-30-45-123Z. */
const ZEITSTEMPEL_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/;
function papierkorbZeitstempel(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Animations-Abbild einer Seite (Welle 4c, docs/editor-vereinheitlichung.md
 *  §9/4c(3)): die vom Animator ueber DIESER Seite gesetzten Scroll-Grafiken —
 *  dieselben `Grafik`-Objekte wie im Abbild-Speicher (abbilder/*.json), nur
 *  hier direkt an der Seite. So ist EINE Datei = Seite + Animation. Die
 *  Anker-Felder der Keyframes (ankerId="puck:<id>") zeigen auf die Bausteine
 *  DIESER Seite (data-og-id, s. app/puck/puck.config.tsx). */
export interface SeitenAnim {
  grafiken: Grafik[];
  /** Uebernommene Plaetze (Vorhang-Kopplung) — reine Anzeige/Filterlogik,
   *  nur auf Form geprueft (Array aus Strings). Optional. */
  uebernommen?: string[];
}

export interface SeitenDatei {
  $doc: string;
  version: number;
  name: string;
  gespeichert: string;
  data: Data;
  /** Optional (Welle 4c): das Animations-Abbild ueber dieser Seite. Aeltere
   *  Seiten ohne dieses Feld laden unveraendert. */
  anim?: SeitenAnim;
  /** Optional (Welle 5a, docs/editor-vereinheitlichung.md §10/5a): uebernommene
   *  Stylesheet-URLs einer eigenen gebauten Seite (public/import/<slug>/css/…,
   *  Dokument-Reihenfolge, Inline-CSS zuletzt). Bühne/Puck-Render/Vorschau
   *  laden diese Liste und injizieren sie gescoped auf den Bühnen-Container.
   *  Aeltere Seiten ohne dieses Feld laden unveraendert. */
  styles?: string[];
}

/** Strukturprueft ein anim-Feld (Welle 4c). Nutzt istGrafik aus der
 *  bestehenden Grafik-Validierung (grafik-validierung.ts) wieder — dieselben
 *  Sicherheits-/Rendering-Felder wie beim Abbild-Import, kein Duplikat. Wirft
 *  bei Formfehlern (400) statt still Falsches zu schreiben. */
export function pruefeAnim(v: unknown): SeitenAnim {
  if (typeof v !== "object" || v === null) throw new AnfrageFehler(400, "anim ungültig");
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.grafiken) || !o.grafiken.every(istGrafik)) {
    throw new AnfrageFehler(400, "anim.grafiken ungültig");
  }
  if (
    o.uebernommen !== undefined &&
    (!Array.isArray(o.uebernommen) || !o.uebernommen.every((x) => typeof x === "string"))
  ) {
    throw new AnfrageFehler(400, "anim.uebernommen ungültig");
  }
  return {
    grafiken: o.grafiken as Grafik[],
    ...(o.uebernommen !== undefined ? { uebernommen: o.uebernommen as string[] } : {}),
  };
}

/** Strukturprueft ein styles-Feld (Welle 5a): Array aus URL-Strings, die auf
 *  unter public/import/ kopierte CSS-Dateien zeigen. Bewusst eng: nur
 *  root-relative /import/…-Pfade (die der Import-Endpunkt selbst erzeugt) —
 *  so kann eine Seiten-Datei keine fremden/absoluten Stylesheet-URLs
 *  einschleusen, die die Bühne spaeter ungefragt laedt. */
export function pruefeStyles(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new AnfrageFehler(400, "styles muss ein String-Array sein");
  }
  const strings = v as string[];
  for (const s of strings) {
    if (!s.startsWith("/import/") || s.includes("..")) {
      throw new AnfrageFehler(400, `styles-URL ungültig (nur /import/…): ${s}`);
    }
  }
  return strings;
}

const SEITEN_DOC =
  `Vom Flowcode-Builder gespeicherte Puck-Seite (lib/api/seiten-speicher.ts). ` +
  `data = Puck-Datenmodell {root, content[], ...} der registrierten Komponenten ` +
  `(lib/puck-registry.ts). Geschrieben ueber POST /api/puck-seite/speichere oder ` +
  `den Import-Endpunkt; der Puck-Editor/Render liest exakt dieses data-Feld.`;

/** Ziel-Pfad fuer einen Seiten-Namen, mit Gegenprobe gegen Pfad-Ausbruch
 *  (Guertel und Hosentraeger wie abbildPfad in app/api/abbild/route.ts). */
function seitenPfad(name: string): string {
  const ziel = join(SEITEN_ORDNER, `${name}.json`);
  if (!resolve(ziel).startsWith(resolve(SEITEN_ORDNER) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Seiten-Ordners");
  }
  return ziel;
}

/** Ziel-Pfad fuer EINE Papierkorb-Datei, mit derselben Pfad-Ausbruch-Gegenprobe
 *  wie seitenPfad — der dateiname kommt aus readdir(PAPIERKORB_ORDNER), also
 *  Guertel und Hosentraeger. */
function papierkorbPfad(dateiname: string): string {
  const ziel = join(PAPIERKORB_ORDNER, dateiname);
  if (!resolve(ziel).startsWith(resolve(PAPIERKORB_ORDNER) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Papierkorbs");
  }
  return ziel;
}

/** Strukturprueft rohes Puck-Data, klemmt es auf registrierte Typen und
 *  laesst Pucks eigene Legacy-Hebung laufen. Gibt das migrierte Data zurueck.
 *
 *  migrate() OHNE config: die config-pflichtigen Migrationen (zones->slots)
 *  koennen ohne UI-Config nicht laufen — unsere Daten sind slot-/zone-frei,
 *  und die UI-Config ist serverseitig tabu (s. lib/puck-registry.ts). Traegt
 *  ein Payload doch zones, wirft migrate hart -> sauberer 400 statt stiller
 *  Datenverlust. */
/** Ein Prop-Wert ist ein Slot-/Inhalts-Array, wenn er ein Array aus
 *  ComponentData-artigen Objekten ist ({type, props}). Slots sind im
 *  Puck-0.22-Modell normale Props vom Typ ComponentData[] (Slot-Kinder liegen
 *  inline in props, nicht in zones — puck-erweiterungsebene.md §2.3). Ein
 *  leeres Array zaehlt mit (harmlos — es gibt dann nichts zu pruefen). */
function istInhaltsArray(v: unknown): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { type?: unknown }).type === "string" &&
        typeof (e as { props?: unknown }).props === "object" &&
        (e as { props?: unknown }).props !== null,
    )
  );
}

/** Strukturprueft EIN content-Item (Typ registriert? props.id vorhanden?) und
 *  steigt rekursiv in jeden Slot-Prop (ComponentData[]) ab — sonst ruschten
 *  verschachtelte, nicht registrierte Bausteine (z.B. in SektionBlock.kinder)
 *  ungeprueft durch und wuerden von <Render> still verschluckt. Sammelt
 *  unbekannte Typen in `unbekannte`. */
function pruefeItem(item: unknown, unbekannte: string[]): void {
  if (typeof item !== "object" || item === null) {
    throw new AnfrageFehler(400, "data.content enthält ein Nicht-Objekt");
  }
  const eintrag = item as Record<string, unknown>;
  if (typeof eintrag.type !== "string") {
    throw new AnfrageFehler(400, "data.content[]: type fehlt");
  }
  const props = eintrag.props;
  if (typeof props !== "object" || props === null || typeof (props as Record<string, unknown>).id !== "string") {
    throw new AnfrageFehler(400, `data.content[] (${eintrag.type}): props.id fehlt`);
  }
  if (!istRegistrierterTyp(eintrag.type)) unbekannte.push(eintrag.type);
  /* Slot-Kinder rekursiv (beliebig tief). */
  for (const wert of Object.values(props as Record<string, unknown>)) {
    if (istInhaltsArray(wert)) {
      for (const kind of wert) pruefeItem(kind, unbekannte);
    }
  }
}

export function pruefePuckData(v: unknown): Data {
  if (typeof v !== "object" || v === null) throw new AnfrageFehler(400, "data fehlt");
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.content)) throw new AnfrageFehler(400, "data.content muss ein Array sein");
  if (o.root !== undefined && (typeof o.root !== "object" || o.root === null)) {
    throw new AnfrageFehler(400, "data.root ungültig");
  }
  const unbekannte: string[] = [];
  for (const item of o.content) pruefeItem(item, unbekannte);
  if (unbekannte.length > 0) {
    /* Hartes Gate statt stillem Verschlucken durch <Render> — s. puck-registry.ts. */
    throw new AnfrageFehler(400, `Nicht registrierte Komponenten-Typen: ${[...new Set(unbekannte)].join(", ")}`);
  }
  try {
    return migrate({ root: (o.root as Data["root"]) ?? {}, content: o.content, zones: o.zones } as Data);
  } catch (e) {
    throw new AnfrageFehler(400, `Puck-Migration fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannt"}`);
  }
}

export interface SeitenInfo {
  name: string;
  gespeichert: string;
  contentAnzahl: number;
}

export async function listeSeiten(): Promise<SeitenInfo[]> {
  let dateien: string[];
  try {
    dateien = (await readdir(SEITEN_ORDNER)).filter((n) => n.endsWith(".json")).sort().slice(0, MAX_SEITEN);
  } catch {
    return []; // Ordner existiert noch nicht.
  }
  const seiten = await Promise.all(
    dateien.map(async (dateiname) => {
      const name = dateiname.slice(0, -".json".length);
      try {
        const roh = await readFile(join(SEITEN_ORDNER, dateiname), "utf-8");
        const inhalt = JSON.parse(roh) as Partial<SeitenDatei>;
        return {
          name,
          gespeichert: typeof inhalt.gespeichert === "string" ? inhalt.gespeichert : "",
          contentAnzahl: Array.isArray(inhalt.data?.content) ? inhalt.data.content.length : 0,
        };
      } catch {
        /* Kaputte Datei trotzdem listen — sie soll nicht die Liste verschlucken. */
        return { name, gespeichert: "", contentAnzahl: 0 };
      }
    }),
  );
  seiten.sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1));
  return seiten;
}

export async function ladeSeite(name: string): Promise<SeitenDatei> {
  let roh: string;
  try {
    roh = await readFile(seitenPfad(name), "utf-8");
  } catch {
    throw new AnfrageFehler(404, `Seite „${name}" nicht gefunden`);
  }
  try {
    return JSON.parse(roh) as SeitenDatei;
  } catch {
    throw new AnfrageFehler(500, "Seiten-Datei ist kein gültiges JSON");
  }
}

export interface SpeichernOptionen {
  /** Der dem Aufrufer bekannte Stand (gespeichert-Zeitstempel) — Konflikt-Guard. */
  erwartetGespeichert?: string;
  /** Ausdrueckliches Ueberschreiben ohne Stand-Abgleich. */
  ueberschreibe?: boolean;
  /** Animations-Abbild (Welle 4c). GESETZT → wird geschrieben. NICHT gesetzt
   *  (undefined) → ein bereits an der Seite haengendes anim bleibt ERHALTEN
   *  (ein normaler Puck-Speichervorgang loescht die Animation also nicht). */
  anim?: SeitenAnim;
  /** Uebernommene Stylesheet-URLs (Welle 5a). Gleiche Erhaltungs-Semantik wie
   *  anim: GESETZT → wird geschrieben; undefined → bestehendes styles bleibt
   *  erhalten (ein reiner Puck-Speichervorgang wirft die Styles nicht weg). */
  styles?: string[];
}

export async function speichereSeite(name: string, data: Data, opts: SpeichernOptionen = {}): Promise<SeitenDatei> {
  const pfad = seitenPfad(name);
  let bestehend: SeitenDatei | null = null;
  try {
    bestehend = JSON.parse(await readFile(pfad, "utf-8")) as SeitenDatei;
  } catch {
    bestehend = null; // neu anlegen
  }
  if (bestehend && !opts.ueberschreibe && opts.erwartetGespeichert !== bestehend.gespeichert) {
    throw new AnfrageFehler(
      409,
      `Konflikt: Seite „${name}" wurde ${bestehend.gespeichert || "unbekannt"} geändert — ` +
        `erst laden (erwartetGespeichert mitschicken) oder ueberschreibe:true setzen`,
    );
  }
  /* N18 (docs/plan-analyse/lens-undo.md §2.5): Die Datei ist WEG, aber der
     Aufrufer glaubt, sie existiere (erwartetGespeichert gesetzt) → das ist ein
     Konflikt, KEINE stumme Neuanlage. Sonst belebt ein Speichern eine soeben
     geloeschte Seite wieder. ueberschreibe:true bleibt der bewusste Ausweg
     (dann wird sie neu angelegt), analog zum bestehenden 409-Guard oben. */
  if (!bestehend && opts.erwartetGespeichert && !opts.ueberschreibe) {
    throw new AnfrageFehler(
      409,
      `Konflikt: Seite „${name}" existiert nicht mehr (zwischenzeitlich geloescht) — ` +
        `erst pruefen/neu laden oder ueberschreibe:true setzen, um neu anzulegen`,
    );
  }
  /* anim: uebergebenes gewinnt; sonst das bestehende erhalten (nicht stumm
     wegwerfen, wenn ein reiner Daten-Speichervorgang kein anim mitschickt). */
  const animEffektiv = opts.anim !== undefined ? opts.anim : bestehend?.anim;
  /* styles: gleiche Erhaltungs-Semantik wie anim (Welle 5a). */
  const stylesEffektiv = opts.styles !== undefined ? opts.styles : bestehend?.styles;
  const datei: SeitenDatei = {
    $doc: SEITEN_DOC,
    version: SEITEN_VERSION,
    name,
    gespeichert: new Date().toISOString(),
    data,
    ...(animEffektiv ? { anim: animEffektiv } : {}),
    ...(stylesEffektiv && stylesEffektiv.length > 0 ? { styles: stylesEffektiv } : {}),
  };
  await mkdir(SEITEN_ORDNER, { recursive: true });
  await writeFile(pfad, JSON.stringify(datei, null, 2), "utf-8");
  return datei;
}

/** Loeschen = in den Papierkorb verschieben (U7/N2, reversibel). Statt hartem
 *  unlink wird die Datei atomar nach seiten/.papierkorb/<name>-<zeitstempel>.json
 *  umbenannt. Rueckgabe: der Papierkorb-Dateiname (fuer Undo/Logs). 404, wenn es
 *  die Seite gar nicht gibt. */
export async function loescheSeite(name: string): Promise<string> {
  const quelle = seitenPfad(name);
  const papierkorbName = `${name}-${papierkorbZeitstempel()}.json`;
  const ziel = papierkorbPfad(papierkorbName);
  await mkdir(PAPIERKORB_ORDNER, { recursive: true });
  try {
    await rename(quelle, ziel);
  } catch (e) {
    /* ENOENT = Seite existierte nicht → 404; alles andere ist ein echter
       Fehler (z.B. Rechte) und darf nicht als "nicht gefunden" maskiert werden. */
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AnfrageFehler(404, `Seite „${name}" nicht gefunden`);
    }
    throw e;
  }
  return papierkorbName;
}

/** Stellt die JUENGSTE Papierkorb-Fassung einer Seite wieder her (U7/N2).
 *  Der Papierkorb-Dateiname ist exakt `<name>-<zeitstempel>.json` — der
 *  Zeitstempel wird per Regex am Ende verankert, damit ein Name mit
 *  Bindestrich (z.B. "wee-website-v3") nicht versehentlich den Papierkorb
 *  einer anderen Seite ("wee-website") aufsammelt.
 *  409, wenn die Ziel-Seite inzwischen wieder existiert (R-e: kein blindes
 *  Ueberschreiben). 404, wenn nichts im Papierkorb liegt. */
export async function stelleSeiteWieder(name: string): Promise<SeitenDatei> {
  const ziel = seitenPfad(name); // wirft bei Pfad-Ausbruch
  /* Nur der exakte Name gefolgt von "-<zeitstempel>.json" gilt. */
  const musterQuelle = `^${escapeRegex(name)}-(${ZEITSTEMPEL_REGEX.source})\\.json$`;
  const muster = new RegExp(musterQuelle);
  let dateien: string[];
  try {
    dateien = await readdir(PAPIERKORB_ORDNER);
  } catch {
    throw new AnfrageFehler(404, `Kein Papierkorb-Eintrag für „${name}"`);
  }
  const treffer = dateien.filter((d) => muster.test(d)).sort();
  if (treffer.length === 0) {
    throw new AnfrageFehler(404, `Kein Papierkorb-Eintrag für „${name}"`);
  }
  const juengste = treffer[treffer.length - 1]; // lexikografisch = chronologisch
  /* R-e: existiert die Seite inzwischen wieder, NICHT ueberschreiben. */
  try {
    await readFile(ziel, "utf-8");
    throw new AnfrageFehler(409, `Seite „${name}" existiert bereits — nicht ueberschrieben`);
  } catch (e) {
    if (e instanceof AnfrageFehler) throw e; // der 409 von oben
    /* readFile warf (Datei fehlt) — Ziel frei, weiter mit Restore. */
  }
  await rename(papierkorbPfad(juengste), ziel);
  return ladeSeite(name);
}

/** Escapt Regex-Sonderzeichen in einem Seiten-Namen (Namen duerfen laut
 *  saubererName u.a. "." und "-" enthalten). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
