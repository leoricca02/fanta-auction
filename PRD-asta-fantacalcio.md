# PRD — Fanta Auction Assistant

**Versione:** 1.0
**Owner:** Leonardo Ricca
**Stato:** approvato per scaffolding

---

## 1. Obiettivo e scope

Applicazione web local-first, single-user, che assiste durante l'asta del Fantacalcio Classic
come strumento decisionale personale, e nella fase di studio pre-asta.

**Non è** il tabellone ufficiale della lega. Il tabellone resta quello di Lega Fantacalcio;
questo tool è la vista strategica privata dell'utente, mantenuta in parallelo.

### Vincoli fissati

| Parametro | Valore |
| --- | --- |
| Modalità | Classic (no Mantra) |
| Formato asta | Per ruoli sequenziali: P → D → C → A |
| Partecipanti | 12 |
| Crediti per squadra | 800 (9.600 totali) |
| Rosa | 3 P, 8 D, 8 C, 6 A = 25 slot (300 totali) |
| Utenti | 1 (nessuna sync, nessuna auth) |
| Tracking | Solo prezzo finale, nessun rilancio |

### Fuori scope v1

Gestione stagione, formazioni, mercato di riparazione, Mantra, multi-lega, multi-device.

---

## 2. Sorgente dati

### 2.1 Listone

File di riferimento: `lista_calciatori_classic.xlsx`, 537 righe, header su riga 1.

| Colonna | Tipo | Uso |
| --- | --- | --- |
| `#` | int | **ID stabile** — chiave primaria, sopravvive tra stagioni |
| `Nome` | str | Display e fuzzy search. Nessun duplicato verificato |
| `Fuori lista` | `*` o vuoto | **21 righe da escludere** dal pool |
| `Sq.` | str | Club Serie A (20 valori) |
| `Under` | int | Età |
| `R.` | `P/D/C/A` | Ruolo Classic |
| `R.MANTRA` | str | Ignorato in v1 |
| `PGv`, `MV`, `FM` | int | **Tutti zero** nel file pre-stagione. Non utilizzabili |
| `FVM/1000` | int, 1–296 | **Metrica di tiering primaria** |
| `QUOT.` | int, 1–35 | Quotazione base, input della normalizzazione |
| `FantaSquadra` | vuoto | **Target di export** — sigla acquirente |
| `Costo` | vuoto | **Target di export** — prezzo pagato |

**Requisito del parser:** difensivo. Lo schema cambia ogni stagione. Validare la presenza
delle colonne attese, fallire con messaggio esplicito su colonna mancante, mai silenziosamente.

**Composizione pool dopo esclusione dei fuori lista (516 giocatori):**

| Ruolo | Pool | Slot lega | Ratio |
| --- | --- | --- | --- |
| P | 63 | 36 | 1.75 |
| D | 181 | 96 | 1.89 |
| C | 184 | 96 | 1.92 |
| A | 88 | 72 | **1.22** |

### 2.2 Note pre-compilate

Il listone non contiene storico. Il campo note si alimenta da un dataset esterno prodotto
dalla pipeline `betting_edge` (SOSFanta, statistiche stagione precedente), joinato su `#`
oppure su `Nome` normalizzato in fallback.

**In v1 il campo note è manuale.** L'integrazione è un'interfaccia astratta
(`NotesProvider`) da implementare in v1.1.

### 2.3 Re-import e versioning

Il mercato estivo chiude il **1° settembre 2026 alle 20:00**. Il listone va riscaricato
dopo quella data. L'app deve gestire il ricaricamento **senza distruggere il lavoro di
studio** accumulato.

**Principio:** `Player` appartiene al listone ed è integralmente sostituibile.
`UserNote` appartiene all'utente e non viene mai toccato da un import. Le due tabelle
sono joinate su `#`, che è l'ID stabile di Fantacalcio.it e sopravvive tra le versioni.

