/*
 * 20-serve.mjs — Wegwerf-Static-Server ueber die gerenderten Ordner.
 *
 * Warum ueberhaupt: das server-gerenderte HTML laedt das Site-Script ueber einen
 * ABSOLUTEN Pfad (/_instatic/runtime/entries/...). Gegen file:// loest das nicht
 * auf. Der Instatic-Dev-Server wird dafuer NICHT angefasst.
 *
 * Zwei Wurzeln, zwei Ports — weil beide Ordner denselben absoluten Asset-Pfad
 * benutzen und deshalb je eine eigene Web-Wurzel brauchen:
 *   4177 -> out/skeleton    (mit Anker-Klassen)
 *   4178 -> out/gegenprobe  (Anker-Klassen vom Node geloest, CSS identisch)
 *
 * Muster: scripts/lib/static-server.mjs des Builders, hier auf feste Ports
 * gesetzt, damit der Browser-Treiber die URLs kennt.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, resolve, extname, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../out')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

async function findeDatei(root, urlPfad) {
  let rel = decodeURIComponent(urlPfad.split('?')[0].split('#')[0])
  if (rel === '' || rel === '/') rel = '/index.html'
  const abs0 = normalize(join(root, rel))
  if (abs0 !== root && !abs0.startsWith(root + sep)) return null
  let abs = abs0
  const st = await stat(abs).catch(() => null)
  if (st && st.isDirectory()) abs = join(abs, 'index.html')
  else if (!st && !extname(abs)) abs = join(abs, 'index.html')
  const st2 = await stat(abs).catch(() => null)
  return st2 && st2.isFile() ? abs : null
}

function starte(wurzel, port, name) {
  const root = resolve(wurzel)
  const server = createServer(async (req, res) => {
    try {
      const abs = await findeDatei(root, req.url ?? '/')
      if (!abs) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('nicht gefunden')
        return
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(await readFile(abs))
    } catch {
      res.writeHead(500)
      res.end('serverfehler')
    }
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`[20-serve] ${name}: http://127.0.0.1:${port}/  (Wurzel: ${root})`)
  })
  return server
}

starte(join(OUT, 'skeleton'), 4177, 'SKELETON  (mit Anker)')
starte(join(OUT, 'gegenprobe'), 4178, 'GEGENPROBE (ohne Anker)')
console.log('[20-serve] laeuft. Beenden: Prozess killen.')
