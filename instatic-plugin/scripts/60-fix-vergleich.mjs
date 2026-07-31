/*
 * 60-fix-vergleich.mjs — hat die Fix-Runde (Check 9: 0 Konsolen-Fehler) an den
 * H4-Messwerten etwas verschoben?
 *
 * Die Reparatur greift in die gerenderte Seite ein (Bild-Ziel gleich-origin,
 * Video-Ziel gleich-origin + preload="none"). Solche Eingriffe koennen
 * Geometrie bewegen — ein 1x1-Bild statt eines kaputten Bildes, ein anders
 * geladenes <video>. Ob sie es TUN, wird hier nicht behauptet, sondern
 * verglichen: alter Messstand gegen neuen, Feld fuer Feld, Zahl fuer Zahl.
 *
 * Vergleich laeuft ueber ALLE Felder beider Berichte. Ausgenommen sind nur
 * Felder, die sich pro Lauf zwangslaeufig aendern (Zeitstempel, Pfade) und die
 * Konsolen-Protokolle — genau die SOLLEN sich ja unterscheiden, sie werden
 * separat gezaehlt.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BELEGE = resolve(__dirname, '../belege')

const vorher = JSON.parse(readFileSync(resolve(BELEGE, 'h4-messwerte-vor-fixrunde.json'), 'utf8'))
const nachher = JSON.parse(readFileSync(resolve(BELEGE, 'h4-messwerte.json'), 'utf8'))

/** Pro Lauf zwangslaeufig verschieden — kein Aussagewert fuer die Frage. */
const IGNORIEREN = [/^\/erzeugt$/, /^\/wurzel$/, /^\/screenshot/, /^\/konsole\//]

function istIgnoriert(pfad) {
  return IGNORIEREN.some((r) => r.test(pfad))
}

const unterschiede = []
function vergleiche(a, b, pfad = '') {
  if (istIgnoriert(pfad)) return
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      unterschiede.push({ pfad, art: 'Laenge', vorher: a.length, nachher: b.length })
      return
    }
    a.forEach((_, i) => vergleiche(a[i], b[i], `${pfad}/${i}`))
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const schluessel = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of schluessel) vergleiche(a[k], b[k], `${pfad}/${k}`)
    return
  }
  if (a !== b) unterschiede.push({ pfad, vorher: a, nachher: b })
}

vergleiche(vorher, nachher)

function fehlerZeilen(bericht) {
  const alle = Object.values(bericht.konsole ?? {}).flat()
  return alle.filter((z) => /^(error|pageerror):/.test(z))
}

const ergebnis = {
  frage: 'Hat die Fix-Runde Messwerte verschoben?',
  unterschiedeAusserhalbKonsole: unterschiede,
  urteilGeometrie:
    unterschiede.length === 0
      ? 'UNVERAENDERT — jede Zahl beider Berichte ist identisch'
      : `${unterschiede.length} Abweichung(en) — unten aufgefuehrt, muessen erklaert werden`,
  konsole: {
    fehlerVorher: fehlerZeilen(vorher),
    fehlerNachher: fehlerZeilen(nachher),
    verbleibendeZeilenNachher: Object.fromEntries(
      Object.entries(nachher.konsole ?? {}).map(([k, v]) => [k, v]),
    ),
  },
}
ergebnis.urteilKonsole =
  ergebnis.konsole.fehlerNachher.length === 0
    ? `OK — 0 Fehlerzeilen (vorher: ${ergebnis.konsole.fehlerVorher.length})`
    : `NICHT OK — ${ergebnis.konsole.fehlerNachher.length} Fehlerzeilen`

console.log(JSON.stringify(ergebnis, null, 2))
