/*
 * scripts/import-fein.mjs — Import-Endlevel Schritt IV (M5, Kernstueck E):
 * ORCHESTRIERT die feine Import-Pipeline End-to-End und speichert das Ergebnis
 * ueber die bestehende Autoren-API. Spec: docs/plan-analyse/lens-import.md
 * §3-Schritt-IV, docs/editor-vereinheitlichung.md §11.
 *
 * KETTE:
 *   (I1) FREEZE       scripts/freeze-seite.mjs  → .freeze-out/<slug>.html
 *   (I2) FILTER       Fremdkoerper (in htmlZuPuckMitSegmentierung, deckt sich
 *                     mit dem Filter, den Schritt III vor gemma faehrt)      [N15]
 *   (I3) SEGMENTIERE  scripts/segmentiere-gemma.mjs → .freeze-out/<slug>.segmentierung.json
 *   (—)  CSS-JE-BAUSTEIN  juice (devDep, NUR im Skript-Pfad) inliniert die
 *                     aufgeloesten CSS-Regeln als style-Attribute VOR dem Mapping
 *                     → jeder HtmlBlock traegt seinen Look selbst und „zerfliegt"
 *                     nicht mehr, wenn er aus seiner Vorfahren-Kette geloest wird.
 *   (I4) MAPPING      lib/import/html-zu-puck.ts htmlZuPuckMitSegmentierung
 *                     → SektionBlock mit feinen TextBlock/BildBlock/HtmlBlock-Kindern
 *   (—)  SPEICHERN    POST /api/puck-seite/speichere  (Test-Slug, NIE die Live-Seite)
 *
 * ENTSCHEIDUNG CSS-je-Baustein (dokumentiert): juice (MIT) im SKRIPT-Pfad, NICHT
 * ein Eigen-Resolver und NICHT im Produktkern. Gruende: (a) der reine Adapter
 * bleibt dep-frei/rein (juice ist Node-only) — er liest nur die schon gesetzten
 * style-Attribute mit; (b) juice ist erprobt (import-endlevel.md §1/2, MIT,
 * direkt einbaubar); (c) ein Eigen-Resolver ueber die kopierten Stylesheets
 * muesste Selektor-Matching nachbauen — vermeidbare Komplexitaet. Die linked
 * Next-CSS wird dafuer als extraCss an juice gereicht (kein Netz-Fetch). Der
 * Schritt ist GRACEFUL: schlaegt juice fehl oder veraendert er die Outline
 * (ref-Drift), wird ohne Inlining gemappt und das transparent geflaggt — das
 * feine Block-Ergebnis haengt NIE an juice.
 *
 * CLI:
 *   node scripts/import-fein.mjs                         (Slug „index" → Seite „wee-v3-fein")
 *   node scripts/import-fein.mjs --seite . --slug verify-i4   (Ziel-Seite „verify-i4")
 *   node scripts/import-fein.mjs --seite bildung --slug wee-v3-fein-bildung
 *   node scripts/import-fein.mjs --alle                  (I6: ALLE out/**\/index.html)
 *   node scripts/import-fein.mjs --alle --basis-slug wee-fein  (Slug-Praefix fuer --alle)
 *   node scripts/import-fein.mjs --kein-freeze           (vorhandene Freeze-HTML nutzen)
 *   node scripts/import-fein.mjs --kein-css              (juice-Inlining ueberspringen)
 *   node scripts/import-fein.mjs --neu                   (Segmentier-Cache ignorieren)
 *   node scripts/import-fein.mjs --keine-leerung         (Asset-Ordner NICHT vorher leeren)
 *   node scripts/import-fein.mjs --seite bildung --slug x --json  (Maschinen-Ausgabe)
 * ENV:  SEG_MODELL (Default gemma4), OLLAMA_URL.
 *
 * ARGUMENT-PRUEFUNG (streng): unbekannte Flags (z.B. ein vertipptes „--slug-praefix"
 *   statt „--basis-slug") und Wert-Flags ohne Wert brechen mit Exit 2 ab, BEVOR
 *   etwas gefroren/gespeichert/geleert wird — kein stilles Zurueckfallen auf einen
 *   destruktiven Default-Slug mehr (I6-Fix, s. pruefeArgumente()).
 *
 * I6 (Unterseiten-Crawl, M6/M3, lens-import.md §3-Schritt-VI):
 *   --alle laeuft ueber ALLE out/**\/index.html (Testfall: bis zu 16 Seiten). Slug-
 *   Schema: Startseite → <basis-slug> (Default „wee-v3-fein"), Unterseite → <basis-
 *   slug>-<unterpfad-mit-bindestrichen>. Die bestehende Seite „wee-website-v3" wird
 *   NIE getroffen (eigener Basis-Slug). Vor jedem Ziel-Slug wird der Asset-Ordner
 *   public/import/<slug>/ REVERSIBEL geleert (Waisen-Vermeidung, aktion="leeren").
 *   Re-Import = Ueberschreiben (ueberschreibe:true); optional --erwartet-gespeichert
 *   fuer den Konfliktschutz der Flow-Lens. Jede Seite legt zusaetzlich ein
 *   Maschinen-Ergebnis .freeze-out/<slug>.import.json ab — daraus liest die
 *   E4-Route /api/import/freeze den Bericht (kein stdout-Parsing).
 *   OFFEN (bewusst spaeter): interne Links ZWISCHEN den importierten Seiten werden
 *   noch NICHT auf die neuen Slugs umgebogen (die HtmlBloecke tragen die Original-
 *   hrefs) — dokumentiert in lens-import.md §3-Schritt-VI, eigener Folge-Schritt.
 *
 * WARUM SELBST-REEXEC + ts-ext-loader + happy-dom: wie scripts/import-ben.mjs —
 * der reine Adapter ist TypeScript + braucht DOMParser. Freeze/Segmentierung
 * laufen als eigene Kindprozesse (jeder mit eigenem Reexec).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit voller TS-Transform + Endungs-Loader ---- */
