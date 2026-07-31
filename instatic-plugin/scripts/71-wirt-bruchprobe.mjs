/*
 * 71-wirt-bruchprobe.mjs — beweist, dass die Smoke-Suite wirklich greift.
 *
 * ============================================================================
 * WARUM ES DIESES SKRIPT GIBT
 * ============================================================================
 * Eine Testsuite, die auf einem heilen System gruen ist, hat nichts bewiesen —
 * eine Suite aus lauter `return true` waere genauso gruen. Beweiskraft
 * entsteht erst, wenn man ihr einen ECHTEN Bruch vorlegt und sie ihn findet,
 * UND wenn eine harmlose Aenderung sie NICHT ausloest. Beides steht hier.
 *
 * ============================================================================
 * WIE DER KLON GESCHUETZT WIRD
 * ============================================================================
 * Jede Probe aendert eine Wirt-Datei nur fuer die Dauer EINES Suite-Laufs:
 *
 *   Inhalt sichern -> aendern -> Suite laufen lassen -> im `finally`
 *   zurueckschreiben -> mit `git status` NACHWEISEN, dass der Klon sauber ist.
 *
 * Der Rueckbau haengt nicht am Gutgehen: er steht im `finally`, und bei
 * SIGINT/SIGTERM greift derselbe Weg ueber einen Prozess-Haken. Nach jeder
 * Probe wird der Arbeitsbaum des Klons geprueft; bleibt auch nur eine Datei
 * geaendert, bricht dieses Skript ab, statt weiterzumachen.
 *
 * Aufruf:  bun run scripts/71-wirt-bruchprobe.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { KLON, PLUGIN_WURZEL } from "./lib/ts-ast.mjs";

const SUITE = join(PLUGIN_WURZEL, "scripts/70-wirt-smoke.mjs");
const BELEG = join(PLUGIN_WURZEL, "belege/h6-bruchproben.json");

/* --------------------------------------------------------------------------
 * Die Proben
 * ------------------------------------------------------------------------ */

const PROBEN = [
  {
    id: "a",
    art: "bruch",
    name: "injectNodeClassIds hinter ein Flag legen",
    warum:
      "Der Anker-Vertrag (BP-03) haengt genau daran, dass dieser Aufruf UNBEDINGT ist. " +
      "Haenge ich ihn an dasselbe Flag wie den Nachbarn injectNodeId, sieht der Code fast " +
      "unveraendert aus — und beliebige Node-Typen verlieren still ihren Anker.",
    datei: "src/core/publisher/renderNode.ts",
    von: "const withClasses = injectNodeClassIds(output.html, node.classIds, config.site)",
    nach:
      "const withClasses = config.annotateNodeIds ? injectNodeClassIds(output.html, node.classIds, config.site) : output.html",
    erwarteteTreffer: ["bp03-injectclassids-unbedingt"],
  },
  {
    id: "b",
    art: "bruch",
    name: "validateNodeProps verwirft unbekannte Keys",
    warum:
      "BP-04 haengt daran, dass jede Rueckgabe die rohen Props durchreicht. Faellt der Spread " +
      "in EINER Rueckgabe weg, verschwinden unsere Keyframes beim naechsten Render — still, " +
      "und erst beim Publish sichtbar.",
    datei: "src/core/module-engine/validateNodeProps.ts",
    von: "return { ...rawProps, ...cleaned }",
    nach: "return { ...cleaned }",
    erwarteteTreffer: ["bp04-unbekannte-keys-ueberleben"],
  },
  {
    id: "c",
    art: "bruch",
    name: "DOM-Marker umbenennen",
    warum:
      "BP-07: verschwindet der Canvas-Marker, findet eine Editor-Flaeche ihren Anker-Punkt " +
      "nicht mehr. Der Kommentar im Wirt-Code bliebe stehen — eine String-Suche waere hier " +
      "falsch-gruen, die Literal-Pruefung nicht.",
    datei: "src/admin/pages/site/canvas/CanvasRoot.tsx",
    von: 'data-instatic-canvas-root="true"',
    nach: 'data-instatic-canvas-anchor="true"',
    erwarteteTreffer: ["bp07-marker-vorhanden"],
  },
  {
    id: "d",
    art: "harmlos",
    name: "Gegenprobe: Kommentar + zwei Umbenennungen",
    warum:
      "Die Suite soll den VERTRAG treffen, nicht die Formatierung. Ein eingefuegter Kommentar " +
      "und zwei umbenannte Bezeichner (`withClasses` in renderNode, `rawProps` in " +
      "validateNodeProps) aendern nichts am Verhalten — genau daran, dass BP-04 an die " +
      "Parameter-POSITION bindet statt an den Namen `rawProps`, entscheidet sich, ob die " +
      "Suite brauchbar ist oder bei jedem Refactoring falschen Alarm schlaegt.",
    mehrfach: [
      {
        datei: "src/core/publisher/renderNode.ts",
        ersetzungen: [
          ["const withClasses = injectNodeClassIds", "// harmlose Aenderung (Bruchprobe d)\n  const mitKlassen = injectNodeClassIds"],
          ["injectNodeInlineStyles(withClasses,", "injectNodeInlineStyles(mitKlassen,"],
        ],
      },
      {
        datei: "src/core/module-engine/validateNodeProps.ts",
        ersetzungen: [["rawProps", "roheProps"]],
        alleVorkommen: true,
      },
    ],
    erwarteteTreffer: [],
  },
];

