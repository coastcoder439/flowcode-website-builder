/*
 * typen.ts – Gemeinsame Typen des Vektorisierers.
 *
 * Die vier "Vektor*"-Typen sind der ÖFFENTLICHE VERTRAG mit der API-Route
 * (wird parallel von einem anderen Agenten gebaut) – Feldnamen/Optionalität
 * hier NICHT ändern, ohne den Aufrufer anzupassen. Alles andere in dieser
 * Datei ist internes Pipeline-Vokabular.
 */

/** Steuerparameter für {@link vektorisiere}. Alle Felder optional, siehe Defaults in vektorisieren.ts. */
export interface VektorOptionen {
  /** Max. Anzahl Farben nach Quantisierung. Default 8. */
  maxFarben?: number;
  /** Regionen kleiner als dies (in Pixeln) werden verworfen. Default 40. */
  minFlaechePx?: number;
  /** 0..1 – steuert RDP-Toleranz UND Bezier-Straffheit. Default 0.5. */
  glaettung?: number;
  /** Alpha-Wert (0..255), unterhalb dessen ein Pixel als transparent gilt. Default 128. */
  alphaSchwelle?: number;
}

/** Eine Farbgruppe im Ergebnis-SVG (ein `<g>` pro Palettenfarbe). */
export interface VektorGruppe {
  /** z.B. "gruppe-gruen-dunkel" – entspricht der `id` des `<g>` im SVG. */
  name: string;
  /** Palettenfarbe dieser Gruppe als "#RRGGBB". */
  farbe: string;
  /** Anzahl Pfade (Regionen) in dieser Gruppe. */
  pfade: number;
}

/** Rückgabe von {@link vektorisiere}. */
export interface VektorErgebnis {
  /** Vollständiges `<svg>…</svg>`-Markup. */
  svg: string;
  /** Farbgruppen in derselben Reihenfolge wie im SVG (= Zeichenreihenfolge). */
  gruppen: VektorGruppe[];
  breite: number;
  hoehe: number;
  /** Netto-Laufzeit der Pipeline in Millisekunden. */
  dauerMs: number;
}

/** {@link VektorOptionen} nach Validierung/Clamping – alle Felder Pflicht. */
export interface AufgeloesteOptionen {
  readonly maxFarben: number;
  readonly minFlaechePx: number;
  readonly glaettung: number;
  readonly alphaSchwelle: number;
}

/** Ganzzahliger Bildpunkt (Pixelraster-Koordinate). */
export interface Punkt {
  readonly x: number;
  readonly y: number;
}

/** RGB-Farbe, Kanäle 0..255. */
export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Eine zusammenhängende Pixel-Komponente einer Palettenfarbe (Ergebnis von regionen.ts).
 * `startX/startY` ist der beim Scan zuerst gefundene Pixel der Komponente – das ist
 * zugleich garantiert der oberste-dann-linkeste Pixel (Scan-Reihenfolge-Argument) und
 * damit der korrekte Startpunkt für Moore-Neighbor-Tracing.
 */
export interface Region {
  readonly paletteIndex: number;
  readonly flaeche: number;
  readonly startX: number;
  readonly startY: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Kontur einer Region: äußerer Rand plus 0..n Löcher, je ein geschlossener Punktzug. */
export interface Kontur {
  readonly aussen: Punkt[];
  readonly loecher: Punkt[][];
}

/** Eine fertig konturierte Region, bereit für die Bezier-/SVG-Stufe. */
export interface RegionMitKontur {
  readonly region: Region;
  readonly kontur: Kontur;
}
