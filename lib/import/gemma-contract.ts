/*
 * lib/import/gemma-contract.ts — Import-Endlevel Schritt I3 (M5, Kernstueck D):
 * TYPEN + MECHANISCHE VALIDIERUNG des gemma4-Segmentier-Urteils, plus der
 * deterministische FALLBACK (Spec: docs/plan-analyse/lens-import.md §3-Schritt-III
 * + gemma4-Contract).
 *
 * ROLLE: gemma4 liefert nur einen VORSCHLAG (Sektionsgrenzen, Blocktypen, Titel).
 * Das Mapping bleibt mechanisch — deshalb wird jedes Modell-Urteil hier HART
 * gegen die Outline geprueft: jede ref genau einmal, Reihenfolge dokumenttreu,
 * Sektionen als lueckenlose zusammenhaengende Baender, Typ konsistent zum Tag,
 * keine Ueberlappungen. Ein Formfehler liefert einen KONKRETEN Fehlertext, den
 * das Skript dem Retry-Prompt anhaengt (bis 2 Retries), sonst greift der
 * deterministische Fallback — nie ein stiller Rueckfall.
 *
 * REIN: keine Aussenwelt (kein DOMParser/Netz/FS). Arbeitet ausschliesslich auf
 * der bereits gebildeten Outline (lib/import/dom-outline.ts). Gleiche Eingabe ->
 * gleiche Ausgabe.
 *
 * ABWEICHUNG (dokumentiert): Der Auftrag nennt fuer diese Datei „Typen +
 * mechanische Validierung"; der deterministische Fallback ist im Skript
 * vorgesehen. Er ist hier als REINE, unit-testbare Funktion `fallbackSegmentierung`
 * abgelegt (statt im Skript vergraben), weil er denselben Contract-Typ erzeugt und
 * so gemeinsam mit der Validierung getestet werden kann. Das Skript ruft ihn nur
 * auf. Sachlich bleibt „Skript entscheidet, wann Fallback"; nur die Grenz-Heuristik
 * lebt testbar im Lib.
 */

import type { OutlineKnoten } from "./dom-outline";
import { TEXT_TAGS } from "./dom-outline";

/* ------------------------------------------------------------------ */
/* Typen (Contract §3)                                                 */
/* ------------------------------------------------------------------ */

export type BlockTyp = "text" | "bild" | "html";

export interface SegBlock {
  ref: string;
  typ: BlockTyp;
}

export interface SegSektion {
  titel: string;
  vonRef: string;
  bisRef: string;
  bloecke: SegBlock[];
}

/** Das reine Modell-/Fallback-Urteil (ohne modus-Umschlag). */
export interface Segmentierung {
  sektionen: SegSektion[];
}

export type SegModus = "gemma" | "fallback";

/** Das neben der Freeze-Ausgabe abgelegte Ergebnis mit deklariertem Modus. */
export interface SegErgebnis {
  modus: SegModus;
  sektionen: SegSektion[];
}

export type ValidierErgebnis =
  | { ok: true; wert: Segmentierung }
  | { ok: false; fehler: string };

/* ------------------------------------------------------------------ */
/* Medien-Tags (fuer Typ-Konsistenz)                                   */
/* ------------------------------------------------------------------ */

const MEDIUM_TAGS = new Set(["img", "picture", "svg", "video", "canvas", "iframe"]);

/* ------------------------------------------------------------------ */
/* Mechanische Validierung                                             */
/* ------------------------------------------------------------------ */

/**
 * Prueft ein (bereits JSON-geparstes) Modell-Urteil gegen die Outline. Gibt bei
 * Erfolg das getypte Urteil zurueck, sonst einen konkreten Fehlertext fuer den
 * Retry-Prompt. Die Reihenfolge der Checks ist bewusst von „grob zu fein", damit
 * der Fehlertext moeglichst frueh und praezise ist.
 */
