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

import type { Config, Data } from "@puckeditor/core";
import { ShapeAccent } from "@/components/ShapeAccent";

type ShapeAccentBlockProps = {
  variant: "arc" | "sunburst" | "blob-a" | "blob-b" | "blob-c";
  color: "accent" | "green" | "sand";
  position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  size: number;
};

type PuckProps = {
  ShapeAccent: ShapeAccentBlockProps;
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
  },
};

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