if (!process.env.__IMPORT_FEIN_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __IMPORT_FEIN_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile, readdir } = await import("node:fs/promises");
const { existsSync, writeFileSync } = await import("node:fs");
const { join, resolve, dirname } = await import("node:path");

/* happy-dom-DOMParser als Global, BEVOR die reinen Libs geladen werden. */
const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { htmlZuPuck, htmlZuPuckMitSegmentierung, ersetzeBildQuellen } = await import("../lib/import/html-zu-puck.ts");
const { baueOutline } = await import("../lib/import/dom-outline.ts");
/* Schritt V (M7): CSS-url()-Reparatur — Fonts/Medien aus den kopierten CSS-
   Dateien aufloesen + rebasen (rein/AST; Datei-Kopie bleibt hier im Skript). */
const { sammleCssAssets, schreibeCssUrls } = await import("../lib/import/css-rewrite.ts");

/* ------------------------------------------------------------------ */
/* Konfiguration / Argumente                                           */
/* ------------------------------------------------------------------ */

const BASIS = "http://127.0.0.1:3113";
const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_ORDNER = join(HIER, ".freeze-out");
const DEFAULT_OUT = resolve(HIER, "..", "test-sites", "wee-website-v3", "out");
const DATAURL_MAX = 300 * 1024;

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function argFlag(name) {
  return process.argv.includes(name);
}

const SEITE = argWert("--seite", "."); // Freeze-Seitenpfad (".", "bildung", …)
const ORDNER = argWert("--ordner", DEFAULT_OUT);
const MODELL = argWert("--modell", process.env.SEG_MODELL || "gemma4");
const KEIN_FREEZE = argFlag("--kein-freeze");
const KEIN_CSS = argFlag("--kein-css");
const CACHE_NEU = argFlag("--neu");
/* I6 (Unterseiten-Crawl + Maschinen-Ausgabe + Re-Import-Steuerung). */
const ALLE = argFlag("--alle"); // ueber alle out/**/index.html
const JSON_MODUS = argFlag("--json"); // Fortschritt → stderr, Aggregat-JSON → stdout
const KEINE_LEERUNG = argFlag("--keine-leerung"); // Asset-Ordner NICHT vorher leeren
const ERWARTET = argWert("--erwartet-gespeichert", null); // optionaler Konfliktschutz
const BASIS_SLUG = argWert("--basis-slug", "wee-v3-fein"); // Slug-Praefix (--alle)