export function validiereSegmentierung(roh: unknown, outline: OutlineKnoten[]): ValidierErgebnis {
  const refReihenfolge = outline.map((k) => k.ref);
  const knotenNach = new Map(outline.map((k) => [k.ref, k] as const));

  /* (1) Grobform. */
  if (!roh || typeof roh !== "object") return fehl("Antwort ist kein JSON-Objekt.");
  const sektionenRoh = (roh as { sektionen?: unknown }).sektionen;
  if (!Array.isArray(sektionenRoh) || sektionenRoh.length === 0) {
    return fehl('Feld "sektionen" fehlt oder ist ein leeres Array.');
  }

  /* (2) Jede Sektion strukturell + Bloecke einsammeln (global, in Reihenfolge). */
  const sektionen: SegSektion[] = [];
  const globaleRefs: string[] = [];
  for (let i = 0; i < sektionenRoh.length; i++) {
    const s = sektionenRoh[i] as Record<string, unknown>;
    if (!s || typeof s !== "object") return fehl(`Sektion ${i} ist kein Objekt.`);
    if (typeof s.titel !== "string" || s.titel.trim() === "") {
      return fehl(`Sektion ${i}: "titel" fehlt oder ist leer.`);
    }
    if (typeof s.vonRef !== "string" || typeof s.bisRef !== "string") {
      return fehl(`Sektion ${i} ("${s.titel}"): "vonRef"/"bisRef" muessen Strings sein.`);
    }
    if (!Array.isArray(s.bloecke) || s.bloecke.length === 0) {
      return fehl(`Sektion ${i} ("${s.titel}"): "bloecke" fehlt oder ist leer.`);
    }

    const bloecke: SegBlock[] = [];
    for (let j = 0; j < s.bloecke.length; j++) {
      const b = s.bloecke[j] as Record<string, unknown>;
      if (!b || typeof b !== "object") return fehl(`Sektion ${i}, Block ${j} ist kein Objekt.`);
      const ref = b.ref;
      const typ = b.typ;
      if (typeof ref !== "string") return fehl(`Sektion ${i}, Block ${j}: "ref" muss ein String sein.`);
      if (!knotenNach.has(ref)) {
        return fehl(`Unbekannte ref "${ref}" (existiert nicht in der Outline).`);
      }
      if (typ !== "text" && typ !== "bild" && typ !== "html") {
        return fehl(`ref "${ref}": "typ" muss "text"|"bild"|"html" sein, war ${JSON.stringify(typ)}.`);
      }
      const typFehler = pruefeTyp(knotenNach.get(ref)!, typ);
      if (typFehler) return fehl(typFehler);
      bloecke.push({ ref, typ });
      globaleRefs.push(ref);
    }

    if (bloecke[0].ref !== s.vonRef) {
      return fehl(`Sektion ${i} ("${s.titel}"): vonRef "${s.vonRef}" != erster Block "${bloecke[0].ref}".`);
    }
    if (bloecke[bloecke.length - 1].ref !== s.bisRef) {
      return fehl(`Sektion ${i} ("${s.titel}"): bisRef "${s.bisRef}" != letzter Block "${bloecke[bloecke.length - 1].ref}".`);
    }
    sektionen.push({ titel: s.titel.trim(), vonRef: s.vonRef, bisRef: s.bisRef, bloecke });
  }

  /* (3) Vollstaendige, ueberschneidungsfreie, dokumenttreue Abdeckung:
     die global gesammelten Block-refs muessen die Outline-Reihenfolge EXAKT
     ergeben (deckt zugleich „jede ref genau einmal" + „keine Ueberlappung" ab). */
  const abdeckung = pruefeAbdeckung(globaleRefs, refReihenfolge);
  if (abdeckung) return fehl(abdeckung);

  return { ok: true, wert: { sektionen } };
}

/** Typ-Konsistenz: Medium != text, reiner Text (kein Bild im Subtree) != bild. */
function pruefeTyp(knoten: OutlineKnoten, typ: BlockTyp): string | null {
  if (MEDIUM_TAGS.has(knoten.tag) && typ === "text") {
    return `ref "${knoten.ref}" (<${knoten.tag}>): Medien-Element darf nicht typ "text" sein.`;
  }
  if (typ === "bild" && !knoten.hatBild && TEXT_TAGS.has(knoten.tag)) {
    return `ref "${knoten.ref}" (<${knoten.tag}>): reiner Textknoten ohne Bild darf nicht typ "bild" sein.`;
  }
  return null;
}

/** Vergleicht die gesammelte ref-Folge exakt mit der Outline-Reihenfolge. */
function pruefeAbdeckung(gesammelt: string[], soll: string[]): string | null {
  if (gesammelt.length !== soll.length) {
    const fehlend = soll.filter((r) => !gesammelt.includes(r));
    const doppelt = gesammelt.filter((r, i) => gesammelt.indexOf(r) !== i);
    const teile: string[] = [`erwartet ${soll.length} Bloecke, erhalten ${gesammelt.length}`];
    if (fehlend.length > 0) teile.push(`fehlend: ${fehlend.slice(0, 8).join(", ")}`);
    if (doppelt.length > 0) teile.push(`doppelt: ${[...new Set(doppelt)].slice(0, 8).join(", ")}`);
    return "Abdeckung unvollstaendig — " + teile.join("; ") + ".";
  }
  for (let i = 0; i < soll.length; i++) {
    if (gesammelt[i] !== soll[i]) {
      return `Reihenfolge weicht ab an Position ${i}: erwartet "${soll[i]}", erhalten "${gesammelt[i]}" (Reihenfolge muss dokumenttreu sein).`;
    }
  }
  return null;
}

function fehl(text: string): ValidierErgebnis {
  return { ok: false, fehler: text };
}

/* ------------------------------------------------------------------ */
/* Deterministischer Fallback (verbesserte Grenz-Heuristik)            */
/* ------------------------------------------------------------------ */

/* Klassen-Hinweise, die den Beginn eines neuen Bandes signalisieren. */
const SEKTIONS_STICHWORT = /\b(hero|banner|section|abschnitt|footer|fusszeile|header|kopf|cta|stats|kennzahl|feature|mission|team|kontakt|contact|gallery|galerie|pricing|preis|faq)\b/i;

