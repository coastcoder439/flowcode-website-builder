/*
 * element-html-export.ts – baut aus EINER platzierten Grafik (inkl. ihrer
 * Scroll-Keyframes) ein selbständiges HTML-Snippet (Welle 3c, Spec §8/3c
 * „einzelne elemente"). Anders als der Overlay-/Seiten-Export (embed-export.ts)
 * braucht dieses Snippet KEINE Runtime (`wee-embed.js`) und keine Config: die
 * Bewegung steckt komplett in einer CSS-Scroll-Driven-Animation
 * (`animation-timeline: scroll()`), mit einem eigenständigen Mini-JS als
 * Fallback für Browser, die das noch nicht können.
 *
 * Reine, DOM-freie Funktion (kein React, kein fetch) – exakt wie embed-export.ts:
 * das Bilder-Inlining (Data-URL) macht der Aufrufer VORHER über
 * verarbeiteGrafik(), damit diese Datei unabhängig vom Editor testbar bleibt.
 *
 * WARUM DIE POSITIONS-/TRANSFORM-LOGIK GENAU SO: das Snippet spiegelt 1:1 das
 * Rendering aus GrafikLayer.tsx wider (Ebene absolut über dem Dokument, Mitte
 * der Grafik auf (x,y), translate(-50%,-50%) zentriert, dann scale/rotate/
 * spiegeln) – nur dass GrafikLayer pro Frame per rAF in den style schreibt,
 * während hier CSS bzw. das Fallback-JS dasselbe am Scroll treibt.
 */

import type { Grafik } from "../grafik/grafik-types";
import { EASING_DEFAULT } from "../grafik/easing";

/** CSS-ease-in-out als Fallback-Kurve, wenn ein Keyframe kein eigenes easing
 *  trägt – identisch zu grafik-types.zustandBei (EASING_DEFAULT). */
const STANDARD_EASING = EASING_DEFAULT;

/** Zahl kompakt formatieren (feste Nachkommastellen, dann überflüssige Nullen
 *  weg) – hält das erzeugte CSS/JS lesbar, ohne die Präzision der Bewegung
 *  spürbar zu verlieren. */
function z(n: number, dezimalen = 2): string {
  return String(Number(n.toFixed(dezimalen)));
}

/** Aus einem Anzeigenamen eine CSS-/Datei-taugliche Kennung ableiten (nur
 *  a–z, 0–9, Bindestrich). Leerer/rein exotischer Name → stabiler Fallback,
 *  damit @keyframes-Name und Element-id nie ungültig werden. */
export function elementSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "element";
}

/** Der Spiegel-Anteil der Transform-Kette ist über alle Keyframes konstant
 *  (spiegelX/Y gehören zur Grafik, nicht zum Keyframe) – einmal bauen und in
 *  jeden Keyframe einsetzen, exakt wie GrafikLayer.schreibe. */
function spiegelTeil(g: Grafik): string {
  const sx = g.spiegelX ? -1 : 1;
  const sy = g.spiegelY ? -1 : 1;
  return `scaleX(${sx}) scaleY(${sy})`;
}

/** Vollständige Transform-Kette EINES Keyframes – Byte-für-Byte dieselbe
 *  Reihenfolge wie GrafikLayer.tsx (translate3d → zentrieren → scale → rotate →
 *  spiegeln), damit das Snippet exakt so aussieht wie im Editor. */
function transformFuer(k: Grafik["keyframes"][number], spiegel: string): string {
  return `translate3d(${z(k.x, 1)}px, ${z(k.y, 1)}px, 0) translate(-50%, -50%) scale(${z(
    k.scale,
    3,
  )}) rotate(${z(k.rotation, 1)}deg) ${spiegel}`;
}

/** Das Medium-Tag: Video als <video> (autoplay/stumm/loop wie im Editor-
 *  Default), alles andere als <img>. Lottie-.json bleibt bewusst außen vor
 *  (das Snippet trägt nur die Scroll-BEWEGUNG, keine Medien-Laufzeit) – dann
 *  ist die Quelle wenigstens als statisches Bild sichtbar. */