/** ".", "" → "index"; "bildung/aquaponik" → "bildung-aquaponik" (wie freeze-seite.mjs). */
function seiteZuSlug(seite) {
  const s = (seite || "").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  return s === "" ? "index" : s.replace(/\//g, "-");
}

/** Ziel-Slug einer Seite fuer den --alle-Crawl: Startseite → BASIS_SLUG,
 *  Unterseite → „<BASIS_SLUG>-<unterpfad>" (bildung → wee-v3-fein-bildung). */
function slugFuerSeite(seite) {
  const teil = seiteZuSlug(seite);
  return teil === "index" ? BASIS_SLUG : `${BASIS_SLUG}-${teil}`;
}

const FREEZE_SLUG = seiteZuSlug(SEITE);
/* Ziel-Slug = eigener Test-Slug, NIE „wee-website-v3" (die bestehende Seite nie
   ueberschreiben — der Umstieg passiert erst nach Leons Abnahme).
   Flag: --slug (wie scripts/import-ben.mjs und der Abnahme-/Verify-Befehl) ist die
   primaere Form; --ziel-slug bleibt als Rueckwaerts-Kompat-Alias erhalten. So
   trifft „--seite . --slug verify-i4" genau die Ziel-Seite „verify-i4". */
const ZIEL_SLUG = argWert(
  "--slug",
  argWert("--ziel-slug", FREEZE_SLUG === "index" ? "wee-v3-fein" : `wee-v3-fein-${FREEZE_SLUG}`),
);

/* ------------------------------------------------------------------ */
/* Strikte Argument-Pruefung (I6-Fix, gegen den Ueberschreib-Nebenbefund) */
/* ------------------------------------------------------------------ */

/* Bekannte Flags. GRUND: argWert/argFlag ignorieren jeden nicht erkannten Flag
   STILL — ein Tippfehler wie „--slug-praefix" (statt „--basis-slug") wurde damit
   wortlos verschluckt, worauf --alle mit dem Default-Basis-Slug „wee-v3-fein" lief
   und bereits vorhandene, NICHT test-praefigierte Seiten ueberschrieb. Deshalb:
   unbekannte Flags (und Wert-Flags ohne Wert) fuehren jetzt zu HARTEM Abbruch,
   BEVOR irgendetwas gefroren/gespeichert/geleert wird. */
const WERT_FLAGS = new Set([
  "--seite", "--ordner", "--modell", "--erwartet-gespeichert",
  "--basis-slug", "--slug", "--ziel-slug",
]);
const BOOL_FLAGS = new Set([
  "--kein-freeze", "--kein-css", "--neu", "--alle", "--json", "--keine-leerung",
]);

/** Prueft die CLI-Argumente streng: unbekannte Flags und Wert-Flags ohne folgenden
 *  Wert brechen mit Exit 2 (Usage-Konvention) ab. So kann ein vertippter/veralteter
 *  Flag-Name NICHT mehr still auf einen destruktiven Default zurueckfallen. */
function pruefeArgumente() {
  const args = process.argv.slice(2);
  const unbekannt = [];
  const ohneWert = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (WERT_FLAGS.has(a)) {
      const naechste = args[i + 1];
      /* Ein Wert darf nicht fehlen und nicht selbst ein Flag sein (--slug --json
         wuerde sonst „--json" als Slug nehmen). */
      if (naechste === undefined || naechste.startsWith("--")) ohneWert.push(a);
      else i++; // Wert ueberspringen
      continue;
    }
    if (BOOL_FLAGS.has(a)) continue;
    if (a.startsWith("--")) unbekannt.push(a);
    /* sonst: freistehender Positions-Wert — hier nicht erwartet, wird ignoriert. */
  }
  if (unbekannt.length === 0 && ohneWert.length === 0) return;
  if (unbekannt.length > 0) console.error(`✗ Unbekannte(s) Argument(e): ${unbekannt.join(", ")}`);
  if (ohneWert.length > 0) console.error(`✗ Wert-Flag ohne Wert: ${ohneWert.join(", ")}`);
  console.error(`  Bekannte Flags: ${[...WERT_FLAGS, ...BOOL_FLAGS].sort().join(" ")}`);
  console.error(`  (Der Slug-Praefix fuer --alle heisst „--basis-slug", die Einzel-Ziel-Seite „--slug".)`);
  console.error(`  Kein stilles Ignorieren — sonst liefe --alle mit dem Default-Basis-Slug`);
  console.error(`  „wee-v3-fein" und ueberschriebe fremde Seiten.`);
  process.exit(2);
}

