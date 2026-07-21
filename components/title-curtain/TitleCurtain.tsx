"use client";

/*
 * TitleCurtain v3 – Vorhangeffekt nach VORHANG-WORKFLOW-PLAN.md.
 *
 * Kernänderung gegenüber v2: Die Grafiken sind KEINE Inline-SVGs mehr,
 * sondern austauschbare transparente PNGs nach fester Namenskonvention
 * (public/curtain/ebene-{1..3}-{links,rechts}.png, §3.1/§3.2) und alle
 * Effekt-Parameter kommen aus curtain.config.json (§3.3) – Anpassung ohne
 * Code-Eingriff.
 *
 * Ablauf-Sequenz (§2.5):
 *   1. Scroll-Lock (sticky-Pin), geschlossener Vorhang, vollfarbiger
 *      Hintergrund im hellen Markengrün
 *   2. Scrollen → drei Ebenen-Paare öffnen sich parallax nach links/rechts
 *      (Ebene 1 vorn = schnellste, Ebene 3 hinten = späteste/langsamste),
 *      Hintergrund dunkelt kontinuierlich ab
 *   3. Ebenen erreichen ihre Parkposition (ragen noch sichtbar hinein)
 *   4. Hintergrund dissolvt ins Titelbild (= Hero dahinter)
 *   5. Scroll-Lock löst sich, normale Website scrollt
 *
 * Bewährt aus v1/v2 übernommen: sticky-Pin, useScrub (JS-Pfad, umgeht
 * motions WAAPI/ViewTimeline-Delegation), sessionStorage-Latch + Reload-
 * Regel, prefers-reduced-motion-Pfad, noscript-Fallback, GrassField.
 */

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cubicBezier,
  motion,
  transform,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  type MotionValue,
} from "motion/react";
import { GrassField } from "./GrassField";
import { FaunaField } from "./FaunaField";
import { SunField } from "./SunField";
import { WildlifeField } from "./WildlifeField";
import { RiverBirth } from "../river/RiverBirth";
import type { BirthPhases, SourceExit } from "../river/river-types";
import curtainConfig from "../../curtain.config.json";
import riverConfig from "../../river.config.json";
import "./title-curtain.css";

const STORAGE_KEY = "wee-title-curtain-seen";

/* Reload-Erkennung einmal pro JS-Laufzeit */
let reloadConsumed = false;

type Mode = "pending" | "curtain" | "instant";

const easeOpen = cubicBezier(0.22, 1, 0.36, 1);
const linear = (t: number) => t;

/* ------------------------------------------------------------------ */
/* Konfiguration (curtain.config.json, §3.3)                           */
/* ------------------------------------------------------------------ */

interface TreeConf {
  file: string;
  /** Standposition: vw-Abstand von der Außenkante */
  xVw: number;
  /** Höhe in % der Bühnenhöhe */
  heightPct: number;
  /** Öffnungs-Distanz in vw (kleiner = ragt geparkt weiter hinein) */
  outVw: number;
  /** individueller Scroll-Versatz → jeder Baum bewegt sich einzeln */
  delay: number;
}

interface PlaneConf {
  rangeStart: number;
  links: TreeConf[];
  rechts: TreeConf[];
}

const CFG = {
  scrollDistanceVh: curtainConfig.scrollDistanceVh,
  bgStart: curtainConfig.background.start,
  bgEnd: curtainConfig.background.end,
  dissolve: [curtainConfig.dissolve.start, curtainConfig.dissolve.end] as const,
  openEnd: curtainConfig.layers.openEnd,
  layers: {
    "ebene-1": curtainConfig.layers["ebene-1"] as PlaneConf,
    "ebene-2": curtainConfig.layers["ebene-2"] as PlaneConf,
    "ebene-3": curtainConfig.layers["ebene-3"] as PlaneConf,
  },
  grass: curtainConfig.grass,
  sway: curtainConfig.sway,
  fauna: curtainConfig.fauna,
  sun: curtainConfig.sun,
  wildlife: curtainConfig.wildlife,
  river: curtainConfig.river,
  /* JSON liefert die Phasen-Fenster als number[] statt [number, number] –
     die Länge-2-Garantie kommt aus curtain.config.json selbst (§Aufgabe A). */
  birth: curtainConfig.birth as unknown as BirthPhases,
};

