/*
 * lib/puck-registry.ts — die im Puck-Editor registrierten Komponenten-Typen
 * als reine Daten-Konstante.
 *
 * Warum nicht direkt aus app/puck/puck.config.tsx ableiten? Die Config
 * importiert React-Komponenten (motion, GrafikMedium) — sie in einer
 * Server-Route zu importieren zoege das komplette UI-Bundle in den
 * API-Handler. Die Registry ist deshalb die geteilte, UI-freie Wahrheit
 * fuers Server-seitige Validieren (docs/puck-erweiterungsebene.md §2.3:
 * Puck selbst validiert nichts, <Render> verschluckt unbekannte Typen
 * still — dieses Gate ist unsere Pflicht).
 *
 * SYNCHRONPFLICHT: Muss mit `config.components` in app/puck/puck.config.tsx
 * uebereinstimmen — beim Registrieren einer neuen Komponente dort HIER
 * nachziehen (der API-Roundtrip-Test scripts/api-roundtrip.mjs faellt sonst
 * beim Import auf).
 */

export const PUCK_KOMPONENTEN_TYPEN = [
  "ShapeAccent",
  "GrafikLayer",
  // Welle 4b (Ordner-Import): generische Bausteine des deterministischen
  // HTML->Puck-Adapters (lib/import/html-zu-puck.ts). SektionBlock traegt
  // einen Slot `kinder` (verschachtelte ComponentData[]) — das Server-Gate
  // (lib/api/seiten-speicher.ts) prueft die Slot-Kinder rekursiv.
  "SektionBlock",
  "TextBlock",
  "BildBlock",
  "HtmlBlock",
  // Phase 4b (struktur-erhaltender Import): eine Original-Sektion bleibt als EIN
  // Block (Layout-Traeger), editierbar ueber Text-/Bild-Injektion. Prop-Typ +
  // Render: lib/import/struktur-injektion.ts + components/import/StrukturBlock.tsx,
  // registriert in app/puck/puck.config.tsx. texte/bilder sind KEINE Slots
  // (Arrays aus {id,label,…}, nicht {type,props}) → das Server-Gate laeuft NICHT
  // rekursiv hinein, was hier korrekt ist.
  "StrukturBlock",
] as const;

export type PuckKomponentenTyp = (typeof PUCK_KOMPONENTEN_TYPEN)[number];

export function istRegistrierterTyp(typ: string): typ is PuckKomponentenTyp {
  return (PUCK_KOMPONENTEN_TYPEN as readonly string[]).includes(typ);
}
