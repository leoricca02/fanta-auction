# PRD — Fanta Auction Assistant

**Versione:** 2.0 — sostituisce integralmente la 1.0
**Owner:** Leonardo Ricca
**Data asta:** 10 settembre 2026

---

## 0. Cosa cambia rispetto alla 1.0

La 1.0 costruiva un modello di prezzo (quotazioni normalizzate, ricalibrazione live,
soglie di rilancio). **È stato eliminato per intero.** I prezzi d'asta variano troppo tra
un tavolo e l'altro perché una previsione derivata dal listone sia affidabile, e la
precisione prodotta era illusoria.

Il valore dell'applicazione si sposta sulle **informazioni inserite dall'utente**:
formazioni, ballottaggi, note su squadre e giocatori, obiettivi.

**Eliminati:** prezzo atteso, fattore `f` e `f_live`, tier calcolati, inflazione di fase,
aggressività avversari, soglie di rilancio, prezzo di indifferenza, livello di
sostituzione, guardrail di disciplina, `userValue`, `maxBid` personale.
I file `pricing.ts` e `live-pricing.ts` vanno rimossi.

**Sopravvivono:** parser del listone, reducer a event log, crediti, slot, undo,
riconciliazione, max bid assoluto, export.

**Distinzione da tenere presente:** sparisce il *prezzo atteso*. Il *prezzo pagato* resta
— si digita all'assegnazione, scala i crediti, finisce nella colonna `Costo` dell'export.
Le colonne `QUOT.` e `FVM/1000` restano come dati grezzi per ordinare e filtrare, senza
alcun calcolo derivato.

---

## 1. Scope

Applicazione web local-first, single-user, offline. Assiste durante l'asta e nello studio
pre-asta. Non è il tabellone ufficiale della lega: è la vista privata dell'utente,
mantenuta in parallelo.

| Parametro | Valore |
| --- | --- |
| Modalità | Classic |
| Formato asta | Per ruoli sequenziali: P → D → C → A |
| Partecipanti | 12 |
| Crediti | 800 a squadra (9.600 totali) |
| Rosa | 3 P, 8 D, 8 C, 6 A = 25 slot (300 totali) |
| Utenti | 1, nessuna auth, nessuna sync |

**Fuori scope:** Mantra, gestione stagione, formazioni di gioco, mercato di riparazione,
multi-lega, multi-device, qualunque backend.

---

## 2. Sorgente dati

File: `data/lista_calciatori_classic.xlsx`, header su riga 1.

| Colonna | Uso |
| --- | --- |
| `#` | ID stabile — chiave primaria, tutte le note si agganciano qui |
| `Nome` | Display e ricerca |
| `Fuori lista` | `*` → escluso dal pool (21 righe) |
| `Sq.` | Club Serie A |
| `Under` | Età |
| `R.` | `P/D/C/A` |
| `QUOT.` | Colonna grezza, ordinabile. Nessun calcolo derivato |
| `FVM/1000` | Colonna grezza, ordinabile. Nessun calcolo derivato |
| `FantaSquadra`, `Costo` | Vuote — target dell'export |

Parser difensivo: valida le colonne attese, fallisce nominando quella mancante, mai in
silenzio. Su questo file: 538 giocatori in lista, P 64, D 189, C 194, A 91.

**Re-import.** Il mercato chiude il 1° settembre; il listone va riscaricato. `Player`
appartiene al listone ed è sostituibile, tutti i dati utente sono agganciati a `#` e non
vengono mai toccati da un import. Il diff (nuovi, usciti, cambio squadra, variazione
quotazione oltre ±20%) si mostra e si applica su conferma. Le note dei giocatori usciti si
archiviano, non si cancellano. Re-import **bloccato** se esistono assegnazioni attive.

---

## 3. Modello dati

