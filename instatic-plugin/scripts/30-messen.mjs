/*
 * 30-messen.mjs — der eigentliche Beweis (Teilaufgabe 4 von H3a).
 *
 * Faehrt das server-gerenderte HTML in einem echten Browser, scrollt auf
 * definierte Positionen und MISST das Zielelement: getBoundingClientRect,
 * computed transform, computed opacity. Keine Optik-Urteile, nur Zahlen.
 *
 * Zwei Wurzeln im Vergleich:
 *   4177 SKELETON   — Anker-Klassen am Node (aus Instatic, echt)
 *   4178 GEGENPROBE — identische Seite, Anker-Klassen vom Node geloest.
 *                     Das ausgelieferte CSS ist in beiden Faellen dasselbe.
 *                     Bewegt sich hier etwas, kaeme es von CSS statt von uns.
 *
 * Browser: Playwright + lokal installiertes Edge (Chromium 150). Der
 * Playwright-MCP-Server war in dieser Sitzung nicht erreichbar und der
 * Browser-Pane rendert im verborgenen Zustand keine rAF-Frames — beides im
 * Bericht vermerkt. Fuer DIESEN Schritt ist keine Instatic-Session noetig:
 * gemessen wird der eigene Wegwerf-Static-Server.
 */
import { chromium } from '../../instatic/node_modules/playwright/index.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BELEGE = resolve(__dirname, '../belege')
mkdirSync(BELEGE, { recursive: true })

const SKELETON = 'http://127.0.0.1:4177/'
const GEGENPROBE = 'http://127.0.0.1:4178/'
const VIEWPORT = { width: 1280, height: 800 }
/** Scroll-Positionen fuer die Bildbelege — identisch fuer Skeleton und
 *  Gegenprobe, damit die Paare vergleichbar sind. */
const SCREENSHOT_POSITIONEN = [0, 200, 400]

/** Erwartungswerte an den EXAKTEN Keyframe-Positionen. Dort ist die
 *  Easing-Kurve definitionsgemaess exakt (t=0 -> 0, t=1 -> 1), die Vorhersage
 *  also hart falsifizierbar — anders als zwischen zwei Keyframes. */
const ERWARTET_LIST = {
  0: { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 },
  800: { x: 320, y: 800, scale: 1.6, opacity: 1, rotation: 45 },
  1600: { x: 0, y: 1600, scale: 1, opacity: 0.25, rotation: 180 },
}

const messeInSeite = async (page, punkte) =>
  page.evaluate(async (positionen) => {
    const zweiFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const ziele = {
      list: document.querySelector('.fcank-list') ?? document.querySelector('ul'),
      video: document.querySelector('.fcank-video') ?? document.querySelector('video'),
    }
    const ergebnis = []
    for (const p of positionen) {
      window.scrollTo(0, p)
      await zweiFrames()
      const eintrag = { sollScrollY: p, istScrollY: window.scrollY, ziele: {} }
      for (const [name, el] of Object.entries(ziele)) {
        if (!el) { eintrag.ziele[name] = null; continue }
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        eintrag.ziele[name] = {
          inlineTransform: el.style.transform || '(keiner)',
          computedTransform: cs.transform,
          opacity: cs.opacity,
          rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
          /* Dokument-Position = Viewport-Position + Scroll. Bewegt sich DIESER
             Wert, bewegt sich das Element wirklich (und scrollt nicht nur weg). */
          dokY: +(r.y + window.scrollY).toFixed(2),
          dokX: +(r.x + window.scrollX).toFixed(2),
        }
      }
      ergebnis.push(eintrag)
    }
    window.scrollTo(0, 0)
    return ergebnis
  }, punkte)

const browser = await chromium.launch({ channel: 'msedge' })
const bericht = { erzeugt: new Date().toISOString(), browser: browser.version(), viewport: VIEWPORT }

