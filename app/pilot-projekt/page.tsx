import Link from "next/link";
import { TitleCurtain } from "@/components/title-curtain/TitleCurtain";

export default function PilotProjektPage() {
  return (
    <main>
      <TitleCurtain
        kicker="Pilotprojekt Leipzig"
        title="Vom Konzept zur ersten Oase."
      >
        <section className="hero">
          <div
            className="hero__bg"
            style={{ backgroundImage: "url(/images/hero-pilot-monument.jpg)" }}
          />
          <div className="hero__overlay" />
          <div className="hero__inner">
            <p className="hero__kicker">Pilotprojekt</p>
            <h1 className="hero__title">Leipzig macht den Anfang.</h1>
            <p className="hero__lead">
              Sieben Projektphasen von der Entwicklung bis zur Nutzung – als
              Forschungs-, Lern- und Begegnungsort für resiliente
              Ernährungssysteme.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary" href="#phasen">
                Die 7 Phasen
              </a>
            </div>
          </div>
        </section>
      </TitleCurtain>

      <section className="section section--sand" id="phasen">
        <div className="section__inner">
          <p className="section__kicker">Wiederverwendbarkeit bewiesen</p>
          <h2 className="section__title">
            Gleiche Komponente – eigener Kicker, Titel und Hero.
          </h2>
          <p className="section__text">
            Diese Seite übergibt der Titelkarte lediglich andere Props. Beim
            ersten Aufruf in dieser Browser-Session lief der Vorhang auch hier –
            danach erscheint der Hero sofort, bis die Seite hart neu geladen
            wird.
          </p>
          <div className="demo-nav">
            <Link className="btn btn--primary" href="/">
              Zurück zur Start-Demo
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
