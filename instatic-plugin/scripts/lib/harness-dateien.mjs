/*
 * harness-dateien.mjs — die zwei Dateien, die ein Wegwerf-Static-Server ausliefern
 * muss, damit auf den gemessenen Pfaden KEIN Fehler in der Konsole steht.
 *
 * WARUM ES DAS GIBT (Fix-Runde zu H4, Check 9)
 * --------------------------------------------
 * Zwei Konsolen-Fehler auf den H4-Messpfaden, beide selbst nachgemessen
 * (55-konsole-diagnose.mjs) und beide OHNE Bezug zum Scroll-Achsen-Mechanismus:
 *
 *  1) `GET /favicon.ico -> 404`. Jeder Chromium holt beim Seitenaufruf von sich
 *     aus ein Favicon; unser Wegwerf-Server kannte die Datei nicht. Das ist eine
 *     LUECKE DES HARNESS-SERVERS, kein Befund ueber Instatic — belegt dadurch,
 *     dass die Konsolenzeile als Ort exakt `http://127.0.0.1:<port>/favicon.ico`
 *     traegt und die Server-Sicht genau diese eine 404-Antwort zeigt.
 *
 *  2) Das Fixture-Video zeigt auf `https://example.com/anker-probe.mp4`. Diese
 *     Domain ist per RFC 2606 reserviert und liefert nie Inhalte; die CSP der
 *     Seite (`default-src 'self'`, unveraendert) verbietet fremde Medien. Das
 *     Video bekommt deshalb ein gleich-origin Ziel (s. 10-render.ts, Flag
 *     --medien-lokal), das hier beantwortet wird.
 *
 * NICHT umgangen wird damit irgendeine Sicherheitsgrenze: die CSP der Seite
 * bleibt woertlich wie sie war, es wird nichts erlaubt, was vorher verboten war —
 * es wird nur nichts Fremdes mehr angefragt.
 */

/** 1x1, transparent, 68 Byte, als base64 eingebettet, damit im Repo keine
 *  Binaerdatei noetig ist. Nur fuer das Favicon: der Browser will ein Icon, also
 *  bekommt er eines. Auf die Seitengeometrie wirkt das Favicon nicht. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** Gleich-origin Ziel fuer das Fixture-Video.
 *
 *  WARUM OHNE INHALT: Das Video steht auf `preload="none"`, der Browser fragt
 *  die Datei deshalb NIE an — nachgemessen, die Server-Sicht in
 *  55-konsole-diagnose.mjs listet diesen Pfad nicht. Gebraucht wird nur ein
 *  gleich-origin URL-Ziel, damit die CSP-Pruefung beim SETZEN der Quelle
 *  (die Chromium auch bei `preload="none"` ausfuehrt — genau daran ist der erste
 *  Reparaturversuch gescheitert) still bleibt.
 *
 *  Ein echtes Mini-Video waere hier schlechter, nicht besser: wuerde es je
 *  geladen, uebernaehme das <video>-Element dessen Eigenmasse — und damit
 *  verschoebe sich die Seitengeometrie und jede H4-Messreihe. Der leere Rumpf
 *  ist ein Notnagel fuer den Fall, dass doch jemand anfragt, kein Ladepfad. */
export const PLATZHALTER_VIDEO_PFAD = '/_fcank-harness/platzhalter.mp4'

/**
 * Liefert die Harness-eigenen Dateien aus.
 * @returns true, wenn die Anfrage hier beantwortet wurde (dann nicht weiterreichen).
 */
export function harnessDateiAusliefern(url, res) {
  const pfad = decodeURIComponent(String(url ?? '/').split('?')[0].split('#')[0])
  if (pfad === '/favicon.ico') {
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': PIXEL_PNG.length,
      'Cache-Control': 'no-store',
    })
    res.end(PIXEL_PNG)
    return true
  }
  if (pfad === PLATZHALTER_VIDEO_PFAD) {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': 0,
      'Cache-Control': 'no-store',
    })
    res.end()
    return true
  }
  return false
}
