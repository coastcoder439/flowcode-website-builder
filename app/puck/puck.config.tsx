/*
 * R2a Puck-Spike — Beweis, dass eine bestehende Komponente in Puck
 * (@puckeditor/core) editierbar ist. Registriert EINE Komponente
 * (ShapeAccent) in `config.components`; die `render`-Funktion delegiert
 * 1:1 an die unveraenderte Bestandskomponente (components/ShapeAccent.tsx).
 *
 * Bewusst isoliert: nur neue Dateien unter app/puck/, nichts Bestehendes
 * angefasst. ShapeAccent bringt sein eigenes "use client" mit; diese Config
 * ist ein reines Datenmodul und wird vom Client-Page-Baum (app/puck/page.tsx)
 * gebuendelt.
 *
 * Warum der relative Wrapper in render(): .shape-accent ist per globals.css
 * `position:absolute` mit Ecken-Offsets und braucht laut Komponenten-Doc einen
 * `position:relative`-Eltern-Container mit Groesse — sonst haette das Motiv im
 * Puck-Canvas keinen Bezugsrahmen. Der Wrapper ist reine Darstellung, keine
 * Aenderung an ShapeAccent selbst.
 */

import { cloneElement, type ReactElement } from "react";
import { AutoField, FieldLabel } from "@puckeditor/core";
import type { Config, Data, Slot, TextareaField } from "@puckeditor/core";
import type { OgTyp } from "@/components/grafik/WebsiteOg";
import { ShapeAccent } from "@/components/ShapeAccent";
import { GrafikMedium } from "@/components/grafik/GrafikMedium";
import type { Grafik } from "@/components/grafik/grafik-types";
import type { GrafikLayerBlockProps } from "@/lib/import/grafik-setup-to-puck";
import {
  entschaerfeHtml,
  type BildBlockProps,
  type HtmlBlockProps,
  type SektionBlockProps,
  type TextBlockProps,
  type TextVariante,
} from "@/lib/import/html-zu-puck";
import { StrukturBlock } from "@/components/import/StrukturBlock";
import type { StrukturBlockProps } from "@/lib/import/struktur-injektion";

type ShapeAccentBlockProps = {
  variant: "arc" | "sunburst" | "blob-a" | "blob-b" | "blob-c";
  color: "accent" | "green" | "sand";
  position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  size: number;
};

type PuckProps = {
  ShapeAccent: ShapeAccentBlockProps;
  // Props ohne id — Puck verwaltet die content-Item-id selbst.
  GrafikLayer: Omit<GrafikLayerBlockProps, "id">;
  // Welle 4b (Ordner-Import): generische Bausteine. Prop-Typen kommen aus dem
  // Import-Adapter (lib/import/html-zu-puck.ts) — EINE geteilte Wahrheit, damit
  // Adapter und Config nicht auseinanderlaufen (SYNCHRONPFLICHT lib/puck-registry.ts).
  SektionBlock: Omit<SektionBlockProps, "id">;
  TextBlock: Omit<TextBlockProps, "id">;
  BildBlock: Omit<BildBlockProps, "id">;
  HtmlBlock: Omit<HtmlBlockProps, "id">;
  // Phase 4b (struktur-erhaltender Import): Original-Markup als Layout-Traeger,
  // editierbar ueber Text-/Bild-Injektion an Marker-Positionen. Prop-Typ aus
  // dem Adapter (lib/import/struktur-injektion.ts) — SYNCHRONPFLICHT mit
  // lib/puck-registry.ts.
  StrukturBlock: Omit<StrukturBlockProps, "id">;
};

