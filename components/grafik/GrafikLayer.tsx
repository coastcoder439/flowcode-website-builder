"use client";

/*
 * GrafikLayer – rendert die platzierten Grafiken über der Seite und treibt
 * sie am Scroll: pro Frame wird für jede Grafik zustandBei(scrollY) gerechnet
 * und DIREKT per style geschrieben (kein React-State im Loop, gleiches Muster
 * wie RiverWaves/RiverFeatures — sonst würde jeder Scroll-Tick die halbe
 * Seite neu rendern).
 *
 * Positionierung in DOKUMENT-Koordinaten: die Ebene liegt absolut über dem
 * Dokument, die Grafik-Mitte sitzt auf (x, y). Dadurch deckt ein einziges
 * Modell mitscrollend / gepinnt / Parallax / fliegend ab (s. grafik-types).
 *
 * prefers-reduced-motion: kein rAF-Loop, stattdessen der Zustand am ERSTEN
 * Keyframe — die Grafik steht dann ruhig an ihrer Ausgangsposition.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGrafiken } from "./GrafikContext";
import { GrafikMedium, type MediumHandle } from "./GrafikMedium";
import {
  effektiveQuelle,
  grafikenFuerRendering,
  scrubFortschritt,
  zustandBei,
  type AnkerAufloeser,
  type Grafik,
} from "./grafik-types";
import "./grafik-layer.css";

export interface GrafikLayerProps {
  grafiken?: Grafik[];
  /** Dokumenthöhe, gegen die `grafiken` autoriert wurde (meta.docH aus dem
   *  Grafik-Editor-Setup bzw. grafik.config.json) — NUR für den statischen
   *  Pfad (Landing-Prop/Embed) relevant. Im EDITOR (ctx vorhanden) ist der
   *  Zustand beim Laden bereits normalisiert (s. GrafikEditor.anwenden) und
   *  diese Prop wird ignoriert — sonst würde ein zweites Mal skaliert.
   *  Fehlt sie oder ist sie identisch zur aktuellen Dokumenthöhe, ist die
   *  Normalisierung ein No-Op (unverändertes Verhalten, Robustheits-Fix). */
  authoredDocH?: number;
}

