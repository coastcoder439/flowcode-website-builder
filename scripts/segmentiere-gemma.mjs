/*
 * scripts/segmentiere-gemma.mjs — Import-Endlevel Schritt I3 (M5, Kernstueck D):
 * fuehrt die gemma4-Segmentierung aus. Spec: docs/plan-analyse/lens-import.md
 * §3-Schritt-III + gemma4-Contract.
 *
 * ABLAUF:
 *   Freeze-HTML (scripts/.freeze-out/<slug>.html)
 *     -> Fremdkoerper entfernen (.site-gate u.a., VOR gemma)      [N15]
 *     -> kompakte DOM-Outline bilden (lib/import/dom-outline.ts)
 *     -> Cache-Pruefung (gleicher Eingabe-Hash -> Datei wiederverwenden)
 *     -> POST http://127.0.0.1:11434/api/generate (model gemma4, format json,
 *        stream false), Validierung, bis 2 Retries MIT konkretem Fehlertext
 *     -> sonst deterministischer Fallback (im Ergebnis DEKLARIERT: modus)
 *   Ergebnis: scripts/.freeze-out/<slug>.segmentierung.json
 *             { modus, sektionen, eingabeHash, modell, wurzelTag, erzeugtAm }
 *
 * CLI:
 *   node scripts/segmentiere-gemma.mjs --slug index
 *   node scripts/segmentiere-gemma.mjs --slug bildung --modell gemma4:12b
 *   node scripts/segmentiere-gemma.mjs --slug index --neu     (Cache ignorieren)
 * ENV:  SEG_MODELL (Default gemma4), OLLAMA_URL (Default 127.0.0.1:11434).
 *
 * WARUM SELBST-REEXEC + ts-ext-loader + happy-dom: die reinen Libs sind
 * TypeScript und dom-outline/fremdkoerper-filter brauchen `DOMParser`. Wie bei
 * scripts/import-ben.mjs: einmal mit --experimental-transform-types + Loader-Hook
 * neu starten und happy-dom als globalen DOMParser bereitstellen. Nur dieser
 * Node-Prozess sieht das; tsc/Next/Browser bleiben unberuehrt.
 *
 * DETERMINISMUS: gleiche Outline + gleiches Modell -> gleicher eingabeHash ->
 * gecachte Datei wird wiederverwendet. Das Modell laeuft mit temperature 0 und
 * festem seed. Der Fallback ist von Natur aus deterministisch.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit voller TS-Transform + Endungs-Loader ---- */