/* sourceExit kommt aus river.config.json (WP0-Fundament, gehört WP2 – hier
   nur lesend importiert): wo der Fluss aus dem fallenden Logo-Tropfen
   entspringt. Geometrie-Vertrag Bühne↔Content. */
const SOURCE_EXIT: SourceExit = riverConfig.sourceExit;

type LayerName = keyof typeof CFG.layers;
/* Renderreihenfolge hinten → vorn (§2.2: vorderste am filigransten) */
const LAYER_ORDER: LayerName[] = ["ebene-3", "ebene-2", "ebene-1"];

/* Intro: Bäume erscheinen gestaffelt (hinterste Ebene zuerst).
   Kundenfeedback: das Aufploppen wirkte hektisch – Basis-Delays und
   Bewegungsdauer deutlich gestreckt, damit der Wald über ~3,5-4,5s
   ruhig "aufwacht" statt sofort hereinzuschnellen. */
const INTRO_DELAY: Record<LayerName, number> = {
  "ebene-3": 0.2,
  "ebene-2": 0.9,
  "ebene-1": 1.6,
};
/** Versatz zwischen den Bäumen einer Ebene (Baum n+1 startet später) */
const INTRO_TREE_STAGGER = 0.22;
/** Zusätzlicher Versatz für die rechte Seite (nie exakt synchron zu links) */
const INTRO_SIDE_OFFSET = INTRO_TREE_STAGGER / 2;
/** Bewegungsdauer je Baum (y/scale) – ruhiges Wachsen statt Einschnappen */
const INTRO_DURATION = 1.65;
/** Eigene, längere Einblend-Dauer für die Opacity (weicherer Verlauf) */
const INTRO_OPACITY_DURATION = 0.7;

/* Remap-Faktor 520vh→660vh (WP1: Vorhang um die Flussgeburts-Phasen
   verlängert). Alle hart kodierten Progress-Ranges unten sind mit diesem
   Faktor skaliert, damit sie dieselbe ABSOLUTE Scrollstrecke (vh) behalten
   wie vor der Verlängerung – nur CFG.dissolve/CFG.openEnd kommen bereits
   fertig remappt aus curtain.config.json. */
const REMAP = 520 / 660;

const TITLE_OUT: [number, number] = [
  CFG.dissolve[0] - 0.12 * REMAP,
  CFG.dissolve[0],
];

/* ------------------------------------------------------------------ */
/* Scrub über den JS-Pfad (WAAPI-Gotcha, siehe v1/README)              */
/* ------------------------------------------------------------------ */

type Ease = (t: number) => number;

function useScrub(
  progress: MotionValue<number>,
  input: number[],
  output: (string | number)[],
  options?: { ease?: Ease | Ease[] },
) {
  const value = useMotionValue(
    transform(progress.get(), input, output, options),
  );
  useMotionValueEvent(progress, "change", (v) => {
    value.set(transform(v, input, output, options));
  });
  useEffect(() => {
    value.set(transform(progress.get(), input, output, options));
  });
  return value;
}

/* ------------------------------------------------------------------ */
/* Ein einzelner Baum: eigene Standposition, Distanz und Versatz       */
/* ------------------------------------------------------------------ */