export const config: Config<PuckProps> = {
  components: {
    ShapeAccent: {
      label: "Form-Akzent (ShapeAccent)",
      fields: {
        variant: {
          type: "select",
          label: "Variante",
          options: [
            { label: "Bogen (arc)", value: "arc" },
            { label: "Sonnenstrahlen (sunburst)", value: "sunburst" },
            { label: "Blob A", value: "blob-a" },
            { label: "Blob B", value: "blob-b" },
            { label: "Blob C", value: "blob-c" },
          ],
        },
        color: {
          type: "radio",
          label: "Farbe",
          options: [
            { label: "Akzent", value: "accent" },
            { label: "Gruen", value: "green" },
            { label: "Sand", value: "sand" },
          ],
        },
        position: {
          type: "select",
          label: "Position",
          options: [
            { label: "Oben rechts", value: "top-right" },
            { label: "Oben links", value: "top-left" },
            { label: "Unten rechts", value: "bottom-right" },
            { label: "Unten links", value: "bottom-left" },
            { label: "Mitte", value: "center" },
          ],
        },
        size: { type: "number", label: "Groesse (px)", min: 80, max: 640 },
      },
      defaultProps: {
        variant: "blob-a",
        color: "accent",
        position: "center",
        size: 220,
      },
      render: ({ variant, color, position, size }) => (
        <div
          style={{
            position: "relative",
            width: "100%",
            minHeight: 360,
            background: "#faf7f0",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <ShapeAccent variant={variant} color={color} position={position} size={size} />
        </div>
      ),
    },
    // R2b Stufe A: Ziel-Baustein des deterministischen Importers. render
    // delegiert 1:1 an die bestehende Render-Einheit (GrafikMedium) — Paritaet.
    GrafikLayer: {
      label: "Grafik-Ebene (importiert)",
      fields: {
        name: { type: "text", label: "Name" },
        src: { type: "text", label: "Bildquelle (src)" },
        art: {
          type: "select",
          label: "Medienart",
          options: [
            { label: "Bild", value: "bild" },
            { label: "Lottie", value: "lottie" },
            { label: "Video", value: "video" },
          ],
        },
        breitePx: { type: "number", label: "Breite (px)", min: 40, max: 1600 },
        scale: { type: "number", label: "Skalierung", min: 0.1, max: 5 },
        opacity: { type: "number", label: "Deckkraft (0-1)", min: 0, max: 1 },
        rotation: { type: "number", label: "Drehung (Grad)" },
        z: { type: "number", label: "Ebene (z)" },
      },
      defaultProps: {
        name: "Grafik",
        src: "/vektor/titelbild.svg",
        art: "bild",
        breitePx: 300,
        z: 0,
        scale: 1,
        opacity: 1,
        rotation: 0,
      },
      render: ({ name, src, art, breitePx, z, scale, opacity, rotation }) => {
        const g: Grafik = { id: "puck-preview", name, src, art, breitePx, z, keyframes: [] };
        return (
          <div
            className="fc-grafik-layer-slot"
            style={{
              position: "relative",
              minHeight: 220,
              background: "#faf7f0",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <style>{`.fc-grafik-layer-slot img{width:100%;height:auto;display:block}`}</style>
            <div
              style={{
                width: Math.max(40, breitePx * (scale ?? 1)),
                maxWidth: "100%",
                opacity: opacity ?? 1,
                transform: `rotate(${rotation ?? 0}deg)`,
              }}
            >
              <GrafikMedium g={g} quelle={src} handleRef={() => {}} />
            </div>
          </div>
        );
      },
    },

    // ---- Welle 4b: generische Import-Bausteine (deterministischer
    // HTML->Puck-Adapter, lib/import/html-zu-puck.ts) ----

    // Container mit Puck-Slot fuer Kinder. Der Slot-Prop `kinder` wird im
    // render als Komponente uebergeben (SlotComponent, 0.22) und als
    // Drop-Zone gerendert — verschachtelte Bausteine leben in props.kinder.
    SektionBlock: {
      label: "Sektion (Container)",
      fields: {
        hintergrund: { type: "text", label: "Hintergrundfarbe (CSS)" },
        kinder: { type: "slot" },
      },
      defaultProps: {
        hintergrund: "transparent",
        kinder: [],
      },
      render: ({ hintergrund, kinder: Kinder }) => (
        <section style={{ background: hintergrund || "transparent", padding: "8px 0" }}>
          <Kinder />
        </section>
      ),
    },

    // Ueberschrift/Absatz. `text` + `variante` (statt roh-HTML) bewusst
    // gewaehlt: robuster + kein zusaetzlicher dangerouslySetInnerHTML-Pfad —
    // Text wird als reiner Knoten gerendert (React escaped selbst). Inline-
    // Markup einer Ueberschrift/eines Absatzes geht beim Import verloren
    // (ehrliche Stufe-C-light-Grenze), dafuer ist das Feld sicher editierbar.
    TextBlock: {
      label: "Text (Ueberschrift/Absatz)",
      fields: {
        text: { type: "textarea", label: "Text" },
        variante: {
          type: "select",
          label: "Art",
          options: [
            { label: "Ueberschrift 1", value: "h1" },
            { label: "Ueberschrift 2", value: "h2" },
            { label: "Ueberschrift 3", value: "h3" },
            { label: "Absatz", value: "p" },
          ],
        },
      },
      defaultProps: { text: "Text", variante: "p" },
      render: ({ text, variante }) => {
        const Tag = (variante ?? "p") as TextVariante;
        return <Tag>{text}</Tag>;
      },
    },

    // Bild mit prozentualer Breite. src ist eine Data-URL oder ein
    // /import/<slug>/-Pfad (Asset-Aufloesung beim Import).
    BildBlock: {
      label: "Bild",
      fields: {
        src: { type: "text", label: "Bildquelle (src)" },
        alt: { type: "text", label: "Alternativtext" },
        breiteProzent: { type: "number", label: "Breite (%)", min: 5, max: 100 },
      },
      defaultProps: { src: "", alt: "", breiteProzent: 100 },
      render: ({ src, alt, breiteProzent }) =>
        src ? (
          <img
            src={src}
            alt={alt}
            style={{ width: `${breiteProzent ?? 100}%`, height: "auto", display: "block" }}
          />
        ) : (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              background: "#faf7f0",
              border: "1px dashed #cbb",
              borderRadius: 8,
              color: "#8a7d70",
            }}
          >
            Kein Bild gewaehlt
          </div>
        ),
    },

    // Uebriges (importiertes) Markup. dangerouslySetInnerHTML ist hier
    // VERTRETBAR, weil (1) dies ein lokales Autoren-Tool ist (kein fremder
    // Besucher speist Inhalte ein) und (2) das Markup bereits beim Import
    // entschaerft wurde — hier wird es defensiv ERNEUT entschaerft
    // (entschaerfeHtml aus dem Import-Adapter), sodass auch von Hand ins Feld
    // getipptes Markup keinen <script>/on*/javascript:-Pfad oeffnet.
    HtmlBlock: {
      label: "HTML-Block (uebriges Markup)",
      fields: {
        // N3-Fix: Pucks Feld-Panel wird DOPPELT gemountet — einmal die
        // Desktop-Sidebar (SidebarSection > Fields) und einmal das
        // `mobileOnly` Fields-Plugin (fieldsPlugin, desktopSideBar:"right"),
        // das auf Desktop nur ausgeblendet (0x0) in der .PuckLayout haengt.
        // Beide Mounts vergeben die von Puck DETERMINISTISCH aus
        // `${itemId}_${feldtyp}_${feldname}` gebildete Feld-id (FieldsChildInner)
        // → mit dem eingebauten `type:"textarea"` lagen so ZWEI <textarea> mit
        // identischer id 'imp-…_textarea_html' im Dokument (ein sichtbares,
        // ein unsichtbares). Ursache ist Puck-intern, NICHT unsere Config.
        //
        // Loesung ohne Funktionsverlust: eigenes Render aus zwei OEFFENTLICHEN
        // Puck-Bausteinen.
        //  (1) AutoField (public) rendert Pucks EIGENES Textarea-Feld — Styling,
        //      Fokus-Schutz und Wertlogik 1:1 — und vergibt pro Mount via
        //      `useSafeId()` (React.useId) eine EIGENE eindeutige id, die die von
        //      Puck uebergebene deterministische id UEBERSCHREIBT. Dadurch sind
        //      die beiden Panel-Mounts garantiert verschieden → keine doppelten
        //      ids mehr. AutoField ersetzt intern aber das Feld-Label durch einen
        //      leeren <div>-Wrapper (DefaultLabel), d.h. der Feld-Titel ginge
        //      verloren — deshalb:
        //  (2) FieldLabel (public) umschliesst das Feld mit Pucks echtem
        //      <label>-Element inkl. Titel-Text ("HTML (wird entschaerft)").
        //      Die <textarea> liegt damit IM <label> → gueltige, id-unabhaengige
        //      (implizite) Label-Zuordnung fuer Screenreader, exakt wie bei
        //      Pucks eingebauten Feldern.
        // Kein neuer Undo-Befehl noetig: Tippen laeuft ueber die uebergebene
        // Puck-`onChange` → Puck-Datenaenderung → Puck-History → PuckUndoBruecke,
        // exakt wie beim vorherigen eingebauten Feld (R1).
        html: {
          type: "custom",
          label: "HTML (wird entschaerft)",
          render: ({ value, onChange, readOnly }) => (
            <FieldLabel label="HTML (wird entschaerft)">
              <AutoField
                // Feld absichtlich OHNE label: den Titel liefert FieldLabel oben;
                // ein label am Feld-Objekt wuerde von AutoFields DefaultLabel nur
                // verschluckt. FieldNoLabel-Constraint → Cast auf TextareaField.
                field={{ type: "textarea" } as TextareaField}
                value={value ?? ""}
                onChange={onChange}
                readOnly={readOnly}
              />
            </FieldLabel>
          ),
        },
      },
      defaultProps: { html: "" },
      render: ({ html }) => (
        <div dangerouslySetInnerHTML={{ __html: entschaerfeHtml(html ?? "").html }} />
      ),
    },

    // ---- Phase 4b: struktur-erhaltender Import-Baustein ----
    //
    // Eine ganze Original-Sektion bleibt als EIN Block erhalten (Layout-Treue,
    // Leons Befund 2026-07-23): `template` ist das entschaerfte Original-Markup
    // mit Marker-Attributen (data-fc-text/data-fc-bild), texte/bilder sind die
    // an diesen Markern injizierten, editierbaren Werte. render delegiert 1:1 an
    // die Render-Einheit components/import/StrukturBlock.tsx (Injektion rein in
    // lib/import/struktur-injektion.ts). BEWUSSTER TRADE-OFF: kein Einzelelement-
    // Drag innerhalb der Sektion — Treue vor Granularitaet.
    StrukturBlock: {
      label: "Struktur-Sektion (importiert, layout-treu)",
      fields: {
        // Das Template ist der Layout-Traeger und bewusst NICHT frei editierbar
        // (eine Roh-HTML-Bearbeitung wuerde genau das Layout zerstoeren, das der
        // Baustein bewahrt). Read-only-Vorschau; der Wert bleibt in der Puck-
        // Data erhalten, weil dieses custom-Feld onChange nie aufruft.
        template: {
          type: "custom",
          label: "Struktur-Vorlage (Layout, nicht editierbar)",
          render: ({ value }) => (
            <FieldLabel label="Struktur-Vorlage (Layout, nicht editierbar)">
              <pre
                style={{
                  margin: 0,
                  maxHeight: 120,
                  overflow: "auto",
                  padding: 8,
                  background: "#faf7f0",
                  border: "1px solid #e3d9c8",
                  borderRadius: 6,
                  font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: "#6a5f52",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {kuerzeVorschau(typeof value === "string" ? value : "", 400)}
              </pre>
            </FieldLabel>
          ),
        },
        // Editierbare Texte, je Marker einer. Labels sprechend (gekuerzter
        // Original-Inhalt), damit die Sidebar navigierbar bleibt. Feld-Muster
        // wie beim TextBlock (mehrzeiliges Textfeld).
        texte: {
          type: "array",
          label: "Texte",
          getItemSummary: (item: { label?: string; wert?: string }, index?: number) =>
            item?.label || kuerzeVorschau(item?.wert ?? "", 40) || `Text ${(index ?? 0) + 1}`,
          arrayFields: {
            // id + label sind interne Zuordnungs-/Anzeigedaten (id bindet an den
            // Template-Marker, label speist getItemSummary) — bewusst NICHT
            // editierbar (custom-Feld ohne UI, onChange wird nie aufgerufen →
            // Wert bleibt erhalten). Nur `wert` ist editierbar (wie TextBlock).
            id: { type: "custom", render: () => <></> },
            label: { type: "custom", render: () => <></> },
            wert: { type: "textarea", label: "Text" },
          },
        },
        // Editierbare Bilder, je Marker einer. Feld-Muster wie beim BildBlock
        // (src + alt). Die src wird beim Rendern ge-whitelistet.
        bilder: {
          type: "array",
          label: "Bilder",
          getItemSummary: (item: { label?: string; alt?: string }, index?: number) =>
            item?.label || item?.alt || `Bild ${(index ?? 0) + 1}`,
          arrayFields: {
            // id + label intern (siehe texte) — nicht editierbar.
            id: { type: "custom", render: () => <></> },
            label: { type: "custom", render: () => <></> },
            src: { type: "text", label: "Bildquelle (src)" },
            alt: { type: "text", label: "Alternativtext" },
          },
        },
      },
      defaultProps: {
        template: '<section data-og-typ="sektion"><p data-fc-text="t1">Text</p></section>',
        texte: [{ id: "t1", label: "Text", wert: "Text" }],
        bilder: [],
      },
      render: ({ template, texte, bilder }) => (
        <StrukturBlock template={template} texte={texte ?? []} bilder={bilder ?? []} />
      ),
    },
  },
};

/** Kuerzt einen (ggf. mehrzeiligen) Text auf eine einzeilige Vorschau — fuer
 *  sprechende Feld-/Item-Labels in der Sidebar. */
function kuerzeVorschau(text: string, max: number): string {
  const eine = text.replace(/\s+/g, " ").trim();
  if (eine.length <= max) return eine;
  return `${eine.slice(0, max - 1)}…`;
}

/* --- Welle 4c Punkt 1: data-og-id fuer JEDEN Puck-Baustein --------------
 * docs/editor-vereinheitlichung.md §9/4c(1). Jede registrierte Komponente
 * bekommt an ihrer WURZEL-DOM-Node `data-og-id="puck:<props.id>"` +
 * `data-og-typ`. Genau diese Attribute scannt der 3b-Anker-Mechanismus
 * (GrafikLayer + GrafikEditor.ankerFelderFuer lesen document-weit
 * [data-og-id], s. grafik-types.grafikenFuerRendering) — dadurch verankern
 * sich Animator-Keyframes automatisch an Puck-Bausteinen, sobald die Seite
 * als Buehne liegt (Backdrop-Modus "puck-seite").
 *
 * ZENTRAL geloest (Spec: "ein gemeinsamer Wrapper statt 6x Copy-Paste"): eine
 * Nachbearbeitungs-Schleife huellt jede render-Funktion, statt die 6
 * render-Ruempfe einzeln anzufassen. cloneElement statt eines umschliessenden
 * <div>: ein zusaetzliches Element muesste display:contents tragen (sonst
 * bricht es das Layout), haette dann aber KEINEN Layout-Kasten →
 * getBoundingClientRect waere 0×0 und der Anker faende es nie. Die Attribute
 * muessen an der echten Wurzel-Node (section/div/img/h1…) haengen.
 *
 * props.id ist in Puck 0.22 garantiert (PuckComponent-Render bekommt
 * WithId<…>, s. @puckeditor/core-Typen). id fehlt nur theoretisch → dann
 * bleibt der Knoten unveraendert (kein Absturz). */
const OG_TYP_JE_KOMPONENTE: Record<string, OgTyp> = {
  ShapeAccent: "deko",
  GrafikLayer: "bild",
  SektionBlock: "sektion",
  TextBlock: "text",
  BildBlock: "bild",
  HtmlBlock: "deko",
  StrukturBlock: "sektion",
};

for (const typ of Object.keys(config.components)) {
  /* Lokale, bewusst lockere Sicht auf render — der Config-Generic macht die
     per-Komponente-Typen hier heterogen; die Semantik (render liefert EIN
     Wurzel-Element) ist ueber alle Bausteine identisch. */
  const komp = config.components[typ as keyof PuckProps] as unknown as {
    render: (props: { id: string }) => ReactElement<Record<string, unknown>>;
  };
  const inner = komp.render;
  const ogTyp = OG_TYP_JE_KOMPONENTE[typ] ?? "deko";
  komp.render = (props) =>
    cloneElement(inner(props), {
      "data-og-id": `puck:${props.id}`,
      "data-og-typ": ogTyp,
    });
}

// Eine vorplatzierte Instanz, damit der Editor sofort ein editierbares
// Element auf dem Canvas zeigt (jedes content-Item braucht eine eindeutige id).
export const initialData: Data = {
  content: [
    {
      type: "ShapeAccent",
      props: {
        id: "ShapeAccent-1",
        variant: "blob-a",
        color: "accent",
        position: "center",
        size: 220,
      },
    },
  ],
  root: {},
};