/**
 * Erzeugt eine gueltige Segmentierung ohne Modell: Sektionsgrenzen aus
 * Landmarks/Heading-Rang/Struktur-/Klassen-Hinweisen. Garantiert lueckenlose,
 * dokumenttreue Abdeckung (das Ergebnis besteht `validiereSegmentierung`).
 */
export function fallbackSegmentierung(outline: OutlineKnoten[]): Segmentierung {
  if (outline.length === 0) return { sektionen: [] };

  const grenzen = ermittleGrenzen(outline);
  const sektionen: SegSektion[] = [];
  for (let g = 0; g < grenzen.length; g++) {
    const von = grenzen[g];
    const bis = g + 1 < grenzen.length ? grenzen[g + 1] : outline.length;
    const scheibe = outline.slice(von, bis);
    const bloecke = scheibe.map((k) => ({ ref: k.ref, typ: fallbackTyp(k) }));
    sektionen.push({
      titel: titelFuer(scheibe, sektionen.length),
      vonRef: scheibe[0].ref,
      bisRef: scheibe[scheibe.length - 1].ref,
      bloecke,
    });
  }
  return { sektionen };
}

/** Liefert die Start-Indizes der Sektionen (immer beginnend bei 0). */
function ermittleGrenzen(outline: OutlineKnoten[]): number[] {
  const rangVon = (k: OutlineKnoten): number => {
    const m = /^h([1-6])$/.exec(k.tag);
    return m ? Number(m[1]) : 0;
  };
  const heads = outline.map(rangVon).filter((r) => r > 0);

  /* Sektions-definierende Raenge bestimmen: der kleinste vorkommende Rang; kommt
     dieser nur EINMAL vor (klassischer Fall: eine einzelne h1 im Hero, darunter
     mehrere h2-Sektionen), zaehlt zusaetzlich der naechstkleinere Rang als
     Sektionsgrenze — sonst kollabierte alles unter der h1 zu einem Band. */
  const sektionsRaenge = new Set<number>();
  if (heads.length > 0) {
    const sortiert = [...new Set(heads)].sort((a, b) => a - b);
    const r0 = sortiert[0];
    sektionsRaenge.add(r0);
    const anzahlR0 = heads.filter((r) => r === r0).length;
    if (anzahlR0 <= 1 && sortiert.length > 1) sektionsRaenge.add(sortiert[1]);
  }

  const grenzen: number[] = [0];
  const merke = (i: number) => {
    if (i > 0 && grenzen[grenzen.length - 1] !== i) grenzen.push(i);
  };

  for (let i = 1; i < outline.length; i++) {
    const k = outline[i];
    const rang = rangVon(k);
    /* (a) Sektions-definierendes Heading startet ein Band. */
    if (rang > 0 && sektionsRaenge.has(rang)) { merke(i); continue; }
    /* (b) Struktureller Ruecksprung auf Tiefe 0 = neues Top-Band. */
    if (k.tiefe === 0 && outline[i - 1].tiefe > 0) { merke(i); continue; }
    /* (c) Sektionierendes Klassen-Stichwort. */
    if (SEKTIONS_STICHWORT.test(k.klassenHinweis)) { merke(i); continue; }
  }

  /* Wenn nur EINE Sektion herauskam, aber viele Atome vorliegen, an JEDEM
     Heading (beliebiger Rang) trennen — besser feine als eine Grob-Sektion. */
  if (grenzen.length === 1 && outline.length > 6) {
    for (let i = 1; i < outline.length; i++) {
      if (rangVon(outline[i]) > 0) merke(i);
    }
    grenzen.sort((a, b) => a - b);
  }
  return grenzen;
}

/** Blocktyp aus dem Tag/Bild-Signal (deterministisch). */
function fallbackTyp(k: OutlineKnoten): BlockTyp {
  if (MEDIUM_TAGS.has(k.tag)) return "bild";
  if (TEXT_TAGS.has(k.tag)) return "text";
  if (k.hatBild) return "bild";
  return "html";
}

/** Sektionstitel aus dem ersten Atom (Heading-Text/Landmark/Klasse/Nummer). */
function titelFuer(scheibe: OutlineKnoten[], index: number): string {
  const kopf = scheibe[0];
  if (/^h[1-6]$/.test(kopf.tag) && kopf.textVorschau) return kopf.textVorschau.slice(0, 60);
  const erstHeading = scheibe.find((k) => /^h[1-6]$/.test(k.tag) && k.textVorschau);
  if (erstHeading) return erstHeading.textVorschau.slice(0, 60);
  switch (kopf.tag) {
    case "header": return "Kopfbereich";
    case "footer": return "Fussbereich";
    case "nav": return "Navigation";
    default: break;
  }
  const stich = kopf.klassenHinweis.split(" ").filter(Boolean)[0];
  if (stich) return stich.slice(0, 40);
  return `Abschnitt ${index + 1}`;
}
