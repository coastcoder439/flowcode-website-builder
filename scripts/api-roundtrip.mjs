/*
 * scripts/api-roundtrip.mjs — Smoke-Test der Autoren-API gegen den laufenden
 * Dev-Server (docs/agent-schnittstelle.md §5, Schritt 6b). Beweist die
 * Vertraege aus openapi.yaml: Status, Seiten-CRUD, Konflikt-409, Import
 * (dry-run-Default + echtes Schreiben), Registry-Gate, CSRF-Origin-Gate.
 *
 *   node scripts/api-roundtrip.mjs        (Dev-Server auf :3113 muss laufen)
 *
 * Exit 0 = alle Pruefungen gruen; Exit 1 = mindestens eine rot.
 */

import { readdir, unlink, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASIS = "http://127.0.0.1:3113";
const TEST_SEITE = "roundtrip-testseite";
const TEST_IMPORT = "roundtrip-import";
const TEST_ANIM = "roundtrip-anim";
const TEST_STYLES = "roundtrip-styles";
const TEST_PAPIERKORB = "roundtrip-papierkorb";

/* Verzeichnisse relativ zum Skript (nicht zum cwd), damit die fs-Aufraeumung
   den Papierkorb auch dann findet, wenn der Roundtrip aus einem Unterordner
   gestartet wird. Kein "hard delete"-Endpunkt existiert bewusst (U7/N2) — die
   Test-Reste im Papierkorb muessen deshalb per fs entfernt werden. */
const SEITEN_DIR = fileURLToPath(new URL("../seiten", import.meta.url));
const PAPIERKORB_DIR = join(SEITEN_DIR, ".papierkorb");
/* Ziel-Wurzel des Ordner-Exports (export/ der Projektwurzel, gitignored). Der
   Roundtrip liest das Geschriebene direkt per fs zurueck (es gibt bewusst keine
   Lese-Route) und raeumt seinen Test-Slug danach wieder ab. */
const EXPORT_DIR = fileURLToPath(new URL("../export", import.meta.url));
const TEST_EXPORT = "roundtrip-export";
/* Next-Build-Ordner: hier liegen die von next/font optimierten Schriften
   (.next/static/media/*.woff2), die der Ordner-Export ueber /_next/… kopieren
   koennen muss (uebernommene CSS verweist auf /_next/static/media/…). */
const NEXT_MEDIA_DIR = fileURLToPath(new URL("../.next/static/media", import.meta.url));

/** Entfernt Papierkorb-Dateien (und optionale wiederhergestellte Seiten) der
 *  Testlaeufe — nur exakt Praefix-<zeitstempel>, fremde Trash-Eintraege bleiben
 *  unberuehrt. */
async function raeumeTestReste(praefixe) {
  try {
    for (const f of await readdir(PAPIERKORB_DIR)) {
      if (praefixe.some((p) => f.startsWith(`${p}-`))) {
        await unlink(join(PAPIERKORB_DIR, f)).catch(() => {});
      }
    }
  } catch {
    /* Kein Papierkorb angelegt → nichts zu tun. */
  }
  /* eine ggf. wiederhergestellte Testseite direkt entfernen (kein Trash-Umweg). */
  await unlink(join(SEITEN_DIR, `${TEST_PAPIERKORB}.json`)).catch(() => {});
}

let gruen = 0;
let rot = 0;

function ok(name, bedingung, detail = "") {
  if (bedingung) {
    gruen++;
    console.log(`  ✓ ${name}`);
  } else {
    rot++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function post(pfad, body, extraHeaders = {}) {
  const res = await fetch(`${BASIS}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* Nicht-JSON-Antwort: json bleibt null, Status reicht den Pruefungen. */
  }
  return { status: res.status, json };
}

const beispielData = {
  root: {},
  content: [
    {
      type: "ShapeAccent",
      props: { id: "ShapeAccent-rt-1", variant: "blob-a", color: "green", position: "center", size: 200 },
    },
  ],
};

const beispielSetup = {
  name: TEST_IMPORT,
  gespeichert: "",
  meta: { viewportW: 1280, viewportH: 720, docH: 4000 },
  grafiken: [
    {
      id: "rt-grafik-1",
      name: "Roundtrip-Baum",
      src: "/curtain/trees/tree-1-0.png",
      art: "bild",
      breitePx: 180,
      z: 0,
      keyframes: [{ scrollY: 0, x: 300, y: 500, scale: 1, opacity: 1, rotation: 0 }],
    },
  ],
};

console.log(`API-Roundtrip gegen ${BASIS}\n`);

/* 1 — Status/Discovery */
{
  const r = await post("/api/builder/status");
  ok("status: 200", r.status === 200, `status=${r.status}`);
  ok("status: name korrekt", r.json?.name === "flowcode-website-builder");
  ok("status: komponentenTypen enthalten GrafikLayer", Array.isArray(r.json?.komponentenTypen) && r.json.komponentenTypen.includes("GrafikLayer"));
}

/* 2 — CSRF-Origin-Gate */
{
  const r = await post("/api/builder/status", undefined, { Origin: "http://boese.example" });
  ok("origin-gate: fremder Origin -> 403", r.status === 403, `status=${r.status}`);
  const r2 = await post("/api/builder/status", undefined, { Origin: "http://localhost:3113" });
  ok("origin-gate: eigener Origin -> 200", r2.status === 200, `status=${r2.status}`);
}

/* 3 — Seite speichern (neu) / laden / listen */
let gespeichertStand = "";
{
  const r = await post("/api/puck-seite/speichere", { name: TEST_SEITE, data: beispielData });
  ok("speichere (neu): 200", r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
  gespeichertStand = r.json?.gespeichert ?? "";

  const lade = await post("/api/puck-seite/lade", { name: TEST_SEITE });
  ok("lade: 200 + data identisch", lade.status === 200 && JSON.stringify(lade.json?.data?.content) === JSON.stringify(beispielData.content));

  const liste = await post("/api/puck-seite/liste");
  ok("liste: enthaelt Testseite", Array.isArray(liste.json?.seiten) && liste.json.seiten.some((s) => s.name === TEST_SEITE));
}

/* 4 — Konflikt-Modell */
{
  const blind = await post("/api/puck-seite/speichere", { name: TEST_SEITE, data: beispielData });
  ok("konflikt: blindes Ueberschreiben -> 409", blind.status === 409, `status=${blind.status}`);

  const mitStand = await post("/api/puck-seite/speichere", {
    name: TEST_SEITE,
    data: beispielData,
    erwartetGespeichert: gespeichertStand,
  });
  ok("konflikt: mit erwartetGespeichert -> 200", mitStand.status === 200, `status=${mitStand.status}`);
}

/* 5 — Registry-Gate */
{
  const r = await post("/api/puck-seite/speichere", {
    name: TEST_SEITE,
    data: { root: {}, content: [{ type: "GibtEsNicht", props: { id: "x" } }] },
    ueberschreibe: true,
  });
  ok("registry-gate: unbekannter Typ -> 400", r.status === 400 && /GibtEsNicht/.test(r.json?.fehler ?? ""), `status=${r.status}`);
}

/* 6 — Import Stufe A: dry-run-Default, dann echtes Schreiben */
{
  const dry = await post("/api/import/grafik-setup", { setup: beispielSetup });
  ok("import: dry-run ist Default", dry.status === 200 && dry.json?.dryRun === true, `status=${dry.status}`);
  ok("import: uebersetzt zu GrafikLayer", Array.isArray(dry.json?.typen) && dry.json.typen.includes("GrafikLayer"));

  const echt = await post("/api/import/grafik-setup", { setup: beispielSetup, dryRun: false, ueberschreibe: true });
  ok("import: dryRun=false schreibt", echt.status === 200 && typeof echt.json?.pfad === "string", `status=${echt.status} ${JSON.stringify(echt.json)}`);

  const lade = await post("/api/puck-seite/lade", { name: TEST_IMPORT });
  ok("import: geschriebene Seite ladbar + 1 Baustein", lade.status === 200 && lade.json?.data?.content?.length === 1);
}

/* 6b — Slot-Gate: rekursive Pruefung der Slot-Kinder (SektionBlock.kinder).
   Ein registrierter Container mit gueltigen Kindern -> 200; ein unbekannter
   Typ TIEF in einem Slot -> 400 (sonst verschluckt <Render> ihn still). */
{
  const gut = await post("/api/puck-seite/speichere", {
    name: TEST_SEITE,
    ueberschreibe: true,
    data: {
      root: {},
      content: [
        {
          type: "SektionBlock",
          props: {
            id: "sek-rt-1",
            hintergrund: "transparent",
            kinder: [
              { type: "TextBlock", props: { id: "txt-rt-1", text: "Hallo", variante: "h1" } },
              { type: "BildBlock", props: { id: "bild-rt-1", src: "/x.png", alt: "", breiteProzent: 100 } },
            ],
          },
        },
      ],
    },
  });
  ok("slot-gate: gueltige Slot-Kinder -> 200", gut.status === 200, `status=${gut.status} ${JSON.stringify(gut.json)}`);

  const boese = await post("/api/puck-seite/speichere", {
    name: TEST_SEITE,
    ueberschreibe: true,
    data: {
      root: {},
      content: [
        {
          type: "SektionBlock",
          props: {
            id: "sek-rt-2",
            hintergrund: "transparent",
            kinder: [{ type: "GibtEsNichtImSlot", props: { id: "z" } }],
          },
        },
      ],
    },
  });
  ok(
    "slot-gate: unbekannter Typ TIEF im Slot -> 400",
    boese.status === 400 && /GibtEsNichtImSlot/.test(boese.json?.fehler ?? ""),
    `status=${boese.status}`,
  );
}

/* 6c — Import-Asset-Endpunkt: Smoke ohne echtes Schreiben (Negativfaelle). */
{
  const ohneDaten = await post("/api/import/asset", { slug: "rt", name: "a.png" });
  ok("import/asset: fehlende dataUrl -> 400", ohneDaten.status === 400, `status=${ohneDaten.status}`);

  /* saubererName lehnt ":" hart ab (Windows-Laufwerk/Pfad) — echter
     Reject-Fall (ein blosses "../x" wuerde saubererName still zum Basisnamen
     kuerzen, also KEIN Ausbruch, aber auch kein 400). */
  const boeserSlug = await post("/api/import/asset", {
    slug: "c:evil",
    name: "a.png",
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  ok("import/asset: ungueltiger Slug (:) -> 400", boeserSlug.status === 400, `status=${boeserSlug.status}`);

  const keinBild = await post("/api/import/asset", {
    slug: "rt",
    name: "schad.exe",
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  ok("import/asset: Nicht-Bild-Endung -> 400", keinBild.status === 400, `status=${keinBild.status}`);
}

/* 6d — anim-Roundtrip (Welle 4c): Seite mit anim speichern, laden, anim zurueck.
   Dann: reiner Daten-Speichervorgang OHNE anim erhaelt das anim (nicht loeschen). */
{
  const beispielAnimGrafik = {
    id: "rt-anim-1",
    name: "Anim-Grafik",
    src: "/curtain/trees/tree-1-0.png",
    art: "bild",
    breitePx: 200,
    z: 1,
    keyframes: [{ scrollY: 0, x: 100, y: 200, scale: 1, opacity: 1, rotation: 0, ankerId: "puck:x" }],
  };
  const mitAnim = await post("/api/puck-seite/speichere", {
    name: TEST_ANIM,
    data: beispielData,
    anim: { grafiken: [beispielAnimGrafik], uebernommen: [] },
  });
  ok("anim: speichern mit anim -> 200", mitAnim.status === 200, `status=${mitAnim.status} ${JSON.stringify(mitAnim.json)}`);
  const stand = mitAnim.json?.gespeichert ?? "";

  const geladen = await post("/api/puck-seite/lade", { name: TEST_ANIM });
  ok(
    "anim: laden liefert anim.grafiken zurueck",
    geladen.status === 200 && geladen.json?.anim?.grafiken?.[0]?.id === "rt-anim-1",
    `status=${geladen.status} ${JSON.stringify(geladen.json?.anim)}`,
  );

  const boese = await post("/api/puck-seite/speichere", {
    name: TEST_ANIM,
    data: beispielData,
    ueberschreibe: true,
    anim: { grafiken: [{ id: "kaputt" }] },
  });
  ok("anim: unvollstaendige Grafik -> 400", boese.status === 400, `status=${boese.status}`);

  const ohneAnim = await post("/api/puck-seite/speichere", {
    name: TEST_ANIM,
    data: beispielData,
    erwartetGespeichert: stand,
  });
  ok("anim: Speichern ohne anim -> 200", ohneAnim.status === 200, `status=${ohneAnim.status}`);
  const nachOhne = await post("/api/puck-seite/lade", { name: TEST_ANIM });
  ok(
    "anim: bleibt nach anim-losem Speichern erhalten",
    nachOhne.status === 200 && nachOhne.json?.anim?.grafiken?.[0]?.id === "rt-anim-1",
    `anim=${JSON.stringify(nachOhne.json?.anim)}`,
  );
}

/* 6e — styles-Roundtrip (Welle 5a): Seite mit styles speichern, laden, styles
   zurueck. Dann: reiner Daten-Speichervorgang OHNE styles erhaelt die styles.
   Plus: ungueltige styles-URL -> 400. */
{
  const mitStyles = await post("/api/puck-seite/speichere", {
    name: TEST_STYLES,
    data: beispielData,
    styles: ["/import/rt-styles/css/haupt.css", "/import/rt-styles/css/roundtrip-styles-inline.css"],
  });
  ok("styles: speichern mit styles -> 200", mitStyles.status === 200, `status=${mitStyles.status} ${JSON.stringify(mitStyles.json)}`);
  const stand = mitStyles.json?.gespeichert ?? "";

  const geladen = await post("/api/puck-seite/lade", { name: TEST_STYLES });
  ok(
    "styles: laden liefert styles zurueck",
    geladen.status === 200 && geladen.json?.styles?.length === 2 && geladen.json.styles[0] === "/import/rt-styles/css/haupt.css",
    `status=${geladen.status} ${JSON.stringify(geladen.json?.styles)}`,
  );

  const ungueltig = await post("/api/puck-seite/speichere", {
    name: TEST_STYLES,
    data: beispielData,
    ueberschreibe: true,
    styles: ["https://fremd.example/x.css"],
  });
  ok("styles: fremde/absolute URL -> 400", ungueltig.status === 400, `status=${ungueltig.status}`);

  const ohneStyles = await post("/api/puck-seite/speichere", {
    name: TEST_STYLES,
    data: beispielData,
    erwartetGespeichert: stand,
  });
  ok("styles: Speichern ohne styles -> 200", ohneStyles.status === 200, `status=${ohneStyles.status}`);
  const nachOhne = await post("/api/puck-seite/lade", { name: TEST_STYLES });
  ok(
    "styles: bleibt nach styles-losem Speichern erhalten",
    nachOhne.status === 200 && nachOhne.json?.styles?.length === 2,
    `styles=${JSON.stringify(nachOhne.json?.styles)}`,
  );
}

/* 6f — import/asset CSS-Whitelist (Welle 5a): Endung↔MIME eng gekoppelt.
   Nur Negativfaelle (kein Schreiben, kein Datei-Muell). */
{
  const cssFalscheMime = await post("/api/import/asset", {
    slug: "rt",
    name: "stil.css",
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  ok("import/asset: .css mit Bild-MIME -> 400", cssFalscheMime.status === 400, `status=${cssFalscheMime.status}`);

  const bildMitCssMime = await post("/api/import/asset", {
    slug: "rt",
    name: "a.png",
    dataUrl: "data:text/css;base64,Ym9keXt9",
  });
  ok("import/asset: Bild-Endung mit CSS-MIME -> 400", bildMitCssMime.status === 400, `status=${bildMitCssMime.status}`);
}

/* 6g — Papierkorb + Wiederherstellen (U7/N2) + Stale-Save-409 (N18).
   Loeschen ist reversibel: die Seite wandert in den Papierkorb (lade -> 404),
   Wiederherstellen holt die juengste Fassung zurueck (lade -> 200). Ein
   Speichern MIT erwartetGespeichert auf eine geloeschte Seite ist ein Konflikt
   (409), keine stumme Neuanlage. Und: Wiederherstellen bei bereits wieder
   existierender Ziel-Seite -> 409 (R-e). */
{
  const anlegen = await post("/api/puck-seite/speichere", { name: TEST_PAPIERKORB, data: beispielData });
  ok("papierkorb: Testseite anlegen -> 200", anlegen.status === 200, `status=${anlegen.status}`);
  const stand = anlegen.json?.gespeichert ?? "";

  const gel = await post("/api/puck-seite/loesche", { name: TEST_PAPIERKORB });
  ok(
    "papierkorb: loeschen -> 200 + papierkorb-Name",
    gel.status === 200 && typeof gel.json?.papierkorb === "string" && gel.json.papierkorb.startsWith(`${TEST_PAPIERKORB}-`),
    `status=${gel.status} ${JSON.stringify(gel.json)}`,
  );
  const nachGel = await post("/api/puck-seite/lade", { name: TEST_PAPIERKORB });
  ok("papierkorb: nach loeschen lade -> 404", nachGel.status === 404, `status=${nachGel.status}`);

  const stale = await post("/api/puck-seite/speichere", {
    name: TEST_PAPIERKORB,
    data: beispielData,
    erwartetGespeichert: stand,
  });
  ok("N18: Stale-Save auf geloeschte Seite -> 409", stale.status === 409, `status=${stale.status}`);

  const wieder = await post("/api/puck-seite/wiederherstelle", { name: TEST_PAPIERKORB });
  ok(
    "papierkorb: wiederherstellen -> 200",
    wieder.status === 200 && wieder.json?.wiederhergestellt === true,
    `status=${wieder.status} ${JSON.stringify(wieder.json)}`,
  );
  const nachWieder = await post("/api/puck-seite/lade", { name: TEST_PAPIERKORB });
  ok("papierkorb: nach wiederherstellen lade -> 200", nachWieder.status === 200, `status=${nachWieder.status}`);

  const leer = await post("/api/puck-seite/wiederherstelle", { name: TEST_PAPIERKORB });
  ok("papierkorb: erneut wiederherstellen (leer) -> 404", leer.status === 404, `status=${leer.status}`);

  /* R-e: Papierkorb-Eintrag existiert, Ziel-Seite aber wieder da -> 409. */
  const gel2 = await post("/api/puck-seite/loesche", { name: TEST_PAPIERKORB });
  const neu = await post("/api/puck-seite/speichere", { name: TEST_PAPIERKORB, data: beispielData });
  const konflikt = await post("/api/puck-seite/wiederherstelle", { name: TEST_PAPIERKORB });
  ok(
    "R-e: wiederherstellen bei existierendem Ziel -> 409",
    gel2.status === 200 && neu.status === 200 && konflikt.status === 409,
    `gel2=${gel2.status} neu=${neu.status} konflikt=${konflikt.status}`,
  );
}

/* 6h — Ordner-Struktur-Export (Station 4 / S2, /api/export/ordner).
   Positiv: schreibt index.html (Text) + wee-embed.js (Text) + Asset (data-URL),
   liest on-disk zurueck. Negativ: fremder Origin -> 403, Pfadausbruch ../ -> 400,
   Nicht-Whitelist-Endung -> 400. Danach den Test-Slug per fs abraeumen. */
{
  const schreib = await post("/api/export/ordner", {
    slug: TEST_EXPORT,
    dateien: [
      { pfad: "index.html", inhalt: "<!doctype html><title>rt-export</title><body>hallo</body>" },
      { pfad: "wee-embed.js", inhalt: "console.info('rt-runtime');" },
      { pfad: "assets/pixel.png", quellUrl: "data:image/png;base64,iVBORw0KGgo=" },
    ],
  });
  ok(
    "export: schreibt Ordner (3 Dateien) -> 200",
    schreib.status === 200 && schreib.json?.anzahl === 3 && schreib.json?.ordner === `export/${TEST_EXPORT}`,
    `status=${schreib.status} ${JSON.stringify(schreib.json)}`,
  );

  const idx = await readFile(join(EXPORT_DIR, TEST_EXPORT, "index.html"), "utf-8").catch(() => null);
  ok("export: index.html on-disk + Inhalt", typeof idx === "string" && idx.includes("<title>rt-export</title>"));

  const emb = await readFile(join(EXPORT_DIR, TEST_EXPORT, "wee-embed.js"), "utf-8").catch(() => null);
  ok("export: wee-embed.js on-disk", typeof emb === "string" && emb.includes("rt-runtime"));

  const asset = await readFile(join(EXPORT_DIR, TEST_EXPORT, "assets", "pixel.png")).catch(() => null);
  ok("export: Asset (data-URL) on-disk + binaer", asset !== null && asset.length > 0);

  /* /_next/…-Kopier-Quelle: next/font-Schriften liegen unter .next/static/media/,
     NICHT unter public/ — die uebernommene Website-CSS verweist aber genau darauf.
     Regression: frueher loeste der Export JEDE Quelle nur gegen public/ auf →
     /_next/static/media/*.woff2 nicht gefunden → 400, ganzer Export scheiterte.
     Dynamisch eine real vorhandene woff2 waehlen (Hash-Name aendert sich je Build). */
  const nextFont = await readdir(NEXT_MEDIA_DIR)
    .then((f) => f.find((n) => n.endsWith(".woff2")) ?? null)
    .catch(() => null);
  if (nextFont) {
    const fontExport = await post("/api/export/ordner", {
      slug: TEST_EXPORT,
      dateien: [{ pfad: "assets/schrift.woff2", quellUrl: `/_next/static/media/${nextFont}` }],
    });
    const fontDatei = await readFile(join(EXPORT_DIR, TEST_EXPORT, "assets", "schrift.woff2")).catch(() => null);
    ok(
      "export: /_next/-Schrift kopiert (.next/static/media → assets/) -> 200 + on-disk",
      fontExport.status === 200 && fontDatei !== null && fontDatei.length > 0,
      `status=${fontExport.status} ${JSON.stringify(fontExport.json)}`,
    );
  } else {
    ok("export: /_next/-Schrift-Test (keine .next/static/media/*.woff2 gefunden -> uebersprungen)", true);
  }

  const fremd = await post(
    "/api/export/ordner",
    { slug: TEST_EXPORT, dateien: [{ pfad: "x.html", inhalt: "x" }] },
    { Origin: "http://boese.example" },
  );
  ok("export: fremder Origin -> 403", fremd.status === 403, `status=${fremd.status}`);

  const ausbruch = await post("/api/export/ordner", {
    slug: TEST_EXPORT,
    dateien: [{ pfad: "../ausbruch.html", inhalt: "boese" }],
  });
  ok("export: Pfadausbruch ../ -> 400", ausbruch.status === 400, `status=${ausbruch.status}`);

  const endung = await post("/api/export/ordner", {
    slug: TEST_EXPORT,
    dateien: [{ pfad: "schad.exe", inhalt: "boese" }],
  });
  ok("export: Nicht-Whitelist-Endung -> 400", endung.status === 400, `status=${endung.status}`);

  /* Belegen, dass der Ausbruch-Versuch NICHTS neben dem Slug-Ordner ablegte. */
  const ausbruchDa = await readFile(join(EXPORT_DIR, "ausbruch.html"), "utf-8").catch(() => null);
  ok("export: Ausbruch-Datei existiert NICHT", ausbruchDa === null);

  /* leeren:true — Clean-Write (Defekt a): ein Alt-Asset aus einem frueheren Export
     muss beim Re-Export mit leeren:true verschwinden (sonst akkumulieren Waisen →
     Bericht zaehlt weniger als auf der Platte liegt). Erst einen Stand mit
     Alt-Asset schreiben, dann mit leeren:true nur index.html re-exportieren. */
  await post("/api/export/ordner", {
    slug: TEST_EXPORT,
    dateien: [
      { pfad: "index.html", inhalt: "<!doctype html><title>alt</title>" },
      { pfad: "assets/waise.png", quellUrl: "data:image/png;base64,iVBORw0KGgo=" },
    ],
  });
  const waiseVorher = await readFile(join(EXPORT_DIR, TEST_EXPORT, "assets", "waise.png")).catch(() => null);
  const reexport = await post("/api/export/ordner", {
    slug: TEST_EXPORT,
    leeren: true,
    dateien: [{ pfad: "index.html", inhalt: "<!doctype html><title>neu</title>" }],
  });
  const waiseNachher = await readFile(join(EXPORT_DIR, TEST_EXPORT, "assets", "waise.png")).catch(() => null);
  const neuIdx = await readFile(join(EXPORT_DIR, TEST_EXPORT, "index.html"), "utf-8").catch(() => null);
  ok(
    "export: leeren:true entfernt Alt-Asset (Clean-Write) + schreibt neu",
    waiseVorher !== null &&
      reexport.status === 200 &&
      reexport.json?.anzahl === 1 &&
      waiseNachher === null &&
      typeof neuIdx === "string" &&
      neuIdx.includes("<title>neu</title>"),
    `waiseVorher=${waiseVorher !== null} status=${reexport.status} anzahl=${reexport.json?.anzahl} waiseWeg=${waiseNachher === null} neu=${typeof neuIdx === "string" && neuIdx.includes("neu")}`,
  );

  /* Test-Slug abraeumen (kein Hard-Delete-Endpunkt — export/ ist Build-Output). */
  await rm(join(EXPORT_DIR, TEST_EXPORT), { recursive: true, force: true }).catch(() => {});
}

/* 7 — Aufraeumen */
{
  const l1 = await post("/api/puck-seite/loesche", { name: TEST_SEITE });
  const l2 = await post("/api/puck-seite/loesche", { name: TEST_IMPORT });
  const l3 = await post("/api/puck-seite/loesche", { name: TEST_ANIM });
  const l4 = await post("/api/puck-seite/loesche", { name: TEST_STYLES });
  ok("loesche: alle Testseiten entfernt", l1.status === 200 && l2.status === 200 && l3.status === 200 && l4.status === 200);
  const nochmal = await post("/api/puck-seite/lade", { name: TEST_SEITE });
  ok("lade nach loesche: 404", nochmal.status === 404, `status=${nochmal.status}`);

  /* Papierkorb-Reste ALLER Testseiten per fs entfernen (kein Hard-Delete-
     Endpunkt) — nur die Test-Praefixe, fremde Trash-Eintraege bleiben. */
  await raeumeTestReste([TEST_SEITE, TEST_IMPORT, TEST_ANIM, TEST_STYLES, TEST_PAPIERKORB]);
}

console.log(`\nErgebnis: ${gruen} grün, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
