/*
 * 10-render.ts — server-gerendertes HTML einer ECHTEN Instatic-Seite erzeugen,
 * mit unserer Runtime als Site-Script (Teilaufgabe 3 von H3a).
 *
 * DER RENDER-PFAD IST DER ECHTE
 * -----------------------------
 * Gerufen werden dieselben zwei Funktionen, die `POST /admin/api/cms/runtime/
 * preview` ruft (server/publish/runtime/previewRuntime.ts:52 + :88) und die auch
 * am echten Publish haengen:
 *   buildSiteRuntimeScripts()  — Instatic buendelt unser Site-Script mit esbuild
 *   publishPage()              — Instatic rendert den Seitenbaum zu HTML
 * mit dem echten Modul-Registry (`@modules/base` registriert sich beim Import).
 *
 * WAS ECHT IST UND WAS HARNESS
 * ----------------------------
 * ECHT (aus der laufenden Datenbank, gesetzt ueber Instatics eigenen Store in H2):
 *   - die Seite `anker-probe-h2` samt allen 17 Nodes,
 *   - die StyleRules `fcank-list` / `fcank-video` (kind: class),
 *   - die Zuordnung dieser Klassen an die Nodes base.list / base.video (classIds).
 * Der ANKER ist also nicht simuliert — er wurde in Instatic gesetzt und liegt
 * persistiert in der Datenbank.
 *
 * HARNESS (nur im Speicher, wird NIE in die Datenbank geschrieben):
 *   - die SiteFile `fcank-runtime.js` (type: script) mit unserem Bundle. Ohne
 *     Admin-Session laesst sich der Code-Tab nicht bedienen (Login-Wand). Der
 *     Bundling- und Einbau-Pfad ist trotzdem der echte, weil Instatic die Datei
 *     selbst durch esbuild schickt und den <script>-Tag selbst setzt.
 *   - zwei Abstands-Container, damit die Seite mehrere Bildschirmhoehen hoch
 *     wird (die Original-Probe-Seite ist zu kurz zum Scrollen).
 * Beides ist im Bericht als Harness ausgewiesen.
 *
 * SCHREIBT NICHTS IN INSTATIC. Ausgabe geht ausschliesslich nach
 * instatic-plugin/out/.
 *
 * BEKANNTE GRENZE DIESES SKRIPTS (gemessen, nicht vermutet)
 * --------------------------------------------------------
 * Props vom Typ `svg` und `richtext` laufen im Publisher durch DOMPurify
 * (escapeProps.ts:85-97). DOMPurify braucht ein DOM; in einem DOM-losen
 * Bun-Skript ist es inert und `sanitizeSvg()` liefert "" (hier direkt
 * nachgemessen). Deshalb rendert der base.svg-Node dieser Seite LEER, und
 * `class="fcank-svg"` taucht im Output nicht auf — es gibt kein Wurzel-Tag,
 * in das die Klasse injiziert werden koennte.
 *
 * Das ist ein Artefakt DIESES Skripts, KEIN Instatic-Verhalten und KEIN
 * Widerspruch zum H2-Befund (dort wurde ueber den Server gemessen, der ein DOM
 * hat). Die beiden hier benutzten Anker (base.list, base.video) sind davon
 * nicht betroffen — ihre Props sind weder svg noch richtext.
 */
/*
 * H6: Alle Wirt-Zugriffe dieses Skripts laufen ab jetzt ueber instatic-plugin/wirt/
 * (BP-05 Render, BP-06 Site-Script, BP-09 Datenzugriff). Kein direkter
 * `../../instatic/...`-Import mehr — durchgesetzt von scripts/70-wirt-smoke.mjs
 * (Pruefung `import-gate`). Der Umbau ist reines Umleiten: dieselben Funktionen,
 * dieselben Modul-Instanzen. Nachgemessen statt behauptet — das gerenderte HTML
 * vor und nach dem Umbau ist byteidentisch (Beleg: belege/h6-wirt-gate.json).
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Page, PageNode, SiteDocument } from '../wirt/typen'
import { rendereSeiteZuHtml, baueLaufzeitScripts, laufzeitSiteFile } from '../wirt/publish'
import { leseInstaticStand, alsSiteDocument } from '../wirt/daten'

const PLUGIN_ROOT = resolve(import.meta.dir, '..')
const OUT = join(PLUGIN_ROOT, 'out')
const SEITEN_SLUG = 'anker-probe-h2'
/** Asset-Basispfad wie im Publish-Pfad (der Preview-Endpunkt nutzt
 *  '/_instatic/preview/runtime/'). Der Static-Server legt die Dateien
 *  spaeter genau unter diesen Pfad. */
