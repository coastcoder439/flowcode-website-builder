/*
 * scripts/buehne-schreiben.mjs — I8/M8: erzeugt die LEBENDIGE Bühnen-Fassung
 * public/import/<ziel>/buehne.html aus der gefrorenen Render-HTML.
 * Spec: docs/plan-analyse/lens-import.md §2-Ziel (M8), docs/editor-vereinheitlichung.md §11.
 *
 * ROLLE IN DER KETTE: der feine Import (import-fein.mjs) friert die Seite ein
 * (.freeze-out/<slug>.html) und segmentiert sie zu Puck-Bausteinen (für den BAU).
 * Diese Fassung hier ist die BÜHNE (fürs Ansehen im Animator): die eingefrorene
 * Original-Seite, SELF-CONTAINED gemacht, damit sie in einer same-origin-iframe
 * ohne die Next.js-Assets läuft (der Dev-Server serviert nur die Builder-public/,
 * nicht Bens out/). Konkret:
 *
 *   1. <link rel=stylesheet> (lokal) → <style> mit dem Datei-Inhalt (aus out/),
 *      url()-Verweise darin als data:-URI eingebettet (Fonts/Hintergründe).
 *   2. <style>-Blöcke: url() ebenfalls eingebettet.
 *   3. <img src> (lokal) → data:-URI (Bilder self-contained).
 *   4. <script> ENTFERNT: ein nacktes iframe kann die Next.js-Chunks nicht
 *      ausführen; die Entrance-Animationen sind bereits in ihren sichtbaren
 *      Endzustand gefroren (freeze-seite.mjs treibt getAnimations().finish()).
 *      CSS-@keyframes/-transitions bleiben erhalten und laufen beim Laden live.
 *   5. data-og-id/-typ auf Landmarks, Überschriften und Bilder injiziert, damit
 *      der OG-Anker-Mechanismus (WebsiteOg/GrafikLayer) die Bühne wie die native
 *      Landing scannen/markieren kann (list-basierte Auswahl + Overlay + „In den
 *      Builder holen").
 *   6. <base target="_blank"> vorangestellt (Links öffnen neues Tab statt die
 *      iframe wegzunavigieren).
 *
 * EHRLICHE GRENZE (dokumentiert, keine Abkürzung verkauft): JS-getriebene
 * (motion/WAAPI) Entrance-Animationen laufen in dieser Fallback-Fassung NICHT
 * erneut ab — sie sind auf ihren Endzustand gefroren (sichtbar, korrekt gelayoutet,
 * echte Fonts/Bilder). Die voll-lebendige Fassung MIT JS-Wiederholung ist der
 * Service-Worker-Ordnermodus (ordner-serve.ts), sofern ein FS-Handle vorliegt —
 * DIESE buehne.html ist der Fallback ohne Handle (lens-import.md §2).
 *
 * CLI:
 *   node scripts/buehne-schreiben.mjs                       (Slug „index" → Ziel „wee-v3-fein")
 *   node scripts/buehne-schreiben.mjs --slug bildung --ziel wee-v3-fein-bildung
 *   node scripts/buehne-schreiben.mjs --ordner test-sites/wee-website-v3/out
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Window } from "happy-dom";

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_ORDNER = join(HIER, ".freeze-out");
const DEFAULT_OUT = resolve(HIER, "..", "test-sites", "wee-website-v3", "out");
const PUBLIC_IMPORT = resolve(HIER, "..", "public", "import");

/* Freeze-Viewport (muss zu freeze-seite.mjs VIEWPORT passen): die Geometrie, in
   der der Endzustand gerendert+gefroren wurde. Höhen-Viewport-Einheiten der Bühne
   werden auf DIESE Höhe fixiert — s. neutralisiereViewportHoehe(). */
const FREEZE_VIEWPORT = { width: 1440, height: 900 };

/* data:-Grenze: sehr große Assets (>2 MB) NICHT einbetten — sonst wird die
   Bühnen-Datei unhandlich. Solche Verweise bleiben als absoluter Pfad stehen
   (best effort; im Zweifel fehlt ein Riesenbild, die Bühne bleibt aber nutzbar). */
const DATAURL_MAX = 2 * 1024 * 1024;

