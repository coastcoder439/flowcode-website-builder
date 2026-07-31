/*
 * 70-wirt-smoke.mjs — "Bricht uns das naechste Instatic-Update?"
 *
 * ============================================================================
 * WAS DAS IST
 * ============================================================================
 * Ein Testlauf, der in wenigen Sekunden sagt, ob die Vertraege noch gelten, an
 * denen unser Plugin haengt. OHNE Browser, OHNE Login, OHNE Dev-Server —
 * ausschliesslich gegen den QUELLTEXT des gepinnten Klons.
 *
 * Aufruf (im Ordner instatic-plugin/):
 *   bun run scripts/70-wirt-smoke.mjs
 *   bun run scripts/70-wirt-smoke.mjs --json          maschinenlesbar
 *   bun run scripts/70-wirt-smoke.mjs --volatilitaet  Aenderungsraten neu messen
 *
 * Exit-Code: 0 wenn kein echter Bruch, 1 bei mindestens einer ABWEICHUNG,
 * 2 wenn ein Check gar nicht laufen konnte (UNGEPRUEFT). Warnungen aendern den
 * Exit-Code NICHT — sie sind Signale, keine Brueche.
 *
 * ============================================================================
 * DREIWERTIG, NICHT ZWEIWERTIG
 * ============================================================================
 * Nach dem Verifikations-Protokoll §1.2 gibt es je Check drei Zustaende:
 * OK / ABWEICHUNG / UNGEPRUEFT (mit Grund). Ein Check, der nicht laufen konnte,
 * wird NICHT stillschweigend als bestanden gezaehlt — das ist der Fehler, der
 * dieses Protokoll ueberhaupt ausgeloest hat. Zusaetzlich gibt es WARNUNG fuer
 * Beobachtungen, die kein Bruch sind (z.B. der Attribut-Zweitweg bewegt sich).
 *
 * ============================================================================
 * WAS DIESE SUITE NICHT KANN — EHRLICH
 * ============================================================================
 * Sie prueft STATISCH. Sie sieht, ob `injectNodeClassIds` unbedingt aufgerufen
 * wird; sie sieht NICHT, ob das Ergebnis im Browser ankommt. Ein Wirt-Update,
 * das alle Signaturen erhaelt und nur das VERHALTEN aendert, faellt hier nicht
 * auf. Dafuer gibt es die Messskripte 10/30/50 — die brauchen aber einen
 * Browser und Minuten statt Sekunden. Diese Suite ist der schnelle Filter
 * davor, nicht ihr Ersatz.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { CHECKS } from "./lib/wirt-checks.mjs";
import { KLON } from "./lib/ts-ast.mjs";
import { VERTRAEGE, QUERPRUEFUNGEN, MESSBEFEHL, alleWirtDateien, volatilitaetFuer } from "../wirt/vertraege.ts";

const ARG = new Set(process.argv.slice(2));
const ALS_JSON = ARG.has("--json");
const MIT_VOLATILITAET = ARG.has("--volatilitaet");

const SYMBOL = { OK: "OK        ", ABWEICHUNG: "ABWEICHUNG", WARNUNG: "WARNUNG   ", UNGEPRUEFT: "UNGEPRUEFT" };

function laufeCheck(id) {
  const fn = CHECKS[id];
  if (!fn) {
    return { id, status: "UNGEPRUEFT", detail: `Check "${id}" steht im Katalog, ist aber nicht implementiert.` };
  }
  try {
    return { id, ...fn() };
  } catch (fehler) {
    /* Ein abgestuerzter Check ist UNGEPRUEFT, nicht gruen und nicht rot:
       wir wissen schlicht nichts ueber den Vertrag. */
    return {
      id,
      status: "UNGEPRUEFT",
      detail: `Check abgestuerzt: ${fehler instanceof Error ? `${fehler.message}` : String(fehler)}`,
    };
  }
}

const start = Date.now();

/* --- Querpruefungen zuerst: passt der Klon ueberhaupt zum Pin? ------------ */
const quer = QUERPRUEFUNGEN.map((q) => ({ ...laufeCheck(q.id), name: q.name, bruchArt: q.bruchArt }));

