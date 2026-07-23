I have gathered enough verified evidence. Here is my analysis.

---

# Lens-Analyse: EINE kohärente Undo-Architektur (R1) über das ganze Werkzeug

Bearbeitete Defekt-IDs: **M11, M12, N2, N4, N8, N9, N10, N12, N18, N19**

---

## 1 · Ist-Befund (selbst verifiziert, mit Datei:Zeile)

Der heutige Zustand ist ein **föderiertes Stapel-System mit fokusbasiertem Router** — genau das, was M11/N8 verursacht. Es gibt vier voneinander getrennte, nicht koordinierte Undo-Welten plus mehrere Aktionen ganz ohne Historie:

**a) Grafik-Verlauf** (`components/grafik/GrafikContext.tsx:39-206`)
- Reifer Snapshot-Stapel: Limit 50 (`:50`), Coalesce 600 ms (`:56`), Gruppen-Schlüssel (`:153`), `commit/undo/redo/resetHistory` (`:148-206`). Sichert nur `{grafiken, uebernommen}` (`:58-61`). Sauber gebaut — das ist der Positiv-Anker („Grafik platzieren war undo-bar", M11-Text).

**b) Fluss-Verlauf** (`components/river/useFlussVerlauf.ts:87-181`)
- Baugleicher, aber **zweiter, physisch getrennter** Stapel. Sichert `{nodes, anim}` (`:43-46`). Eigene Refs, eigene `canUndo/canRedo` (`:96-99`).

**c) Puck-interne Historie** (`app/editor/SeitenBereich.tsx:416-434`)
- `<Puck>` bringt seine **eigene** `dispatch/history`-Maschinerie mit (`onChange` schreibt nur `aktuelleDatenRef`, `:430-432`; kein App-Undo hängt daran). Vollständig abgekoppelt vom Editor-Verlauf.

**d) Backdrop-State** (`components/backdrop/BackdropContext.tsx:58-61`)
- `setBackdrop` schreibt sofort in State **und** IndexedDB (`backdropSpeichern`, `:60`). **Kein Commit, keine Historie.** → M12-Wurzel.

**Der fokusbasierte Router (N8-Wurzel):** `GrafikEditor.tsx:2376-2394`
```
const rueckgaengigMachen = () => {
  if (flussObjekt?.fokus && flussObjekt.steuerung) { ...fluss.undo(); return; }
  const label = ctx?.undo(); ...
};
```
Ein einziger Ctrl+Z geht **entweder** an Fluss **oder** an Grafik — nie chronologisch an „die letzte Aktion". Ist der Fluss fokussiert und dessen Stapel leer, tut Ctrl+Z nichts, obwohl eine Grafik-Aktion rückgängig zu machen wäre. Der globale Tastatur-Handler ruft genau diese Weiche (`GrafikEditor.tsx:2403-2418`).

**Konkrete Einzel-Belege je Defekt:**

