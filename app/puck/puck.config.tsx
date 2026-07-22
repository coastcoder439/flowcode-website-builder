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
import type { Config, Data, Slot } from "@puckeditor/core";
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
        html: { type: "textarea", label: "HTML (wird entschaerft)" },
      },
      defaultProps: { html: "" },
      render: ({ html }) => (
        <div dangerouslySetInnerHTML={{ __html: entschaerfeHtml(html ?? "").html }} />
      ),
    },
  },
};

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
