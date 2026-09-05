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

**E il prezzo dinamico di §5.5?** È l'unica cifra in crediti che l'app propone, e non è il
modello della 1.0 che rientra dalla finestra. Quello derivava una previsione dal listone,
per tutti, sempre. Questo mette in rapporto due numeri che il listone non conosce: una
*tua* aspettativa dichiarata a mano, e i prezzi che il *tuo* tavolo sta battendo stasera.
Se non hai scritto l'aspettativa, non esiste — ed è il caso normale.

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

interface Expectation {         // dati utente, §5.5
  playerId: number;
  matches: number;              // presenze a voto attese
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
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

- Export JSON completo di tutti i dati utente (lineups, note, obiettivi, tag,
  aspettative, eventi)
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

## 5. Interfaccia — cinque sezioni

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

### 5.5 Aspettative e prezzo dinamico

Risponde a una domanda sola, quella che sotto asta non ci si ricorda di farsi: *se penso
che Yildiz faccia gli stessi numeri di Kolo Muani, e Kolo Muani è appena andato a 60,
perché sto scrivendo 90?*

**Solo giocatori di movimento.** L'asta dei portieri si gioca su porte inviolate e
titolarità del reparto, non su gol e assist: una formula sola per entrambi mentirebbe su
uno dei due. I portieri restano fuori, ed è una scelta, non una dimenticanza.

#### Il valore

Cinque numeri per giocatore, scritti a mano: presenze, gol, assist, ammonizioni,
espulsioni attesi nella 2026/27.

```
V(x) = w[ruolo] × presenze + 3×gol + 1×assist − 0,5×amm − 1×esp
w = { D: 0,5   C: 0,3   A: 0,2 }
```

Gol, assist e cartellini sono i bonus/malus del fantacalcio: regolamento, non opinione.
L'unico numero discutibile è quanto vale una presenza, e vale **per ruolo** — da un
difensore si compra titolarità, da un attaccante gol.

I tre pesi sono tarati, non scelti a occhio: la simulazione di §5.5.3 li ha misurati
contro i prezzi veri, e la curva dell'errore è piatta attorno a questi valori (D: 30%
contro il 29% dell'ottimo; C e A esatti). Sui difensori le presenze contano davvero
(peso 0 → 42% di errore, peso 0,3 → 29%); sugli attaccanti sono ininfluenti, e da 0 a 2
l'errore non si muove.

Il tasso si calcola per reparto, quindi la **scala** dei pesi è irrilevante: moltiplicarli
tutti per due dimezza ogni tasso e non sposta un credito. Conta solo la **forma** — quante
presenze valgono un gol dentro quel ruolo.

#### Il tasso, e il prezzo

```
tasso[ruolo] = mediana( prezzo_pagato / V )  sulle aste già battute del reparto
prezzo(x)    = max(1, round( tasso[ruolo] × V(x) ))
```

- **Mediana, non media**: una singola asta fuori scala non deve spostare la scala di
  tutte le altre.
- **Solo le aste valutate da te**: di un acquisto senza aspettativa non si conosce il
  denominatore, e inventarlo sposterebbe il tasso di tutti gli altri.
- **Ogni reparto sta per conto suo, e non si prestano niente.** La simulazione misura
  0,96 crediti per punto sui difensori e 1,90 sugli attaccanti: prestare il tasso dei D
  alla fase A dimezzerebbe ogni consiglio, e proprio all'apertura del reparto, quando
  escono i nomi grossi.
- Conseguenza accettata: l'asta è sequenziale P → D → C → A, quindi **i primi 3 colpi di
  ogni fase non hanno prezzo**. È il costo di non mentire sulla scala, e dura tre aste.

`null` non è zero, ed è il caso più frequente. Quattro stati distinti, che la UI deve
dire a parole perché sono quattro cose da fare diverse: portiere · non valutato ·
aspettativa che vale zero · reparto con meno di 3 aste.

#### 5.5.1 Dove si compila

- **Sezione Aspettative** — una riga per giocatore, un reparto alla volta, ordine
  `FVM/1000` decrescente, `Tab` che scorre le cinque caselle. È dove se ne riempiono
  quaranta la sera prima. Filtri: tutti / da valutare / valutati.
- **Scheda giocatore** — le stesse cinque caselle, per il ripensamento sul singolo nome,
  raggiungibile con `?` mentre l'asta corre.

In entrambe, un bottone precompila con le cifre **vere** della 2025/26 (`SEASON_STATS`).
È un punto di partenza, non un verdetto: da lì in poi il numero è tuo.

Svuotare tutte e cinque le caselle **toglie** l'aspettativa, non la mette a zero. È
l'unico hard delete sui dati utente, e la ragione è che qui il vuoto significa qualcosa:
una riga a zero dice "non farà niente", che è un giudizio; nessuna riga dice "non l'ho
valutato", che spegne il prezzo invece di falsarlo.

#### 5.5.2 Dove si legge

Nel pannello di assegnazione, sopra la casella del prezzo, **solo per i giocatori che hai
valutato** — su un nome non valutato non c'è niente da dire, e una riga vuota a ogni
chiamata sarebbe rumore nella zona più densa dello schermo.

Mostra il consigliato, il `V`, il tasso con quante aste lo sostengono, un bottone che lo
scrive nella casella del prezzo, e — se hai già battuto una cifra più alta — **di quanto
la stai superando**. Quel `+68%` è la feature: è la domanda di partenza, posta nel momento
in cui serve.

#### 5.5.2b Si può spegnere

Un interruttore in Impostazioni toglie §5.5 dall'applicazione: sparisce la scheda
Aspettative, la sezione nella scheda giocatore e il consigliato nel pannello d'asta.
Acceso di default; la scelta sopravvive a un refresh.

**Non cancella niente.** Le aspettative restano su disco e nel backup, e riaccendendo si
ritrova ogni riga dov'era, anche a metà asta. Per questo non chiede conferma: non c'è
niente da perdere, e una conferma su un gesto reversibile insegna solo a cliccare "sì"
senza leggere.

Esiste perché l'asta è una serata sola e non si ripete: se il numero consigliato
distraesse invece di aiutare, non ci deve essere modo di restare impantanati. È una
preferenza, non un dato utente — vive in `meta`, non nel JSON di §3.1.

#### 5.5.3 Quanto ci si può fidare

`src/test/valuation-sim.test.ts` simula un'asta intera per 264 giocatori di movimento.
Non bara: le aspettative sono le statistiche **vere** 2025/26, i prezzi escono dalla
colonna `FVM/1000` riscalata sui 9.600 crediti. Due sorgenti indipendenti, nessuna delle
due prodotta da questa formula. Si stampa con `SIM=1 npx vitest run valuation-sim`.

Cosa dice:

| | |
| --- | --- |
| Aspettative perfette | errore **0,0%** — il meccanismo è corretto, l'errore sta altrove |
| Statistiche dell'anno scorso come aspettative | errore mediano **40%** |
| Bias sui più costosi | **−33%** — il consiglio resta basso |
| Bias sui più economici | **+63%** |

**Il collo di bottiglia sono le aspettative, non la formula.** Curvare la proporzione con
un esponente (`tasso × V^γ`) non migliora l'errore mediano — 39% a γ=1, 43% a γ=2 —
riduce solo il bias sistematico. Quindi la formula resta lineare: complicarla non paga, e
questo è misurato, non opinato.

Quel 40% è il tetto pessimistico, e viene in gran parte dal fatto che "l'anno scorso" non
è "quest'anno": stesse cifre 2025/26 per Malen e Hojlund, prezzi veri 348 e 201. Le
aspettative scritte a mano sono il rimedio, ed è per quello che le scrive l'utente.

**Da tenere a mente usandolo:** sui nomi più cari il consigliato è sistematicamente basso.
Si legge come un pavimento, non come un tetto.

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
  /domain      lineupStatus, reducer, svincolati, maxBid, valuation — TS puro, testato
  /store       Zustand + Dexie
  /parse       parser difensivo del listone + diff di re-import
  /features
    /live      command bar, board, scheda giocatore, overlay
    /teams     editor formazioni, note squadra
    /goals     obiettivi
    /free      svincolati
    /expectations  aspettative in blocco, §5.5
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
| M6 | **Aspettative + prezzo dinamico §5.5** | Simulazione su listone e statistiche reali verde; consigliato visibile nel pannello di assegnazione |

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
| **Il prezzo dinamico riletto come una previsione** | È un rapporto fra la tua aspettativa e i prezzi battuti: senza aspettativa non esiste, e la UI dichiara sempre tasso e quante aste lo sostengono. Sui nomi cari resta basso per costruzione (§5.5.3): pavimento, non tetto |
| Aspettative compilate a metà | Il valore `V` è visibile in tabella mentre si compila, e svuotare le caselle toglie la riga invece di lasciarla a zero |
