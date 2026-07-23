/*
 * scripts/import-ben.mjs — Welle 5a (docs/editor-vereinheitlichung.md §10/5a,
 * Punkt 4): fuehrt die Ben-Import-Pipeline PROGRAMMATISCH aus — der reine
 * HTML->Puck-Adapter (lib/import/html-zu-puck.ts) + die laufende Autoren-API.
 * Der UI-Ordner-Picker braucht einen Menschen; dieses Skript ist zugleich
 * Leons Wiederhol-Werkzeug (deterministisch, immer wieder ausfuehrbar).
 *
 *   node scripts/import-ben.mjs            (Dev-Server auf :3113 muss laufen)
 *   node scripts/import-ben.mjs --html bildung/index.html --slug wee-bildung
 *
 * Ergebnis: seiten/<slug>.json (Default-Slug „wee-website-v3", NIE „v2") mit
 * uebernommenen Bildern (data-URL/kopiert) + uebernommenen Styles
 * (public/import/<slug>/css/). Am Ende ein Import-Bericht (Zaehler + Flags).
 *
 * WARUM SELBST-REEXEC: Der reine Adapter ist TypeScript und nutzt eine
 * Parameter-Property — Nodes „strip-only"-Modus lehnt das ab. Wir starten uns
 * daher einmal mit --experimental-transform-types neu (volle TS-Transform), statt
 * den geteilten Adapter fuers Skript umzuschreiben.
 *
 * WARUM --import ts-ext-loader.mjs: Der Adapter importiert relativ+endungslos
 * `./fremdkoerper-filter` (so verlangt es tsc/bundler + der Browser-Pfad). Nodes
 * nativer Resolver macht keine Endungs-Probe → der Loader-Hook haengt fuer den
 * Skript-Pfad `.ts` an (s. scripts/lib/ts-ext-loader.mjs). Nur dieser
 * Node-Prozess sieht den Hook; tsc/Next/Browser bleiben unberuehrt.
 *
 * WARUM happy-dom: Der Adapter braucht `DOMParser` (im Browser vorhanden). In
 * Node stellen wir ihn ueber das bereits installierte happy-dom bereit — reines
 * Parsen, kein Ausfuehren (wie im Browser: <script> im geparsten Dokument laeuft
 * nicht).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit voller TS-Transform (s. Dateikopf) ---- */
if (!process.env.__BEN_IMPORT_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __BEN_IMPORT_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile, readdir } = await import("node:fs/promises");
const { join, resolve, dirname } = await import("node:path");

/* happy-dom-DOMParser als Global bereitstellen, BEVOR der Adapter geladen wird
   (statische Imports wuerden vor dieser Zuweisung ausgewertet → dynamic import). */
const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { htmlZuPuck, ersetzeBildQuellen } = await import("../lib/import/html-zu-puck.ts");

/* ------------------------------------------------------------------ */
/* Konfiguration / Argumente                                           */
/* ------------------------------------------------------------------ */

const BASIS = "http://127.0.0.1:3113";
const HIER = dirname(fileURLToPath(import.meta.url));
const OUT_WURZEL = resolve(HIER, "..", "test-sites", "wee-website-v3", "out");
const DATAURL_MAX = 300 * 1024;

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const HTML_REL = argWert("--html", "index.html");
const SLUG = argWert("--slug", "wee-website-v3");

/* ------------------------------------------------------------------ */
/* Datei-Sammlung + Aufloesung                                          */
/* ------------------------------------------------------------------ */

