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
 *  Single-File-HTML (per srcdoc-iframe gerendert) ODER ein mehrdateiiger
 *  Ordner (index.html + CSS + Bilder), der ueber einen Service Worker
 *  same-origin unter /wee-site/ ausgeliefert wird (s. ordner-serve.ts). */
export type BackdropArt = "bild" | "html" | "ordner";

export interface Backdrop {
  art: BackdropArt;
  /** Bild: Data-URL. HTML: der rohe Dateiinhalt (kompletter HTML-Text).
   *  Ordner: nur ein Anzeige-Marker (der Ordnername) — die eigentlichen
   *  Dateien leben NICHT hier, sondern im Cache Storage "wee-site"
   *  (s. ordner-serve.ts: ordnerInCacheLaden). */
  quelle: string;
  /** Ursprünglicher Datei- bzw. Ordnername — nur zur Anzeige im Panel. */
  name: string;
}