/* --- Beruehrungspunkte ---------------------------------------------------- */
const punkte = VERTRAEGE.map((v) => ({
  id: v.id,
  name: v.name,
  volatilitaet: v.volatilitaet,
  genutztAb: v.genutztAb,
  wirtModul: v.wirtModul,
  wirtSymbol: v.wirtSymbol,
  checks: v.pruefungen.map(laufeCheck),
}));

/* --- Optional: Volatilitaet neu messen ------------------------------------ */
let volatilitaet = null;
if (MIT_VOLATILITAET) {
  volatilitaet = alleWirtDateien().map((d) => {
    let jetzt = null;
    try {
      const roh = execFileSync("git", ["-C", KLON, "log", "--since=2026-05-30", "--oneline", "--", d.pfad], {
        encoding: "utf8",
      });
      jetzt = roh.trim() === "" ? 0 : roh.trim().split("\n").length;
    } catch {
      jetzt = null;
    }
    return {
      pfad: d.pfad,
      katalog: d.aenderungen60d,
      gemessen: jetzt,
      abweichung: jetzt !== null && jetzt !== d.aenderungen60d,
      einstufung: jetzt === null ? null : volatilitaetFuer(jetzt),
    };
  });
}

/* --- Auswertung ----------------------------------------------------------- */
const alleChecks = [...quer, ...punkte.flatMap((p) => p.checks)];
const zaehler = { OK: 0, ABWEICHUNG: 0, WARNUNG: 0, UNGEPRUEFT: 0 };
for (const c of alleChecks) zaehler[c.status] = (zaehler[c.status] ?? 0) + 1;

const dauerMs = Date.now() - start;
const exitCode = zaehler.ABWEICHUNG > 0 ? 1 : zaehler.UNGEPRUEFT > 0 ? 2 : 0;

if (ALS_JSON) {
  console.log(
    JSON.stringify({ zaehler, dauerMs, exitCode, querpruefungen: quer, beruehrungspunkte: punkte, volatilitaet }, null, 2),
  );
  process.exit(exitCode);
}

/* --- Textbericht ---------------------------------------------------------- */
const zeile = (s) => console.log(s);

zeile("");
zeile("WIRT-SMOKE — haelt der Instatic-Vertrag noch?");
zeile(`Klon: ${KLON}`);
zeile("=".repeat(100));

zeile("");
zeile("QUERPRUEFUNGEN");
for (const c of quer) {
  zeile(`  ${SYMBOL[c.status]}  ${c.name}`);
  zeile(`              ${c.detail}`);
}

for (const p of punkte) {
  zeile("");
  zeile(`${p.id}  ${p.name}   [${p.volatilitaet}]   ${p.wirtModul} -> ${p.wirtSymbol}`);
  if (p.genutztAb.includes("ungenutzt")) zeile(`      (${p.genutztAb})`);
  for (const c of p.checks) {
    zeile(`  ${SYMBOL[c.status]}  ${c.id}`);
    zeile(`              ${c.detail}${c.fundstelle ? `   [${c.fundstelle}]` : ""}`);
  }
}

if (volatilitaet) {
  zeile("");
  zeile("VOLATILITAET (neu gemessen)");
  zeile(`  ${MESSBEFEHL}`);
  for (const v of volatilitaet) {
    const marke = v.gemessen === null ? "?" : v.abweichung ? "!=" : "==";
    zeile(`  ${marke} ${String(v.gemessen ?? "?").padStart(3)} (Katalog ${String(v.katalog).padStart(3)})  ${v.einstufung ?? "?"}  ${v.pfad}`);
  }
}

zeile("");
zeile("=".repeat(100));
zeile(
  `OK ${zaehler.OK}   ABWEICHUNG ${zaehler.ABWEICHUNG}   WARNUNG ${zaehler.WARNUNG}   UNGEPRUEFT ${zaehler.UNGEPRUEFT}   (${dauerMs} ms)`,
);
zeile(
  exitCode === 0
    ? "ERGEBNIS: kein Bruch. (Statische Pruefung — Verhaltensaenderungen bei gleichen Signaturen sieht sie nicht.)"
    : exitCode === 1
      ? "ERGEBNIS: BRUCH. Auf dem gepinnten Stand bleiben (E4), Upgrade als eigenes Haeppchen planen."
      : "ERGEBNIS: NICHT ABGENOMMEN — mindestens ein Check konnte nicht laufen (UNGEPRUEFT ist nicht 'halb ok').",
);
zeile("");

process.exit(exitCode);
