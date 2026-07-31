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
import '../../instatic/src/modules/base'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { registry } from '../../instatic/src/core/module-engine'
import { publishPage } from '../../instatic/src/core/publisher'
import { buildSiteRuntimeScripts } from '../../instatic/server/publish/runtime/bundleScripts'
import type { Page, PageNode, SiteDocument } from '../../instatic/src/core/page-tree'
import { leseInstaticStand, alsSiteDocument } from './lib/instatic-lesen'

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
const AUSGABE_ORDNER = OHNE_ANKER ? join(OUT, 'gegenprobe') : join(OUT, 'skeleton')

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

/* Unser Site-Script als SiteFile — type 'script', sonst nichts: Instatic setzt
   von sich aus enabled/runInCanvas/format=module/placement=body-end/
   timing=dom-ready (DEFAULT_SCRIPT_RUNTIME_CONFIG, runtimeConfig.ts:69). */
const siteScriptInhalt = readFileSync(join(PLUGIN_ROOT, 'dist/fcank-site-script.js'), 'utf8')
const site: SiteDocument = {
  ...basisSite,
  files: [
    ...basisSite.files,
    {
      id: 'fcank-runtime-file',
      path: 'src/fcank-runtime.js',
      type: 'script',
      content: siteScriptInhalt,
    },
  ],
  pages: basisSite.pages.map((p) => (p.id === seite.id ? seite : p)),
}

const runtimeBuild = await buildSiteRuntimeScripts({
  site,
  page: seite,
  target: 'publish',
  assetBasePath: ASSET_BASIS,
})

const { html } = publishPage(seite, site, registry, {
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
console.log(JSON.stringify({
  modus: OHNE_ANKER ? 'GEGENPROBE (Anker-Klassen entfernt)' : 'SKELETON',
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