pruefeArgumente();

/** Menschliche Fortschrittsausgabe. Im --json-Modus nach stderr, damit stdout
 *  ausschliesslich das Aggregat-JSON traegt (fuer Aufrufer, die es parsen). */
function log(...args) {
  if (JSON_MODUS) console.error(...args);
  else console.log(...args);
}

/* ------------------------------------------------------------------ */
/* Kindprozesse (Freeze, Segmentierung)                                */
/* ------------------------------------------------------------------ */

function laufeSkript(skript, args) {
  /* Im --json-Modus die Kindprozess-STDOUT auf unsere stderr umleiten (fd 2),
     damit unser stdout sauber das Aggregat-JSON traegt; sonst normal erben. */
  const stdio = JSON_MODUS ? ["inherit", 2, "inherit"] : "inherit";
  const r = spawnSync(process.execPath, [join(HIER, skript), ...args], { stdio });
  return r.status === 0;
}

/* ------------------------------------------------------------------ */
/* Datei-Sammlung + Aufloesung (wie import-ben.mjs)                     */
/* ------------------------------------------------------------------ */

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
  const s = src.split("#")[0].split("?")[0].trim();
  return s.replace(/^\.\//, "").replace(/^\/+/, "");
}

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
  png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
};
function bildMime(name) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return BILD_MIME[ext] ?? null;
}

/* Schritt V: MIME fuer die in CSS referenzierten Fonts/Medien — passt exakt auf
   die enge Endung↔MIME-Whitelist von /api/import/asset (FONT_MIME/MEDIEN_MIME). */
const ASSET_MIME = {
  ...BILD_MIME,
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
};
function assetMime(name) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return ASSET_MIME[ext] ?? null;
}