function mediumTag(g: Grafik): string {
  const stil = `display:block;width:100%;height:auto;`;
  if (g.art === "video") {
    return `<video src="${g.src}" autoplay muted loop playsinline style="${stil}"></video>`;
  }
  return `<img src="${g.src}" alt="" draggable="false" style="${stil}" />`;
}

/** Baut die JSON-Keyframe-Daten für das Fallback-JS: nur die Felder, die die
 *  eigenständige Interpolation braucht (kein srcOverride/Anker – das Fallback
 *  bewegt nur, es tauscht keine Bilder). easing als 4er-Array oder null. */
function fallbackDaten(g: Grafik): string {
  const daten = g.keyframes.map((k) => ({
    sy: Number(k.scrollY.toFixed(1)),
    x: Number(k.x.toFixed(1)),
    y: Number(k.y.toFixed(1)),
    s: Number(k.scale.toFixed(3)),
    o: Number(k.opacity.toFixed(3)),
    r: Number(k.rotation.toFixed(1)),
    e: k.easing ? [...k.easing] : null,
  }));
  return JSON.stringify(daten);
}

/** Das eigenständige Mini-JS (Fallback für Browser ohne
 *  `animation-timeline: scroll()`). BEWUSST losgelöst von grafik-types.zustandBei
 *  (Spec §8/3c: „nutzt die vorhandene zustandBei-Logik NICHT – eigenständiges
 *  Mini-JS") – dieselbe Rechnung, aber ohne Import, damit das Snippet auf jeder
 *  fremden Seite ohne Build läuft. Interpoliert linear zwischen zwei Keyframes,
 *  durch die kubische Bezier-Kurve des LINKEN Keyframes geführt (wie im Editor).
 */
function fallbackScript(itemId: string, daten: string, spiegel: string): string {
  return [
    `<script>`,
    `(function(){`,
    `  /* Unterstützt der Browser CSS-Scroll-Animationen, übernimmt das @supports-`,
    `     CSS oben – dann tut dieses Skript NICHTS (kein doppeltes Treiben). */`,
    `  if (window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')) return;`,
    `  var el = document.getElementById(${JSON.stringify(itemId)});`,
    `  if (!el) return;`,
    `  /* CSS-Animation abschalten, damit unser inline gesetzter transform gewinnt. */`,
    `  el.style.animation = 'none';`,
    `  var KF = ${daten};`,
    `  var SP = ${JSON.stringify(spiegel)};`,
    `  /* Kubische Bezier-Kurve f(t) wie CSS cubic-bezier() – Newton-Raphson,`,
    `     P0=(0,0)/P3=(1,1) fest (kompakte Variante von easing.ts). */`,
    `  function bez(p){var x1=p[0],y1=p[1],x2=p[2],y2=p[3];`,
    `    function b(a1,a2,t){var it=1-t;return 3*it*it*t*a1+3*it*t*t*a2+t*t*t;}`,
    `    return function(t){if(t<=0)return 0;if(t>=1)return 1;var s=t;`,
    `      for(var i=0;i<8;i++){var d=b(x1,x2,s)-t;if(Math.abs(d)<1e-6)break;`,
    `        var dv=3*(1-s)*(1-s)*x1+6*(1-s)*s*(x2-x1)+3*s*s*(1-x2);`,
    `        if(Math.abs(dv)<1e-6)break;s-=d/dv;}`,
    `      return b(y1,y2,s);};}`,
    `  var STD=[${STANDARD_EASING.join(",")}];`,
    `  /* Zustand bei Scrollposition y – vor dem ersten / nach dem letzten`,
    `     Keyframe geklemmt, dazwischen easing-interpoliert (= zustandBei). */`,
    `  function zustand(y){var n=KF.length;`,
    `    if(n===1||y<=KF[0].sy){var f=KF[0];return {x:f.x,y:f.y,s:f.s,o:f.o,r:f.r};}`,
    `    var L=KF[n-1];if(y>=L.sy)return {x:L.x,y:L.y,s:L.s,o:L.o,r:L.r};`,
    `    var i=0;while(i<n-2&&KF[i+1].sy<y)i++;var a=KF[i],c=KF[i+1];`,
    `    var sp=c.sy-a.sy,t=sp<=0?0:(y-a.sy)/sp,te=bez(a.e||STD)(t);`,
    `    function ip(p,q){return p+(q-p)*te;}`,
    `    return {x:ip(a.x,c.x),y:ip(a.y,c.y),s:ip(a.s,c.s),o:ip(a.o,c.o),r:ip(a.r,c.r)};}`,
    `  function schreibe(){var st=zustand(window.scrollY||window.pageYOffset||0);`,
    `    el.style.transform='translate3d('+st.x.toFixed(1)+'px, '+st.y.toFixed(1)+'px, 0) translate(-50%, -50%) scale('+st.s.toFixed(3)+') rotate('+st.r.toFixed(1)+'deg) '+SP;`,
    `    el.style.opacity=st.o.toFixed(3);}`,
    `  /* Reduzierte Bewegung respektieren: dann still am ersten Keyframe stehen`,
    `     bleiben (kein Scroll-Listener), sonst rAF-gedrosselt mitscrollen. */`,
    `  var mq=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');`,
    `  if(mq&&mq.matches){var f=KF[0];el.style.transform='translate3d('+f.x.toFixed(1)+'px, '+f.y.toFixed(1)+'px, 0) translate(-50%, -50%) scale('+f.s.toFixed(3)+') rotate('+f.r.toFixed(1)+'deg) '+SP;el.style.opacity=f.o.toFixed(3);return;}`,
    `  var warte=false;`,
    `  function anstoss(){if(warte)return;warte=true;requestAnimationFrame(function(){warte=false;schreibe();});}`,
    `  schreibe();`,
    `  window.addEventListener('scroll',anstoss,{passive:true});`,
    `  window.addEventListener('resize',anstoss,{passive:true});`,
    `})();`,
    `<\/script>`,
  ].join("\n");
}

