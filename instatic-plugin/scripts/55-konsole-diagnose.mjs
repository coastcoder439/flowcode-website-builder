/*
 * 55-konsole-diagnose.mjs — WOHER kommt jede Konsolen-Zeile?
 *
 * Der Verify-Agent hat Check 9 (0 Konsolen-Fehler auf den gemessenen Pfaden)
 * als FEHLGESCHLAGEN gemeldet: zwei 'error:'-Zeilen (CSP-Block einer externen
 * Medien-URL + ein 404). Dieses Skript ordnet JEDE Zeile einer konkreten URL
 * zu, statt zu raten — erst danach wird repariert.
 *
 * Es misst keine Transforms — es protokolliert Konsole, fehlgeschlagene Anfragen
 * und die Server-Sicht (welche URL welchen Status bekam) und legt das als
 * belege/h4-konsole-diagnose.json ab. Eigener Wegwerf-Port (4181), damit nichts
 * Laufendes gestoert wird.
 */
import { chromium } from '../../instatic/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, normalize, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { harnessDateiAusliefern } from './lib/harness-dateien.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WURZEL = resolve(__dirname, '../out/h4')
const BELEGE = resolve(__dirname, '../belege')
const PORT = 4181
const BASIS = `http://127.0.0.1:${PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function findeDatei(root, urlPfad) {
  let rel = decodeURIComponent(urlPfad.split('?')[0].split('#')[0])
  if (rel === '' || rel === '/') rel = '/index.html'
  const abs0 = normalize(join(root, rel))
  if (abs0 !== root && !abs0.startsWith(root + sep)) return null
  let abs = abs0
  const st = await stat(abs).catch(() => null)
  if (st && st.isDirectory()) abs = join(abs, 'index.html')
  const st2 = await stat(abs).catch(() => null)
  return st2 && st2.isFile() ? abs : null
}

const angefragt = []
const server = createServer(async (req, res) => {
  if (harnessDateiAusliefern(req.url, res)) {
    angefragt.push({ url: req.url, status: 200, quelle: 'harness-datei' })
    return
  }
  const abs = await findeDatei(WURZEL, req.url ?? '/')
  angefragt.push({ url: req.url, status: abs ? 200 : 404 })
  if (!abs) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('nicht gefunden')
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  res.end(await readFile(abs))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({ channel: 'msedge' })

async function pruefe(pfad, viewport, scrollen) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const konsole = []
  const fehlgeschlagen = []
  const antworten = []
  page.on('console', (m) => {
    const l = m.location()
    konsole.push({ typ: m.type(), text: m.text().slice(0, 200), ort: `${l.url}:${l.lineNumber}` })
  })
  page.on('pageerror', (e) => konsole.push({ typ: 'pageerror', text: e.message }))
  page.on('requestfailed', (r) =>
    fehlgeschlagen.push({ url: r.url(), grund: r.failure()?.errorText, typ: r.resourceType() }),
  )
  page.on('response', async (r) => {
    if (r.status() >= 400) antworten.push({ url: r.url(), status: r.status() })
  })
  await page.goto(`${BASIS}${pfad}`, { waitUntil: 'networkidle' })
  if (scrollen) {
    await page.evaluate(async () => {
      for (const p of [0, 400, 800, 1197, 1600, 2394]) {
        window.scrollTo(0, p)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
      window.scrollTo(0, 0)
    })
  }
  await page.waitForTimeout(800)
  await ctx.close()
  return { pfad, konsole, fehlgeschlagen, antwortenAb400: antworten }
}

const ergebnis = {
  erzeugt: new Date().toISOString(),
  browser: browser.version(),
  wurzel: WURZEL,
  indexMitScrollen: await pruefe('/index.html', { width: 1280, height: 800 }, true),
  welten: await pruefe('/welten.html', { width: 1500, height: 1100 }, false),
  serverSicht: angefragt,
}
await browser.close()
server.close()

/* Zaehlung als eigenes Feld, damit der Check nicht aus einer Liste geschaetzt
   werden muss. Gezaehlt wird beides: Konsolen-Fehler UND fehlgeschlagene
   Anfragen — die zweite Zahl darf laut Check 9 groesser 0 sein, sie ist aber
   ein Befund und gehoert sichtbar in den Beleg. */
ergebnis.zaehlung = Object.fromEntries(
  ['indexMitScrollen', 'welten'].map((k) => [
    k,
    {
      konsolenFehler: ergebnis[k].konsole.filter((z) => z.typ === 'error' || z.typ === 'pageerror').length,
      fehlgeschlageneAnfragen: ergebnis[k].fehlgeschlagen.length,
      antwortenAb400: ergebnis[k].antwortenAb400.length,
    },
  ]),
)

mkdirSync(BELEGE, { recursive: true })
writeFileSync(join(BELEGE, 'h4-konsole-diagnose.json'), JSON.stringify(ergebnis, null, 2), 'utf8')
console.log(JSON.stringify(ergebnis, null, 2))