```ts
interface Dataset {
  version: string;      // hash del file sorgente
  importedAt: number;
  filename: string;
  players: Player[];
}

interface ListoneDiff {
  added:        Player[];                                    // nuovi in lista
  removed:      Player[];                                    // usciti dalla Serie A
  teamChanged:  { player: Player; from: string; to: string }[];
  quotChanged:  { player: Player; from: number; to: number; deltaPct: number }[];
}
```

**Requisiti:**

- Il re-import è **transazionale e confermato**: si calcola il diff, lo si mostra, e si
  applica solo su conferma esplicita. Mai un aggiornamento silenzioso.
- Le note dei giocatori in `removed` si **archiviano** (`archived: true`), non si
  cancellano. Un giocatore può rientrare, e una cancellazione è irrecuperabile.
- Alert di severità alta su `removed` e `teamChanged` quando il giocatore è in watchlist
  (`starred` o `maxBid !== null`): è lo studio dell'utente a essere invalidato.
- `quotChanged` si filtra a `|deltaPct| ≥ 20`. Sotto soglia è rumore.
- `f` (§4.1) si ricalcola sul nuovo pool, quindi **tutti** gli `expectedPrice` cambiano,
  anche a quotazione invariata. Il diff deve mostrare il rapporto `maxBid / expectedPrice`
  prima e dopo per ogni giocatore in watchlist, così che l'utente riconosca i max bid
  che non significano più quello che intendeva.
- Il re-import va **bloccato** se esiste già un `AssignmentEvent` non annullato: cambiare
  il listone ad asta iniziata invalida l'event log. Richiedere conferma distruttiva
  esplicita con reset.

**Caso limite — asta prima del 1° settembre.** Se l'asta precede la chiusura del mercato,
il rischio non è il dato obsoleto ma l'acquisto di giocatori in uscita. Fuori scope v1,
ma il campo note manuale è sufficiente a marcarli.

---

## 3. Modello dati

### 3.1 Entità

```ts
type Role = 'P' | 'D' | 'C' | 'A';

interface Player {
  id: number;            // colonna '#'
  name: string;
  team: string;          // club Serie A
  role: Role;
  under: number;
  quot: number;          // QUOT. grezza
  fvm: number;           // FVM/1000
  expectedPrice: number; // derivato, vedi 4.1
  tier: 1 | 2 | 3 | 4 | 5;
}

interface FantaTeam {
  id: string;
  name: string;
  abbr: string;          // sigla per command bar, univoca
  isUser: boolean;       // esattamente una true
}

interface AssignmentEvent {
  id: string;
  ts: number;
  playerId: number;
  teamId: string;
  price: number;
  phase: Role;
  undone: boolean;       // soft delete, mai hard delete
}

interface UserNote {
  playerId: number;
  text: string;
  maxBid: number | null; // prezzo massimo personale
  starred: boolean;      // watchlist
}
```

### 3.2 Principio architetturale

Lo stato di lega **non è mai mutato direttamente**. È sempre `reduce(events) → LeagueState`.

```
AssignmentEvent[]  →  reducer puro  →  LeagueState { rosters, credits, slots, metrics }
```

Conseguenze richieste:

- **Undo/redo** su qualsiasi assegnazione, anche non l'ultima (flag `undone`)
- **Crash recovery**: persistenza sincrona dell'evento su IndexedDB prima del render
- **Inserimento retroattivo**: assegnare a chiunque in qualsiasi momento, non solo "adesso"
- **Replay** per il report finale e l'analisi post-asta

---

## 4. Metriche

Tutte in `/domain/metrics.ts`, funzioni pure, coperte da test.

### 4.1 Prezzo atteso di lega

Le quotazioni del listone sono tarate su una lega da 500 crediti e sotto-quotano
strutturalmente. Vanno riscalate sull'economia reale.

```
N_r          = slot del ruolo r nella lega        (P 36, D 96, C 96, A 72)
pool_r       = top N_r giocatori del ruolo r per QUOT.
S            = Σ_r Σ_{p ∈ pool_r} QUOT(p)         = 2844 sul file corrente
f            = creditiTotaliLega / S               = 9600 / 2844 = 3.38
expectedPrice(p) = round(QUOT(p) × f)
```