/** @keyframes-Regel aus den Grafik-Keyframes: pro Keyframe ein Prozent-Stopp
 *  (0 % = erster, 100 % = letzter), Transform + Deckkraft, plus die Easing-Kurve
 *  als `animation-timing-function` – die gilt in CSS für das Segment, das an
 *  DIESEM Stopp BEGINNT (exakt die Editor-Semantik: a.easing führt von a nach b).
 *  Der letzte Stopp bekommt keine Kurve mehr (kein Folgesegment). */
function keyframesRegel(g: Grafik, keyframesName: string, spiegel: string): string {
  const kf = g.keyframes;
  const erster = kf[0].scrollY;
  const spanne = kf[kf.length - 1].scrollY - erster;
  const stopps = kf.map((k, i) => {
    const pct = spanne > 0 ? ((k.scrollY - erster) / spanne) * 100 : i === 0 ? 0 : 100;
    const timing =
      i < kf.length - 1
        ? `\n    animation-timing-function: cubic-bezier(${(k.easing ?? STANDARD_EASING).join(", ")});`
        : "";
    return `  ${z(pct, 4)}% {\n    transform: ${transformFuer(k, spiegel)};\n    opacity: ${z(
      k.opacity,
      3,
    )};${timing}\n  }`;
  });
  return `@keyframes ${keyframesName} {\n${stopps.join("\n")}\n}`;
}

export interface BaueElementHtmlOptionen {
  /** Anzeigename der Grafik – fließt in Kommentar, Slug, @keyframes-Name und
   *  Element-id ein. */
  name: string;
}

/** Baut das vollständige, selbsttragende Element-Snippet. Erwartet, dass der
 *  Aufrufer das Bilder-Inlining (falls gewünscht) bereits erledigt hat
 *  (g.src ist dann eine Data-URL, sonst der Projektpfad). */