export function GrafikLayer({ grafiken, authoredDocH }: GrafikLayerProps) {
  const ctx = useGrafiken();
  /* Im Editor kommen die Grafiken aus dem Context, auf der Landing als Prop
     (fest hinterlegtes Setup). */
  const liste = ctx?.grafiken ?? grafiken ?? [];
  const elRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  /** Abspielkopf-Griffe der zeitbasierten Medien (Lottie/Video). */
  const medienRefs = useRef<Map<string, MediumHandle | null>>(new Map());
  const [reduced, setReduced] = useState(false);
  /** Effektive Bildquelle pro Grafik-Id (s. effektiveQuelle/srcOverride in
   *  grafik-types.ts) — für JEDE Grafik gepflegt (s. schreibe() unten), auch
   *  ohne jemals einen Override gehabt zu haben: effektiveQuelle liefert dann
   *  ohnehin immer g.src, der Eintrag ist also faktisch ein No-Op. Wichtig
   *  ist das gerade für den umgekehrten Fall — einen ENTFERNTEN Override —,
   *  sonst bliebe der alte Wert für immer haengen (eine "hat überhaupt einen
   *  Override"-Abkürzung würde nach dem Löschen des letzten Overrides nie
   *  wieder greifen). Bewusst React-STATE statt direktem DOM-Schreiben
   *  (anders als Transform/Opacity oben): <img src> soll bei einem
   *  UNABHÄNGIGEN Re-Render (z.B. Breite-Regler im Editor) nicht wieder auf
   *  g.src zurückspringen — deklarativ ist hier robuster, und der Wechsel
   *  passiert ohnehin nur an einzelnen Scroll-Grenzen, nicht pro Frame. */
  const [quellen, setQuellen] = useState<Record<string, string>>({});
  const quellenRef = useRef<Record<string, string>>({});
  quellenRef.current = quellen;

  /* Element-ID-Anker (Welle 3b, s. grafik-types.grafikenFuerRendering): die
     aktuelle Dokument-Oberkante jedes getaggten `[data-og-id]`-Elements EINMAL
     pro Layout-Epoche in eine Map legen — verankerte Keyframes lösen sich daraus
     auf, OHNE pro Frame das DOM abzufragen (Spec §8/3b). Neu gebaut bei Mount,
     Fenster-Resize und jeder Layout-Reflow (ResizeObserver auf <body> — deckt
     Backdrop-Wechsel und späte Hydration der Landing mit ab). `ankerVersion`
     stößt den Render-Effekt unten an, wenn sich die Map geändert hat. */
  const ankerMapRef = useRef<Map<string, number>>(new Map());
  const [ankerVersion, setAnkerVersion] = useState(0);
  /* Anker-Map EINMAL bauen: die aktuelle Dokument-Oberkante jedes getaggten
     [data-og-id]-Elements. Als useCallback herausgezogen (stabil), damit
     NEBEN dem Mount/Resize/ResizeObserver-Effekt unten auch der Render-Tick
     einen Neubau anstoßen kann — dort wird eine Layout-Verschiebung mitten in
     der Seite (z.B. ein Anker-Baustein bekommt marginTop) über die
     Dokumenthöhe erkannt, die weder ein resize-Event noch der Body-
     ResizeObserver zuverlässig meldet (der Anker WANDERT, ohne seine eigene
     Größe zu ändern). Liest nur Layout (kein Schreiben) → keine Reflow-
     Rückkopplung. */
  const ankerMapBauen = useCallback(() => {
    const map = new Map<string, number>();
    const sy = window.scrollY;
    document.querySelectorAll<HTMLElement>("[data-og-id]").forEach((el) => {
      const id = el.getAttribute("data-og-id");
      if (!id || map.has(id)) return;
      const r = el.getBoundingClientRect();
      map.set(id, r.top + sy);
    });
    ankerMapRef.current = map;
    setAnkerVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    let raf = 0;
    /* rAF-gedrosselt: mehrere Reflow-Events in einem Frame lösen nur EINEN
       Neubau aus. */
    const anstossen = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        ankerMapBauen();
      });
    };
    ankerMapBauen();
    window.addEventListener("resize", anstossen);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(anstossen) : null;
    if (ro && document.body) ro.observe(document.body);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", anstossen);
      ro?.disconnect();
    };
  }, [ankerMapBauen]);

  /* Stabile Callback-Fabrik: sonst bekaeme GrafikMedium bei jedem Render
     eine neue Funktion und wuerde seine Lottie-Instanz neu aufbauen. */
  const machHandleRef = useCallback(
    (id: string) => (h: MediumHandle | null) => {
      medienRefs.current.set(id, h);
    },
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (liste.length === 0) return;

    /* Höhen-Normalisierung (Robustheits-Fix) NUR für den Prop-Pfad
       (Landing/Embed, kein ctx): der Editor-Zustand (ctx.grafiken) ist beim
       Laden bereits normalisiert (s. GrafikEditor.anwenden) — würde er hier
       ZUSÄTZLICH skaliert, verschöbe sich eine live bearbeitete Grafik bei
       jeder Dokumenthöhen-Änderung (z.B. ein neuer Keyframe verlängert die
       Seite) ein zweites Mal. document.* bewusst NUR hier (innerhalb des
       Effects, also client-only) gelesen, nie während SSR/Render. */
    let faktor = 1;
    if (!ctx && authoredDocH) {
      const aktuelleDocH = document.documentElement.scrollHeight;
      if (Number.isFinite(aktuelleDocH) && aktuelleDocH > 0) faktor = aktuelleDocH / authoredDocH;
    }
    /* Höhen-Normalisierung UND Element-ID-Anker in EINEM Schritt (die beiden
       schließen sich pro Keyframe aus, s. grafikenFuerRendering): verankerte
       Keyframes lösen sich aus der gecachten Anker-Map auf, alle anderen laufen
       den bisherigen faktor-Pfad. EINMAL pro Effekt-Lauf gebacken (nicht pro
       Frame), genau wie zuvor listeSkaliert. */
    const aufloeser: AnkerAufloeser = (id) => ankerMapRef.current.get(id);
    const listeSkaliert = grafikenFuerRendering(liste, faktor, aufloeser);

    const schreibe = (scrollY: number) => {
      /* Nur bei tatsaechlicher Aenderung neu setzen (setState triggert
         sonst bei JEDEM Scroll-Tick ein React-Re-Render aller Grafiken —
         genau das, was der direkte DOM-Zugriff oben vermeiden soll). */
      let neueQuellen: Record<string, string> | null = null;
      for (const g of listeSkaliert) {
        const el = elRefs.current.get(g.id);
        if (!el) continue;
        const z = zustandBei(g, scrollY);
        /* Spiegeln (G3-Bildbearbeitung, s. GrafikInspector.tsx „Spiegeln"):
           scaleX/scaleY(-1) bewusst NACH rotate() gesetzt (rechts im String
           = wird zuerst auf die rohe Bildgeometrie angewandt, CSS-Transforms
           komponieren rechts-nach-links). Dadurch spiegelt sich das Bild in
           seinem EIGENEN, unrotierten Rahmen — unabhängig vom Drehungswert.
           Würde man stattdessen VOR rotate() spiegeln, würde eine gesetzte
           Drehung die Spiegelachse mitdrehen (mirror(rotate(p)) ≠
           rotate(mirror(p)) für scaleX/Y, anders als bei der bisherigen
           GLEICHFÖRMIGEN scale() — die kommutiert mit rotate, deshalb war
           die Reihenfolge vorher irrelevant). */
        const spiegelX = g.spiegelX ? -1 : 1;
        const spiegelY = g.spiegelY ? -1 : 1;
        /* translate(-50%,-50%) zentriert die Grafik auf (x,y) — deshalb
           sitzt der Keyframe auf dem MITTELPUNKT, nicht der Ecke. */
        el.style.transform = `translate3d(${z.x.toFixed(1)}px, ${z.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${z.scale.toFixed(3)}) rotate(${z.rotation.toFixed(1)}deg) scaleX(${spiegelX}) scaleY(${spiegelY})`;
        el.style.opacity = z.opacity.toFixed(3);
        /* Scroll-Scrub: Abspielkopf von Lottie/Video an den Scroll haengen —
           hochscrollen laesst die Animation rueckwaerts laufen. */
        if (g.modus === "scrub") {
          medienRefs.current.get(g.id)?.setFortschritt(scrubFortschritt(g, scrollY));
        }
        /* Frame-spezifischer Bildtausch (srcOverride): IMMER prüfen (auch
           ohne aktuellen Override) — sonst bliebe ein GELÖSCHTER Override
           für immer im quellen-State hängen (die Prüfung "hat die Grafik
           ueberhaupt einen Override" wuerde nach dem Entfernen des LETZTEN
           Overrides nie wieder true und der alte Wert nie mehr korrigiert).
           Kosten sind vernachlaessigbar: derselbe Groessenordnung wie
           zustandBei direkt darueber, nur bei tatsaechlicher Scroll-
           Aenderung. */
        const eff = effektiveQuelle(g, scrollY);
        if (quellenRef.current[g.id] !== eff) {
          neueQuellen = { ...(neueQuellen ?? quellenRef.current), [g.id]: eff };
        }
      }
      if (neueQuellen) setQuellen(neueQuellen);
    };

    if (reduced) {
      schreibe(listeSkaliert[0]?.keyframes[0]?.scrollY ?? 0);
      return;
    }

    let raf = 0;
    let letzterY = -1;
    /* Editor (ctx): erkennt Layout-Verschiebungen mitten in der Seite über die
       Gesamt-Dokumenthöhe und baut die Anker-Map neu — bekommt ein verankerter
       Baustein z.B. marginTop, wächst die Seite, ohne dass ein resize-Event
       feuert oder der Body-ResizeObserver zuverlässig anschlägt (der Anker
       wandert, ändert aber nicht seine eigene Größe). scrollHeight wird am
       Tick-ANFANG gelesen (vor den Transform-/Opacity-Schreibern, die
       ohnehin nur kompositiert werden) → kein erzwungener Reflow durch eigene
       Writes. NUR im Editor, damit der Landing-Renderpfad lesefrei/unberührt
       bleibt. */
    let letzteDocH = -1;
    const tick = () => {
      const y = window.scrollY;
      if (ctx) {
        const docH = document.documentElement.scrollHeight;
        if (letzteDocH === -1) letzteDocH = docH;
        else if (docH !== letzteDocH) {
          letzteDocH = docH;
          /* Stößt einen Anker-Map-Neubau an (bumpt ankerVersion → dieser Effekt
             läuft neu und backt die verankerten Positionen frisch). */
          ankerMapBauen();
        }
      }
      /* Nur schreiben, wenn sich der Scroll wirklich geändert hat — spart
         Layout-Arbeit bei Stillstand. */
      if (y !== letzterY) {
        letzterY = y;
        schreibe(y);
      }
      raf = requestAnimationFrame(tick);
    };
    schreibe(window.scrollY);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    /* ankerVersion: bei Layout-Reflow wurde die Anker-Map neu gebaut → hier
       neu backen, damit verankerte Grafiken an ihre aktualisierte Anker-
       Oberkante nachrücken. */
  }, [liste, reduced, ctx, authoredDocH, ankerVersion, ankerMapBauen]);

  if (liste.length === 0) return null;

  return (
    <div className="grafik-layer" aria-hidden="true">
      {liste.filter((g) => !g.versteckt).map((g) => (
        <div
          key={g.id}
          data-grafik-id={g.id}
          /* Nur IM EDITOR anfassbar (ctx vorhanden). Auf der Landing bleibt
             die Ebene komplett klick-durchlässig — sonst lägen die Grafiken
             wie eine Glasscheibe über Buttons und Links. */
          className={`grafik-item${ctx ? " grafik-item--editierbar" : ""}${
            /* Aktiv-Rahmen für die primäre Auswahl UND jedes zusätzlich
               mehrfach-ausgewählte Mitglied (additiv, s. GrafikContext.tsx
               auswahlMehr) — optisch identisch, kein neuer Zustand nötig. */
            ctx?.auswahl === g.id || ctx?.auswahlMehr.includes(g.id) ? " grafik-item--aktiv" : ""
          }`}
          ref={(el) => {
            elRefs.current.set(g.id, el);
          }}
          style={{ width: g.breitePx, zIndex: g.z }}
        >
          {/* Rendert je nach Medienart: <img> (SVG/PNG/…), Lottie oder
              <video> — inkl. Abspielkopf-Griff fürs Scroll-Scrubbing.
              quelle = effektive Quelle (srcOverride des aktiven Keyframes,
              sonst g.src, s. quellen-State oben). */}
          <GrafikMedium g={g} quelle={quellen[g.id] ?? g.src} handleRef={machHandleRef(g.id)} />
        </div>
      ))}
    </div>
  );
}
