"use client";

/*
 * HomePageContent – Hero/Vorhang + Bens komplette Landing-Struktur (7
 * Sektionen) innerhalb der Fluss-Zone (RiverFlow, WP2). Texte sind 1:1 aus
 * content/home.ts der Hauptseite übernommen (siehe
 * WEE-Website-V2-main-ben-aktuell) – hier hart codiert statt über den
 * PageContent-Renderer der Hauptseite, weil dieses Prototyp-Repo dessen
 * Block-Rendering-Infrastruktur nicht mitbringt.
 *
 * "use client": die Stats-Sektion braucht einen IntersectionObserver für
 * den Count-up-Effekt – die ganze Komponente ist deshalb Client-Komponente.
 *
 * EIGENE DATEI statt Teil von app/page.tsx (dort lag der Code urspruenglich):
 * Next.js' App Router erlaubt fuer app/page.tsx NUR einen festen Satz von
 * Exports (default + ein paar Routen-Config-Exports wie metadata) und
 * prueft den Props-Typ des default-Exports strikt gegen sein eigenes
 * PageProps (.next/types/app/page.ts) — sowohl eine zusaetzliche eigene Prop
 * auf dem default-Export ALS AUCH ein zusaetzlicher benannter Export lassen
 * den Build mit TS2559/TS2344 scheitern ("has no properties/properties in
 * common with type 'PageProps'"). Der Backdrop-Modus braucht aber genau das:
 * eine optionale `backdrop`-Prop, wiederverwendbar von /grafik-editor UND
 * /fluss-editor. Deshalb lebt die eigentliche Seite hier (normale
 * Komponenten-Datei, keine Exportbeschraenkung) — app/page.tsx ist nur noch
 * ein schlanker, propless Wrapper (`export default function HomePage() {
 * return <HomePageContent />; }`).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { TitleCurtain } from "@/components/title-curtain/TitleCurtain";
import { RiverFlow } from "@/components/river/RiverFlow";
import { GrafikLayer } from "@/components/grafik/GrafikLayer";
import {
  KONFIG_GRAFIKEN,
  KONFIG_GRAFIKEN_DOC_H,
  KONFIG_UEBERNOMMEN,
  useGrafiken,
} from "@/components/grafik/GrafikContext";
import { ShapeAccent } from "@/components/ShapeAccent";
import { TextureField } from "@/components/TextureField";

/* Bens echte Akzent-Rotation für Projekt-Karten (Blocks.tsx, CARD_ACCENTS). */
const CARD_ACCENTS = [
  { variant: "blob-a" as const, color: "accent" as const, position: "top-right" as const },
  { variant: "blob-b" as const, color: "green" as const, position: "bottom-left" as const },
  { variant: "blob-c" as const, color: "sand" as const, position: "top-left" as const },
];

/* ------------------------------------------------------------------ */
/* Daten (1:1 aus content/home.ts, siehe Dateikopf)                    */
/* ------------------------------------------------------------------ */

interface Cta {
  label: string;
  href: string;
  external?: boolean;
  variant?: "outline";
}

interface BausteinItem {
  title: string;
  text: string;
}

interface ProjektItem {
  image: { src: string; alt: string; width: number; height: number };
  title: string;
  text: string;
  cta?: Cta;
}

interface StatItem {
  value: number;
  suffix?: string;
  label: string;
}

interface AskItem {
  title: string;
  text: string;
  cta?: Cta;
}

const MISSION_PARAGRAPH =
  "Wir bei World Eden Era (WEE) sind eine gemeinnützige Organisation, die innovative und skalierbare Lösungen für nachhaltige Ernährungssysteme entwickelt. Angesichts globaler Herausforderungen wie Klimawandel, Bevölkerungswachstum und Ressourcenknappheit sind zentrale Versorgungssysteme zunehmend fragil. Unser zentrales Anliegen ist es, Ernährungssicherheit insbesondere in klimatisch, sozial oder politisch vulnerablen Regionen zu stärken. Wir verstehen Landwirtschaft nicht nur als Produktionsform, sondern als strategisches Instrument: zur Überwindung von Armutsspiralen, zur Stabilisierung von Gemeinschaften und zur Förderung langfristiger Unabhängigkeit.";