```ts
type Role = 'P' | 'D' | 'C' | 'A';
type Tag = 'obiettivo' | 'alternativa' | 'evita';
type LineupStatus = 'TITOLARE' | 'BALLOTTAGGIO' | 'PANCHINA' | 'NON_INSERITO';

interface Player {              // dal listone, sostituibile
  id: number;
  name: string;
  searchKey: string;            // normalizzato: minuscolo, senza accenti
  team: string;
  role: Role;
  under: number;
  quot: number;
  fvm: number;
}

interface LineupSlot {
  slotId: string;
  roleLabel: string;            // 'POR', 'DC', 'EST', 'MED', 'TRQ', 'PC'...
  candidates: number[];         // 1 = titolare, 2+ = ballottaggio, ordinati
  note: string;
}

interface Lineup {              // dati utente
  teamCode: string;             // 'Inter', combacia con Player.team
  module: string;               // '4-3-3'
  slots: LineupSlot[];
  updatedAt: number;
}

interface TeamNote {            // dati utente
  teamCode: string;
  text: string;
}

interface PlayerNote {          // dati utente
  playerId: number;
  text: string;
  tag: Tag | null;
  archived: boolean;            // superstite di un re-import
}

interface Objectives {          // dati utente, istanza unica
  text: string;                 // note generali, testo libero
  targets: {
    playerId: number;
    priority: number;           // ordinamento manuale
    note: string;
  }[];
}

interface FantaTeam {
  id: string;
  name: string;
  abbr: string;                 // 3 lettere, univoche, per la command bar
  isUser: boolean;              // esattamente una true
}

interface AssignmentEvent {
  id: string;
  ts: number;
  playerId: number;
  teamId: string;
  price: number;                // prezzo effettivamente pagato
  phase: Role;
  undone: boolean;              // soft delete, mai hard delete
}
```

Lo stato di lega è sempre `reduce(events) → LeagueState`. Nessuna mutazione diretta di
rose, crediti o slot.

### 3.1 Backup — requisito critico

**Le note sono l'intero valore dell'applicazione.** Ore di lavoro dentro IndexedDB, che
una pulizia dati del browser azzera senza preavviso. Questo è il rischio numero uno del
progetto, sopra ogni altra considerazione.

- Export JSON completo di tutti i dati utente (lineups, note, obiettivi, tag, eventi)
- Import dello stesso JSON, con merge non distruttivo
- **Auto-download del backup all'apertura dell'app** se l'ultimo risale a più di un giorno
- Il backup non dipende da nessun'altra milestone: va implementato per primo

---

## 4. Logica derivata

Poche funzioni pure in `/src/domain`, senza dipendenze da React.

### 4.1 Stato di formazione

```
lineupStatus(playerId):
  se la squadra del giocatore non ha Lineup       → NON_INSERITO
  se compare in uno slot con 1 candidato          → TITOLARE
  se compare in uno slot con 2+ candidati         → BALLOTTAGGIO
  altrimenti                                      → PANCHINA
```

È la logica più importante dell'app. La titolarità è il fattore che decide il valore di
un giocatore nel Classic, e qui non è stimata: è il dato che l'utente ha inserito.

### 4.2 Max bid assoluto

```
maxBidAssoluto(t) = crediti(t) − (slotRimanenti(t) − 1)
```

Aritmetica pura, calcolata per tutti i 12 partecipanti. Risponde a "chi può ancora
battermi su questo giocatore".

### 4.3 Svincolati

```
svincolati = giocatori in lista senza AssignmentEvent attivo
```

Conteggi derivati per la barra: liberi per ruolo, e liberi per ruolo con tag `obiettivo`.
Quest'ultimo sostituisce ogni metrica di scarsità della 1.0 — è un conteggio, non una
stima.

### 4.4 Riconciliazione

`Σ crediti spesi in lega` e `Σ slot occupati`, sempre visibili, per il confronto a colpo
d'occhio col tabellone ufficiale.

---

## 5. Interfaccia — quattro sezioni

### 5.1 Asta Live

Command bar unica, keyboard-only:

```
dimarco 60 mrc       →  assegna Dimarco a MRC per 60
```

Fuzzy search filtrata di default sul ruolo della fase attiva. Ogni riga di risultato mostra:

```
Dimarco        D   Inter   [TITOLARE]   quot 32   ★obiettivo
  "spinge sempre, rigorista sui piazzati"
```

Il badge di §4.1 e la prima riga della nota compaiono **inline nel risultato di ricerca**,
non solo nella scheda. È l'informazione che serve nei cinque secondi della chiamata.

Sempre visibili: la rosa dell'utente per ruolo con slot liberi e crediti, la griglia densa
dei 12 partecipanti con crediti e max bid assoluto, la riga di riconciliazione.

**Overlay, apribili da tastiera senza perdere il testo digitato nella command bar:**

| Tasto | Apre |
| --- | --- |
| `?` | Scheda del giocatore evidenziato |
| `o` | Obiettivi |
| `s` | Svincolati |
| `Esc` | Chiude, il focus torna alla command bar col testo intatto |

Altri comandi: `Ctrl+Z` / `Ctrl+Shift+Z` undo e redo, anche su eventi non ultimi;
inserimento retroattivo per recuperare assegnazioni perse.