try {
  // ---------------------------------------------------------------- SKELETON
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  const konsole = []
  page.on('console', (m) => konsole.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`))
  await page.goto(SKELETON, { waitUntil: 'networkidle' })

  const umgebung = await page.evaluate(() => ({
    titel: document.title,
    docHoehe: document.documentElement.scrollHeight,
    maxScroll: document.documentElement.scrollHeight - innerHeight,
    scriptQuellen: [...document.querySelectorAll('script')].map((s) => s.src || '(inline)'),
    runtimeGeladen: typeof window.fcank,
    status: window.fcank ? window.fcank.status() : null,
    /* Struktureller Gegenbeweis am ausgelieferten Dokument selbst. */
    bewegungImDokument: (() => {
      const text = document.documentElement.outerHTML
      const treffer = {}
      for (const w of ['transform', '@keyframes', 'animation', 'transition', 'scroll-timeline', 'view-timeline'])
        treffer[w] = (text.match(new RegExp(w.replace('@', '@'), 'gi')) ?? []).length
      return treffer
    })(),
    stylesheetRegeln: [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules].map((r) => r.cssText) } catch { return ['(nicht lesbar)'] }
    }),
  }))
  bericht.skeleton = { url: SKELETON, umgebung }

  const max = umgebung.maxScroll
  const punkte = [0, 400, 800, Math.round(max * 0.5), 1600, max]
  bericht.skeleton.messungen = await messeInSeite(page, punkte)
  bericht.skeleton.konsole = konsole

  /* Screenshot-Positionen bewusst dort, wo das Zielelement im Bild steht.
     Bei scrollY=800 laeuft der um 45 Grad gedrehte, 1.6-fach skalierte
     Listentext rechnerisch knapp ueber den oberen Bildrand hinaus — die
     Zahlenreihe oben deckt diese Positionen ab, das Bild kann es nicht.
     Dieselben Positionen werden fuer die Gegenprobe benutzt, damit die
     Bildpaare direkt vergleichbar sind. */
  for (const y of SCREENSHOT_POSITIONEN) {
    await page.evaluate(async (p) => {
      window.scrollTo(0, p)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }, y)
    await page.screenshot({ path: join(BELEGE, `h3a-skeleton-scroll-${String(y).padStart(4, '0')}.png`) })
  }
  await ctx.close()

  // -------------------------------------------------------------- GEGENPROBE
  const ctx2 = await browser.newContext({ viewport: VIEWPORT })
  const page2 = await ctx2.newPage()
  const konsole2 = []
  page2.on('console', (m) => konsole2.push(`${m.type()}: ${m.text()}`))
  await page2.goto(GEGENPROBE, { waitUntil: 'networkidle' })
  const umgebung2 = await page2.evaluate(() => ({
    docHoehe: document.documentElement.scrollHeight,
    maxScroll: document.documentElement.scrollHeight - innerHeight,
    runtimeGeladen: typeof window.fcank,
    status: window.fcank ? window.fcank.status() : null,
    ankerKlassenImHtml: {
      'fcank-list': document.querySelectorAll('.fcank-list').length,
      'fcank-video': document.querySelectorAll('.fcank-video').length,
    },
    stylesheetRegeln: [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules].map((r) => r.cssText) } catch { return ['(nicht lesbar)'] }
    }),
  }))
  bericht.gegenprobe = { url: GEGENPROBE, umgebung: umgebung2 }
  bericht.gegenprobe.messungen = await messeInSeite(page2, punkte)
  bericht.gegenprobe.konsole = konsole2
  for (const y of SCREENSHOT_POSITIONEN) {
    await page2.evaluate(async (p) => {
      window.scrollTo(0, p)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }, y)
    await page2.screenshot({ path: join(BELEGE, `h3a-gegenprobe-scroll-${String(y).padStart(4, '0')}.png`) })
  }
  await ctx2.close()
} finally {
  await browser.close()
}

// ------------------------------------------------------------------ Urteile

/** Zahlen aus dem transform-String ziehen. Bewusst NICHT per String-Vergleich
 *  pruefen: die CSSOM serialisiert neu ("0.0px" -> "0px", "1.600" -> "1.6"),
 *  ein Textvergleich wuerde also Formatierung statt Wirkung messen. */
function zahlenAusTransform(t) {
  const tr = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t ?? '')
  const sc = /(?:^|\s)scale\((-?[\d.]+)\)/.exec(t ?? '')
  const ro = /rotate\((-?[\d.]+)deg\)/.exec(t ?? '')
  return {
    x: tr ? Number(tr[1]) : null,
    y: tr ? Number(tr[2]) : null,
    scale: sc ? Number(sc[1]) : null,
    rotation: ro ? Number(ro[1]) : null,
  }
}

/** Die vom BROWSER aufgeloeste Matrix zurueckrechnen — unabhaengige
 *  Gegenprobe zu dem, was wir geschrieben haben. matrix/matrix3d:
 *  scale = hypot(m11,m12), rotation = atan2(m12,m11), tx/ty = m41/m42. */
function ausMatrix(computed) {
  const m = /matrix(3d)?\(([^)]+)\)/.exec(computed ?? '')
  if (!m) return null
  const v = m[2].split(',').map((s) => Number(s.trim()))
  const [a, b2, , , tx, ty] = m[1] ? [v[0], v[1], v[4], v[5], v[12], v[13]] : [v[0], v[1], v[2], v[3], v[4], v[5]]
  return {
    x: +tx.toFixed(2),
    y: +ty.toFixed(2),
    scale: +Math.hypot(a, b2).toFixed(4),
    rotation: +((Math.atan2(b2, a) * 180) / Math.PI).toFixed(2),
  }
}

const nahe = (ist, soll, tol = 0.02) => ist !== null && Math.abs(ist - soll) <= tol
/** Drehwinkel modulo 360 vergleichen (atan2 liefert -180 statt +180). */
const naheWinkel = (ist, soll, tol = 0.02) =>
  ist !== null && Math.abs((((ist - soll) % 360) + 540) % 360 - 180) <= tol

function urteile(b) {
  const raus = []
  const finde = (mess, y) => mess.find((m) => m.sollScrollY === y)

  for (const [yStr, e] of Object.entries(ERWARTET_LIST)) {
    const y = Number(yStr)
    const ist = finde(b.skeleton.messungen, y)?.ziele.list
    const geschrieben = zahlenAusTransform(ist?.inlineTransform)
    const aufgeloest = ausMatrix(ist?.computedTransform)
    const opacityOk = nahe(Number(ist?.opacity), e.opacity, 0.001)
    const geschriebenOk =
      nahe(geschrieben.x, e.x) && nahe(geschrieben.y, e.y) &&
      nahe(geschrieben.scale, e.scale) && nahe(geschrieben.rotation, e.rotation)
    const aufgeloestOk =
      aufgeloest !== null &&
      nahe(aufgeloest.x, e.x, 0.5) && nahe(aufgeloest.y, e.y, 0.5) &&
      nahe(aufgeloest.scale, e.scale, 0.01) && naheWinkel(aufgeloest.rotation, e.rotation, 0.05)
    raus.push({
      pruefung: `SKELETON list @ scrollY=${y} trifft den Keyframe exakt (Zahlen, nicht Textform)`,
      erwartet: { ...e },
      gemessen: {
        vonUnsGeschrieben: geschrieben,
        vomBrowserAufgeloest: aufgeloest,
        opacity: ist?.opacity,
        rohInline: ist?.inlineTransform,
        rohComputed: ist?.computedTransform,
      },
      ergebnis: geschriebenOk && aufgeloestOk && opacityOk ? 'OK' : 'FEHLGESCHLAGEN',
    })
  }

  const rects = b.skeleton.messungen.map((m) => m.ziele.list.rect)
  const unterschiedlich = new Set(rects.map((r) => `${r.x}|${r.w}|${r.h}`)).size
  raus.push({
    pruefung: 'SKELETON list: Geometrie aendert sich ueber die Scroll-Positionen (echte Renderwirkung)',
    gemessen: { verschiedeneGeometrien: unterschiedlich, von: rects.length, rects },
    ergebnis: unterschiedlich >= 4 ? 'OK' : 'FEHLGESCHLAGEN',
  })

  const gRects = b.gegenprobe.messungen.map((m) => m.ziele.list?.rect).filter(Boolean)
  const gTransforms = new Set(b.gegenprobe.messungen.map((m) => m.ziele.list?.inlineTransform))
  const gDokY = new Set(b.gegenprobe.messungen.map((m) => m.ziele.list?.dokY))
  raus.push({
    pruefung: 'GEGENPROBE: ohne Anker-Klasse bewegt sich NICHTS',
    gemessen: {
      transformWerte: [...gTransforms],
      dokumentPositionen: [...gDokY],
      geometrien: gRects,
      ankerKlassenImHtml: b.gegenprobe.umgebung.ankerKlassenImHtml,
      runtimeGeladen: b.gegenprobe.umgebung.runtimeGeladen,
    },
    ergebnis:
      gTransforms.size === 1 && [...gTransforms][0] === '(keiner)' && gDokY.size === 1
        ? 'OK'
        : 'FEHLGESCHLAGEN',
  })

  const clamp = finde(b.skeleton.messungen, b.skeleton.umgebung.maxScroll)
  const kf2 = finde(b.skeleton.messungen, 1600)
  raus.push({
    pruefung: 'SKELETON: hinter dem letzten Keyframe wird geklemmt (Rand-Zustand haelt)',
    gemessen: { beiMaxScroll: clamp?.ziele.list.inlineTransform, beiKf2: kf2?.ziele.list.inlineTransform },
    ergebnis: clamp?.ziele.list.inlineTransform === kf2?.ziele.list.inlineTransform ? 'OK' : 'FEHLGESCHLAGEN',
  })

  const bew = b.skeleton.umgebung.bewegungImDokument
  raus.push({
    pruefung: 'Kein CSS im ausgelieferten Dokument kann Bewegung erzeugen',
    gemessen: bew,
    ergebnis:
      bew['@keyframes'] === 0 && bew.animation === 0 && bew.transition === 0 &&
      bew['scroll-timeline'] === 0 && bew['view-timeline'] === 0
        ? 'OK'
        : 'FEHLGESCHLAGEN',
  })

  return raus
}

bericht.urteile = urteile(bericht)
writeFileSync(join(BELEGE, 'h3a-messwerte.json'), JSON.stringify(bericht, null, 2), 'utf8')

console.log('=== URTEILE ===')
for (const u of bericht.urteile) console.log(`${u.ergebnis.padEnd(15)} ${u.pruefung}`)
console.log('\n=== Messwerte SKELETON (Ziel: list) ===')
for (const m of bericht.skeleton.messungen) {
  const z = m.ziele.list
  console.log(
    `scrollY=${String(m.istScrollY).padStart(4)} | rect.x=${String(z.rect.x).padStart(8)} rect.y=${String(z.rect.y).padStart(8)} ` +
      `w=${String(z.rect.w).padStart(7)} h=${String(z.rect.h).padStart(6)} | dokY=${String(z.dokY).padStart(8)} | opacity=${z.opacity}`,
  )
}
console.log('\n=== Messwerte GEGENPROBE (dasselbe Element, ohne Anker-Klasse) ===')
for (const m of bericht.gegenprobe.messungen) {
  const z = m.ziele.list
  console.log(
    `scrollY=${String(m.istScrollY).padStart(4)} | rect.x=${String(z.rect.x).padStart(8)} rect.y=${String(z.rect.y).padStart(8)} ` +
      `w=${String(z.rect.w).padStart(7)} h=${String(z.rect.h).padStart(6)} | dokY=${String(z.dokY).padStart(8)} | transform=${z.inlineTransform}`,
  )
}
console.log(`\nBelege: ${BELEGE}`)
