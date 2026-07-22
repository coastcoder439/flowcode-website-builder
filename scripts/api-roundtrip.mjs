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

const BASIS = "http://127.0.0.1:3113";
const TEST_SEITE = "roundtrip-testseite";
const TEST_IMPORT = "roundtrip-import";
const TEST_ANIM = "roundtrip-anim";
const TEST_STYLES = "roundtrip-styles";

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

/* 7 — Aufraeumen */
{
  const l1 = await post("/api/puck-seite/loesche", { name: TEST_SEITE });
  const l2 = await post("/api/puck-seite/loesche", { name: TEST_IMPORT });
  const l3 = await post("/api/puck-seite/loesche", { name: TEST_ANIM });
  const l4 = await post("/api/puck-seite/loesche", { name: TEST_STYLES });
  ok("loesche: alle Testseiten entfernt", l1.status === 200 && l2.status === 200 && l3.status === 200 && l4.status === 200);
  const nochmal = await post("/api/puck-seite/lade", { name: TEST_SEITE });
  ok("lade nach loesche: 404", nochmal.status === 404, `status=${nochmal.status}`);
}

console.log(`\nErgebnis: ${gruen} grün, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