- **M12** (Backdrop nicht undo-bar, „entfernt die falsche Grafik"): Backdrop-Wechsel läuft über `BackdropContext.setBackdrop` (`BackdropContext.tsx:58-61`) — nie ein `commit`. Ctrl+Z trifft daher den Grafik-Stapel und macht die **letzte Grafik-Platzierung** rückgängig statt den Backdrop-Wechsel. Live-Befund der Mängelliste exakt reproduzierbar aus dem Code.
- **N9** (Slider schluckt Ctrl+Z): `istEingabeFokussiert` (`GrafikEditor.tsx:170-173`) gibt `true` für **jedes** `INPUT` zurück — inklusive `type="range"` (`GrafikEditor.tsx:3201, 3226, 3245`). Der Key-Handler bricht bei `:2406` früh ab → Ctrl+Z wird verschluckt, solange ein Regler Fokus hält. Der ↶-Knopf funktioniert, weil er nicht durch den Key-Guard läuft.
- **N10** (Bibliothek-Änderungen ohne Historie): `GrafikEditor.tsx:2554-2560` — `onClick={() => setPool(pool.filter(...))}` schreibt direkt `setPool` (State-Def `:429`), **ohne** `commit`. Gilt genauso für Hinzufügen/Vektorisieren. Der Pool liegt außerhalb des `{grafiken, uebernommen}`-Snapshots.
- **N2** (Seiten-Löschen irreversibel): `SeitenBereich.tsx:331-347` — `confirm("...laesst sich nicht rueckgaengig machen")` → `loescheSeite` macht server-seitig ein hartes `unlink` (`lib/api/seiten-speicher.ts:288-294`). Kein Papierkorb.
- **N18** (Speichern belebt gelöschte Seite wieder): `seiten-speicher.ts:262` — der 409-Guard steht hinter `if (bestehend && ...)`. Ist die Datei weg (`bestehend === null`, `:257-261`), wird sie **stumm neu angelegt**. Der Aufrufer schickt `erwartetGespeichert` mit (Konflikt-Modell, `:240-241`), aber der Null-Fall ignoriert es.
- **N19** (Backdrop zeigt auf gelöschte Seite → Dauerfehler): Löschen räumt nur `aktiveSeite` (localStorage) auf (`SeitenBereich.tsx:341-342`). Self-Heal existiert **nur für die aktive Seite** (`app/editor/page.tsx:96-122`, `entferneAktiveSeite` bei `listeOk && !da`). Der Backdrop-Verweis (`art:"puck-seite"`, `backdrop-types.ts:29`) bleibt; `effektiverBackdrop` gibt den expliziten Backdrop bedingungslos zurück (`app/editor/page.tsx:130-133`) → Backdrop.tsx lädt eine 404-Seite.
- **N4** (Puck: native Textarea-Undo vs. App-Undo): Der HtmlBlock rendert eine Textarea in Pucks iframe; die Textarea hat browsereigenes Zeichen-Undo, Puck hat History-Undo, unser globaler Handler (`GrafikEditor.tsx:2408`) feuert zusätzlich, wenn er auf derselben Station mitliest. Drei Undo-Ebenen konkurrieren.
- **N12** (verwaiste Datei): `RiverKursEditor.tsx` wird **nirgends** importiert oder als `<RiverKursEditor>` gerendert (Grep bestätigt: 0 Import-Statements, 0 JSX-Nutzung; die Grep-Treffer sind Kommentare/CSS `river-kurs-editor.css`). Beide Alt-Routen sind reine Redirects (`app/grafik-editor/page.tsx`, `app/fluss-editor/page.tsx` → `router.replace("/editor")`). Die Datei enthält ein eigenes Fluss-Undo-Loch und ist tote Wartungslast.

**Kernproblem-Zusammenfassung:** Es gibt keine „letzte Aktion" im System — nur mehrere parallele „letzte Aktionen je Domäne", von einem Fokus-Zufall geroutet, und drei Aktionsklassen (Backdrop, Pool, Seiten-Löschen) fallen ganz durch. R1 ist strukturell nicht erfüllbar, solange das so bleibt.

---

## 2 · Ziel-Architektur: EIN Undo-Bus (Command-Timeline) statt föderierter Stapel

**Entscheidung: unified command/undo bus** — nicht föderierte Stapel mit Router. Begründung: N8/M11/M12 sind keine Bugs *in* den Stapeln, sondern Symptome der *Föderation selbst*. Ein Router über getrennte Zeitachsen kann prinzipiell nicht „die chronologisch letzte Aktion" rückgängig machen. Nur eine einzige Zeitachse kann das.

### 2.1 Kernmodell

Neuer Provider `components/undo/UndoBus.tsx`:

```
interface Befehl {           // ein undo-barer Schritt, domänenunabhängig
  label: string;             // Statuszeile: "Rückgängig: <label>"
  gruppe?: string;           // Coalesce-Schlüssel (600 ms), wie heute
  undo: () => void;          // stellt Vor-Zustand her (Closure über Snapshot)
  redo: () => void;          // stellt Nach-Zustand wieder her
}
interface UndoBus {
  push: (b: Befehl) => void;                 // ersetzt alle heutigen commit()
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean; canRedo: boolean;
  resetHistory: () => void;                  // bei Setup-/Stationswechsel
  pushScope/popScope: (a: BusAdapter) => …;  // Stations-Segmentierung (s.u.)
}
```

Der Bus hält **eine** chronologische Rückgängig-/Wiederholen-Liste von `Befehl`-Objekten. Die bewährte Coalesce-/Limit-Mechanik (600 ms Fenster, Gruppen-Schlüssel, Limit 50, Zukunft-Invalidierung) wird **1:1 aus `GrafikContext.tsx:148-168` in den Bus gehoben** und dort einmalig zentral implementiert — kein Neubau, nur Umzug.

### 2.2 Domänen werden zu Command-Produzenten (nicht mehr Stapel-Besitzer)

- **Grafik**: `GrafikContext.commit(label, gruppe, zustand)` bleibt als *dünner* Wrapper erhalten (API-kompatibel für alle heutigen Aufrufer), erzeugt intern aber ein `Befehl` mit `undo: () => { setGrafiken(vor.grafiken); setUebernommen(vor.uebernommen) }` und `push`t es auf den Bus. Die Snapshot-Billigkeit (nur Array-Referenzen, `GrafikContext.tsx:44-49`) bleibt.
- **Fluss**: `useFlussVerlauf` wird ersetzt durch einen Producer, der `{nodes, anim}`-Snapshots als `Befehl` auf **denselben** Bus schiebt. Der separate Stapel entfällt → N8 verschwindet an der Wurzel (kein Router mehr).
- **Backdrop** (M12): `BackdropContext.setBackdrop` bekommt einen zweiten Pfad `setBackdropMitUndo(neu, label)`, der vor dem Setzen den alten Backdrop als `Befehl` push't (`undo: () => setBackdropState(alt)`; IndexedDB-Persistenz im undo/redo mitgeführt). Der Direktpfad `setBackdrop` bleibt für nicht-undo-bare Programmaufrufe (z. B. Self-Heal) bestehen.
- **Bibliothek/Pool** (N10): `setPool(...)`-Aufrufe an `GrafikEditor.tsx:2554-2560` (Entfernen) und den Hinzufügen-/Vektorisieren-Stellen bekommen je einen `Befehl` (`undo: () => setPool(vorherigerPool)`).

### 2.3 Stations-Segmentierung (R3-konform, löst N4)

Eine einzige globale Zeitachse **quer über alle vier Stationen** wäre verwirrend (Ctrl+Z im Animator würde in einen Puck-Bau-Schritt springen). Deshalb: **ein Bus-Abstraktum, aber pro Station ein Scope.** Der Bus ist ein Stapel von Scopes; Ctrl+Z wirkt immer nur auf den **aktiven** Scope. Das ist weiterhin „ein Modell" (eine Tastatur-Vertrag, eine Statuszeilen-Konvention, eine `Befehl`-Schnittstelle), nur zeitlich nach Station getrennt — die Trennung folgt exakt dem Userflow R3.

- **Station 3 (Animator)**: EIN Scope, gefüllt von Grafik + Fluss + Backdrop + Pool. Das ist die Vereinheitlichung von a/b/d + Pool.
- **Station 2 (Puck)**: eigener Scope über einen **Puck-History-Bridge-Adapter** — `bus.undo()` delegiert an `usePuck().history.back()`, `redo()` an `.forward()`. So bedient dasselbe Ctrl+Z / dieselben ↶↷-Kopfknöpfe Pucks interne Historie, ohne dass unser Handler und Pucks Handler doppelt feuern (**genau der N4-Fight**). Kein Nachbau von Pucks Undo — nur Anschluss.

### 2.4 EIN zentraler Fokus-Guard (löst N9, entschärft N4)

Der heutige Blanket-Guard `istEingabeFokussiert` (`GrafikEditor.tsx:170-173`) wird ersetzt durch **eine** zentrale Funktion `sollUndoShortcutGreifen(target)` im Bus:

| Fokus-Ziel | Ctrl+Z-Verhalten |
|---|---|
| `textarea`, `input[type=text/search/url/...]`, `contenteditable` | **Nativ** (Zeichen-Undo des Feldes) — Bus greift NICHT; verhindert das „Entf löscht Grafik statt Zeichen"-Problem UND den N4-Fight in Puck-Textareas |
| `input[type=range]` (Slider) | **Bus greift** — ein Slider hat kein sinnvolles natives Text-Undo; N9 gefixt |
| `checkbox`, `radio`, `button`, `select`, Bühne, Body | **Bus greift** |

Der Guard prüft also `tagName`/`type` differenziert statt „jedes INPUT". Genau **eine** Definition, von Tastatur-Shortcut, Paste- und Drop-Handler geteilt (wie der heutige Kommentar `GrafikEditor.tsx:168-169` es bereits anstrebt).

### 2.5 Undo-barer Seiten-Papierkorb (N2) + Server-Konflikt (N18)

- **N2**: `loescheSeite` (`seiten-speicher.ts:288-294`) verschiebt statt `unlink` nach `seiten/.papierkorb/<name>-<ts>.json` (Rename, atomar, reversibel). Neuer Endpoint `POST /api/puck-seite/wiederherstelle`. Client-seitig push't `SeitenBereich.loesche` (`:331-347`) einen `Befehl` in den Puck-Scope: `undo: () => restore(name)`. Der `confirm`-Text (`:333`) wird zu „…in den Papierkorb verschoben (rückgängig per Strg+Z)".
- **N18**: In `speichereSeite` (`seiten-speicher.ts:254-268`) neuer Zweig **vor** dem Schreiben: `if (!bestehend && opts.erwartetGespeichert) throw new AnfrageFehler(409, "Seite existiert nicht mehr")`. `erwartetGespeichert` gesetzt = Aufrufer glaubt, die Seite existiert → ihr Fehlen ist ein Konflikt, keine Neuanlage. Client zeigt das bestehende Konflikt-Banner (`SeitenBereich.tsx:409-413`).
- **N19**: Beim Löschen zusätzlich den Backdrop-Verweis heilen — analog zu `app/editor/page.tsx:114`. Entweder Client-seitig (`SeitenBereich.loesche` ruft `bctx.setBackdrop(null)`, falls `backdrop.art==="puck-seite" && quelle===name`) oder robuster im `effektiverBackdrop`-Selektor (`page.tsx:130-136`): einen `puck-seite`-Backdrop nur zurückgeben, wenn die Seite in der Liste existiert — sonst `null` (Fallback-Bühne) statt 404.

---

## 3 · Umsetzung in prüfbaren Häppchen (geordnet)

Jeder Schritt: bauen → `tsc` → Browser-Verify nach `verifikations-protokoll.md` → Commit. Reihenfolge so, dass jede Stufe für sich lauffähig bleibt und nichts aus `feature-inventar.md` §1 verliert (additiv).

**U0 — Bus-Gerüst (kein Verhalten geändert)**
`components/undo/UndoBus.tsx` (neu), `components/undo/coalesce.ts` (neu, Coalesce/Limit aus `GrafikContext.tsx:148-168` extrahiert). Deliverable: Provider mit `push/undo/redo/canUndo/canRedo/resetHistory/scopes`, Unit-Tests für Coalesce/Limit/Zukunft-Invalidierung. Noch nirgends gemountet.

**U1 — Grafik als erster Producer (Verhalten identisch)**
`GrafikContext.tsx`: interne Stapel raus, `commit` push't auf den Bus; `undo/redo/canUndo/canRedo` delegieren. Bus im /editor-Shell mounten (`app/editor/page.tsx`), Grafik-Scope aktiv. Deliverable: Grafik-Undo verhält sich **exakt wie heute** (Regression-Anker: „Grafik platzieren" undo-bar). Messlatte: Screenshot vor/nach Ctrl+Z deckungsgleich mit heutigem Verhalten.

**U2 — Fluss in denselben Scope, Router raus (fixt N8, M11)**
`useFlussVerlauf.ts` → Producer auf den Bus; `GrafikEditor.tsx:2376-2394` `rueckgaengigMachen/wiederholenMachen` werden zu reinen `bus.undo()/redo()`-Aufrufen (Fokus-Weiche gelöscht). `FlussObjektContext`/`useFlussKnoten`-Verdrahtung anpassen. Deliverable: Ctrl+Z macht chronologisch die letzte Aktion rückgängig, egal ob Grafik oder Fluss zuletzt dran war — auch bei Fluss-Fokus + leerem Fluss-Verlauf greift eine vorherige Grafik-Aktion. Verify: gemischte Aktionsfolge Grafik→Fluss→Grafik, dreimal Ctrl+Z.

**U3 — Zentraler Fokus-Guard (fixt N9)**
`istEingabeFokussiert` (`GrafikEditor.tsx:170-173`) → `sollUndoShortcutGreifen` im Bus, differenziert nach Slider vs. Textfeld (§2.4). Alle Aufrufer (`:1764`, `:2406`) + `FlussObjektContext.inEingabefeld:53-56` auf die eine Funktion umstellen (Duplikat auflösen). Deliverable: Ctrl+Z wirkt bei Slider-Fokus, bleibt bei Textarea-Fokus nativ. Verify: Slider-Wert 620→Ctrl+Z→240 **ohne** vorheriges blur().

**U4 — Backdrop-Wechsel undo-bar (fixt M12)**
`BackdropContext.tsx:58-61` um `setBackdropMitUndo` erweitern; `BackdropAuswahl` nutzt ihn. Deliverable: Screenshot-Backdrop laden → Ctrl+Z stellt vorigen Backdrop wieder her und lässt platzierte Grafiken in Ruhe. Verify: die exakte M12-Live-Sequenz (Grafik platzieren → Backdrop wechseln → Ctrl+Z) macht jetzt den Backdrop rückgängig.

**U5 — Bibliothek/Pool undo-bar (fixt N10)**
`GrafikEditor.tsx:2554-2560` + Hinzufügen-/Vektorisieren-Stellen: je `Befehl` push. Deliverable: versehentlich entferntes Asset per Ctrl+Z zurück. Verify: ✕ auf Pool-Eintrag → Ctrl+Z → Eintrag wieder da.

**U6 — Puck-History-Bridge (fixt N4)**
`SeitenBereich.tsx:416-434`: Puck-Scope-Adapter, der `bus.undo/redo` an `usePuck().history` hängt; unseren globalen Key-Handler auf der Puck-Station deaktivieren (Scope-Grenze), Textarea-Guard aus U3 greift. Deliverable: in Puck ist Ctrl+Z vorhersagbar — im HtmlBlock-Textfeld Zeichen-Undo, sonst Puck-Block-Undo; keine „springt-auf-leer"-Sprünge. Verify: Screenshot-Paar station2-after-second-ctrlz reproduziert **nicht** mehr.

**U7 — Server: Papierkorb + 409 (fixt N2, N18)**
`seiten-speicher.ts:288-294` (Rename statt unlink), `:254-268` (Null+erwartetGespeichert→409), neuer `app/api/puck-seite/wiederherstelle/route.ts`, `openapi.yaml` ergänzen. Deliverable: Löschen reversibel server-seitig; Speichern auf gelöschte Seite → 409. Unit/Integrationstests für beide Pfade.

**U8 — Seiten-Löschen im Bus + Backdrop-Heilung (fixt N2 Client-Seite, N19)**
`SeitenBereich.tsx:331-347`: `Befehl` (undo=restore) in Puck-Scope; `confirm`-Text anpassen; beim Löschen Backdrop-Verweis heilen (§2.5/N19) bzw. `page.tsx:130-136`-Selektor absichern. Deliverable: Seite löschen → Ctrl+Z stellt sie wieder her; ein Backdrop auf die gelöschte Seite fällt sauber auf die Fallback-Bühne zurück statt Dauerfehler.

**U9 — Orphan entfernen (fixt N12)**
`components/river/RiverKursEditor.tsx` löschen (Nutzung 0 bestätigt). Deliverable: tote Datei + ihr Undo-Loch weg; `/editor`, `/`, Redirects unverändert. Verify: Build grün, keine Broken Imports.

---

## 4 · Risiken + Gegenmaßnahmen

- **R-a: Grafik-Undo-Regression beim Umzug.** Der Grafik-Verlauf ist das einzige heute funktionierende Stück. → U1 ist reiner Mechanik-Umzug mit API-kompatiblem `commit`; Unit-Tests der Coalesce-/Limit-/Gruppen-Logik in U0 **vor** dem Umzug; U1-Verify gegen heutiges Verhalten als Regressions-Anker.
- **R-b: Puck-API-Kopplung.** `usePuck().history` ist Puck-0.22-intern und kann sich versionieren. → Adapter kapselt den einzigen Berührungspunkt; Fallback: wenn `history` fehlt, Puck-Scope liefert `canUndo=false` und wir lassen Pucks eigenes Ctrl+Z ungestört laufen (kein Bridge-Zwang). Vor Bau: Puck-0.22-Doku via Context7 gegen die installierte Version prüfen ([[erst-doku-kartieren-dann-architektur]]).
- **R-c: Backdrop-Undo über IndexedDB-Persistenz.** undo/redo eines Backdrops muss auch die IndexedDB-Persistenz mitführen, sonst divergieren State und Speicher. → Der `Befehl` ruft in undo/redo denselben `backdropSpeichern`-Pfad wie `setBackdrop` (`BackdropContext.tsx:60`).
- **R-d: Scope-Leaks bei Stationswechsel.** Wechselt man Animator→Puck→Animator, dürfen keine Fremd-Befehle im falschen Scope landen. → `resetHistory`/`popScope` beim Stationswechsel (bestehendes Muster: `resetHistory` bei Setup-Wechsel, `GrafikContext.tsx:111-114`).
- **R-e: Papierkorb wächst unbegrenzt / N18-Race.** Rename-Papierkorb sammelt Dateien; Wiederherstellen einer Seite, deren Name inzwischen neu vergeben wurde, kollidiert. → Papierkorb-Namen mit Zeitstempel; Restore prüft Ziel-Existenz und meldet 409 statt zu überschreiben.
- **R-f: Coalesce über Domänengrenzen.** Ein Gruppen-Schlüssel „opacity:id" darf nicht versehentlich mit einem Fluss-Befehl coalescen. → Producer präfixen ihre Gruppen-Schlüssel domänenspezifisch (`grafik:opacity:<id>`, `fluss:breite:<idx>`), zentral dokumentiert.

---

## 5 · Abhängigkeiten zu den anderen Lenses

- **Flow/Navigation (R3, Stations-Reihenfolge):** Meine Scope-Segmentierung folgt exakt den vier Stationen. Ich brauche vom Flow-Lens die **verbindliche Definition der Stationsgrenzen und Mount-Punkte** (wo genau wird der Animator-Scope aktiv, wo der Puck-Scope), inkl. N20 (Browser-Zurück verwirft ungespeicherte Puck-Änderungen) — der Undo-Bus ist kein Ersatz für die „Wirklich verlassen?"-Warnung, aber beide teilen sich den „ungespeicherte Änderungen"-Zustand. Abstimmung nötig, damit Scope-Wechsel und History-Warnung nicht kollidieren.
- **Import-Lens:** Import legt Seiten an/ersetzt Bausteine. Es muss klären, ob ein Import-Schritt undo-bar sein soll (vermutlich: eigener Puck-Scope-Befehl oder bewusst außerhalb, wie `resetHistory` bei Setup-Wechsel). Grenze abstimmen.
- **Design-Lens (R5):** Die undo/redo-Kopfknöpfe (↶↷, `GrafikEditor.tsx:2574-2580`) und das neue Papierkorb-/Konflikt-Banner müssen ins helle WEE-Designsystem — ich liefere die Struktur, Design-Lens die Tokens.
- **Preview/Export-Lens:** Station 4 (Live-Preview) ist bewusst **ohne** Undo (nur Ansicht/Export). Ich stelle sicher, dass dort kein Bus-Scope aktiv ist. Der Papierkorb (N2) darf gelöschte Seiten nicht in den Export durchreichen — Export-Lens muss `.papierkorb/` ignorieren.

---

## 6 · Offene Fragen (nur echt unentscheidbares)

1. **Cross-Station-Undo bewusst ausgeschlossen?** Mein Modell trennt Ctrl+Z nach Station (Puck-Bau-Undo springt nicht in Animator-Aktionen). Das ist die konsistentere UX und R3-konform, aber Leons „jede Funktion mit Strg+Z" (R1) könnte auch als *eine* globale Zeitachse gemeint sein. Ich empfehle Stations-Scopes; Bestätigung durch Leon sinnvoll, weil es die mentale Grundregel des Tools festlegt.
2. **Papierkorb-Lebensdauer:** Soll der Seiten-Papierkorb (N2) nur sitzungsweit per Ctrl+Z reversibel sein, oder dauerhaft mit eigener „Papierkorb"-Ansicht (Wiederherstellen nach Reload)? Ersteres deckt R1 minimal, Letzteres ist robuster. Rein produktseitige Entscheidung.

---

## 7 · Abgedeckte Defekt-IDs (Coverage)

| ID | Schritt | Wie gelöst |
|---|---|---|
| **M11** | U0–U2 | Föderierte Stapel → eine Command-Timeline; „letzte Aktion" existiert wieder |
| **M12** | U4 | Backdrop-Wechsel wird undo-barer `Befehl` statt historienloses `setBackdrop` |
| **N8** | U2 | Fokus-Router (`GrafikEditor.tsx:2376-2394`) gelöscht; ein Scope für Grafik+Fluss |
| **N9** | U3 | Fokus-Guard differenziert Slider (Bus greift) vs. Textfeld (nativ) |
| **N10** | U5 | Pool-Änderungen (`:2554-2560` u. a.) push'en `Befehl` |
| **N4** | U6 | Puck-History-Bridge + Textarea-Guard; drei-Ebenen-Fight aufgelöst |
| **N2** | U7+U8 | Server-Papierkorb (Rename) + Restore-Endpoint + Client-`Befehl` (undo=restore) |
| **N18** | U7 | `seiten-speicher.ts:262` Null-Fall → 409 „Seite existiert nicht mehr" |
| **N19** | U8 | Backdrop-Verweis beim Löschen heilen / `page.tsx:130-136`-Selektor absichern |
| **N12** | U9 | Verwaiste `RiverKursEditor.tsx` (Nutzung 0 verifiziert) entfernt |

Alle zehn zugewiesenen IDs sind adressiert. **R1** wird strukturell erfüllt: jede Editier-Aktion (Grafik, Fluss, Backdrop, Pool, Seiten-Löschen) erzeugt genau einen `Befehl` auf einem Bus mit einheitlichem, fokus-korrektem Ctrl+Z-Vertrag; Puck-Bau-Aktionen über die Bridge.