const HALTUNG_TEXT =
  "Wir träumen nicht von einer Rückkehr in die Vergangenheit, sondern arbeiten an einer Ära, in der Mensch, Natur und Technologie in regenerativer Symbiose existieren. Back to the Nature – but smarter.";

const OASIS_PROSE_PARAGRAPH =
  "Project Oasis ist unser ganzheitliches Systemkonzept für eine dezentrale, ressourcenschonende Lebensmittelproduktion. Im Zentrum steht ein modulares aquaponisches Gewächshaussystem, das Pflanzenanbau und Fischzucht in einem geschlossenen Kreislauf verbindet. Ergänzt durch regenerative Landnutzungsansätze wie die Permakultur, ermöglicht das System eine kontinuierliche Nahrungsmittelversorgung, selbst unter herausfordernden klimatischen Bedingungen. Somit reduziert das System Abhängigkeiten von globalen Märkten, verkürzt Transportwege und ermöglicht direkte lokale Wertschöpfung.";

const BAUSTEINE: BausteinItem[] = [
  {
    title: "Aquaponik",
    text: "Bildet den produktiven Kern. In einem geschlossenen Kreislaufsystem werden Pflanzenanbau und Fischzucht ressourceneffizient verbunden, wodurch eine kontinuierliche, lokale Lebensmittelproduktion entsteht.",
  },
  {
    title: "Geo-Dome",
    text: "Die geodätische Gewächshausstruktur (Ikosaeder) bietet maximale Stabilität bei geringem Materialaufwand und schafft ein klimaresilientes Mikroklima für ganzjährige Erträge.",
  },
  {
    title: "Permakultur",
    text: "Permakulturelle Ergänzungen erweitern das System durch regenerative Landnutzung und Bodenaufbau. Es entstehen stabile Mikroökosysteme, die ökologische Regeneration aktiv fördern.",
  },
  {
    title: "Community",
    text: "Wissenstransfer und lokale Wertschöpfung bilden das soziale Fundament. Wir schaffen praxisnahe Lernräume und stärken die Eigenständigkeit der Menschen vor Ort.",
  },
];

const PROJEKTE: ProjektItem[] = [
  {
    image: { src: "/images/projekt-pilot-card.jpeg", alt: "Pilotprojekt", width: 768, height: 432 },
    title: "Pilotprojekt (in Planung)",
    text: "Wissenschaftliche Begleitung und Weiterentwicklung unseres Systems unter realen Bedingungen. Praxisnah, zukunftsorientiert und die fundierte Basis für eine weltweite Skalierung.",
    cta: { label: "Zum Pilot Projekt", href: "/pilot-projekt/", variant: "outline" },
  },
  {
    image: {
      src: "/images/projekt-mountainspring-card.jpeg",
      alt: "Project Mountainspring in der Humla-Region, Nepal",
      width: 1024,
      height: 576,
    },
    title: "Project Mountainspring (in Planung)",
    text: "In der sozial stark benachteiligten Humla-Region in Nepal wollen wir gemeinsam mit Nepal Women neue Perspektiven schaffen. Durch dezentrale Nahrungsmittelproduktion soll die Ernährungssicherheit gefördert und Frauen durch echte Hilfe zur Selbsthilfe gestärkt werden.",
  },
];

const STATS: StatItem[] = [
  { value: 1, label: "geplanter Pilotstandort in Leipzig" },
  { value: 4, label: "Systembausteine" },
  { value: 7, label: "Projektphasen bis zur Ernte" },
  { value: 100, suffix: " %", label: "der Spenden fließen in Projekte" },
];

const DONATE_URL = "https://secure.spendenbank.de/form/3930?langid=1";
const INSTAGRAM_URL = "https://www.instagram.com/worldedenera/";

const CTA_BAND_INTRO =
  "Es gibt viele Möglichkeiten wie du unsere Mission unterstützen kannst. Jeder Beitrag macht einen Unterschied.";

