"use client";

/*
 * GrafikMedium – rendert EIN Asset je nach Medienart und haelt seinen
 * Abspielkopf am Scroll:
 *
 *   bild   <img>       SVG (statisch/SMIL/CSS), PNG/JPG/WebP/GIF/AVIF/APNG.
 *                      Bewusst <img>: deklarative Animationen laufen,
 *                      eingebettete Skripte NICHT (kein fremder Code).
 *   lottie <div>       lottie-web, Renderer "svg". modus "scrub" haengt den
 *                      Frame an den Scroll (goToAndStop) -> hochscrollen
 *                      spielt rueckwaerts.
 *   video  <video>     modus "scrub" setzt currentTime aus dem Scroll.
 *                      Stumm + playsInline, sonst blocken Browser das
 *                      Autoplay.
 *
 * Der Fortschritt kommt als MotionValue-artiger Callback von aussen
 * (GrafikLayer schreibt ihn im rAF-Loop) — kein React-State pro Frame.
 *
 * `quelle` (statt direkt g.src): GrafikLayer reicht die per Keyframe
 * effektive Quelle durch (s. effektiveQuelle in grafik-types.ts) — normal
 * identisch zu g.src, nur bei einem srcOverride am aktuell aktiven Keyframe
 * (frame-spezifischer Bildtausch) abweichend. Diese Datei selbst weiss
 * nichts von Keyframes, sie rendert nur, was ihr gereicht wird.
 */

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import type { Grafik } from "./grafik-types";

export interface MediumHandle {
  /** Fortschritt 0..1 setzen (nur bei modus "scrub" relevant). */
  setFortschritt: (t: number) => void;
}

export function GrafikMedium({
  g,
  quelle,
  handleRef,
}: {
  g: Grafik;
  /** Effektive Bildquelle (s. Kommentar oben) — g.src im Normalfall. */
  quelle: string;
  handleRef: (h: MediumHandle | null) => void;
}) {
  const lottieHostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  /* Lottie: nur im Browser laden (lottie-web fasst window an) und nur, wenn
     das Asset wirklich Lottie ist — sonst zoege jede Seite die Bibliothek
     unnoetig mit. */
  useEffect(() => {
    if (g.art !== "lottie") return;
    const host = lottieHostRef.current;
    if (!host) return;
    let tot = false;
    let anim: AnimationItem | null = null;

    void (async () => {
      try {
        const lottie = (await import("lottie-web")).default;
        if (tot || !host) return;
        anim = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: g.modus !== "still",
          autoplay: g.modus === "loop",
          path: quelle,
        });
        animRef.current = anim;
        if (g.modus === "scrub" || g.modus === "still") anim.goToAndStop(0, true);
        handleRef({
          setFortschritt: (t) => {
            const a = animRef.current;
            if (!a || g.modus !== "scrub") return;
            /* totalFrames ist erst nach DOMLoaded gesetzt — bis dahin 0,
               dann ist der Aufruf einfach wirkungslos. */
            a.goToAndStop(t * (a.totalFrames - 1), true);
          },
        });
      } catch {
        /* Kaputte/fremde JSON-Datei: kein Absturz, das Feld bleibt leer. */
      }
    })();

    return () => {
      tot = true;
      handleRef(null);
      anim?.destroy();
      animRef.current = null;
    };
  }, [g.art, quelle, g.modus, handleRef]);

  /* Video: Scrub schreibt currentTime, Loop laesst das Element selbst laufen. */
  useEffect(() => {
    if (g.art !== "video") return;
    const v = videoRef.current;
    if (!v) return;
    handleRef({
      setFortschritt: (t) => {
        if (g.modus !== "scrub") return;
        const d = v.duration;
        if (!Number.isFinite(d) || d <= 0) return;
        v.currentTime = t * d;
      },
    });
    return () => handleRef(null);
  }, [g.art, g.modus, handleRef]);

  if (g.art === "lottie") {
    return <div ref={lottieHostRef} className="grafik-lottie" />;
  }

  if (g.art === "video") {
    return (
      <video
        ref={videoRef}
        className="grafik-video"
        src={quelle}
        muted={g.stumm !== false}
        playsInline
        loop={g.modus === "loop"}
        autoPlay={g.modus === "loop"}
        preload="auto"
      />
    );
  }

  return <img src={quelle} alt="" draggable={false} />;
}
