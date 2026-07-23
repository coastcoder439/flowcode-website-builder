# Coverage-Audit — Mängelliste vs. fünf Lens-Reports

## 1) Verwaiste IDs (von KEINER Lens beansprucht)

- **M10** – "Neu einlesen"-Knöpfe tot (Station 3)
- **M13** – Verdacht weitere tote Knöpfe (explizit Leon-Restprüfung, S5 — korrekt niemandem zugeteilt)
- **M14** – Fluss-Fokus-Falle (Station 3)
- **M15** – "Animation laden?"-Dialog nervt (Station 3)
- **M21** – Optische Abnahme Sichten-Trio (reine Leon-Abnahme, keine Codearbeit — vertretbar unbeansprucht, aber sollte irgendwo als Meilenstein referenziert werden)
- **N3** – doppeltes HTML-Feld mit gleicher ID (Station 2/Puck)
- **N6** – NUL-Byte in GrafikEditor.tsx (von Design-Lens nur als Fremdvoraussetzung erwähnt: "andere Lens" — aber keine der fünf Lenses beansprucht es tatsächlich)
- **N7** – Wasser-Linie findet Anker nicht (Station 3)
- **N11** – "⬡ In den Builder holen" ausgegraut trotz Bild-Inhalt (Station 3)

→ 9 Lücken, die aktuell durch keinen Plan abgedeckt sind.

## 2) Mehrfach beanspruchte IDs (Overlap)

- **M23** (Live-Preview-Station) — von **flow** ("M23 offen/bestätigt", ausführlich diskutiert) UND **preview-export** ("M23 (Umsetzungsdetails)") beansprucht. Empfehlung: **preview-export** sollte Owner sein (Substanz/Umsetzung der Station-4-Render-Grundlage); flow behandelt nur den Navigations-/Reihenfolge-Aspekt und sollte auf M1/M22 beschränkt bleiben, M23 nur als Abhängigkeit referenzieren statt selbst zu "bestätigen".
- **N14** (Vorschau/Export getrennte Welten) — von **flow** ("N14 bestätigt", eigener Analyseabschnitt) UND **preview-export** (in Ziel-ID-Liste, eigener Hauptabschnitt) beansprucht. Gleiche Empfehlung: **preview-export** owner (das ist exakt seine Kernstation), flow sollte nur den History-/Navigationsteil (N20/N21) behalten.

Keine weiteren Doppel-Claims gefunden (M1–M9, M11/M12, M16–M20, M22, M24/M25, N1/N2, N4/N5, N8–N10, N12/N13, N15–N21 je genau einer Lens zugeordnet).

## 3) Regel-/Bann-Verstöße

- **Keine klare Verletzung** von R1–R5 oder den Bans (kein Decap/CMS, keine Feature-Entfernung, keine Grün-Flächen, Dunkel nie großflächig) in den fünf Reports gefunden.
- Einziger Prüfpunkt: Design-Lens zitiert im Ist-Befund Leons Regel als "Grüntöne inkl. 500 nicht als Fläche", schlägt in der Ziel-Architektur dann aber "Signal = `--accent-500` (Orange) + `--green-500`" vor. Das ist **keine echte Verletzung**, weil M24 selbst im Mängeltext explizit "Orange + Grün-500 nur als Signalfarben" erlaubt — aber die eigene Ist-Befund-Paraphrase der Lens ist strenger formuliert als die Mängelliste. Empfehlung: bei Umsetzung präzisieren, dass Grün-500 nur als kleine Signalfarbe (nie als Button-/Panel-Fläche) verwendet wird, um Eigenwiderspruch zu vermeiden.
- Undo-Lens' Löschung von `RiverKursEditor.tsx` (N12) ist keine Feature-Entfernung, da Datei bereits unerreichbar/tot ist (beide Alt-Routen leiten um) — deckt sich mit dem Soll von N12 selbst.

## 4) Später-Liste (S1–S5) respektiert?

- **S1** (Tutorial-Feinbau): korrekt nicht vorgezogen — flow-Lens fixt nur den Trigger-Ort (M2), Inhalt bleibt unangetastet.
- **S2** (CLI/MCP-Neudruck erst am Schluss): korrekt respektiert — Import-Lens erwähnt `api-roundtrip.mjs` nur als Referenz mit explizitem Verweis "S2: Neudruck/CLI erst am Schluss", keine Lens plant ihn vorzuziehen.
- **S3** (Verify-Prozess): unberührt, laufend — keine Planabweichung.
- **S4** (Gemma-Zerlegung): korrekt im Import-Umbau selbst verortet (Import-Lens Stufe D) — das ist laut Mängelliste ausdrücklich "beim Import-Umbau", also kein Vorziehen eines "Später"-Punkts, sondern zeitlich richtig.
- **S5** (Leons eigene Restprüfung "Funktionen passen noch nicht"): korrekt niemandem zugeteilt — M13 bleibt bewusst unbeansprucht, keine Lens greift Leon vor.

→ Terminierung ist insgesamt sauber; keine verfrühte S2-Behandlung, keine Vorwegnahme von S1/S5.