/*
 * daten.ts — BP-09: lesender Zugriff auf den Instatic-Stand.
 *
 * Zuvor: scripts/lib/instatic-lesen.ts (H2). In H6 in die Wirt-Schicht
 * gezogen — es ist ein Beruehrungspunkt wie jeder andere, und er beruehrt
 * sogar DREI Vertraege auf einmal:
 *   1. das SQLite-Schema (`site`, `data_tables`, `data_rows`),
 *   2. `validateSite` (Shell-Parser),
 *   3. `pageFromRow` (Datenzeile -> Page).
 *
 * BUN-ONLY (bun:sqlite). Nicht aus wirt/index.ts re-exportiert.
 *
 * ============================================================================
 * WARUM UEBER DIE DATENBANK UND NICHT UEBER HTTP
 * ============================================================================
 * `POST /admin/api/cms/runtime/preview` haette dasselbe geliefert, verlangt
 * aber eine Admin-Session. Die ist derzeit abgelaufen (Login-Wand), und
 * Einloggen ist verboten. Der Endpunkt ist ohnehin nur ein duenner Mantel um
 * `publishPage()` (previewRuntime.ts:88) — den ruft BP-05 direkt auf, mit
 * derselben Modul-Registry und denselben echten Daten.
 *
 * SCHREIBT NIE. Die SQLite-Datei wird ausdruecklich `readonly` geoeffnet —
 * das ist kein Stil, sondern die Bedingung dafuer, dass dieses Werkzeug neben
 * einem laufenden Dev-Server benutzt werden darf.
 *
 * ============================================================================
 * WENN ER BRICHT
 * ============================================================================
 * WARNUNG, kein Fehler: das ist ein Messwerkzeug, kein Produktpfad. Bricht
 * das DB-Schema, bleibt der HTTP-Weg (sobald eine Session da ist). Bricht ein
 * Parser, ist das ein Upgrade-Haeppchen. Das Plugin selbst haengt an keinem
 * der drei — im Betrieb liest Instatic seine Daten selbst.
 */
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { Page, SiteDocument, SiteShell } from "./typen";
import { validateSite } from "../../instatic/src/core/persistence/validate";
import { pageFromRow } from "../../instatic/src/core/data/pageFromRow";

export const DB_PFAD = resolve(import.meta.dir, "../../instatic/.tmp/dev.db");

interface SiteRow {
  id: string;
  name: string;
  settings_json: string;
}

interface DataRowRaw {
  id: string;
  slug: string;
  cells_json: string;
  author_user_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
}

export interface GelesenerStand {
  shell: SiteShell;
  seiten: Page[];
}

export function leseInstaticStand(): GelesenerStand {
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    const siteRow = db
      .query<SiteRow, []>("select id, name, settings_json from site where id = 'default' limit 1")
      .get();
    if (!siteRow) throw new Error(`Kein Site-Datensatz in ${DB_PFAD}`);

    /* settings_json kommt bei bun:sqlite als String zurueck; der SQLite-Adapter
       von Instatic parst `*_json`-Spalten selbst. Hier von Hand, gleiche Semantik. */
    const gespeichert = JSON.parse(siteRow.settings_json) as { site?: Record<string, unknown> };
    const roh = gespeichert.site ?? {};
    const shell = validateSite({ ...roh, name: siteRow.name } as unknown) as SiteShell;

    const pagesTableId = db
      .query<{ id: string }, []>("select id from data_tables where slug = 'pages' limit 1")
      .get()?.id;
    if (!pagesTableId) throw new Error('Keine Systemtabelle "pages" gefunden');

    const rows = db
      .query<DataRowRaw, [string]>(
        `select id, slug, cells_json, author_user_id, created_by_user_id, updated_by_user_id
         from data_rows where table_id = ? and deleted_at is null`,
      )
      .all(pagesTableId);

    const seiten = rows.map((r) =>
      pageFromRow({
        id: r.id,
        slug: r.slug,
        cells: JSON.parse(r.cells_json),
        authorUserId: r.author_user_id,
        createdByUserId: r.created_by_user_id,
        updatedByUserId: r.updated_by_user_id,
      } as never),
    );

    return { shell, seiten };
  } finally {
    db.close();
  }
}

/** Baut das SiteDocument, das der Publisher erwartet (Shell + Seiten). */
export function alsSiteDocument(stand: GelesenerStand): SiteDocument {
  return { ...stand.shell, pages: stand.seiten, visualComponents: [], layouts: [] };
}