/* --------------------------------------------------------------------------
 * Rueckbau-Sicherung
 * ------------------------------------------------------------------------ */

/** Pfad -> Originalinhalt, solange eine Probe laeuft. */
const offen = new Map();

function sichere(relPfad) {
  const p = resolve(KLON, relPfad);
  offen.set(p, readFileSync(p, "utf8"));
  return p;
}

function stelleAllesWiederHer() {
  for (const [p, inhalt] of offen) {
    try {
      writeFileSync(p, inhalt, "utf8");
    } catch (f) {
      console.error(`[bruchprobe] RUECKBAU FEHLGESCHLAGEN fuer ${p}:`, f);
    }
  }
  offen.clear();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stelleAllesWiederHer();
    process.exit(130);
  });
}
process.on("uncaughtException", (f) => {
  stelleAllesWiederHer();
  throw f;
});

/** Der Arbeitsbaum des Klons MUSS sauber sein (bis auf bekanntes Unversioniertes). */
function klonSauber() {
  const roh = execFileSync("git", ["-C", KLON, "status", "--porcelain"], { encoding: "utf8" });
  const geaendert = roh
    .split("\n")
    .filter((z) => z.trim() !== "")
    .filter((z) => !z.startsWith("??")); /* unversionierte Dateien sind nicht unsere Aenderung */
  return { sauber: geaendert.length === 0, zeilen: geaendert };
}

/* --------------------------------------------------------------------------
 * Ablauf
 * ------------------------------------------------------------------------ */

function laufeSuite() {
  const r = spawnSync("bun", ["run", SUITE, "--json"], { encoding: "utf8", cwd: PLUGIN_WURZEL });
  let bericht = null;
  try {
    bericht = JSON.parse(r.stdout);
  } catch {
    return { exitCode: r.status, parseFehler: (r.stdout || r.stderr || "").slice(0, 400) };
  }
  const alle = [...bericht.querpruefungen, ...bericht.beruehrungspunkte.flatMap((p) => p.checks)];
  return {
    exitCode: r.status,
    zaehler: bericht.zaehler,
    dauerMs: bericht.dauerMs,
    abweichungen: alle.filter((c) => c.status === "ABWEICHUNG").map((c) => ({ id: c.id, detail: c.detail })),
    warnungen: alle.filter((c) => c.status === "WARNUNG").map((c) => c.id),
    ungeprueft: alle.filter((c) => c.status === "UNGEPRUEFT").map((c) => ({ id: c.id, detail: c.detail })),
  };
}

function wendeAn(probe) {
  const schritte = probe.mehrfach ?? [{ datei: probe.datei, ersetzungen: [[probe.von, probe.nach]] }];
  for (const s of schritte) {
    const p = sichere(s.datei);
    let text = offen.get(p);
    for (const [von, nach] of s.ersetzungen) {
      if (!text.includes(von)) {
        throw new Error(
          `Probe ${probe.id}: Suchtext nicht gefunden in ${s.datei}: ${JSON.stringify(von.slice(0, 70))}. ` +
            "Der Wirt hat sich geaendert — die Probe muss angepasst werden, bevor sie etwas beweist.",
        );
      }
      text = s.alleVorkommen ? text.split(von).join(nach) : text.replace(von, nach);
    }
    writeFileSync(p, text, "utf8");
  }
}

const vorher = klonSauber();
if (!vorher.sauber) {
  console.error("[bruchprobe] ABBRUCH: Der Klon ist schon vor der ersten Probe veraendert:");
  console.error(vorher.zeilen.join("\n"));
  process.exit(3);
}

