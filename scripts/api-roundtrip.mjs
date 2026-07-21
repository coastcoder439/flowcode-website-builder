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

/* 7 — Aufraeumen */
{
  const l1 = await post("/api/puck-seite/loesche", { name: TEST_SEITE });
  const l2 = await post("/api/puck-seite/loesche", { name: TEST_IMPORT });
  ok("loesche: beide Testseiten entfernt", l1.status === 200 && l2.status === 200);
  const nochmal = await post("/api/puck-seite/lade", { name: TEST_SEITE });
  ok("lade nach loesche: 404", nochmal.status === 404, `status=${nochmal.status}`);
}

console.log(`\nErgebnis: ${gruen} grün, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