const ASSET_BASIS = '/_instatic/runtime/'

/** Gegenprobe-Modus: dieselbe Seite, aber die Anker-Klassen werden vom
 *  Node entfernt. Bewegt sich dann noch etwas, kaeme es von CSS — nicht von uns. */
const OHNE_ANKER = process.argv.includes('--ohne-anker')
/** `--medien-lokal`: keine Anfrage mehr an example.com (s. ohneFremdMedien).
 *  Bewusst ein FLAG und nicht das Standardverhalten, damit der H3a-Aufruf
 *  (ohne Flag) weiterhin die eingefrorenen H3a-Bytes reproduziert — nachgemessen:
 *  Render ohne Flag ist byteidentisch zum Stand vor dieser Fix-Runde. */
const MEDIEN_LOKAL = process.argv.includes('--medien-lokal')
/** `--ordner <name>` schreibt woandershin (H4 rendert nach out/h4, damit die
 *  H3a-Belege in out/skeleton byteidentisch stehen bleiben). */
const ORDNER_FLAG = process.argv.indexOf('--ordner')
const ORDNER_NAME =
  ORDNER_FLAG >= 0 && process.argv[ORDNER_FLAG + 1]
    ? process.argv[ORDNER_FLAG + 1]
    : OHNE_ANKER
      ? 'gegenprobe'
      : 'skeleton'
const AUSGABE_ORDNER = join(OUT, ORDNER_NAME)

// ---------------------------------------------------------------------------
// Harness-Bausteine
// ---------------------------------------------------------------------------

/** Abstands-Container: echtes base.container-Modul, Hoehe ueber inlineStyles
 *  (derselbe Weg, den der Editor fuer Inline-Styles nutzt — s.
 *  injectNodeInlineStyles in renderNode.ts:197). */
function abstandsNode(id: string, hoehePx: number): PageNode {
  return {
    id,
    moduleId: 'base.container',
    props: { tag: 'div', customTag: '', htmlAttributes: { 'data-fcank-harness': 'abstand' } },
    breakpointOverrides: {},
    children: [],
    classIds: [],
    parentId: null,
    inlineStyles: { height: `${hoehePx}px` },
  } as unknown as PageNode
}

function mitHarnessHoehe(seite: Page): Page {
  const oben = abstandsNode('fcank-harness-oben', 300)
  const unten = abstandsNode('fcank-harness-unten', 2600)
  const wurzel = seite.nodes[seite.rootNodeId]
  if (!wurzel) throw new Error('Seite hat keinen Wurzel-Node')
  return {
    ...seite,
    nodes: {
      ...seite.nodes,
      [oben.id]: { ...oben, parentId: wurzel.id },
      [unten.id]: { ...unten, parentId: wurzel.id },
      [wurzel.id]: { ...wurzel, children: [oben.id, ...wurzel.children, unten.id] },
    },
  }
}

