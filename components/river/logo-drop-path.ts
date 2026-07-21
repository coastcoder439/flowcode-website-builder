/*
 * logo-drop-path.ts – generiert via trace-logo.mjs, NICHT von Hand editieren.
 *
 * Exakte äußere Silhouette des WEE-Logo-Tropfens (public/images/logo-weiss.png,
 * Alpha-Schwelle 24, Marching Squares + Douglas-Peucker 1px,
 * 83 Punkte). IoU gegen die gefüllte Tropfen-Komponente des
 * Logo-Alphas (ohne die 6 schwebenden Blätter daneben): 99.58%.
 *
 * Koordinaten: zentriert auf die Bildmitte des 512x512er Logos – ein Punkt
 * (0,0) im Pfad entspricht der Mitte des gerenderten Logo-<img>. Skalierung
 * auf Anzeigegröße: faktor = gerenderteLogoBreitePx / LOGO_DROP_IMG_SIZE.
 */

/** Kantenlänge des Quell-Logos in Pixel (quadratisch). */
export const LOGO_DROP_IMG_SIZE = 512;

/** Äußere Tropfen-Silhouette, zentriert auf (0,0). */
export const LOGO_DROP_PATH =
  "M-2.0,-211.0 L-8.0,-206.0 L-10.0,-199.0 L-12.0,-197.0 L-36.0,-124.0 L-38.0,-122.0 L-46.0,-97.0 L-51.0,-88.0 L-56.0,-73.0 L-59.0,-69.0 L-59.0,-66.0 L-62.0,-62.0 L-62.0,-59.0 L-81.0,-20.0 L-83.0,-19.0 L-94.0,3.0 L-100.0,11.0 L-104.0,21.0 L-106.0,22.0 L-116.0,44.0 L-123.0,69.0 L-124.0,96.0 L-120.0,120.0 L-109.0,147.0 L-107.0,148.0 L-106.0,152.0 L-104.0,153.0 L-100.0,161.0 L-97.0,163.0 L-97.0,165.0 L-78.0,184.0 L-76.0,184.0 L-74.0,187.0 L-72.0,187.0 L-65.0,193.0 L-61.0,194.0 L-60.0,196.0 L-33.0,207.0 L-10.0,211.0 L9.0,211.0 L33.0,207.0 L60.0,196.0 L61.0,194.0 L65.0,193.0 L66.0,191.0 L74.0,187.0 L77.0,183.0 L79.0,183.0 L96.0,166.0 L96.0,164.0 L100.0,161.0 L100.0,159.0 L106.0,152.0 L107.0,148.0 L109.0,147.0 L119.0,123.0 L123.0,105.0 L124.0,79.0 L120.0,56.0 L115.0,41.0 L112.0,37.0 L112.0,34.0 L101.0,12.0 L99.0,11.0 L88.0,-11.0 L86.0,-12.0 L83.0,-20.0 L81.0,-21.0 L69.0,-45.0 L69.0,-48.0 L63.0,-58.0 L63.0,-61.0 L56.0,-74.0 L56.0,-77.0 L50.0,-88.0 L48.0,-96.0 L45.0,-100.0 L32.0,-139.0 L30.0,-141.0 L24.0,-162.0 L22.0,-164.0 L11.0,-200.0 L4.0,-210.0 Z";
