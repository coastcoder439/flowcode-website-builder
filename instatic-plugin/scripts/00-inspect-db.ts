/*
 * 00-inspect-db.ts — LESENDE Bestandsaufnahme der laufenden Instatic-Instanz.
 *
 * Warum ueberhaupt: die Admin-Session war beim Start dieses Haeppchens
 * abgelaufen (Login-Wand). Einloggen ist verboten. Der Ersatzweg ist, den
 * Render-Pfad in-process zu fahren statt ueber den authentifizierten
 * HTTP-Endpunkt — dafuer braucht es das echte Site-Dokument.
 *
 * SCHREIBT NICHTS. Oeffnet die SQLite-Datei ausdruecklich `readonly`.
 */
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'

const dbPfad = resolve(import.meta.dir, '../../instatic/.tmp/dev.db')
const db = new Database(dbPfad, { readonly: true })

const tabellen = db
  .query<{ name: string }, []>("select name from sqlite_master where type='table' order by name")
  .all()
  .map((r) => r.name)

const siteRow = db
  .query<{ id: string; name: string; settings_json: string }, []>(
    "select id, name, settings_json from site where id = 'default' limit 1",
  )
  .get()

const shell = siteRow ? JSON.parse(siteRow.settings_json).site : null

const dataTables = db
  .query<{ id: string; slug: string; name: string }, []>('select id, slug, name from data_tables')
  .all()

const pagesTable = dataTables.find((t) => t.slug === 'pages')
const pageRows = pagesTable
  ? db
      .query<{ id: string; cells_json: string; slug: string; status: string }, [string]>(
        'select id, cells_json, slug, status from data_rows where table_id = ? and deleted_at is null limit 50',
      )
      .all(pagesTable.id)
  : []

console.log(JSON.stringify({
  dbPfad,
  tabellen,
  siteName: siteRow?.name,
  shellKeys: shell ? Object.keys(shell) : null,
  styleRules: shell ? Object.values(shell.styleRules ?? {}).map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, selector: r.selector })) : [],
  files: shell ? (shell.files ?? []).map((f: any) => ({ id: f.id, path: f.path, type: f.type, bytes: (f.content ?? '').length })) : [],
  runtimeScripts: shell?.runtime?.scripts ?? {},
  breakpoints: shell?.breakpoints?.map((b: any) => b.id) ?? [],
  dataTables: dataTables.map((t) => ({ slug: t.slug, name: t.name })),
  pages: pageRows.map((r) => {
    const d = JSON.parse(r.cells_json)
    return {
      rowId: r.id,
      slug: r.slug,
      status: r.status,
      zellen: Object.keys(d),
      probe: Object.fromEntries(
        Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 60) : typeof v]),
      ),
    }
  }),
}, null, 2))

db.close()