if (!process.env.__SEG_GEMMA_REEXEC) {
  const ladeHook = new URL("./lib/ts-ext-loader.mjs", import.meta.url).href;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      ladeHook,
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: { ...process.env, __SEG_GEMMA_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile, writeFile, mkdir } = await import("node:fs/promises");
const { existsSync } = await import("node:fs");
const { join, dirname, resolve } = await import("node:path");
const { createHash } = await import("node:crypto");

/* happy-dom-DOMParser global bereitstellen, BEVOR die Libs geladen werden. */
const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { entferneFremdkoerper } = await import("../lib/import/fremdkoerper-filter.ts");
const { baueOutline, zuGemmaEingabe } = await import("../lib/import/dom-outline.ts");
const { validiereSegmentierung, fallbackSegmentierung } = await import("../lib/import/gemma-contract.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_ORDNER = join(HIER, ".freeze-out");

/* Prompt-Version fliesst in den Cache-Hash: aendert sich der Prompt/Contract,
   wird das Urteil neu geholt (alter Cache passt nicht mehr). */
const PROMPT_VERSION = "i3-v1";
const MAX_VERSUCHE = 3; // 1 Erst-Versuch + 2 Retries (Contract: „bis 2 Retries")

/* ------------------------------------------------------------------ */
/* CLI-Argumente                                                       */
/* ------------------------------------------------------------------ */

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function argFlag(name) {
  return process.argv.includes(name);
}

const slug = argWert("--slug", "index");
const modell = argWert("--modell", process.env.SEG_MODELL || "gemma4");
const ollamaBasis = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const cacheIgnorieren = argFlag("--neu");

/* ------------------------------------------------------------------ */
/* Ollama-Anbindung                                                    */
/* ------------------------------------------------------------------ */

/**
 * Loest einen (evtl. tag-losen) Modellnamen gegen die installierten Tags auf.
 * Ollama nennt Tags voll ("gemma4:latest"); `ollama run gemma4` haengt implizit
 * ":latest" an. Diese Aufloesung bildet dasselbe nach, damit „gemma4" den Tag
 * "gemma4:latest" trifft. Rueckgabe: der voll aufgeloeste Tag oder null.
 */
function loeseTagAuf(wunsch, tags) {
  if (tags.includes(wunsch)) return wunsch;
  if (!wunsch.includes(":")) {
    if (tags.includes(`${wunsch}:latest`)) return `${wunsch}:latest`;
    const treffer = tags.find((t) => t.startsWith(`${wunsch}:`));
    if (treffer) return treffer;
  }
  return null;
}

/** Prueft, ob Ollama erreichbar ist und den Modell-Tag kennt (mit :latest-Aufloesung). */
async function pruefeModell() {
  try {
    const res = await fetch(`${ollamaBasis}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { erreichbar: false, hatTag: false, grund: `HTTP ${res.status}` };
    const daten = await res.json();
    const tags = Array.isArray(daten?.models) ? daten.models.map((m) => m.name) : [];
    const aufgeloest = loeseTagAuf(modell, tags);
    return { erreichbar: true, hatTag: aufgeloest !== null, aufgeloest, tags };
  } catch (fehler) {
    return { erreichbar: false, hatTag: false, grund: fehler?.message ?? String(fehler) };
  }
}

/** Baut den Segmentier-Prompt; `fehlerText` haengt konkretes Retry-Feedback an. */
function bauePrompt(eingabe, fehlerText) {
  const regeln = [
    "Du bist ein Segmentierer fuer Website-Inhalte. Du bekommst eine GEORDNETE Liste von Knoten (Atome) einer Seite in DOKUMENTREIHENFOLGE.",
    "Deine Aufgabe: gruppiere DIESELBEN Knoten zu zusammenhaengenden Sektionen (Baendern) und vergib je Knoten einen Blocktyp und je Sektion einen kurzen deutschen Titel.",
    "HARTE REGELN:",
    "- Verwende AUSSCHLIESSLICH die vorgegebenen refs. Erfinde keine, lasse keine weg.",
    "- Jede ref genau EINMAL, in exakt der vorgegebenen Reihenfolge.",
    "- Sektionen sind zusammenhaengende Bereiche: die bloecke einer Sektion sind aufeinanderfolgende refs; vonRef = erste ref, bisRef = letzte ref der Sektion.",
    "- typ ist eines von: \"text\" | \"bild\" | \"html\". Medien (hatBild bei tag img/svg/picture/video) => \"bild\". Ueberschriften/Absaetze => \"text\". Sonst \"html\".",
    "- titel ist eine kurze deutsche Bezeichnung (z. B. \"Hero\", \"Mission\", \"Kennzahlen\", \"Kontakt\", \"Fussbereich\").",
    "Signale je Knoten: tag (HTML-Tag), klassenHinweis (Klassennamen), textDichte (Textlaenge), tiefe (Schachtelung), hatBild (Bild im Teilbaum).",
    "Neue Sektion beginnt typischerweise bei einer Ueberschrift, einem Tiefen-Ruecksprung oder einem sektionierenden Klassennamen.",
    'Antworte NUR mit JSON exakt dieser Form: {"sektionen":[{"titel":"...","vonRef":"rX","bisRef":"rY","bloecke":[{"ref":"rX","typ":"text"}]}]}',
  ];
  const teile = [regeln.join("\n")];
  if (fehlerText) {
    teile.push(
      "\nDEIN LETZTER VERSUCH WAR UNGUELTIG. Fehler (behebe GENAU das): " +
        fehlerText +
        "\nGib die vollstaendige, korrigierte Segmentierung erneut aus.",
    );
  }
  teile.push("\nKNOTEN (JSON):\n" + JSON.stringify(eingabe));
  return teile.join("\n");
}

/* Nach dem Preflight gesetzter, voll aufgeloester Tag fuer die Generate-Aufrufe. */
let modellAufgeloest = modell;

/** Ein Generate-Aufruf; wirft bei Netz-/HTTP-Fehler. Gibt den geparsten Body. */
async function rufeGemma(prompt) {
  const res = await fetch(`${ollamaBasis}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modellAufgeloest,
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0, seed: 7 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const daten = await res.json();
  const roh = typeof daten?.response === "string" ? daten.response : "";
  try {
    return JSON.parse(roh);
  } catch {
    /* format:json sollte gueltiges JSON liefern; falls nicht, als Formfehler
       behandeln (fuehrt zu Retry mit Feedback). */
    return { __parseFehler: true, roh: roh.slice(0, 400) };
  }
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

function eingabeHashVon(eingabe) {
  const material = JSON.stringify(eingabe) + "|" + modell + "|" + PROMPT_VERSION;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

async function ladeCache(pfad, hash) {
  if (cacheIgnorieren || !existsSync(pfad)) return null;
  try {
    const vorhanden = JSON.parse(await readFile(pfad, "utf-8"));
    return vorhanden?.eingabeHash === hash ? vorhanden : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Hauptlauf                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  const htmlPfad = join(FREEZE_ORDNER, `${slug}.html`);
  if (!existsSync(htmlPfad)) {
    console.error(`✗ Freeze-HTML fehlt: ${htmlPfad}`);
    console.error(`  Erst einfrieren: node scripts/freeze-seite.mjs --seite <pfad>`);
    process.exit(1);
  }

  const rohHtml = await readFile(htmlPfad, "utf-8");
  console.log(`Segmentierung → Slug „${slug}", Modell „${modell}"`);

  /* (1) Fremdkoerper VOR gemma entfernen. */
  const gefiltert = entferneFremdkoerper(rohHtml);
  if (gefiltert.entfernt.length > 0) {
    console.log(`  Fremdkoerper entfernt: ${gefiltert.entfernt.map((e) => e.selector).join(", ")}`);
  }

  /* (2) Outline bilden. */
  const { knoten, wurzelTag } = baueOutline(gefiltert.html);
  const eingabe = zuGemmaEingabe(knoten);
  console.log(`  Outline: ${knoten.length} Atome (Wurzel <${wurzelTag}>)`);
  if (knoten.length === 0) {
    console.error("✗ Leere Outline — kein segmentierbarer Inhalt gefunden.");
    process.exit(1);
  }

  /* (3) Cache. */
  const hash = eingabeHashVon(eingabe);
  const ausgabePfad = join(FREEZE_ORDNER, `${slug}.segmentierung.json`);
  const cache = await ladeCache(ausgabePfad, hash);
  if (cache) {
    console.log(`  ✓ Cache-Treffer (eingabeHash ${hash}) → wiederverwendet: modus=${cache.modus}, ${cache.sektionen.length} Sektionen`);
    console.log(`  ${ausgabePfad}`);
    return;
  }

  /* (4) Modell-Preflight. */
  const pruef = await pruefeModell();
  let modus = "fallback";
  let sektionen = null;
  let fallbackGrund = "";

  if (!pruef.erreichbar) {
    fallbackGrund = `Ollama nicht erreichbar (${pruef.grund})`;
  } else if (!pruef.hatTag) {
    fallbackGrund = `Modell-Tag „${modell}" nicht in Ollama (verfuegbar: ${(pruef.tags || []).join(", ") || "keine"})`;
  } else {
    modellAufgeloest = pruef.aufgeloest;
    if (modellAufgeloest !== modell) console.log(`  Modell-Tag „${modell}" → „${modellAufgeloest}"`);
    /* (5) Generate mit Retries + konkretem Fehler-Feedback. */
    let letzterFehler = "";
    for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch++) {
      let roh;
      try {
        roh = await rufeGemma(bauePrompt(eingabe, versuch > 1 ? letzterFehler : ""));
      } catch (fehler) {
        letzterFehler = fehler?.message ?? String(fehler);
        console.log(`  Versuch ${versuch}/${MAX_VERSUCHE}: Aufruf-Fehler — ${letzterFehler}`);
        break; // Netz-/HTTP-Fehler => nicht weiter retryen, direkt Fallback
      }
      if (roh?.__parseFehler) {
        letzterFehler = `Antwort war kein gueltiges JSON (Auszug: ${roh.roh}).`;
        console.log(`  Versuch ${versuch}/${MAX_VERSUCHE}: ${letzterFehler}`);
        continue;
      }
      const geprueft = validiereSegmentierung(roh, knoten);
      if (geprueft.ok) {
        modus = "gemma";
        sektionen = geprueft.wert.sektionen;
        console.log(`  Versuch ${versuch}/${MAX_VERSUCHE}: gueltig ✓`);
        break;
      }
      letzterFehler = geprueft.fehler;
      console.log(`  Versuch ${versuch}/${MAX_VERSUCHE}: ungueltig — ${letzterFehler}`);
    }
    if (modus !== "gemma") fallbackGrund = `Modell-Urteil nach ${MAX_VERSUCHE} Versuchen ungueltig/nicht nutzbar`;
  }

  /* (6) Fallback, falls kein gueltiges Modell-Urteil. NIE still. */
  if (modus !== "gemma") {
    sektionen = fallbackSegmentierung(knoten).sektionen;
    console.log(`  ⚠ Fallback-Modus: ${fallbackGrund} → deterministische Segmentierung (${sektionen.length} Sektionen)`);
  }

  /* (7) Schreiben. */
  const ergebnis = {
    modus,
    sektionen,
    eingabeHash: hash,
    modell: modus === "gemma" ? modellAufgeloest : null,
    wurzelTag,
    atome: knoten.length,
    fallbackGrund: modus === "gemma" ? null : fallbackGrund,
    erzeugtAm: new Date().toISOString(),
  };
  await mkdir(FREEZE_ORDNER, { recursive: true });
  await writeFile(ausgabePfad, JSON.stringify(ergebnis, null, 2), "utf-8");

  console.log(`\n✓ Segmentierung (${modus}): ${sektionen.length} Sektionen`);
  for (const s of sektionen) {
    console.log(`    · ${s.titel}  [${s.vonRef}..${s.bisRef}, ${s.bloecke.length} Bloecke]`);
  }
  console.log(`  ${ausgabePfad}`);
}

await main();