async function post(pfad, body) {
  let res;
  try {
    res = await fetch(`${BASIS}${pfad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* Server nicht erreichbar → status 0 (statt uncaught). */
    return { status: 0, json: null };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* Nicht-JSON: json bleibt null. */
  }
  return { status: res.status, json };
}

/** Preflight: laeuft der Dev-Server (fuer /api/import/asset + /api/puck-seite/speichere)? */
async function serverErreichbar() {
  try {
    /* POST, nicht GET: die Seiten-Routen existieren wegen output:"export"
       (GET-Prerender-Zwang) NUR als POST — ein GET meldet 405 und liesse
       den lebenden Server faelschlich als tot erscheinen. */
    const res = await fetch(`${BASIS}/api/puck-seite/liste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ladeAssetHoch(slug, name, dataUrl) {
  const r = await post("/api/import/asset", { slug, name, dataUrl });
  return r.status === 200 && typeof r.json?.url === "string" ? r.json.url : null;
}

/* I6: Asset-Ordner eines Slugs REVERSIBEL leeren (Waisen-Vermeidung vor Re-Import).
   Gibt {geleert, dateien, verschobenNach} zurueck (oder null bei Fehler). */
async function leereAssets(slug) {
  const r = await post("/api/import/asset", { aktion: "leeren", slug });
  return r.status === 200 ? r.json : null;
}

/* I6: alle out/**\/index.html eines Ordners entdecken → Seitenpfade (".",
   "bildung", "bildung/aquaponik", …), Startseite zuerst, danach alphabetisch. */
async function entdeckeSeiten(wurzel) {
  const map = await sammleDateien(wurzel);
  const seiten = [];
  for (const rel of map.keys()) {
    if (!/(^|\/)index\.html?$/i.test(rel)) continue;
    const dir = rel.replace(/(^|\/)index\.html?$/i, "");
    seiten.push(dir === "" ? "." : dir);
  }
  seiten.sort((a, b) => {
    if (a === ".") return -1;
    if (b === ".") return 1;
    return a.localeCompare(b);
  });
  return seiten;
}

/* ------------------------------------------------------------------ */
/* Schritt V: CSS-url()-Reparatur (Fonts/Medien) — M7                   */
/* ------------------------------------------------------------------ */

/**
 * Loest die lokalen url()-Verweise (Fonts/Bilder/Medien) einer CSS-Datei auf,
 * kopiert die Dateien nach public/import/<slug>/ (via /api/import/asset) und
 * rebased die Pfade im CSS-Text (AST, rein — s. lib/import/css-rewrite.ts).
 *   text     Roh-CSS.
 *   basisDir Verzeichnis der CSS-Datei relativ zur Ordnerwurzel ("" = Wurzel).
 *   flags    wird bei fehlenden/fehlgeschlagenen Assets ergaenzt.
 * Gibt den umgeschriebenen CSS-Text + Zahl der kopierten Assets zurueck.
 */
async function reparierCssUrls(text, basisDir, fileMap, flags, slug) {
  const refs = sammleCssAssets(text, basisDir);
  if (refs.length === 0) return { css: text, kopiert: 0 };
  const urlMap = {};
  let kopiert = 0;
  for (const ref of refs) {
    const abs = findePfad(fileMap, ref.pfad);
    if (!abs) {
      flags.push({ grund: "CSS-Asset nicht gefunden", detail: ref.rohUrl });
      continue;
    }
    const mime = assetMime(ref.name);
    if (!mime) {
      flags.push({ grund: "CSS-Asset-Endung nicht erlaubt", detail: ref.rohUrl });
      continue;
    }
    const daten = await readFile(abs);
    const dataUrl = `data:${mime};base64,${daten.toString("base64")}`;
    const url = await ladeAssetHoch(slug, ref.name, dataUrl);
    if (url) {
      urlMap[ref.rohUrl] = url;
      kopiert++;
    } else {
      flags.push({ grund: "CSS-Asset-Upload fehlgeschlagen", detail: ref.rohUrl });
    }
  }
  const { css } = schreibeCssUrls(text, urlMap);
  return { css, kopiert };
}

/* ------------------------------------------------------------------ */
/* CSS-je-Baustein (juice, GRACEFUL)                                    */
/* ------------------------------------------------------------------ */

/** Sammelt die aufzuloesende CSS: same-origin <link rel=stylesheet> aus dem
 *  out/-Ordner + Inhalt aller <style>-Bloecke der Freeze-HTML. */
async function sammleCss(freezeHtml, fileMap) {
  const doc = new DOMParser().parseFromString(freezeHtml, "text/html");
  const teile = [];
  for (const l of Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))) {
    const href = l.getAttribute("href") ?? "";
    if (!href || /^(https?:)?\/\//i.test(href)) continue; // nur same-origin
    const abs = findePfad(fileMap, href);
    if (!abs) continue;
    try {
      teile.push(await readFile(abs, "utf-8"));
    } catch {
      /* Datei nicht lesbar → ueberspringen (juice bekommt sie dann nicht). */
    }
  }
  for (const s of Array.from(doc.querySelectorAll("style"))) {
    const t = (s.textContent ?? "").trim();
    if (t) teile.push(t);
  }
  return teile.join("\n");
}

/** Prueft, ob zwei HTML-Fassungen dieselbe Outline (ref-Folge) ergeben — nur
 *  dann ist das Inlining ref-sicher (die Segmentierung passt weiter). */
function outlineGleich(htmlA, htmlB) {
  const a = baueOutline(htmlA).knoten;
  const b = baueOutline(htmlB).knoten;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].ref !== b[i].ref || a[i].tag !== b[i].tag) return false;
  }
  return true;
}

/** Inliniert die aufgeloeste CSS als style-Attribute (juice). Gibt bei Erfolg die
 *  gejuicete HTML zurueck, sonst die Original-HTML + einen Grund fuer den Bericht. */