const ASKS: AskItem[] = [
  {
    title: "Sorge dafür, dass Projekte Realität werden.",
    text: "Mit deiner Spende oder Patenschaft finanzierst du direkt Project Oasis, um Menschen in Not unabhängig zu machen.",
    cta: { label: "Jetzt spenden", href: DONATE_URL, external: true },
  },
  {
    title: "Pack mit an, statt nur zuzusehen.",
    text: "Ob freiwillig, ehrenamtlich oder als Partner Betrieb: Gemeinsam entwickeln wir Lösungen, die wirklich funktionieren und die Welt ein Stück besser machen.",
  },
  {
    title: "Teilen. Inspirieren. Wirken.",
    text: "Folge uns, teile unsere Inhalte und verbreite unsere Vision. Schon ein Klick kann Bewusstsein schaffen und Projekte sichtbar machen.",
    cta: { label: "Folge uns", href: INSTAGRAM_URL, external: true, variant: "outline" },
  },
];

/* ------------------------------------------------------------------ */
/* Kleine Bausteine                                                     */
/* ------------------------------------------------------------------ */

function CtaLink({ label, href, external, variant }: Cta) {
  const className = `btn ${variant === "outline" ? "btn--outline" : "btn--primary"}`;
  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

/* Count-up-Dauer in Millisekunden (Kundenwert: "leicht", also kurz+dezent). */
const STATS_COUNT_UP_MS = 1200;

function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setValue(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / STATS_COUNT_UP_MS);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return value;
}

/* Feuert den Count-up einmalig beim Einscrollen, kein Reset beim Verlassen. */
const STATS_TRIGGER_THRESHOLD = 0.4;