/** Sammelt out/ rekursiv in eine Map „relativer POSIX-Pfad -> absoluter Pfad". */
async function sammleDateien(wurzel) {
  const map = new Map();
  async function rein(ordner, praefix) {
    let eintraege;
    try {
      eintraege = await readdir(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      const abs = join(ordner, e.name);
      const rel = praefix ? `${praefix}/${e.name}` : e.name;
      if (e.isDirectory()) await rein(abs, rel);
      else map.set(rel, abs);
    }
  }
  await rein(wurzel, "");
  return map;
}

function normalisiereSrc(src) {
  let s = src.split("#")[0].split("?")[0].trim();
  return s.replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Exakter Pfad zuerst, sonst per Basisname. */
function findePfad(map, src) {
  const norm = normalisiereSrc(src);
  if (map.has(norm)) return map.get(norm);
  const basis = norm.split("/").pop() ?? norm;
  for (const [rel, abs] of map) {
    if ((rel.split("/").pop() ?? rel) === basis) return abs;
  }
  return null;
}

const BILD_MIME = {
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

function bildMime(name) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return BILD_MIME[ext] ?? null;
}

async function post(pfad, body) {
  const res = await fetch(`${BASIS}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* Nicht-JSON: json bleibt null. */
  }
  return { status: res.status, json };
}

/** Grosses Asset (Bild ODER CSS) ueber /api/import/asset kopieren. */
async function ladeAssetHoch(name, dataUrl) {
  const r = await post("/api/import/asset", { slug: SLUG, name, dataUrl });
  return r.status === 200 && typeof r.json?.url === "string" ? r.json.url : null;
}

/* ------------------------------------------------------------------ */
/* Ablauf                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`Ben-Import → Slug „${SLUG}" (Quelle: out/${HTML_REL})\n`);

  const htmlAbs = findePfad(await sammleDateien(OUT_WURZEL), HTML_REL) ?? join(OUT_WURZEL, HTML_REL);
  let html;
  try {
    html = await readFile(htmlAbs, "utf-8");
  } catch {
    console.error(`✗ HTML nicht gefunden: ${htmlAbs}`);
    console.error(`  Erst Bens Seite bauen: (in test-sites/wee-website-v3) npm install && npm run build`);
    process.exit(1);
  }

  const map = await sammleDateien(OUT_WURZEL);
  const bericht = htmlZuPuck(html, { idPraefix: SLUG, styleUebernehmen: true });
  const flags = [...bericht.flags];

  /* --- Bilder aufloesen --- */
  const ersatz = {};
  /* Welle 5a: Original-src -> neue URL fuer Bilder INNERHALB von HtmlBloecken. */
  const htmlErsatz = {};
  let bilderData = 0;
  let bilderKopiert = 0;
  for (const { id, src, quelle } of bericht.bilder) {
    if (/^(data:|https?:)/i.test(src)) {
      flags.push({ grund: "Externes Bild belassen", detail: src });
      continue;
    }
    const abs = findePfad(map, src);
    if (!abs) {
      flags.push({ grund: "Bild nicht gefunden", detail: src });
      continue;
    }
    const mime = bildMime(abs);
    if (!mime) {
      flags.push({ grund: "Bild-Endung nicht erlaubt", detail: src });
      continue;
    }
    const daten = await readFile(abs);
    const name = (normalisiereSrc(src).split("/").pop() ?? "bild").trim() || "bild";
    const b64 = `data:${mime};base64,${daten.toString("base64")}`;
    /* html-interne Bilder IMMER kopieren (Markup schlank, Datei real unter
       public/import/<slug>/); eigenstaendige BildBloecke wie bisher
       (klein → data-URL, gross → kopieren). */
    if (quelle === "html") {
      const url = await ladeAssetHoch(name, b64);
      if (url) {
        htmlErsatz[src] = url;
        bilderKopiert++;
      } else flags.push({ grund: "Bild-Upload fehlgeschlagen", detail: src });
    } else if (daten.length < DATAURL_MAX) {
      ersatz[id] = b64;
      bilderData++;
    } else {
      const url = await ladeAssetHoch(name, b64);
      if (url) {
        ersatz[id] = url;
        bilderKopiert++;
      } else flags.push({ grund: "Bild-Upload fehlgeschlagen", detail: src });
    }
  }
  const data = ersetzeBildQuellen(bericht.data, ersatz, htmlErsatz);

  /* --- Styles uebernehmen (CSS kopieren + Inline sammeln) --- */
  const styles = [];
  for (const href of bericht.stylesheets) {
    const abs = findePfad(map, href);
    if (!abs) {
      flags.push({ grund: "Stylesheet nicht gefunden", detail: href });
      continue;
    }
    const text = await readFile(abs, "utf-8");
    const name = (normalisiereSrc(href).split("/").pop() ?? "stil.css").trim() || "stil.css";
    const url = await ladeAssetHoch(name, `data:text/css;base64,${Buffer.from(text, "utf-8").toString("base64")}`);
    if (url) styles.push(url);
    else flags.push({ grund: "Stylesheet-Upload fehlgeschlagen", detail: href });
  }
  if (bericht.inlineStyles.length > 0) {
    const zusammen = bericht.inlineStyles.join("\n\n");
    const url = await ladeAssetHoch(`${SLUG}-inline.css`, `data:text/css;base64,${Buffer.from(zusammen, "utf-8").toString("base64")}`);
    if (url) styles.push(url);
    else flags.push({ grund: "Stylesheet-Upload fehlgeschlagen", detail: "Inline-<style>-Sammeldatei" });
  }

  /* --- Als Seite speichern (ueberschreibt einen alten Import-Stand) --- */
  const speichern = await post("/api/puck-seite/speichere", {
    name: SLUG,
    data,
    ueberschreibe: true,
    ...(styles.length > 0 ? { styles } : {}),
  });

  /* --- Bericht --- */
  console.log("Import-Bericht:");
  console.log(
    `  Framework:    ${bericht.framework.typ}${bericht.framework.marker.length > 0 ? ` (${bericht.framework.marker.join(", ")})` : ""}`,
  );
  console.log(`  Sektionen:    ${bericht.statistik.sektionen}`);
  console.log(`  Texte:        ${bericht.statistik.texte}`);
  console.log(`  Bilder:       ${bericht.statistik.bilder} (${bilderData} eingebettet, ${bilderKopiert} kopiert)`);
  console.log(`  HTML-Bloecke: ${bericht.statistik.htmlBloecke}`);
  console.log(`  Styles:       ${styles.length} übernommen`);
  console.log(`  Flags:        ${flags.length}`);
  for (const f of dedupFlags(flags)) console.log(`    · ${f.grund}: ${f.detail}`);

  if (speichern.status !== 200) {
    console.error(`\n✗ Speichern fehlgeschlagen (HTTP ${speichern.status}): ${JSON.stringify(speichern.json)}`);
    console.error(`  Laeuft der Dev-Server auf ${BASIS}?`);
    process.exit(1);
  }
  console.log(`\n✓ Gespeichert: ${speichern.json?.pfad} (${speichern.json?.contentAnzahl} Bausteine, Stand ${speichern.json?.gespeichert})`);
  console.log(`  Erscheint im Seiten-Bereich als „${SLUG}" und oeffnet in Puck.`);
}

function dedupFlags(flags) {
  const gesehen = new Set();
  const out = [];
  for (const f of flags) {
    const k = `${f.grund}::${f.detail}`;
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    out.push(f);
  }
  return out;
}

await main();
