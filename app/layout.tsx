import type { Metadata } from "next";
import { Montserrat, Syne } from "next/font/google";
import "./design-tokens.css";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flowcode Website Builder",
  description:
    "Self-hosted visueller Website-Builder: Seiten importieren, in Puck bauen, animieren, exportieren.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${syne.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
