/*
 * End-to-End-Test der Vektorisierungs-Route gegen den LAUFENDEN Dev-Server.
 * Prueft nicht nur den Gutfall, sondern auch, ob die Schutzgrenzen wirklich
 * greifen — eine offene Route, die alles annimmt, waere ein Einfallstor.
 *
 * Lauf:  node scripts/test-route.mjs   (Dev-Server muss auf 3113 laufen)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const URL_ = "http://localhost:3113/api/vektorisieren/";
const TREE = join(process.cwd(), "public", "curtain", "trees", "tree-1-0.png");

let fehler = 0;
const ok = (t) => console.log(`ok      ${t}`);
const bad = (t) => {
  console.log(`PROBLEM ${t}`);
  fehler++;
};

async function post(body) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* Route hat kein JSON geliefert — faengt der Test unten ab. */
  }
  return { status: r.status, j };
}

const dataUrl = `data:image/png;base64,${readFileSync(TREE).toString("base64")}`;

console.log("--- Gutfall ---");
const t0 = Date.now();
const { status, j } = await post({ dataUrl });
const dauer = Date.now() - t0;

if (status !== 200) bad(`Gutfall Status ${status} (erwartet 200) ${JSON.stringify(j)?.slice(0, 200)}`);
else if (!j?.svg?.startsWith("<svg")) bad(`kein SVG zurueck: ${JSON.stringify(j)?.slice(0, 200)}`);
else {
  const pfade = j.gruppen.reduce((s, g) => s + g.pfade, 0);
  ok(
    `200, ${Math.round(dauer)}ms gesamt (davon ${j.dauerMs}ms rechnen), ` +
      `${j.gruppen.length} Gruppen, ${pfade} Pfade, ${Math.round(j.svg.length / 1024)}kB`,
  );
  if (dauer > 8000) bad(`zu langsam fuer "ein paar Sekunden": ${dauer}ms`);
}

console.log("\n--- Optionen greifen? ---");
const grob = await post({ dataUrl, optionen: { maxFarben: 3 } });
if (grob.status === 200 && grob.j.gruppen.length <= 3) ok(`maxFarben:3 -> ${grob.j.gruppen.length} Gruppen`);
else bad(`maxFarben:3 ignoriert -> ${grob.j?.gruppen?.length} Gruppen`);

console.log("\n--- Schutzgrenzen ---");
const faelle = [
  ["kein dataUrl", {}],
  ["Muell statt dataUrl", { dataUrl: "hallo" }],
  ["fremdes Schema", { dataUrl: "data:text/html;base64,PHNjcmlwdD4=" }],
  ["file:// Versuch", { dataUrl: "file:///C:/Windows/win.ini" }],
  ["http:// Versuch (SSRF)", { dataUrl: "http://169.254.169.254/latest/meta-data/" }],
  ["kaputtes Base64", { dataUrl: "data:image/png;base64,!!!nicht-base64!!!" }],
];
for (const [name, body] of faelle) {
  const r = await post(body);
  if (r.status >= 400 && r.status < 500) {
    const leaked = JSON.stringify(r.j ?? "").match(/at \/|node_modules|C:\\\\|Error:.*\n\s*at /);
    if (leaked) bad(`${name}: ${r.status}, aber Stacktrace nach aussen!`);
    else ok(`${name}: ${r.status} abgelehnt`);
  } else {
    bad(`${name}: Status ${r.status} — haette abgelehnt werden muessen`);
  }
}

console.log("\n--- Methode ---");
const g = await fetch(URL_, { method: "GET" });
if (g.status === 405 || g.status === 404) ok(`GET: ${g.status}`);
else bad(`GET: ${g.status} — POST-only Route sollte GET nicht bedienen`);

console.log(`\n=== ${fehler === 0 ? "ROUTE STEHT" : `${fehler} PROBLEM(E)`} ===`);
process.exit(fehler === 0 ? 0 : 1);
