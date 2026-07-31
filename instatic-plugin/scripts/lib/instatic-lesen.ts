/*
 * instatic-lesen.ts — UMGEZOGEN nach instatic-plugin/wirt/daten.ts (H6, BP-09).
 *
 * Grund: der Zugriff auf den Instatic-Stand ist ein Beruehrungspunkt mit dem
 * Wirt (SQLite-Schema + validateSite + pageFromRow) und gehoert damit in die
 * Wirt-Schicht, nicht in den Skript-Werkzeugkasten. Dort steht auch, wie
 * volatil die drei Vertraege sind und was zu tun ist, wenn einer bricht.
 *
 * Diese Datei bleibt als Weiterleitung stehen, damit aeltere Aufrufe nicht
 * still ins Leere laufen. Neuer Code importiert direkt aus `../wirt/daten`.
 */
export { leseInstaticStand, alsSiteDocument, DB_PFAD, type GelesenerStand } from "../../wirt/daten";