/* ---------------------------------------------------------------------------
 * Fix-Runde zu H4, Check 9 ("0 Konsolen-Fehler auf den gemessenen Pfaden")
 * ---------------------------------------------------------------------------
 * Die H2-Fixture zeigt mit Bild und Video auf `https://example.com/...`. Diese
 * Domain ist per RFC 2606 reserviert und liefert nie Inhalte — beide Anfragen
 * MUESSEN scheitern. Sie scheitern aber UNTERSCHIEDLICH, und nur eine davon
 * schreibt in die Konsole:
 *   - Video: `default-src 'self'` (Instatics eigene CSP, unveraendert) verbietet
 *     fremde Medien -> eine 'error'-ZEILE je Dokument. Das ist der Check-9-Fund.
 *   - Bild:  net::ERR_BLOCKED_BY_ORB -> fehlgeschlagene Anfrage OHNE
 *     Konsolenzeile (selbst gemessen, 55-konsole-diagnose.mjs).
 *
 * REPARIERT WIRD DESHALB NUR DAS VIDEO — gleich-origin Ziel PLUS
 * `preload="none"`. Beides zusammen ist noetig, und das ist gemessen, nicht
 * angenommen: mit `preload="none"` allein blieb die Fehlerzeile stehen, weil
 * Chromium die CSP schon beim SETZEN der Quelle prueft, nicht erst beim Laden.
 * Das gleich-origin Ziel macht diese Pruefung still, `preload="none"` verhindert
 * die Anfrage danach — es wird also nichts geladen, was das <video> neu
 * vermassen koennte. Anker-Klasse und Node-Typ bleiben unberuehrt.
 *
 * DAS BILD BLEIBT ABSICHTLICH STEHEN, und der Grund ist eine Messung:
 * ein gleich-origin 1x1-Platzhalter wurde gebaut und durchgemessen — er
 * verlaengert die Seite um exakt 1 px je Bild (die Fixture hat zwei, also
 * +2 px: docHoehe 3194 -> 3196, Anker-dokY 522 -> 524, und in der Folge jede
 * Zahl der H4-Reihen). Eine Anfrage, die keine Fehlerzeile erzeugt, ist diesen
 * Preis nicht wert: die H4-Messwerte sollen vergleichbar bleiben. Der Rest-Fund
 * (eine fehlgeschlagene Fremd-Anfrage ohne Konsolenfehler) ist im Bericht
 * ausgewiesen statt weggeraeumt.
 *
 * Die CSP der Seite wird NICHT angefasst: es wird nichts erlaubt, was vorher
 * verboten war. Dass die Reparatur keine Geometrie bewegt, wird nicht behauptet,
 * sondern in 60-fix-vergleich.mjs gegen den Messstand vor der Fix-Runde geprueft.
 */
const PLATZHALTER_VIDEO = '/_fcank-harness/platzhalter.mp4'

function istFremdUrl(wert: unknown): wert is string {
  return typeof wert === 'string' && /^https?:\/\//i.test(wert)
}

interface MedienAenderung {
  nodeId: string
  moduleId: string
  was: string
  vorher: string
  nachher: string
}

function ohneFremdMedien(seite: Page): { seite: Page; aenderungen: MedienAenderung[] } {
  const aenderungen: MedienAenderung[] = []
  const nodes: Record<string, PageNode> = {}
  for (const [id, n] of Object.entries(seite.nodes)) {
    const knoten = n as PageNode & { moduleId: string; props: Record<string, unknown> }
    const props = { ...knoten.props }
    let beruehrt = false

    if (knoten.moduleId === 'base.video' && istFremdUrl(props.videoUrl)) {
      aenderungen.push({ nodeId: id, moduleId: knoten.moduleId, was: 'videoUrl', vorher: props.videoUrl, nachher: PLATZHALTER_VIDEO })
      aenderungen.push({
        nodeId: id,
        moduleId: knoten.moduleId,
        was: 'preload',
        vorher: String(props.preload ?? 'metadata'),
        nachher: 'none',
      })
      props.videoUrl = PLATZHALTER_VIDEO
      props.preload = 'none'
      beruehrt = true
    }
    nodes[id] = beruehrt ? ({ ...knoten, props } as PageNode) : n
  }
  return { seite: { ...seite, nodes }, aenderungen }
}

/** Gegenprobe: jede fcank-Klassenzuordnung vom Node loesen. Die StyleRules
 *  (und damit das CSS) bleiben unangetastet — genau darum geht es. */