const MIME = {
  css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  otf: "font/otf", eot: "application/vnd.ms-fontobject", mp4: "video/mp4",
};

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function mimeVon(pfad) {
  const ext = (pfad.split(".").pop() ?? "").toLowerCase().split(/[?#]/)[0];
  return MIME[ext] ?? null;
}

/** Löst einen absoluten out/-Pfad („/_next/static/…", „/images/…") ODER einen
 *  relativen (gegen basisDir) auf einen Datei-Pfad in out/ auf. */
function outPfad(wurzel, roh, basisDir) {
  const clean = roh.split(/[?#]/)[0].trim();
  if (clean.startsWith("/")) return join(wurzel, clean.slice(1));
  return join(wurzel, basisDir, clean);
}

/** Datei → data:-URI (oder null bei Fehler/zu groß/unbekanntem MIME). */
async function alsDataUri(dateiPfad) {
  const mime = mimeVon(dateiPfad);
  if (!mime) return null;
  let daten;
  try {
    daten = await readFile(dateiPfad);
  } catch {
    return null;
  }
  if (daten.length > DATAURL_MAX) return null;
  return `data:${mime};base64,${daten.toString("base64")}`;
}

/** Ersetzt url(...)-Verweise in CSS durch data:-URIs (Fonts/Hintergründe).
 *  basisDir = Verzeichnis der CSS-Datei relativ zur out/-Wurzel. */
async function cssUrlsEinbetten(css, wurzel, basisDir) {
  const treffer = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  let ergebnis = css;
  const ersetzt = new Map();
  for (const m of treffer) {
    const roh = m[2];
    if (/^(data:|https?:|#)/i.test(roh)) continue;
    if (ersetzt.has(roh)) continue;
    const dataUri = await alsDataUri(outPfad(wurzel, roh, basisDir));
    if (dataUri) ersetzt.set(roh, dataUri);
  }
  for (const [roh, dataUri] of ersetzt) {
    ergebnis = ergebnis.split(`url(${roh})`).join(`url(${dataUri})`);
    ergebnis = ergebnis.split(`url("${roh}")`).join(`url("${dataUri}")`);
    ergebnis = ergebnis.split(`url('${roh}')`).join(`url('${dataUri}')`);
  }
  return ergebnis;
}

/* ------------------------------------------------------------------ */
/* Viewport-HÖHEN-Einheiten → px (Runaway-Fix, I8-FIX-RUNDE)            */
/* ------------------------------------------------------------------ */

/*
 * PROBLEM (I8-FIX): Die Bühne wird als VOLL-HÖHE-iframe gerendert
 * (Backdrop.tsx: iframe.style.height = contentDocument.scrollHeight). In der
 * gefrorenen Original-Seite steht mindestens ein scrollytelling-Treiber
 * `<div class="tc-driver--active" style="height:300vh">`. Im iframe ist `vh`
 * relativ zur EIGENEN iframe-Höhe → sobald die iframe wächst, wächst das
 * 300vh-Element mit → scrollHeight steigt → ResizeObserver setzt größere Höhe →
 * Rückkopplung bis zur Chromium-Obergrenze (2^25 px). Der Treiber ist ohnehin
 * TOTES Layout: sein JS-Treiber wurde in Schritt (4) entfernt, er kann keine
 * Scroll-Animation mehr spielen.
 *
 * FIX: Höhen-abhängige Viewport-Einheiten (vh/svh/lvh/dvh + vmin/vmax, die die
 * Höhe mit einbeziehen können) werden auf px fixiert — und zwar auf die Höhe des
 * FREEZE-Viewports (900px), also exakt die Geometrie, in der die Seite gefroren
 * wurde. Damit ist die Bühne ein px-genauer Standbild-Schnitt bei 1440×900 —
 * stabil im Voll-Höhe-Modell, KEIN Feedback mehr. BREITEN-Einheiten (vw/svw/…)
 * bleiben unangetastet: die iframe-Breite ist stabil (= Host-Breite), kein
 * Runaway-Risiko; responsive Breite ist eher erwünscht.
 *
 * Bewusst konservativ auf CSS-Wert-Kontexte angewandt (Inline-`style`-Attribute
 * und <style>-Textinhalte über den DOM), NICHT als globaler String-Replace —
 * so kann keine data:-base64-Sequenz („…8vh…") fälschlich getroffen werden.
 */

/** n·Einheit → px anhand des Freeze-Viewports (Höhe 900, Breite 1440). */
const VIEWPORT_HOEHE_RE = /(-?\d*\.?\d+)(svh|lvh|dvh|vmin|vmax|vh)(?![a-z0-9])/gi;

function neutralisiereViewportHoehe(cssText) {
  if (!cssText || !/v(h|min|max)/i.test(cssText)) return cssText;
  const { width, height } = FREEZE_VIEWPORT;
  return cssText.replace(VIEWPORT_HOEHE_RE, (_ganz, zahl, einheit) => {
    const n = parseFloat(zahl);
    if (!Number.isFinite(n)) return _ganz;
    const e = einheit.toLowerCase();
    let basis;
    if (e === "vmin") basis = Math.min(width, height);
    else if (e === "vmax") basis = Math.max(width, height);
    else basis = height; // vh/svh/lvh/dvh — reine Höhe
    const px = Math.round(((n / 100) * basis) * 100) / 100;
    return `${px}px`;
  });
}

/** Inline-`style`-Attribute aufbereiten: (a) Höhen-Viewport-Einheiten → px
 *  (Runaway-Fix), (b) `url(...)`-Verweise als data:-URI einbetten. Punkt (b) ist
 *  nötig, weil cssUrlsEinbetten sonst NUR <style>-Blöcke und <link>-CSS abdeckt —
 *  Inline-`background-image: url(/images/…)` blieb un-eingebettet und lief in der
 *  Bühne als 404 (z. B. hero-home-valley.webp). basisDir="" → absolute out/-Pfade
 *  wie „/images/…" werden gegen die out/-Wurzel aufgelöst. Gibt Zähler zurück. */
async function fixeInlineStyles(doc, wurzel) {
  let vhFixes = 0;
  let urlFixes = 0;
  for (const el of [...doc.querySelectorAll("[style]")]) {
    const roh = el.getAttribute("style") ?? "";
    let neu = neutralisiereViewportHoehe(roh);
    if (neu !== roh) vhFixes++;
    if (neu.includes("url(")) {
      const eingebettet = await cssUrlsEinbetten(neu, wurzel, "");
      if (eingebettet !== neu) {
        urlFixes++;
        neu = eingebettet;
      }
    }
    if (neu !== roh) el.setAttribute("style", neu);
  }
  return { vhFixes, urlFixes };
}

/* ------------------------------------------------------------------ */
/* data-og-id-Injektion (Landmarks / Überschriften / Bilder)           */
/* ------------------------------------------------------------------ */

/** Taggt strukturelle Elemente der Bühne mit data-og-id/-typ — analog zur
 *  hand-getaggten nativen Landing (HomePageContent u.a.), hier automatisch:
 *  Landmarks/Sektionen → „sektion", <img> → „bild", h1–h3 → „text".
 *  Schema data-og-id = „buehne:<typ>-<n>" (nicht „puck:"/„og:") — WebsiteOg
 *  gruppiert unbekannte Präfixe unter dem ersten Segment. Gibt die Zahl der
 *  getaggten Elemente zurück. */
function taggeOgElemente(doc) {
  const body = doc.body;
  if (!body) return 0;
  let n = 0;
  const setze = (el, typ) => {
    if (el.getAttribute("data-og-id")) return;
    el.setAttribute("data-og-id", `buehne:${typ}-${++n}`);
    el.setAttribute("data-og-typ", typ);
  };
  for (const el of body.querySelectorAll("header, main, footer, section, article, aside")) {
    setze(el, "sektion");
  }
  for (const el of body.querySelectorAll("h1, h2, h3")) {
    if ((el.textContent ?? "").trim()) setze(el, "text");
  }
  for (const el of body.querySelectorAll("img")) {
    setze(el, "bild");
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Ablauf                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const slug = argWert("--slug", "index"); // Freeze-Basisname (.freeze-out/<slug>.html)
  const ziel = argWert("--ziel", slug === "index" ? "wee-v3-fein" : `wee-v3-fein-${slug}`);
  const wurzel = resolve(argWert("--ordner", DEFAULT_OUT));

  const freezePfad = join(FREEZE_ORDNER, `${slug}.html`);
  let roh;
  try {
    roh = await readFile(freezePfad, "utf-8");
  } catch {
    console.error(`✗ Freeze-HTML fehlt: ${freezePfad}`);
    console.error(`  Erst 'node scripts/freeze-seite.mjs --seite <…>' laufen lassen.`);
    process.exit(1);
  }

  const fenster = new Window({ url: "http://buehne.local/" });
  const doc = fenster.document;
  doc.documentElement.innerHTML = roh.replace(/^<!DOCTYPE[^>]*>/i, "");

  /* (1) <link rel=stylesheet> lokal → <style>. */
  let styleGezogen = 0;
  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"]')]) {
    const href = link.getAttribute("href") ?? "";
    if (!href || /^(https?:)?\/\//i.test(href)) continue;
    let css;
    try {
      css = await readFile(outPfad(wurzel, href, ""), "utf-8");
    } catch {
      continue;
    }
    const basisDir = href.replace(/^\//, "").split("/").slice(0, -1).join("/");
    css = neutralisiereViewportHoehe(css); // vor dem Einbetten (kein base64 im Weg)
    css = await cssUrlsEinbetten(css, wurzel, basisDir);
    const style = doc.createElement("style");
    style.setAttribute("data-buehne-inline", href);
    style.textContent = css;
    link.replaceWith(style);
    styleGezogen++;
  }

  /* (2) bestehende <style>-Blöcke: Viewport-Höhen fixieren + url() einbetten. */
  for (const style of [...doc.querySelectorAll("style")]) {
    if (style.getAttribute("data-buehne-inline")) continue; // gerade erzeugt
    let t = neutralisiereViewportHoehe(style.textContent ?? "");
    if (t.includes("url(")) t = await cssUrlsEinbetten(t, wurzel, "");
    style.textContent = t;
  }

  /* (2b) Inline-`style`-Attribute: Viewport-Höhen fixieren (der 300vh-Treiber
     steht als Inline-Style — DER Runaway-Auslöser) UND url() einbetten (sonst
     404, z. B. hero-home-valley.webp als Inline-background-image). */
  const inlineFixes = await fixeInlineStyles(doc, wurzel);

  /* (3) <img src> lokal → data:. */
  let bilder = 0;
  for (const img of [...doc.querySelectorAll("img")]) {
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(data:|https?:)/i.test(src)) continue;
    const dataUri = await alsDataUri(outPfad(wurzel, src, ""));
    if (dataUri) {
      img.setAttribute("src", dataUri);
      img.removeAttribute("srcset"); // srcset würde sonst den absoluten Pfad bevorzugen
      bilder++;
    }
  }

  /* (4) <script> entfernen + preload-<link as=script/style> (tote Verweise). */
  let skripte = 0;
  for (const s of [...doc.querySelectorAll("script")]) {
    s.remove();
    skripte++;
  }
  for (const l of [...doc.querySelectorAll('link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]')]) {
    l.remove();
  }

  /* (5) data-og-id-Injektion. */
  const getaggt = taggeOgElemente(doc);

  /* (6) <base target="_blank"> voranstellen. */
  const head = doc.querySelector("head");
  if (head) {
    const base = doc.createElement("base");
    base.setAttribute("target", "_blank");
    head.insertBefore(base, head.firstChild);
  }

  const ausgabe = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  const zielOrdner = join(PUBLIC_IMPORT, ziel);
  await mkdir(zielOrdner, { recursive: true });
  const zielPfad = join(zielOrdner, "buehne.html");
  await writeFile(zielPfad, ausgabe, "utf-8");

  const opacityNull = (ausgabe.match(/opacity:\s*0(?![.\d])/g) || []).length;
  console.log(`✓ Bühne geschrieben: ${zielPfad}`);
  console.log(`  Stylesheets inline: ${styleGezogen} · Bilder inline: ${bilder} · Scripts entfernt: ${skripte}`);
  console.log(`  Inline-Styles: Viewport-Höhen→px ${inlineFixes.vhFixes} (Runaway-Fix) · url()→data: ${inlineFixes.urlFixes} (404-Fix)`);
  console.log(`  data-og-id injiziert: ${getaggt} · Größe: ${(ausgabe.length / 1024).toFixed(0)} KB · opacity:0-Reste: ${opacityNull}`);
}

await main();
