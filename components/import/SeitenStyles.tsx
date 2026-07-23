"use client";

/*
 * components/import/SeitenStyles.tsx — Welle 5a (docs/editor-vereinheitlichung.md
 * §10/5a, Punkt 3): laedt die uebernommenen Stylesheet-URLs einer Seite
 * (SeitenDatei.styles) und injiziert sie GESCOPED auf einen Bühnen-Container.
 *
 * Warum @scope + Text-Inlining statt <link>/@import:
 *   Die INLINE-Bühne (Backdrop-Modus "puck-seite", spaeter die statische
 *   Vorschau) liegt im SELBEN Dokument wie die Editor-Oberflaeche — ein
 *   ungescoptes <link> wuerde die fremde Seiten-CSS ueber den ganzen Editor
 *   kippen (Resets auf html/body/*, Utility-Klassen). CSS-`@scope` grenzt die
 *   Reichweite auf den Bühnen-Container ein. `@scope (sel) { @import … }` ist
 *   laut Spec nicht moeglich → wir FETCHEN den CSS-Text und wrappen ihn in
 *   einen @scope-Block (deckt sich mit der bestehenden Ordner-Feature-Grenze:
 *   Chromium).
 *
 * Fallback ohne @scope-Support: ungescoped injizieren + sichtbare Konsolen-
 * UND UI-Warnung (die fremde CSS kann dann die Oberflaeche beeinflussen).
 *
 * Fuer die IFRAME-Bühne (Puck-Editor-Vorschau) ist diese Komponente NICHT
 * zustaendig — dort isoliert der iframe selbst, die Styles werden per
 * <link> ins iframe-Dokument gehaengt (s. SeitenBereich.tsx iframe-Override).
 *
 * `:root` → `:scope` (WICHTIG fuer die inline @scope-Buehne): Design-Token-CSS
 * definiert Custom Properties auf `:root{ --x: … }`. Innerhalb `@scope (sel){}`
 * matcht `:root` weiterhin das <html> AUSSERHALB der Bühne → die Variablen
 * kaemen nie in der Bühne an, alle `var(--…)`-Farben blieben leer. Wir ersetzen
 * daher `:root` durch `:scope` (= der Bühnen-Container), damit die Tokens auf
 * der Bühne definiert werden und in ihren Baum kaskadieren. Im iframe-Pfad ist
 * das unnoetig (dort ist die Bühne selbst der Dokument-Root).
 *
 * Grenze (ehrlich): url()-Verweise in der CSS (Fonts/Hintergrundbilder) werden
 * beim Import nicht mitkopiert und loesen relativ zu UNSEREM Dokument auf —
 * mediengebundene Details koennen fehlen (schon beim Import als Flag benannt).
 * `html`/`body`-Selektoren matchen unter @scope ebenfalls nicht (liegen ausser-
 * halb) — reine Resets/Backgrounds auf body greifen auf der Bühne nicht.
 */

import { useEffect, useState } from "react";
import { rootAufScope } from "@/lib/import/css-rewrite";

/* rootAufScope (Verlegen von :root auf den Bühnen-Container, damit Token unter
 * @scope kaskadieren) kommt jetzt AST-basiert aus lib/import/css-rewrite.ts.
 * Die alte `css.replace(/:root\b/g,…)`-Kaskade hier war die bekannte Regex-Grenze:
 * sie traf `:root` auch in `content:"…"`, `url()` und Kommentaren. Die AST-Fassung
 * ersetzt ausschliesslich Selektor-Pseudos. */

/** @scope wird ab Chromium 118 unterstuetzt; Feature-Erkennung ueber das
 *  zugehoerige CSSOM-Interface (praezise, ohne CSS.supports-Raterei). */
function scopeUnterstuetzt(): boolean {
  return typeof window !== "undefined" && "CSSScopeRule" in window;
}

/** Laedt alle CSS-Texte (fehlertolerant: eine nicht ladbare Datei wird zu einem
 *  CSS-Kommentar, bricht die uebrigen nicht ab). */
async function ladeCssTexte(urls: string[]): Promise<string> {
  const texte = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u);
        if (!res.ok) return `/* Stil „${u}" nicht ladbar (HTTP ${res.status}) */`;
        return await res.text();
      } catch {
        return `/* Stil „${u}" nicht erreichbar */`;
      }
    }),
  );
  return texte.join("\n\n");
}

interface SeitenStylesProps {
  /** Uebernommene Stylesheet-URLs (SeitenDatei.styles), Dokument-Reihenfolge. */
  urls: string[];
  /** Bühnen-Container-Selektor, auf den @scope die CSS begrenzt. */
  selektor: string;
}

export function GescopteSeitenStyles({ urls, selektor }: SeitenStylesProps) {
  const [css, setCss] = useState("");
  const [ungescoped, setUngescoped] = useState(false);
  /* Stabiler Abhaengigkeits-Schluessel — verhindert Neu-Laden bei bloßer
     Array-Identitaets-Aenderung des Elternteils. */
  const schluessel = urls.join("|");

  useEffect(() => {
    let tot = false;
    if (urls.length === 0) {
      setCss("");
      setUngescoped(false);
      return;
    }
    void (async () => {
      const roh = await ladeCssTexte(urls);
      if (tot) return;
      if (scopeUnterstuetzt()) {
        setCss(`@scope (${selektor}) {\n${rootAufScope(roh)}\n}`);
        setUngescoped(false);
      } else {
        console.warn(
          "[SeitenStyles] @scope wird nicht unterstuetzt — die uebernommene Seiten-CSS " +
            "wird UNGESCOPED injiziert und kann die Editor-Oberflaeche beeinflussen (Chromium noetig).",
        );
        setCss(roh);
        setUngescoped(true);
      }
    })();
    return () => {
      tot = true;
    };
    // schluessel deckt urls ab; selektor separat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, selektor]);

  if (!css) return null;
  return (
    <>
      {ungescoped && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 8,
            left: 8,
            zIndex: 95,
            maxWidth: 320,
            padding: "6px 10px",
            background: "#7a2e00",
            color: "#fff",
            font: "12px/1.4 system-ui, sans-serif",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          Seiten-Styles ohne @scope injiziert (Browser unterstuetzt @scope nicht) — sie koennen die
          Editor-Oberflaeche beeinflussen. Chrome/Edge empfohlen.
        </div>
      )}
      <style data-fc-seiten-styles>{css}</style>
    </>
  );
}
