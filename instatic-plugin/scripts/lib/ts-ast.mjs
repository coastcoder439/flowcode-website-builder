/*
 * ts-ast.mjs — AST-Werkzeug fuer die Wirt-Smoke-Suite (H6).
 *
 * ============================================================================
 * WARUM AST UND NICHT GREP
 * ============================================================================
 * Die Suite soll den VERTRAG treffen, nicht die Formatierung. Eine umbenannte
 * Variable darf nicht als Bruch gelten, ein entfernter Aufruf schon. Drei
 * konkrete Faelle, an denen eine String-Suche im Instatic-Klon nachweislich
 * das Falsche sagen wuerde:
 *
 *   1. FALSCH-GRUEN durch Kommentare. `data-breakpoint-id` steht in
 *      IframeFrameSurface.tsx allein viermal im Kommentar. Wuerde jemand das
 *      Attribut entfernen und den Kommentar stehen lassen, faende `grep` es
 *      weiterhin — der Marker waere weg, die Suite gruen. Hier zaehlen nur
 *      JSX-Attributnamen und echte String-/Template-Literale.
 *
 *   2. FALSCH-GRUEN bei Bedingungen. Der wichtigste Vertrag (BP-03) lautet
 *      nicht "injectNodeClassIds wird aufgerufen", sondern "…wird UNBEDINGT
 *      aufgerufen". Direkt darunter steht im selben Wirt-Code
 *      `config.annotateNodeIds ? injectNodeId(...) : ...` — ein Aufruf, der
 *      genauso aussieht und trotzdem nicht traegt. Der Unterschied ist nur im
 *      Baum sichtbar.
 *
 *   3. FALSCH-ROT durch Umbenennung. BP-04 haengt daran, dass unbekannte Keys
 *      ueberleben — nicht daran, dass der Parameter `rawProps` heisst. Die
 *      Pruefung bindet deshalb an die PARAMETER-POSITION und prueft die
 *      Eigenschaft, nicht den Namen.
 *
 * Der Parser kommt aus dem Klon selbst (instatic/node_modules/typescript) —
 * derselbe, mit dem Instatic gebaut wird. Kein eigenes Abhaengigkeits-Paket.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `import.meta.dir` waere kuerzer, ist aber Bun-eigen — so laeuft die Suite
 *  auch unter Node, falls Bun mal nicht zur Hand ist. */
const HIER = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_WURZEL = resolve(HIER, "../..");
export const KLON = resolve(HIER, "../../../instatic");

const require_ = createRequire(import.meta.url);
/** TypeScript aus dem Klon — nicht aus einer eigenen Abhaengigkeit. */
export const ts = require_(resolve(KLON, "node_modules/typescript/lib/typescript.js"));

const cache = new Map();

/** Parst eine Datei (TS/TSX/JS) EINMAL und merkt sie sich. */
export function quelle(absoluterPfad) {
  const treffer = cache.get(absoluterPfad);
  if (treffer) return treffer;
  const text = readFileSync(absoluterPfad, "utf8");
  const sf = ts.createSourceFile(
    absoluterPfad,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    absoluterPfad.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : absoluterPfad.endsWith(".js") || absoluterPfad.endsWith(".mjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS,
  );
  cache.set(absoluterPfad, sf);
  return sf;
}

/** Tiefensuche. `treffer(node)` -> true sammelt ein. */
export function suche(wurzel, treffer) {
  const raus = [];
  const gehe = (n) => {
    if (treffer(n)) raus.push(n);
    ts.forEachChild(n, gehe);
  };
  gehe(wurzel);
  return raus;
}

/** Erster Treffer oder null. */
export function suchEines(wurzel, treffer) {
  return suche(wurzel, treffer)[0] ?? null;
}

/** 1-basierte Zeile eines Knotens — fuer Fundstellen im Bericht. */
export function zeileVon(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Name eines Knotens als Text, falls er einen hat. */
export function nameVon(node) {
  const n = node?.name;
  if (!n) return null;
  return ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;
}

/* ---------------------------------------------------------------------------
 * Aufrufe
 * ------------------------------------------------------------------------- */

/** Alle Aufrufe `name(...)` (auch `obj.name(...)`). */
export function aufrufe(wurzel, name) {
  return suche(wurzel, (n) => {
    if (!ts.isCallExpression(n)) return false;
    const f = n.expression;
    if (ts.isIdentifier(f)) return f.text === name;
    if (ts.isPropertyAccessExpression(f)) return f.name.text === name;
    return false;
  });
}

/**
 * DIE Kernpruefung fuer BP-03: haengt dieser Knoten an einer Bedingung?
 *
 * Geprueft wird der Weg vom Knoten bis zur umschliessenden Funktion. Alles,
 * was den Aufruf ueberspringen koennte, zaehlt: if/else, `?:`, `&&`/`||`,
 * switch, Schleifen und `try/catch`. Rueckgabe ist der GRUND (fuer den
 * Bericht) oder null.
 */
export function bedingungAufDemWeg(node) {
  let k = node;
  let kind = null;
  while (k?.parent) {
    const p = k.parent;
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) {
      return null; /* Funktionsgrenze erreicht, ohne Bedingung */
    }
    if (ts.isIfStatement(p)) kind = "if/else";
    else if (ts.isConditionalExpression(p)) kind = "Ternaer (?:)";
    else if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        kind = "Kurzschluss (&&, ||, ??)";
      }
    } else if (ts.isSwitchStatement(p) || ts.isCaseClause(p)) kind = "switch";
    else if (ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isWhileStatement(p)) {
      kind = "Schleife";
    } else if (ts.isTryStatement(p) || ts.isCatchClause(p)) kind = "try/catch";
    if (kind) return kind;
    k = p;
  }
  return null;
}