**Scheda giocatore** — un singolo pannello con: nota del giocatore (editabile inline,
salvata a ogni battuta), tag, formazione completa della sua squadra con lo slot del
giocatore evidenziato e i ballottaggi, nota della squadra.

### 5.2 Squadre

Elenco dei 20 club. Per ognuno: editor di formazione e nota libera.

**L'editor è il collo di bottiglia del progetto**: 20 squadre da compilare a mano. Va
ottimizzato per la velocità, obiettivo **una squadra in due minuti**.

- Si sceglie il modulo da un elenco (`4-3-3`, `3-5-2`, `4-2-3-1`, `3-4-2-1`...) e gli slot
  si generano di conseguenza
- Cliccando uno slot si apre un picker che mostra **solo i giocatori di quella squadra**,
  pre-filtrati per ruolo compatibile, ordinati per `QUOT.` decrescente — chi gioca sta
  quasi sempre in cima
- Un secondo giocatore nello stesso slot crea il ballottaggio, senza comandi dedicati
- Nota libera per slot (es. "rientra dopo la sosta")
- Indicatore di completamento per squadra, così sai quali mancano

### 5.3 Obiettivi

Due parti nella stessa schermata:

- **Testo libero** — note generali di strategia, markdown semplice
- **Lista target** — giocatori con priorità riordinabile e nota per riga. Ogni voce mostra
  il badge di formazione e se il giocatore è ancora svincolato o già assegnato, e a chi

### 5.4 Svincolati

Tabella di tutti i giocatori non ancora assegnati.

- Divisa per ruolo (tab o gruppi)
- Ordinabile per: `QUOT.`, `FVM/1000`, nome, squadra, stato di formazione, tag
- Filtri combinabili: ruolo, squadra, tag, stato di formazione, presenza di nota,
  range di quotazione
- Apribile in overlay dall'asta live con `s`, mantenendo i filtri tra un'apertura e l'altra

---

## 6. Export

1. **`.xlsx` nativo reimportabile** — il listone con `FantaSquadra` e `Costo` compilate.
   Priorità massima.
2. **`.json` completo** — backup dei dati utente, vedi §3.1.
3. **`.xlsx` report** — rose e spesa per reparto.
4. **`.pdf`** — riepilogo stampabile. Cosmetico.

---

## 7. Stack

```
Vite + React 18 + TypeScript strict
Tailwind CSS
Zustand            stato applicativo
Dexie              persistenza IndexedDB
Fuse.js            fuzzy search
SheetJS (xlsx)     export Excel
pdfmake            export PDF
Vitest             test del domain layer
```

Nessun backend, nessuna chiamata di rete a runtime.

```
/src
  /domain      lineupStatus, reducer, svincolati, maxBid — TS puro, testato
  /store       Zustand + Dexie
  /parse       parser difensivo del listone + diff di re-import
  /features
    /live      command bar, board, scheda giocatore, overlay
    /teams     editor formazioni, note squadra
    /goals     obiettivi
    /free      svincolati
  /export      xlsx, json, pdf
```

---

## 8. Milestone

| # | Contenuto | Criterio |
| --- | --- | --- |
| M0 | Rimozione pricing + backup/export JSON §3.1 | `pricing.ts` e `live-pricing.ts` eliminati, test verdi, backup round-trip verificato |
| M1 | Modello dati utente + `lineupStatus` + persistenza | Note, tag, lineups salvati e ricaricati dopo refresh |
| M2 | **Squadre — editor formazioni** | Una squadra compilata in meno di due minuti |
| M3 | Asta live — command bar, badge inline, scheda, overlay | Assegnazione in <5 s, undo, crash recovery |
| M4 | Svincolati + Obiettivi | Filtri e ordinamenti, overlay da `s` e `o` |
| M5 | Export xlsx nativo + report | File reimportabile in Lega Fantacalcio |

**M2 va prima di M3.** L'inserimento delle 20 formazioni è giorni di lavoro manuale, non
di codice: prima esiste l'editor, prima si può cominciare. La command bar senza formazioni
inserite non mostra i badge, che sono la ragione per cui esiste.

---

## 9. Rischi

| Rischio | Mitigazione |
| --- | --- |
| **Perdita delle note** | §3.1 — export JSON, auto-download, import non distruttivo. Rischio n.1 |
| Formazioni non compilate in tempo | M2 anticipata; le big per prime, le altre anche parziali |
| Desync dal tabellone ufficiale | Riga di riconciliazione §4.4, inserimento retroattivo, undo su tutto |
| Schema del listone cambia | Parser difensivo con validazione esplicita |
| Scope creep | §1 fuori scope. Non negoziabile prima di M5 |