Verifica di sanità sul dataset attuale: Lautaro Martinez 35 → 118, Dimarco 32 → 108,
Pulisic 25 → 84.

`f` va ricalcolato a ogni import, mai hardcodato.

### 4.2 Budget split implicito dal listone

Baseline neutra derivata dal valore del pool, da mostrare pre-asta come punto di partenza
per il piano personale (che l'utente sovrascrive):

| Ruolo | Quota | Crediti | Media per slot |
| --- | --- | --- | --- |
| P | 8.4 % | 810 | 22.5 |
| D | 27.4 % | 2.630 | 27.4 |
| C | 34.4 % | 3.301 | 34.4 |
| A | 29.8 % | 2.859 | 39.7 |

### 4.3 Max bid

Per ogni squadra, in ogni istante:

```
maxBidAssoluto(t)   = crediti(t) − (slotRimanenti(t) − 1)
maxBidRagionevole(t) = crediti(t) − Σ_{fasi future} (slot_fase × prezzoMinimoAccettabile_fase)
```

Il primo è il tetto matematico e va calcolato **per tutti i 12 partecipanti**: risponde a
"chi può ancora battermi su questo giocatore". Il secondo vale solo per l'utente.

### 4.4 Scarcity della fase attiva

Deterministico durante l'asta per ruoli:

```
poolResiduo_r    = giocatori del ruolo r non ancora assegnati, sopra soglia tier
slotResidui_r    = Σ_t slotLiberi(t, r)
pressione_r      = slotResidui_r / poolResiduo_r
```

`pressione → 1` significa che ogni giocatore rimasto verrà comprato: i prezzi salgono e
aspettare non paga. Alert a `pressione > 0.8`.

### 4.5 Inflazione della fase

```
creditiAttesiSullaFase = Σ_t min(crediti(t), quotaPianificata_fase(t))
inflazione_fase = creditiAttesiSullaFase / Σ_{p ∈ pool fase} expectedPrice(p)
```

Sopra 1 il mercato paga sopra quotazione in questo momento, sotto 1 è a sconto.

### 4.6 Profilo avversari

Aggiornato a ogni assegnazione, leggibile dal terzo o quarto acquisto:

```
aggressività(t) = media( prezzoPagato / expectedPrice ) sugli acquisti di t
```

### 4.7 Riconciliazione

Sempre visibile in barra: `Σ crediti spesi in lega` e `Σ slot occupati`, per il confronto
a colpo d'occhio col tabellone ufficiale. È la mitigazione del rischio di desync.

### 4.8 Ricalibrazione live (`f_live`)

I 9.600 crediti sono una quantità conservata. Se l'asta parte cara, il resto **deve**
andare a sconto: non è una stima, è un vincolo di bilancio. Il fattore di §4.1 va quindi
ricalcolato sullo stato residuo a ogni assegnazione.

```
creditiResidui = creditiTotali − Σ prezziPagati
slotResidui    = 300 − assegnazioniAttive
poolResiduo    = top {slotResidui} giocatori non assegnati, per QUOT. desc
f_live         = (creditiResidui − slotResidui) / Σ QUOT(poolResiduo)

expectedPriceLive(p) = max(1, round(QUOT(p) × f_live))
```

Il termine `− slotResidui` è il floor da 1 credito per slot, non spendibile.

**Invariante da testare:** `Σ expectedPriceLive(poolResiduo) ≈ creditiResidui − slotResidui`,
tolleranza 1% per gli arrotondamenti. Se questa proprietà si rompe, la metrica mente.

**Segno.** Prezzi sopra l'atteso fanno **scendere** `f_live`, non salire. L'errore
intuitivo opposto — "va a 60 invece di 50, quindi rialzo tutti del 20%" — è la ragione
principale per cui questa metrica vale la pena: i 10 crediti extra sono usciti dal
montepremi, quindi il resto del mercato si è impoverito.

Ordine di grandezza atteso: se i primi 100 slot vanno mediamente a +20%, si bruciano ~640
crediti extra e `f_live` scende di circa il 10% per i restanti 200 slot.

### 4.9 Livello di sostituzione

Per ogni ruolo, il valore del giocatore *marginale* — l'ultimo che verrà assegnato in lega:

```
marginale(r) = expectedPriceLive( poolResiduo_r [ slotResidui_r − 1 ] )
```

con `poolResiduo_r` ordinato per QUOT. desc. Se il pool del ruolo è esaurito o più corto
degli slot, `marginale(r) = 1`.

È il costo di riempire uno slot al minimo accettabile, e alimenta §4.10.

### 4.10 Soglie di rilancio

Tre numeri, non un verdetto. La funzione restituisce soglie, mai un "compra".

```ts
interface BidVerdict {
  tettoSostenibile: number;   // aritmetico, sempre affidabile
  prezzoIndifferenza: number; // dipende dalle stime dell'utente
  scarsitaTier: number;       // giocatori del tier rimasti nel ruolo
  surplusCorrente: number;    // valore(p) − prezzoAttuale
}
```

**Tetto sostenibile** — quanto puoi pagare senza compromettere gli slot restanti:

```
tettoSostenibile(p) = crediti(user)
                    − Σ_r ( slotLiberi(user, r) × marginale(r) )
                    + marginale( role(p) )
```

L'ultimo termine ripristina la riserva dello slot che stai riempiendo adesso.
Puramente aritmetico: nessun giudizio, corretto per costruzione.

**Prezzo di indifferenza** — sopra questa cifra conviene lasciare e prendere la migliore
alternativa rimasta nel ruolo:

```
valore(p)              = userValue(p) ?? expectedPriceLive(p)
surplus(q)             = valore(q) − expectedPriceLive(q)
prezzoIndifferenza(p)  = valore(p) − max{ surplus(q) : q ∈ poolResiduo_role(p), q ≠ p }
```

Vale esattamente quanto valgono le stime `userValue` dell'utente. Se risulta **negativo**,
significa che esiste già un'alternativa migliore a mercato: lasciare subito.

**Scarsità del tier** — §4.4 ristretta al tier del giocatore. In fase A, con rapporto
pool/slot a 1.22, "ne trovo un altro" è quasi sempre falso.

### 4.11 Guardrail di disciplina

I crediti non spesi valgono zero a fine asta, il che spinge strutturalmente verso
l'alto. Ma il tetto sostenibile è un **limite, non un obiettivo**: usarlo come consiglio
porta a chiudere ogni acquisto al massimo consentito.

Contatore visibile in barra: numero di acquisti chiusi entro il 10% del tetto
sostenibile. Sopra 3, avviso di calibrazione.

---

## 5. Interfaccia

### 5.1 Command bar (schermata live)

Input singolo, keyboard-only, con due modalità distinte dalla presenza della sigla:

```
dimarco 60           →  VALUTAZIONE: soglie §4.10 live mentre il rilancio sale
dimarco 60 mrc       →  ASSEGNAZIONE: registra e aggiorna lo stato
lautaro 118 leo      →  assegna Lautaro Martinez a LEO per 118
```

Nessuno switch di modalità, nessun tasto in più: si digita il prezzo mentre l'asta sale e
le tre soglie si ricalcolano a ogni cifra. Aggiungendo la sigla si conferma l'acquisto.

Il verdetto deve stare in **una riga leggibile in due secondi**: tetto sostenibile in
grande, indifferenza e scarsità di contorno, colore sul surplus corrente. Deve essere
ignorabile — l'utente non è tenuto a leggerlo per usare il tool.

Requisiti:

- Fuzzy search filtrata di default sul ruolo della fase attiva (~63–184 candidati, non 516)
- Match tollerante ad accenti, maiuscole e nomi parziali
- Conferma con `Enter`, disambiguazione con frecce se il match è ambiguo
- `Ctrl+Z` undo, `Ctrl+Shift+Z` redo
- Target: **sotto i 5 secondi per assegnazione**, zero uso del mouse

300 chiamate a 5 secondi invece di 15 sono 50 minuti di attenzione risparmiati.

### 5.2 Schermate

**Studio (pre-asta)** — tabella listone filtrabile per ruolo, tier, club, fascia di prezzo
atteso. Colonna note editabile inline. Stellina per watchlist e campo max bid personale.
Pannello del piano budget per reparto, inizializzato sui valori di §4.2.

**Live (asta)** — layout a tre zone:
- *Sinistra, dominante*: la rosa dell'utente per ruolo, con slot liberi, crediti residui,
  max bid ragionevole, scostamento dal piano di reparto
- *Centro*: command bar, watchlist della fase attiva con alert sul superamento del max bid,
  scarcity e inflazione della fase
- *Destra, densa*: griglia 12 righe degli avversari — crediti, max bid assoluto, slot liberi
  per ruolo, indice di aggressività

La UI è deliberatamente egocentrica: nessuna concessione alla leggibilità pubblica.

**Report (post-asta)** — riepilogo rose, spesa per reparto, percentuali, scostamento
pagato/atteso per ogni acquisto, classifica di aggressività.

---

## 6. Export

1. **`.xlsx` nativo reimportabile** — il listone originale con `FantaSquadra` e `Costo`
   compilate. Priorità massima.
2. **`.xlsx` report** — multi-sheet: rose, spesa per reparto, analisi acquisti.
3. **`.pdf` stampabile** — riepilogo delle 12 rose.
4. **`.json` dell'event log** — backup completo e riproducibile dello stato.

---

## 7. Stack

```
Vite + React 18 + TypeScript (strict)
Tailwind CSS
Zustand            stato applicativo
Dexie              persistenza IndexedDB
Fuse.js            fuzzy search
SheetJS (xlsx)     export Excel
pdfmake            export PDF
Vitest             test del domain layer
```

**Nessun backend.** Nessun server attivo il giorno dell'asta.

Wrapper Tauri v2 valutabile in v2 per un binario distribuibile: la SPA resta identica.

### Struttura

```
/etl                  Python — listone + betting_edge → dataset.json (v1.1)
/src
  /domain             reducer, metriche, tiering — TS puro, zero React, 100% testato
  /store              Zustand + persistenza Dexie
  /features
    /study            schermata pre-asta
    /live             command bar, board, griglia avversari
    /report           riepilogo e analisi
  /export             xlsx, pdf, json
  /parse              parser difensivo del listone
```

Il confine `/domain` senza dipendenze da React è deliberato: le metriche di §4 sono
funzioni pure testabili, e durante l'asta i numeri devono essere affidabili senza verifica
manuale.

---

## 8. Milestone

| # | Contenuto | Criterio di completamento |
| --- | --- | --- |
| M1 | Parser listone + domain layer + test | 516 giocatori caricati, `f` calcolato, metriche verdi |
| M2 | Schermata Studio + re-import con diff | Note, watchlist, max bid, piano budget persistiti; re-import §2.3 non distruttivo |
| M3 | Live: command bar + event log + undo | Assegnazione in <5 s, crash recovery verificata |
| M4 | Griglia avversari + metriche live + soglie di rilancio | Max bid di tutti, scarcity, `f_live` con invariante verde, soglie §4.10, aggressività |
| M5 | Export | `.xlsx` nativo reimportabile + report + PDF |

M1 e M3 sono il cuore. M2 e M4 sono incrementali. M5 è isolato e parallelizzabile.

---

## 9. Rischi

| Rischio | Mitigazione |
| --- | --- |
| Desync dal tabellone ufficiale | Barra di riconciliazione §4.7, inserimento retroattivo, undo su tutto |
| Schema del listone cambia | Parser difensivo con validazione esplicita delle colonne |
| Errore di battitura sotto pressione | Fuzzy search filtrata per fase, conferma visiva, undo immediato |
| Scope creep post-asta | Fuori scope esplicito in §1. Non negoziabile prima di M5 |
| Perdita dati a metà asta | Event log append-only su IndexedDB, scrittura sincrona, export JSON manuale |
| Studio invalidato dal listone di fine mercato | Separazione Player/UserNote su `#`, diff confermato §2.3, note archiviate mai cancellate |