/** Die Funktion, in der ein Knoten steht. */
export function umschliessendeFunktion(node) {
  let k = node.parent;
  while (k) {
    if (
      ts.isFunctionDeclaration(k) ||
      ts.isFunctionExpression(k) ||
      ts.isArrowFunction(k) ||
      ts.isMethodDeclaration(k)
    ) {
      return k;
    }
    k = k.parent;
  }
  return null;
}

/** Zaehlt `return`-Anweisungen, die VOR `node` in derselben Funktion stehen.
 *  Ein neuer frueher Ausstieg ist eine stille Verengung des Vertrags — er
 *  faellt so auf, ohne dass die Pruefung an Formatierung haengt. */
export function returnsVor(fn, node) {
  if (!fn?.body) return 0;
  const grenze = node.getStart();
  return suche(fn.body, (n) => ts.isReturnStatement(n) && n.getStart() < grenze).length;
}

/* ---------------------------------------------------------------------------
 * Exporte, Objektliterale, Literale
 * ------------------------------------------------------------------------- */

/** Ist `name` aus dieser Datei exportiert? (function/const/class/interface/type
 *  mit `export`, oder in einer `export { … }`-Liste.) */
export function exportiert(sf, name) {
  const direkt = suche(sf, (n) => {
    if (!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return false;
    if (nameVon(n) === name) return true;
    if (ts.isVariableStatement(n)) {
      return n.declarationList.declarations.some((d) => nameVon(d) === name);
    }
    return false;
  });
  if (direkt.length > 0) return true;
  return (
    suche(sf, (n) => ts.isExportDeclaration(n)).some((n) =>
      n.exportClause && ts.isNamedExports(n.exportClause)
        ? n.exportClause.elements.some((e) => e.name.text === name)
        : false,
    )
  );
}

/** Eigenschaft `name` in einem Objektliteral (auch Kurzform-Methode). */
export function eigenschaft(objLiteral, name) {
  if (!objLiteral || !ts.isObjectLiteralExpression(objLiteral)) return null;
  return (
    objLiteral.properties.find(
      (p) => (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p)) && nameVon(p) === name,
    ) ?? null
  );
}

/** Der Initialisierer einer benannten `const`/`let` — z.B. ein Objektliteral. */
export function konstanteInitialisierer(sf, name) {
  const d = suchEines(sf, (n) => ts.isVariableDeclaration(n) && nameVon(n) === name);
  return d?.initializer ?? null;
}

/** Literalwert einer Objekt-Eigenschaft (String, true/false, Zahl). */
export function literalWert(prop) {
  const init = prop?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
  if (init.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (init.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(init)) return Number(init.text);
  return undefined;
}

/**
 * Alle String-artigen Texte einer Datei — OHNE Kommentare.
 * Deckt String-Literale, Template-Bausteine UND JSX-Attributnamen ab, damit
 * `<div data-x=…>` genauso gefunden wird wie `setAttribute('data-x', …)`.
 */
export function textLiterale(sf) {
  const raus = new Set();
  suche(sf, (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) raus.add(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) raus.add(n.text);
    else if (ts.isJsxAttribute(n) && n.name) raus.add(n.name.getText(sf));
    return false;
  });
  return raus;
}

/** Kommt `nadel` als echtes Literal/JSX-Attribut vor (nicht im Kommentar)? */
export function literalVorhanden(sf, nadel) {
  for (const t of textLiterale(sf)) if (t.includes(nadel)) return true;
  return false;
}

/** Modul-Spezifizierer aller `import`/`export … from`-Anweisungen. */
export function importQuellen(sf) {
  const raus = [];
  for (const n of suche(sf, (x) => ts.isImportDeclaration(x) || ts.isExportDeclaration(x))) {
    const s = n.moduleSpecifier;
    if (s && ts.isStringLiteral(s)) {
      raus.push({ spezifizierer: s.text, zeile: zeileVon(sf, n), nurTypen: Boolean(n.isTypeOnly) });
    }
  }
  /* `import(...)`-Ausdruecke zaehlen genauso. */
  for (const n of suche(sf, (x) => ts.isCallExpression(x) && x.expression.kind === ts.SyntaxKind.ImportKeyword)) {
    const a = n.arguments[0];
    if (a && ts.isStringLiteral(a)) {
      raus.push({ spezifizierer: a.text, zeile: zeileVon(sf, n), nurTypen: false });
    }
  }
  return raus;
}