function TreeSprite({
  tree,
  side,
  rangeStart,
  baseDelay,
  index,
  progress,
  vorhangId,
}: {
  tree: TreeConf;
  side: "links" | "rechts";
  rangeStart: number;
  baseDelay: number;
  index: number;
  progress: MotionValue<number>;
  /** Stabile Platz-ID ("ebene:seite:index") — nur als DOM-Attribut (s.u.),
   *  damit der Grafik-Editor diesen Baum bei der Uebernahme wiederfindet
   *  (s. GrafikSeiteTab.tsx). Beeinflusst die Optik/Animation NICHT. */
  vorhangId: string;
}) {
  const sign = side === "links" ? -1 : 1;
  /* Ebenen-Parallax (rangeStart) + Baum-Delay: jeder Baum löst einzeln */
  const start = Math.min(rangeStart + tree.delay, CFG.openEnd - 0.12 * REMAP);
  const x = useScrub(
    progress,
    [start, CFG.openEnd, 1],
    ["0vw", `${sign * tree.outVw}vw`, `${sign * tree.outVw}vw`],
    { ease: [easeOpen, linear] },
  );

  const introDelay =
    baseDelay +
    index * INTRO_TREE_STAGGER +
    (side === "rechts" ? INTRO_SIDE_OFFSET : 0);

  return (
    <motion.div
      className="tc-tree"
      style={{
        x,
        height: `${tree.heightPct}%`,
        ...(side === "links"
          ? { left: `${tree.xVw}vw` }
          : { right: `${tree.xVw}vw` }),
      }}
    >
      <motion.img
        className={`tc-tree__img${CFG.sway ? ` tc-sway tc-sway--v${(index % 3) + 1}` : ""}`}
        src={`/curtain/trees/${tree.file}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-vorhang-id={vorhangId}
        initial={{ y: 60, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{
          duration: INTRO_DURATION,
          delay: introDelay,
          ease: easeOpen,
          opacity: { duration: INTRO_OPACITY_DURATION, delay: introDelay },
        }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

export interface TitleCurtainProps {
  kicker: string;
  title: ReactNode;
  logoSrc?: string;
  logoAlt?: string;
  children: ReactNode;
  /** Stabile Plaetze ("ebene:seite:index"), die der Grafik-Editor bereits in
   *  eine Builder-Grafik uebernommen hat (s. GrafikSeiteTab.tsx) — werden
   *  hier NICHT gezeichnet, damit der Baum nicht doppelt dasteht. Rein
   *  datengetrieben: TitleCurtain kennt keine Baumnamen, nur diese IDs.
   *  Kommt auf der echten Landing aus grafik.config.json, im Editor aus dem
   *  Live-Zustand (s. app/page.tsx). Leer/fehlend = unverändertes Verhalten. */
  uebernommen?: string[];
}

export function TitleCurtain({
  kicker,
  title,
  logoSrc = "/images/logo-weiss.png",
  logoAlt = "World Eden Era",
  children,
  uebernommen = [],
}: TitleCurtainProps) {
  const [mode, setMode] = useState<Mode>("pending");
  const driverRef = useRef<HTMLDivElement>(null);
  /* Ausgangsposition des Logo-Tropfens für RiverBirth (misst per
     getBoundingClientRect, siehe RiverBirth.tsx). */
  const logoRef = useRef<HTMLImageElement>(null);
  /* Pro-Instanz-Cache der Entscheidung (NICHT Modul-Scope – eine neue
     Instanz bei Client-Navigation muss frisch entscheiden). Überlebt den
     StrictMode-Doppellauf des Effekts unten, da Refs zwischen den beiden
     Läufen derselben Komponenten-Instanz erhalten bleiben. */
  const decidedRef = useRef<Mode | null>(null);

  const { scrollYProgress } = useScroll({
    target: driverRef,
    offset: ["start start", "end end"],
  });

  useLayoutEffect(() => {
    /* Reduced-Motion-Query auch für Laufzeit-Wechsel (unten) offen halten,
       nicht nur für den einmaligen .matches-Check. */
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      /* Schaltet der Nutzer Reduced-Motion während des gepinnten Vorhangs
         ein, bleibt sonst der Inline-Height am Driver stehen und die
         Website scrollt durch leeren Raum (Hero steht auf Opacity~0). */
      if (e.matches) {
        decidedRef.current = "instant";
        setMode("instant");
      }
    };
    mq.addEventListener("change", onReducedMotionChange);

    if (decidedRef.current) {
      /* StrictMode-Härtung: der zweite Effekt-Lauf darf sessionStorage
         nicht erneut lesen/schreiben (würde die eben gesetzte '1' sehen
         und fälschlich auf 'instant' kippen) – stattdessen die bereits
         getroffene Entscheidung wiederverwenden. */
      setMode(decidedRef.current);
    } else if (mq.matches) {
      decidedRef.current = "instant";
      setMode("instant");
    } else {
      let freshReload = false;
      if (!reloadConsumed) {
        reloadConsumed = true;
        const nav = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        freshReload = nav?.type === "reload";
      }
      let seen = false;
      try {
        seen = window.sessionStorage.getItem(STORAGE_KEY) === "1";
      } catch {
        /* Storage gesperrt → wie ungesehen behandeln */
      }
      if (seen && !freshReload) {
        decidedRef.current = "instant";
        setMode("instant");
      } else {
        try {
          window.sessionStorage.setItem(STORAGE_KEY, "1");
        } catch {
          /* ohne Storage läuft der Vorhang schlimmstenfalls erneut */
        }
        decidedRef.current = "curtain";
        setMode("curtain");
      }
    }

    return () => mq.removeEventListener("change", onReducedMotionChange);
  }, []);

  /* Hintergrund: helles Markengrün → kontinuierlich dunkler (§2.4) */
  const bgColor = useScrub(
    scrollYProgress,
    [0, CFG.openEnd],
    [CFG.bgStart, CFG.bgEnd],
  );
  /* Dissolve ins Titelbild: Vollfarbfläche löst sich auf (§2.4/§2.5) */
  const bgOpacity = useScrub(scrollYProgress, [...CFG.dissolve], [1, 0]);
  const heroOpacity = useScrub(scrollYProgress, [...CFG.dissolve], [0, 1]);
  const heroScale = useScrub(
    scrollYProgress,
    [CFG.dissolve[0], 0.97 * REMAP],
    [1.06, 1],
    { ease: easeOpen },
  );
  const centerOpacity = useScrub(scrollYProgress, [...TITLE_OUT], [1, 0]);
  const centerY = useScrub(scrollYProgress, [...TITLE_OUT], [0, -34]);
  const hintOpacity = useScrub(
    scrollYProgress,
    [0, 0.02 * REMAP, CFG.openEnd - 0.1 * REMAP, CFG.openEnd],
    [0.9, 0.9, 0.9, 0],
  );
  const grassOpacity = useScrub(
    scrollYProgress,
    [CFG.dissolve[0] - 0.06 * REMAP, CFG.dissolve[1] - 0.08 * REMAP],
    [1, 0],
  );
  const grassY = useScrub(
    scrollYProgress,
    [CFG.dissolve[0] - 0.06 * REMAP, CFG.dissolve[1]],
    [0, 60],
  );
  const faunaOpacity = useScrub(
    scrollYProgress,
    [CFG.dissolve[0] - 0.06 * REMAP, CFG.dissolve[1] - 0.08 * REMAP],
    [1, 0],
  );
  const faunaY = useScrub(
    scrollYProgress,
    [CFG.dissolve[0] - 0.06 * REMAP, CFG.dissolve[1] - 0.08 * REMAP],
    [0, 40],
  );
  /* Sonne: verschwindet früh nach oben aus dem Bild (Scroll-Scrub, kein
     Timer) – lange bevor die Bäume/der Vorhang sich vollständig öffnen. */
  const sunY = useScrub(scrollYProgress, [0.02 * REMAP, 0.3 * REMAP], ["0svh", "-50svh"]);
  const sunOpacity = useScrub(scrollYProgress, [0.2 * REMAP, 0.3 * REMAP], [1, 0]);

  /* ---- Logo → Wassertropfen (WP1) --------------------------------
     Das Logo löst sich aus dem Titel-Verbund: Kicker/Titel behalten das
     bisherige Exit-Verhalten (TITLE_OUT), das Logo bleibt sichtbar und
     driftet eigenständig von seiner Layout-Position Richtung Bühnenmitte,
     bis RiverBirth am Anfang der crossfade-Phase übernimmt (dort wird die
     tatsächliche Endposition per getBoundingClientRect gemessen). */
  const logoY = useScrub(
    scrollYProgress,
    [TITLE_OUT[0], CFG.birth.crossfade[0]],
    ["0svh", "11svh"],
    { ease: easeOpen },
  );
  const logoDriftScale = useScrub(
    scrollYProgress,
    [TITLE_OUT[0], CFG.birth.crossfade[0]],
    [1, 1.12],
    { ease: easeOpen },
  );
  /* Logo blendet erst während der crossfade-Phase aus (RiverBirths Tropfen
     blendet im Gegenzug ein) – bis dahin bleibt es voll sichtbar. */
  const logoOpacity = useScrub(scrollYProgress, [...CFG.birth.crossfade], [1, 0]);
  /* Gemeinsamer, dezenter Scale-Puls während crossfade – kaschiert die
     Silhouetten-Differenz Logo↔Tropfen (RiverBirth berechnet exakt denselben
     Puls unabhängig für den Tropfen, deterministisch aus progress+birth). */
  const logoCrossfadeMid =
    (CFG.birth.crossfade[0] + CFG.birth.crossfade[1]) / 2;
  const logoPulse = useScrub(
    scrollYProgress,
    [CFG.birth.crossfade[0], logoCrossfadeMid, CFG.birth.crossfade[1]],
    [1, 1.06, 1],
  );

  if (mode === "instant") {
    return <>{children}</>;
  }

  /* Uebernommene Plaetze als Set fuer O(1)-Nachschlag im Render-Loop unten —
     bewusst hier (nicht frueher) berechnet: im "instant"-Zweig oben wird sie
     gar nicht gebraucht. */
  const uebernommenSet = new Set(uebernommen);

  return (
    <div
      ref={driverRef}
      className={`tc-driver${mode === "curtain" ? " tc-driver--active" : ""}`}
      style={
        mode === "curtain"
          ? { height: `${CFG.scrollDistanceVh}vh` }
          : undefined
      }
    >
      <div className="tc-stage">
        <motion.div
          className="tc-hero"
          style={{ scale: heroScale, opacity: heroOpacity }}
        >
          {children}
        </motion.div>

        <div className="tc-overlay" aria-hidden="true">
          {/* Vollfarbige Fläche (kein Verlauf – §2.4), dissolvt ins Titelbild */}
          <motion.div
            className="tc-bg"
            style={{ backgroundColor: bgColor, opacity: bgOpacity }}
          />

          <div className="tc-title-block">
            {/* Logo: eigener Scrub, bleibt sichtbar (siehe logoY/-Scale/
                -Opacity/-Pulse oben) – löst sich aus dem Kicker/Titel-Exit
                heraus und wird ab birth.crossfade[0] zum Wassertropfen
                (RiverBirth misst logoRef an genau diesem Punkt). */}
            <motion.div
              className="tc-logo-wrap"
              style={{ y: logoY, scale: logoDriftScale }}
            >
              <motion.img
                ref={logoRef}
                className="tc-logo"
                src={logoSrc}
                alt={logoAlt}
                width={92}
                height={92}
                style={{ opacity: logoOpacity, scale: logoPulse }}
              />
            </motion.div>

            <motion.div
              className="tc-center"
              style={{ opacity: centerOpacity, y: centerY }}
            >
              <p className="tc-kicker">{kicker}</p>
              <h2 className="tc-title">{title}</h2>
            </motion.div>
          </div>

          {/* Drei Ebenen, hinten → vorn – jeder Baum ein eigenes,
              einzeln animiertes Sprite (Position/Distanz/Versatz aus Config).
              Baeume, deren stabile Platz-ID in `uebernommen` steht, werden
              HIER uebersprungen (return null) — sie werden dann als normale
              Grafik vom Builder gezeichnet (s. GrafikLayer/GrafikSeiteTab),
              curtain.config.json bleibt dabei unangetastet. */}
          {LAYER_ORDER.map((name) => {
            const plane = CFG.layers[name];
            return (
              <Fragment key={name}>
                <div className={`tc-plane tc-plane--${name}`}>
                  {(["links", "rechts"] as const).map((side) =>
                    plane[side].map((tree, i) => {
                      const vorhangId = `${name}:${side}:${i}`;
                      if (uebernommenSet.has(vorhangId)) return null;
                      return (
                        <TreeSprite
                          key={vorhangId}
                          tree={tree}
                          side={side}
                          rangeStart={plane.rangeStart}
                          baseDelay={INTRO_DELAY[name]}
                          index={i}
                          progress={scrollYProgress}
                          vorhangId={vorhangId}
                        />
                      );
                    }),
                  )}
                </div>
                {/* Reh-Slot: zwischen ebene-2 (hinten) und ebene-1 (vorn) im
                    DOM eingehängt – verschwindet dadurch automatisch hinter
                    den vorderen Baum-Sprites von ebene-1 und taucht in deren
                    Lücken wieder auf (Tiefen-Occlusion über DOM-Reihenfolge,
                    kein z-index-Trick, siehe WildlifeField-Kommentar). */}
                {CFG.wildlife && name === "ebene-2" && (
                  <WildlifeField variant="reh" progress={scrollYProgress} />
                )}
              </Fragment>
            );
          })}

          {/* Hase-Slot: nach allen Baum-Ebenen (vor Sonne/Gras) – läuft ganz
              vorn auf der Wiese, nie von Bäumen verdeckt. */}
          {CFG.wildlife && (
            <WildlifeField variant="hase" progress={scrollYProgress} />
          )}

          {/* Licht-Schacht-Overlay, ÜBER den Bäumen (DOM-Reihenfolge NACH
              den .tc-plane-Ebenen) – Licht scheint durchs Blätterdach auf
              die Szene. Blendet nach Mount sanft ein, verschwindet beim
              Scrollen scroll-scrubbed nach oben aus dem Bild. */}
          {CFG.sun && (
            <motion.div
              className="tc-sun-wrap"
              style={{ y: sunY, opacity: sunOpacity }}
            >
              <motion.div
                style={{ position: "absolute", inset: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, delay: 0.2, ease: easeOpen }}
              >
                <SunField />
              </motion.div>
            </motion.div>
          )}

          {CFG.grass && (
            <motion.div
              className="tc-grass-wrap"
              style={{ opacity: grassOpacity, y: grassY }}
            >
              <GrassField />
            </motion.div>
          )}

          {CFG.fauna && (
            <motion.div
              className="tc-fauna-wrap"
              style={{ opacity: faunaOpacity, y: faunaY }}
            >
              <FaunaField />
            </motion.div>
          )}

          {/* Geburt des Flusses (WP1): Logo-Tropfen löst sich, fällt,
              spritzt auf, Fluss entspringt – über allen Ebenen inkl.
              Gras/Fauna, eigener Wrapper (pointer-events:none in
              river-birth.css). */}
          {CFG.river && mode === "curtain" && (
            <RiverBirth
              progress={scrollYProgress}
              logoRef={logoRef}
              birth={CFG.birth}
              sourceExit={SOURCE_EXIT}
            />
          )}

          <motion.div className="tc-hint" style={{ opacity: hintOpacity }}>
            <span className="tc-hint__label">Scrollen</span>
            <span className="tc-hint__line" />
          </motion.div>
        </div>

        <noscript>
          <style>{`.tc-overlay{display:none}.tc-driver{height:auto!important}.tc-hero{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </div>
    </div>
  );
}