const grundlinie = laufeSuite();
const ergebnisse = [];
let allesWieErwartet = true;

for (const probe of PROBEN) {
  let lauf = null;
  let fehler = null;
  try {
    wendeAn(probe);
    lauf = laufeSuite();
  } catch (f) {
    fehler = f instanceof Error ? f.message : String(f);
  } finally {
    stelleAllesWiederHer();
  }

  const nach = klonSauber();
  if (!nach.sauber) {
    console.error(`[bruchprobe] ABBRUCH nach Probe ${probe.id}: Klon nicht sauber zurueckgesetzt:`);
    console.error(nach.zeilen.join("\n"));
    process.exit(4);
  }

  const getroffen = (lauf?.abweichungen ?? []).map((a) => a.id);
  const erwartet = probe.erwarteteTreffer;
  const fehlend = erwartet.filter((e) => !getroffen.includes(e));
  const unerwartet = getroffen.filter((g) => !erwartet.includes(g));
  const bestanden = !fehler && fehlend.length === 0 && unerwartet.length === 0;
  if (!bestanden) allesWieErwartet = false;

  ergebnisse.push({
    probe: probe.id,
    art: probe.art,
    name: probe.name,
    warum: probe.warum,
    bestanden,
    fehler,
    erwarteteTreffer: erwartet,
    tatsaechlicheTreffer: getroffen,
    fehlend,
    unerwartet,
    exitCode: lauf?.exitCode ?? null,
    zaehler: lauf?.zaehler ?? null,
    meldungen: lauf?.abweichungen ?? [],
    klonSauberDanach: true,
  });
}

const beleg = {
  erzeugt: new Date().toISOString(),
  klon: KLON,
  grundlinie: { exitCode: grundlinie.exitCode, zaehler: grundlinie.zaehler, dauerMs: grundlinie.dauerMs, warnungen: grundlinie.warnungen },
  proben: ergebnisse,
  fazit: allesWieErwartet
    ? "Alle Bruchproben wurden gefunden, die harmlose Aenderung hat NICHT ausgeloest."
    : "MINDESTENS EINE PROBE HAT NICHT WIE ERWARTET REAGIERT — die Suite ist nicht abgenommen.",
};
mkdirSync(join(PLUGIN_WURZEL, "belege"), { recursive: true });
writeFileSync(BELEG, JSON.stringify(beleg, null, 2), "utf8");

/* --- Bericht -------------------------------------------------------------- */
console.log("");
console.log("BRUCHPROBEN — greift die Smoke-Suite wirklich?");
console.log("=".repeat(100));
console.log(
  `Grundlinie (unveraenderter Klon): exit ${grundlinie.exitCode}, ` +
    `OK ${grundlinie.zaehler?.OK} / ABWEICHUNG ${grundlinie.zaehler?.ABWEICHUNG} / WARNUNG ${grundlinie.zaehler?.WARNUNG} / UNGEPRUEFT ${grundlinie.zaehler?.UNGEPRUEFT}`,
);
for (const e of ergebnisse) {
  console.log("");
  console.log(`(${e.probe}) ${e.art === "bruch" ? "BRUCH  " : "HARMLOS"}  ${e.name}   -> ${e.bestanden ? "erkannt wie erwartet" : "NICHT WIE ERWARTET"}`);
  if (e.fehler) console.log(`      Fehler: ${e.fehler}`);
  console.log(`      erwartet: [${e.erwarteteTreffer.join(", ") || "keine Abweichung"}]`);
  console.log(`      gemeldet: [${e.tatsaechlicheTreffer.join(", ") || "keine Abweichung"}]   exit ${e.exitCode}`);
  for (const m of e.meldungen) console.log(`      >> ${m.id}: ${m.detail}`);
  if (e.fehlend.length) console.log(`      NICHT GEFUNDEN: ${e.fehlend.join(", ")}`);
  if (e.unerwartet.length) console.log(`      ZUSAETZLICH: ${e.unerwartet.join(", ")}`);
}
console.log("");
console.log("=".repeat(100));
console.log(`Klon nach allen Proben: ${klonSauber().sauber ? "SAUBER (keine bleibende Aenderung)" : "NICHT SAUBER"}`);
console.log(beleg.fazit);
console.log(`Beleg: ${BELEG}`);
console.log("");

process.exit(allesWieErwartet ? 0 : 1);
