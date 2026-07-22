/*
 * backdrop-types.ts – Datenmodell des Backdrop-Modus: der Grafik- UND
 * Fluss-Editor koennen sich statt ueber die eigene Landing-Page ueber eine
 * NUTZER-GELIEFERTE Website legen (Screenshot, Single-File-HTML ODER ein
 * kompletter, lokal gepickter Website-ORDNER mit mehreren Dateien).
 *
 * Bewusst eigenstaendig (kein Import aus grafik-types.ts o.ae.) — der
 * Backdrop ist ein Editor-uebergreifendes Konzept (Grafik-Editor UND
 * Fluss-Editor teilen sich denselben Zustand), kein Feature EINES Editors.
 */

/** Art des Hintergrunds: ganzseitiger Screenshot (Bild), importierte
 *  Single-File-HTML (per srcdoc-iframe gerendert), ein mehrdateiiger
 *  Ordner (index.html + CSS + Bilder), der ueber einen Service Worker
 *  same-origin unter /wee-site/ ausgeliefert wird (s. ordner-serve.ts), ODER
 *  eine eigene Puck-Seite (seiten/<name>.json), die per <Render> INLINE (kein
 *  iframe) als Buehne des Animators gerendert wird (Welle 4c,
 *  docs/editor-vereinheitlichung.md §9/4c: die Puck-Fusion). Nur "puck-seite"
 *  liegt im selben Dokument wie der Editor — deshalb greifen die
 *  data-og-id="puck:<id>"-Anker der Bausteine direkt (Backdrop.tsx). */
export type BackdropArt = "bild" | "html" | "ordner" | "puck-seite";

export interface Backdrop {
  art: BackdropArt;
  /** Bild: Data-URL. HTML: der rohe Dateiinhalt (kompletter HTML-Text).
   *  Ordner: nur ein Anzeige-Marker (der Ordnername) — die eigentlichen
   *  Dateien leben NICHT hier, sondern im Cache Storage "wee-site"
   *  (s. ordner-serve.ts: ordnerInCacheLaden). Puck-Seite: der Seiten-Name
   *  (ohne .json); die Daten laedt Backdrop.tsx beim Mounten ueber
   *  /api/puck-seite/lade nach. */
  quelle: string;
  /** Ursprünglicher Datei- bzw. Ordnername — nur zur Anzeige im Panel. */
  name: string;
}