function ohneAnkerKlassen(seite: Page, fcankRuleIds: Set<string>): Page {
  const nodes: Record<string, PageNode> = {}
  for (const [id, n] of Object.entries(seite.nodes)) {
    nodes[id] = { ...n, classIds: (n.classIds ?? []).filter((c) => !fcankRuleIds.has(c)) }
  }
  return { ...seite, nodes }
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

const stand = leseInstaticStand()
const basisSite = alsSiteDocument(stand)

const original = basisSite.pages.find((p) => p.slug === SEITEN_SLUG)
if (!original) throw new Error(`Seite "${SEITEN_SLUG}" nicht in der Instatic-Datenbank gefunden`)

const fcankRuleIds = new Set(
  Object.values(basisSite.styleRules ?? {})
    .filter((r) => r.kind === 'class' && r.name.startsWith('fcank-'))
    .map((r) => r.id),
)

let seite = mitHarnessHoehe(original)
if (OHNE_ANKER) seite = ohneAnkerKlassen(seite, fcankRuleIds)
let medienAenderungen: MedienAenderung[] = []
if (MEDIEN_LOKAL) {
  const entschaerft = ohneFremdMedien(seite)
  seite = entschaerft.seite
  medienAenderungen = entschaerft.aenderungen
}

/* Unser Site-Script als SiteFile — type 'script', sonst nichts: Instatic setzt
   von sich aus enabled/runInCanvas/format=module/placement=body-end/
   timing=dom-ready (DEFAULT_SCRIPT_RUNTIME_CONFIG, runtimeConfig.ts:44).
   H6/BP-06: die Datei baut jetzt `laufzeitSiteFile()` in der Wirt-Schicht. */
const siteScriptInhalt = readFileSync(join(PLUGIN_ROOT, 'dist/fcank-site-script.js'), 'utf8')
const site: SiteDocument = {
  ...basisSite,
  files: [...basisSite.files, laufzeitSiteFile(siteScriptInhalt).datei],
  pages: basisSite.pages.map((p) => (p.id === seite.id ? seite : p)),
}

/* H6/BP-06 + BP-05: beides ueber die Wirt-Schicht. */
const runtimeBuild = await baueLaufzeitScripts({
  site,
  page: seite,
  target: 'publish',
  assetBasePath: ASSET_BASIS,
})

const { html } = rendereSeiteZuHtml(seite, site, {
  runtimeAssets: runtimeBuild.runtimeAssets,
})

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

rmSync(AUSGABE_ORDNER, { recursive: true, force: true })
mkdirSync(AUSGABE_ORDNER, { recursive: true })
writeFileSync(join(AUSGABE_ORDNER, 'index.html'), html, 'utf8')

for (const datei of runtimeBuild.files) {
  const ziel = join(AUSGABE_ORDNER, datei.publicPath.replace(/^\/+/, ''))
  mkdirSync(dirname(ziel), { recursive: true })
  writeFileSync(ziel, datei.content, 'utf8')
}

const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
/* Jede verbliebene Fremd-URL an einem ladenden Attribut wird ausgewiesen, damit
   nichts still durchrutscht. `<video src>` darf hier stehen bleiben — mit
   preload="none" wird es nicht angefragt (im Browser nachgemessen). */
const fremdUrlsImHtml = [...html.matchAll(/(src|poster)="(https?:\/\/[^"]*)"/g)].map((m) => ({
  attribut: m[1],
  url: m[2],
  imTag: /<video[^>]*$/.test(html.slice(0, m.index)) ? 'video' : 'anderes',
}))
console.log(JSON.stringify({
  modus: OHNE_ANKER ? 'GEGENPROBE (Anker-Klassen entfernt)' : 'SKELETON',
  medienLokal: MEDIEN_LOKAL,
  medienAenderungen,
  fremdUrlsImHtml,
  ausgabe: AUSGABE_ORDNER,
  seite: { slug: seite.slug, titel: seite.title, nodes: Object.keys(seite.nodes).length },
  htmlBytes: Buffer.byteLength(html, 'utf8'),
  runtimeDateien: runtimeBuild.files.map((f) => ({ publicPath: f.publicPath, bytes: f.bytes.length })),
  runtimeAssets: runtimeBuild.runtimeAssets,
  diagnostics: runtimeBuild.diagnostics,
  scriptTags,
  ankerImHtml: {
    'class="fcank-list"': (html.match(/class="fcank-list"/g) ?? []).length,
    'class="fcank-video"': (html.match(/class="fcank-video"/g) ?? []).length,
    'data-og-id="fc-list-1"': (html.match(/data-og-id="fc-list-1"/g) ?? []).length,
    'data-og-id="fc-video-1"': (html.match(/data-og-id="fc-video-1"/g) ?? []).length,
  },
  cspScriptSrc: /script-src ([^;]*)/.exec(html)?.[1] ?? null,
}, null, 2))