export function baueElementHtml(g: Grafik, optionen: BaueElementHtmlOptionen): string {
  const slug = elementSlug(optionen.name);
  const wrapperClass = `wee-el-${slug}`;
  const itemId = `${wrapperClass}-item`;
  const keyframesName = `${wrapperClass}-kf`;
  const spiegel = spiegelTeil(g);
  const kf = g.keyframes;
  /* Animierbar nur, wenn es überhaupt eine Scroll-Strecke gibt (≥2 Keyframes
     mit unterschiedlicher scrollY). Sonst: statisch am einzigen Keyframe – die
     Grafik hängt einfach im Dokument und scrollt mit (= zustandBei bei 1 KF). */
  const animierbar = kf.length >= 2 && kf[kf.length - 1].scrollY - kf[0].scrollY > 0;
  const startTransform = transformFuer(kf[0], spiegel);

  const stilZeilen: string[] = [
    `  /* Ebene über dem Dokument – klick-durchlässig, damit sie Links/Buttons`,
    `     der Host-Seite nicht blockiert (wie die Grafik-Ebene der Landing). */`,
    `  .${wrapperClass} {`,
    `    position: absolute; top: 0; left: 0; width: 100%;`,
    `    pointer-events: none; z-index: 2147483000;`,
    `  }`,
    `  /* Die Grafik selbst: Mitte sitzt per translate(-50%,-50%) auf (x,y).`,
    `     Grundzustand = erster Keyframe (greift auch bei reduzierter Bewegung). */`,
    `  #${itemId} {`,
    `    position: absolute; top: 0; left: 0;`,
    `    width: ${z(g.breitePx, 0)}px;`,
    `    transform: ${startTransform};`,
    `    opacity: ${z(kf[0].opacity, 3)};`,
    `    will-change: transform, opacity;`,
    `  }`,
  ];

  if (animierbar) {
    const ersterScroll = z(kf[0].scrollY, 0);
    const letzterScroll = z(kf[kf.length - 1].scrollY, 0);
    stilZeilen.push(
      `  /* Nur wo CSS-Scroll-Animationen laufen: Bewegung am Dokument-Scroll`,
      `     festmachen. animation-range = Scroll-Spanne der Keyframes (in px).`,
      `     Per-Keyframe-Kurven steuern jedes Segment, daher Basis linear. */`,
      `  @supports (animation-timeline: scroll()) {`,
      `    #${itemId} {`,
      `      animation-name: ${keyframesName};`,
      `      animation-duration: auto;`,
      `      animation-fill-mode: both;`,
      `      animation-timing-function: linear;`,
      `      animation-timeline: scroll(root);`,
      `      animation-range: ${ersterScroll}px ${letzterScroll}px;`,
      `    }`,
      `  }`,
      `  /* Reduzierte Bewegung: Animation aus → Grafik bleibt am ersten Keyframe. */`,
      `  @media (prefers-reduced-motion: reduce) {`,
      `    #${itemId} { animation: none; }`,
      `  }`,
      keyframesRegel(g, keyframesName, spiegel)
        .split("\n")
        .map((zeile) => `  ${zeile}`)
        .join("\n"),
    );
  }

  const kommentar = [
    `<!--`,
    ` WEE-Element „${optionen.name}" – selbsttragendes Snippet mit Scroll-Animation.`,
    ` Einbau: diesen Block irgendwo in den <body> deiner Seite einfügen (die Ebene`,
    ` legt sich absolut über das Dokument und bewegt sich beim Scrollen).`,
    ` Läuft ohne Runtime: moderne Browser über CSS (animation-timeline: scroll()),`,
    ` ältere über das eingebaute Fallback-Skript. Kein wee-embed.js nötig.`,
    `-->`,
  ].join("\n");

  const teile = [
    kommentar,
    `<style>`,
    stilZeilen.join("\n"),
    `</style>`,
    `<div class="${wrapperClass}" aria-hidden="true">`,
    `  <div id="${itemId}">${mediumTag(g)}</div>`,
    `</div>`,
  ];
  if (animierbar) teile.push(fallbackScript(itemId, fallbackDaten(g), spiegel));
  teile.push("");
  return teile.join("\n");
}