async function inlineCss(freezeHtml, fileMap) {
  if (KEIN_CSS) return { html: freezeHtml, hinweis: "übersprungen (--kein-css)" };
  let juice;
  try {
    juice = (await import("juice")).default;
  } catch {
    return { html: freezeHtml, hinweis: "übersprungen (juice nicht installiert)" };
  }
  const extraCss = await sammleCss(freezeHtml, fileMap);
  let gejuiced;
  try {
    gejuiced = juice(freezeHtml, {
      extraCss,
      applyStyleTags: true,
      applyLinkTags: false, // KEIN Netz-Fetch — CSS kommt via extraCss
      removeStyleTags: false, // <style>/<link> im <head> bleiben (Stylesheet-Uebernahme + Buehnen-Scoping)
      removeLinkTags: false,
      preserveMediaQueries: true,
      preserveImportant: true,
    });
  } catch (fehler) {
    return { html: freezeHtml, hinweis: `übersprungen (juice-Fehler: ${fehler?.message ?? fehler})` };
  }
  if (!outlineGleich(freezeHtml, gejuiced)) {
    return { html: freezeHtml, hinweis: "übersprungen (Inlining veränderte die Outline — ref-Drift vermieden)" };
  }
  const vorher = (freezeHtml.match(/style="/g) || []).length;
  const nachher = (gejuiced.match(/style="/g) || []).length;
  return { html: gejuiced, hinweis: `aktiv (style-Attribute ${vorher} → ${nachher})` };
}

/* ------------------------------------------------------------------ */
/* Ablauf                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fuehrt die feine Import-Pipeline fuer GENAU EINE Seite aus (Freeze →
 * Segmentierung → CSS-Inlining → Mapping → Asset-Aufraeumung → Asset-Aufloesung
 * → Speichern) und gibt ein strukturiertes Ergebnis zurueck. Von main() sowohl
 * fuer den Einzel- als auch fuer den --alle-Lauf verwendet; die E4-Route liest
 * das nebenbei geschriebene .freeze-out/<zielSlug>.import.json.
 *
 * @param {object} opts
 * @param {string} opts.seite     Seiten-Pfad (".", "bildung", "bildung/aquaponik").
 * @param {string} opts.zielSlug  Ziel-Seiten-/Asset-Slug.
 * @param {Map<string,string>} opts.fileMap  Ordner-Inhalt (rel → abs), einmal gesammelt.
 * @param {string|null} [opts.erwartetGespeichert]  optionaler Konfliktschutz.
 * @returns {Promise<object>} Ergebnis-Objekt (ok, statistik, flags, gespeichert, …).
 */
async function importiereSeite({ seite, zielSlug, fileMap, erwartetGespeichert = null }) {
  const freezeSlug = seiteZuSlug(seite);
  const htmlPfad = join(FREEZE_ORDNER, `${freezeSlug}.html`);
  const segPfad = join(FREEZE_ORDNER, `${freezeSlug}.segmentierung.json`);
  const seiteLabel = seite === "." || seite === "" ? "(Startseite)" : seite;

  const scheitere = (fehler) => {
    const ergebnis = { ok: false, seite: seiteLabel, freezeSlug, zielSlug, fehler };
    schreibeErgebnis(zielSlug, ergebnis);
    return ergebnis;
  };

  log(`\n── Seite „${seiteLabel}" → Freeze-Slug „${freezeSlug}" → Ziel „${zielSlug}" ──`);

  /* --- (I1) FREEZE --- */
  if (KEIN_FREEZE && existsSync(htmlPfad)) {
    log(`[I1] Freeze übersprungen (--kein-freeze) — nutze ${htmlPfad}`);
  } else if (!KEIN_FREEZE) {
    log(`[I1] Freeze …`);
    if (!laufeSkript("freeze-seite.mjs", ["--ordner", ORDNER, "--seite", seite])) {
      return scheitere("Freeze fehlgeschlagen");
    }
  } else if (!existsSync(htmlPfad)) {
    return scheitere(`--kein-freeze gesetzt, aber ${htmlPfad} fehlt`);
  }

  /* --- (I3) SEGMENTIERUNG --- */
  log(`[I3] Segmentierung …`);
  const segArgs = ["--slug", freezeSlug, "--modell", MODELL];
  if (CACHE_NEU) segArgs.push("--neu");
  if (!laufeSkript("segmentiere-gemma.mjs", segArgs)) {
    return scheitere("Segmentierung fehlgeschlagen");
  }
  if (!existsSync(segPfad)) return scheitere(`Segmentierung fehlt: ${segPfad}`);

  const freezeHtml = await readFile(htmlPfad, "utf-8");
  const segErgebnis = JSON.parse(await readFile(segPfad, "utf-8"));

  /* --- CSS-je-Baustein (juice, graceful) --- */
  const { html: mappingHtml, hinweis: cssHinweis } = await inlineCss(freezeHtml, fileMap);
  log(`[CSS] Inlining: ${cssHinweis}`);

  /* --- (I4) MAPPING (fein) + Vergleich zum groben Fallback --- */
  const grob = htmlZuPuck(freezeHtml, { idPraefix: zielSlug, styleUebernehmen: true });
  const bericht = htmlZuPuckMitSegmentierung(
    mappingHtml,
    { sektionen: segErgebnis.sektionen },
    { idPraefix: zielSlug, styleUebernehmen: true },
  );
  const flags = [...bericht.flags];

  log(`[I4] Statistik grob→fein  Sektionen ${grob.statistik.sektionen}→${bericht.statistik.sektionen} · Texte ${grob.statistik.texte}→${bericht.statistik.texte} · Bilder ${grob.statistik.bilder}→${bericht.statistik.bilder} · HTML-Bloecke ${grob.statistik.htmlBloecke}→${bericht.statistik.htmlBloecke}`);

  /* --- Asset-Aufraeumung (I6, reversibel): alten Asset-Ordner leeren, damit
     Waisen aus einem frueheren Import dieses Slugs nicht liegen bleiben. --- */
  let assetsGeleert = null;
  if (!KEINE_LEERUNG) {
    assetsGeleert = await leereAssets(zielSlug);
    if (assetsGeleert?.geleert) {
      log(`[I6] Asset-Ordner geleert: ${assetsGeleert.dateien} Eintrag/Eintraege → ${assetsGeleert.verschobenNach}`);
    }
  }

  /* --- Bilder aufloesen (wie import-ben.mjs) --- */
  const ersatz = {};
  const htmlErsatz = {};
  let bilderData = 0;
  let bilderKopiert = 0;
  for (const { id, src, quelle } of bericht.bilder) {
    if (/^(data:|https?:)/i.test(src)) {
      flags.push({ grund: "Externes Bild belassen", detail: src });
      continue;
    }
    const abs = findePfad(fileMap, src);
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
    if (quelle === "html") {
      const url = await ladeAssetHoch(zielSlug, name, b64);
      if (url) { htmlErsatz[src] = url; bilderKopiert++; }
      else flags.push({ grund: "Bild-Upload fehlgeschlagen", detail: src });
    } else if (daten.length < DATAURL_MAX) {
      ersatz[id] = b64;
      bilderData++;
    } else {
      const url = await ladeAssetHoch(zielSlug, name, b64);
      if (url) { ersatz[id] = url; bilderKopiert++; }
      else flags.push({ grund: "Bild-Upload fehlgeschlagen", detail: src });
    }
  }
  const data = ersetzeBildQuellen(bericht.data, ersatz, htmlErsatz);

  /* --- Styles uebernehmen + Schritt V: url()-Reparatur (Fonts/Medien) --- */
  const styles = [];
  let cssAssetsKopiert = 0;
  for (const href of bericht.stylesheets) {
    const abs = findePfad(fileMap, href);
    if (!abs) { flags.push({ grund: "Stylesheet nicht gefunden", detail: href }); continue; }
    const roh = await readFile(abs, "utf-8");
    const rel = normalisiereSrc(href);
    const basisDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const { css: text, kopiert } = await reparierCssUrls(roh, basisDir, fileMap, flags, zielSlug);
    cssAssetsKopiert += kopiert;
    const name = (rel.split("/").pop() ?? "stil.css").trim() || "stil.css";
    const url = await ladeAssetHoch(zielSlug, name, `data:text/css;base64,${Buffer.from(text, "utf-8").toString("base64")}`);
    if (url) styles.push(url);
    else flags.push({ grund: "Stylesheet-Upload fehlgeschlagen", detail: href });
  }
  if (bericht.inlineStyles.length > 0) {
    const zusammen = bericht.inlineStyles.join("\n\n");
    const { css: text, kopiert } = await reparierCssUrls(zusammen, "", fileMap, flags, zielSlug);
    cssAssetsKopiert += kopiert;
    const url = await ladeAssetHoch(zielSlug, `${zielSlug}-inline.css`, `data:text/css;base64,${Buffer.from(text, "utf-8").toString("base64")}`);
    if (url) styles.push(url);
    else flags.push({ grund: "Stylesheet-Upload fehlgeschlagen", detail: "Inline-<style>-Sammeldatei" });
  }

  /* --- Speichern (Test-Slug, Re-Import = Ueberschreiben) --- */
  const speichern = await post("/api/puck-seite/speichere", {
    name: zielSlug,
    data,
    ueberschreibe: true,
    ...(styles.length > 0 ? { styles } : {}),
    ...(erwartetGespeichert ? { erwartetGespeichert } : {}),
  });

  const dedup = dedupFlags(flags);
  if (speichern.status !== 200) {
    log(`✗ Speichern fehlgeschlagen (HTTP ${speichern.status}): ${JSON.stringify(speichern.json)}`);
    return scheitere(`Speichern fehlgeschlagen (HTTP ${speichern.status})`);
  }

  log(`✓ Gespeichert: ${speichern.json?.pfad} (${speichern.json?.contentAnzahl} Bausteine) · Bilder ${bilderData}+${bilderKopiert} · Styles ${styles.length} (+${cssAssetsKopiert} Assets) · Flags ${dedup.length}`);

  const ergebnis = {
    ok: true,
    seite: seiteLabel,
    freezeSlug,
    zielSlug,
    modus: segErgebnis.modus,
    modell: segErgebnis.modell ?? null,
    framework: bericht.framework.typ,
    statistik: bericht.statistik,
    statistikGrob: grob.statistik,
    cssInlining: cssHinweis,
    bilderEingebettet: bilderData,
    bilderKopiert,
    styles: styles.length,
    cssAssetsKopiert,
    assetsGeleert,
    flags: dedup,
    gespeichert: speichern.json?.gespeichert ?? null,
    pfad: speichern.json?.pfad ?? null,
    contentAnzahl: speichern.json?.contentAnzahl ?? null,
  };
  schreibeErgebnis(zielSlug, ergebnis);
  return ergebnis;
}

/** Legt das Maschinen-Ergebnis einer Seite unter .freeze-out/<slug>.import.json
 *  ab — daraus liest die E4-Route den Bericht (statt stdout zu parsen). */
function schreibeErgebnis(zielSlug, ergebnis) {
  try {
    writeFileSync(join(FREEZE_ORDNER, `${zielSlug}.import.json`), JSON.stringify(ergebnis, null, 2), "utf-8");
  } catch {
    /* Nicht kritisch — der Rueckgabewert bleibt die primaere Quelle. */
  }
}

async function main() {
  const fileMap = await sammleDateien(resolve(ORDNER));

  /* --- Preflight: ohne Dev-Server kann nicht aufgeloest/gespeichert werden. --- */
  if (!(await serverErreichbar())) {
    console.error(`✗ Dev-Server ${BASIS} nicht erreichbar — Abbruch (Freeze/Segmentierung sind gecacht, wiederholbar).`);
    process.exit(1);
  }

  /* Zu importierende Seiten bestimmen: --alle = Crawl, sonst die eine --seite. */
  let jobs;
  if (ALLE) {
    const seiten = await entdeckeSeiten(resolve(ORDNER));
    log(`Feiner Import (--alle) → ${seiten.length} Seite(n) aus ${ORDNER}, Basis-Slug „${BASIS_SLUG}"`);
    jobs = seiten.map((seite) => ({ seite, zielSlug: slugFuerSeite(seite) }));
  } else {
    log(`Feiner Import → Seite „${SEITE}" → Ziel-Seite „${ZIEL_SLUG}"`);
    jobs = [{ seite: SEITE, zielSlug: ZIEL_SLUG }];
  }

  const ergebnisse = [];
  for (const job of jobs) {
    /* erwartetGespeichert nur im Einzel-Lauf durchreichen (der --alle-Crawl legt
       frische/ueberschriebene Test-Slugs an — dort waere ein Stand-Abgleich sinnlos). */
    const erwartet = ALLE ? null : ERWARTET;
    ergebnisse.push(await importiereSeite({ ...job, fileMap, erwartetGespeichert: erwartet }));
  }

  const ok = ergebnisse.filter((e) => e.ok).length;
  const fehler = ergebnisse.length - ok;
  log(`\n══ Fertig: ${ok} gespeichert, ${fehler} fehlgeschlagen ══`);
  if (ALLE && ok > 0) {
    log(`  Hinweis: interne Links ZWISCHEN den Seiten sind noch NICHT auf die neuen`);
    log(`  Slugs umgebogen (bewusst spaeter, s. Dateikopf/lens-import.md §3-Schritt-VI).`);
  }

  /* Maschinen-Aggregat fuer Aufrufer (E4-Route liest primaer die Einzel-Dateien). */
  if (JSON_MODUS) {
    process.stdout.write(JSON.stringify({ ok: fehler === 0, seiten: ergebnisse }) + "\n");
  }
  if (fehler > 0) process.exit(1);
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