function StatTile({ stat, index }: { stat: StatItem; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { threshold: STATS_TRIGGER_THRESHOLD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const value = useCountUp(stat.value, active);
  const finalText = `${stat.value.toLocaleString("de-DE")}${stat.suffix ?? ""}`;

  return (
    <div className="stat-tile" ref={ref} data-og-id={`stats:kachel:${index}`} data-og-typ="text">
      {/* Ghost/Live-Zwilling (Bens echte Stats.tsx-Technik): der unsichtbare
          Ghost-Text reserviert von Anfang an die Endbreite, damit das
          Hochzählen keine Breiten-Neuverteilung der Nachbar-Kacheln
          auslöst. */}
      <div className="stat-value-shell">
        <div className="stat-value stat-value--ghost" aria-hidden="true">
          {finalText}
        </div>
        <div className="stat-value stat-value--live">
          {value.toLocaleString("de-DE")}
          {stat.suffix ?? ""}
        </div>
      </div>
      <div className="stat-label">{stat.label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface HomePageProps {
  /** Backdrop-Modus (/grafik-editor, /fluss-editor): eine FREMDE Website
   *  (Screenshot oder Single-File-HTML, s. components/backdrop/) ersetzt
   *  Vorhang + die 7 echten Sektionen als Inhalt der Fluss-Zone — RiverFlow
   *  und GrafikLayer bleiben UNVERAENDERT im Einsatz (beide sind bereits
   *  backdrop-agnostisch: RiverFlow braucht nur einen Kind-Container zum
   *  Umschliessen, GrafikLayer positioniert rein in Dokument-Koordinaten).
   *  Ohne dieses Prop (der Fall auf der echten Landing "/", s. app/page.tsx)
   *  aendert sich NICHTS am bisherigen Rendering. */
  backdrop?: ReactNode;
}

export function HomePageContent({ backdrop }: HomePageProps) {
  /* Vorhang-Uebernahme (s. TitleCurtain-Prop "uebernommen"): im Editor
     ueberschreibt der Live-Context die feste Konfiguration — exakt dasselbe
     Muster wie GrafikLayer weiter unten. Auf der echten Landing existiert
     kein Provider, ctx ist dann null und KONFIG_UEBERNOMMEN (aus
     grafik.config.json) greift, ohne die Seite zu veraendern. */
  const grafikCtx = useGrafiken();
  const uebernommen = grafikCtx?.uebernommen ?? KONFIG_UEBERNOMMEN;

  /* Backdrop-Modus: weder Vorhang noch Bens 7 Sektionen — nur die fremde
     Seite innerhalb derselben Fluss-Zone + die Grafik-Ebene darueber. Eigener
     frueher Return statt einer Inline-Verzweigung im JSX, damit der
     Normalfall (Landing) unten UNVERAENDERT lesbar bleibt. */
  if (backdrop) {
    return (
      <main>
        <RiverFlow>{backdrop}</RiverFlow>
        <GrafikLayer grafiken={KONFIG_GRAFIKEN} authoredDocH={KONFIG_GRAFIKEN_DOC_H} />
      </main>
    );
  }

  return (
    <main>
      <TitleCurtain
        kicker="Nachhaltige Ernährungssysteme"
        title={
          <>
            Together, <span style={{ color: "var(--green-400)" }}>WEE</span>{" "}
            can.
          </>
        }
        uebernommen={uebernommen}
      >
        <section className="hero" data-og-id="hero:sektion:0" data-og-typ="sektion">
          <div
            className="hero__bg"
            style={{ backgroundImage: "url(/images/hero-fields-aerial.jpg)" }}
            data-og-id="hero:hintergrund:0"
            data-og-typ="hintergrund"
          />
          <div className="hero__overlay" data-og-id="hero:overlay:0" data-og-typ="deko" />
          <div className="hero__inner">
            <p className="hero__kicker" data-og-id="hero:kicker:0" data-og-typ="text">
              World Eden Era
            </p>
            <h1 className="hero__title" data-og-id="hero:titel:0" data-og-typ="text">
              Back to the Nature – but smarter.
            </h1>
            <p className="hero__lead" data-og-id="hero:lead:0" data-og-typ="text">
              Gemeinsam Ernährung sichern. Global. Nachhaltige und resiliente
              Ernährungssysteme – für eine Welt im Wandel.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary" href="#mission">
                Project Oasis entdecken
              </a>
              <a className="btn btn--outline" href="#mitmachen">
                Jetzt unterstützen
              </a>
            </div>
          </div>
        </section>
      </TitleCurtain>

      {/* Bens Original-Landingpage 1:1 (Texte + Markup + CSS-Klassen aus
          WEE-Website-V2-main-ben-aktuell) – der Fluss läuft als Hinter-
          grundelement hinter den Sektionen (Integration folgt als eigener
          nächster Schritt). Abweichungen von Bens Original nur exakt dort,
          wo explizit gewünscht: Mission/Oasis-Prose ohne Bild (Platz bleibt
          frei, Text links bzw. rechts), Bausteine als diagonale Treppe
          statt Bens Standard-Grid, Projekte unverändert als Bens Paar. */}
      <RiverFlow>
        <section
          className="section block-prose"
          id="mission"
          data-og-id="mission:sektion:0"
          data-og-typ="sektion"
        >
          <TextureField variant="light" ogId="mission:textur:0" ogTyp="deko" />
          <div className="container block-prose__inner block-prose__inner--text-only">
            <div className="block-prose__text">
              <p className="kicker" data-og-id="mission:kicker:0" data-og-typ="text">
                Unsere Mission
              </p>
              <h2 data-og-id="mission:titel:0" data-og-typ="text">Unsere Mission</h2>
              <p data-og-id="mission:text:0" data-og-typ="text">{MISSION_PARAGRAPH}</p>
            </div>
          </div>
        </section>

        <section
          className="section block-statement"
          id="haltung"
          data-og-id="haltung:sektion:0"
          data-og-typ="sektion"
        >
          <TextureField variant="dark" ogId="haltung:textur:0" ogTyp="deko" />
          <div className="container block-statement__inner">
            <ShapeAccent
              variant="arc"
              color="green"
              position="bottom-right"
              size={260}
              ogId="haltung:akzent:0"
              ogTyp="deko"
            />
            <p className="eyebrow" data-og-id="haltung:kicker:0" data-og-typ="text">
              Unsere Haltung
            </p>
            <p className="block-statement__text" data-og-id="haltung:text:0" data-og-typ="text">
              {HALTUNG_TEXT}
            </p>
            <div className="cta-row">
              <CtaLink label="Lerne uns kennen" href="/organisation/" variant="outline" />
            </div>
          </div>
        </section>

        <section
          className="section block-prose"
          id="oasis-prose"
          data-og-id="oasis:sektion:0"
          data-og-typ="sektion"
        >
          <TextureField variant="light" ogId="oasis:textur:0" ogTyp="deko" />
          <div className="container block-prose__inner block-prose__inner--text-only">
            <div className="block-prose__text">
              <h2 data-og-id="oasis:titel:0" data-og-typ="text">
                Project Oasis, Back to the Nature
              </h2>
              <p data-og-id="oasis:text:0" data-og-typ="text">{OASIS_PROSE_PARAGRAPH}</p>
              <div className="cta-row">
                <CtaLink label="Wie verändert Project Oasis?" href="/project-oasis/" />
              </div>
            </div>
          </div>
        </section>

        <section
          className="section block-features block-features--cycle"
          id="bausteine"
          data-og-id="bausteine:sektion:0"
          data-og-typ="sektion"
        >
          <div className="container">
            <p className="kicker" data-og-id="bausteine:kicker:0" data-og-typ="text">
              Project Oasis
            </p>
            <h2 data-og-id="bausteine:titel:0" data-og-typ="text">Project Oasis</h2>
            <div className="features-cycle">
              <ShapeAccent
                variant="blob-b"
                color="green"
                position="top-left"
                size={180}
                ogId="bausteine:akzent:0"
                ogTyp="deko"
              />
              <svg
                className="features-cycle__loop"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                data-og-id="bausteine:schleife:0"
                data-og-typ="deko"
              >
                <rect
                  x="4"
                  y="4"
                  width="92"
                  height="92"
                  rx="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.6"
                  strokeDasharray="1.6 3.2"
                />
              </svg>
              <div className="features-cycle__grid features-cycle__grid--diagonal">
                <div className="features-cycle__row features-cycle__row--top">
                  {BAUSTEINE.slice(0, 2).map((item, i) => (
                    <article
                      className="features-cycle__item"
                      key={item.title}
                      data-og-id={`bausteine:baustein:${i}`}
                      data-og-typ="sektion"
                    >
                      <span className="features-cycle__no">{i + 1}</span>
                      <h3 data-og-id={`bausteine:baustein-titel:${i}`} data-og-typ="text">
                        {item.title}
                      </h3>
                      <p data-og-id={`bausteine:baustein-text:${i}`} data-og-typ="text">
                        {item.text}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="features-cycle__row features-cycle__row--bottom">
                  {BAUSTEINE.slice(2, 4).map((item, i) => (
                    <article
                      className="features-cycle__item"
                      key={item.title}
                      data-og-id={`bausteine:baustein:${i + 2}`}
                      data-og-typ="sektion"
                    >
                      <span className="features-cycle__no">{i + 3}</span>
                      <h3 data-og-id={`bausteine:baustein-titel:${i + 2}`} data-og-typ="text">
                        {item.title}
                      </h3>
                      <p data-og-id={`bausteine:baustein-text:${i + 2}`} data-og-typ="text">
                        {item.text}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="section block-cards"
          id="projekte"
          data-og-id="projekte:sektion:0"
          data-og-typ="sektion"
        >
          <div className="container">
            <h2 data-og-id="projekte:titel:0" data-og-typ="text">Projekte</h2>
            <div className="grid grid--2">
              {PROJEKTE.map((item, i) => (
                <div
                  className="block-cards__item"
                  key={item.title}
                  data-og-id={`projekte:karte:${i}`}
                  data-og-typ="sektion"
                >
                  <ShapeAccent
                    {...CARD_ACCENTS[i % CARD_ACCENTS.length]}
                    size={180}
                    ogId={`projekte:akzent:${i}`}
                    ogTyp="deko"
                  />
                  <article className="card card--media">
                    <img
                      src={item.image.src}
                      alt={item.image.alt}
                      width={item.image.width}
                      height={item.image.height}
                      loading="lazy"
                      data-og-id={`projekte:bild:${i}`}
                      data-og-typ="bild"
                    />
                    <h3 data-og-id={`projekte:titel-karte:${i}`} data-og-typ="text">
                      {item.title}
                    </h3>
                    <p data-og-id={`projekte:text:${i}`} data-og-typ="text">{item.text}</p>
                    {item.cta && (
                      <div className="cta-row">
                        <CtaLink {...item.cta} />
                      </div>
                    )}
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="section block-stats"
          id="stats"
          data-og-id="stats:sektion:0"
          data-og-typ="sektion"
        >
          <TextureField variant="dark" ogId="stats:textur:0" ogTyp="deko" />
          <ShapeAccent
            variant="blob-a"
            color="green"
            position="bottom-right"
            size={220}
            ogId="stats:akzent:0"
            ogTyp="deko"
          />
          <div className="container">
            <p className="eyebrow eyebrow--on-dark" data-og-id="stats:kicker:0" data-og-typ="text">
              WEE in Zahlen
            </p>
            <h2 data-og-id="stats:titel:0" data-og-typ="text">Vom Konzept zur Wirkung</h2>
            <div className="stats-grid">
              {STATS.map((stat, i) => (
                <StatTile stat={stat} index={i} key={stat.label} />
              ))}
            </div>
          </div>
        </section>

        <section
          className="section section--tal"
          id="tal"
          data-og-id="tal:sektion:0"
          data-og-typ="sektion"
        >
          {/* Layout-Platzhalter: Felswand/Wasserfall/See sind in F1a
              stillgelegt und kommen in F2/F3 neu (river.config.json:
              disabledWaypointTypes) – der dunkle Boden + CTA bleiben. Der
              Rest der Sektion (Ben's block-ctaband) ist v3-eigene
              Erweiterung fürs Fluss-Finale, existiert auf Bens echter Seite
              so nicht (dort ist ctaBand ein normaler heller Block). */}
          <div className="tal-cliff" aria-hidden="true" data-og-id="tal:deko:0" data-og-typ="deko" />
          <div className="tal-floor block-ctaband cta-band">
            <div className="container">
              <h2 data-og-id="tal:titel:0" data-og-typ="text">Werde selbst aktiv</h2>
              <p className="block-intro" data-og-id="tal:intro:0" data-og-typ="text">
                {CTA_BAND_INTRO}
              </p>
              <div className="grid grid--3 block-ctaband__grid">
                {ASKS.map((ask, i) => (
                  <article
                    className={i === 0 ? "card card--accent" : "card"}
                    key={ask.title}
                    data-og-id={`tal:ask:${i}`}
                    data-og-typ="sektion"
                  >
                    {i === 0 && (
                      <ShapeAccent
                        variant="blob-c"
                        color="accent"
                        position="bottom-right"
                        size={200}
                        ogId="tal:ask-akzent:0"
                        ogTyp="deko"
                      />
                    )}
                    <h3 data-og-id={`tal:ask-titel:${i}`} data-og-typ="text">{ask.title}</h3>
                    <p data-og-id={`tal:ask-text:${i}`} data-og-typ="text">{ask.text}</p>
                    {ask.cta && (
                      <div className="cta-row">
                        <CtaLink {...ask.cta} />
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {/* Freiraum unter dem Ask-Grid: hier setzt F2/F3 den Tal-See an. */}
              <div className="cta-band__lake-space" aria-hidden="true" />
            </div>
          </div>
        </section>
      </RiverFlow>
      {/* Scroll-Grafiken: auf der Landing aus grafik.config.json, im
          Grafik-Editor (/grafik-editor) übersteuert der Editor-Zustand die
          Liste. Ohne Config-Einträge rendert die Ebene gar nichts. */}
      <GrafikLayer grafiken={KONFIG_GRAFIKEN} authoredDocH={KONFIG_GRAFIKEN_DOC_H} />
    </main>
  );
}
