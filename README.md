# Fanta Auction Assistant

Applicazione web local-first per assistere durante l'asta del Fantacalcio Classic
e nello studio pre-asta. Nessun backend, nessuna chiamata di rete a runtime,
un solo utente.

Specifica di riferimento: [`PRD-asta-fantacalcio-v2.md`](./PRD-asta-fantacalcio-v2.md).
La 1.0, che costruiva un modello di prezzo poi eliminato, resta in
`PRD-v1-superseded.md` solo come riferimento storico.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
```

Al primo avvio l'app chiede il listone: **Impostazioni → Listone → Carica .xlsx**,
poi **Impostazioni → Partecipanti** per nomi e sigle dei 12.

```bash
npm test         # 467 test
npm run test:cov # con copertura; /src/domain ha soglia 100%
npm run build
```

## Le quattro sezioni

| Sezione | A cosa serve |
| --- | --- |
| **Asta** | Command bar keyboard-only, event log con undo, griglia dei 12 |
| **Squadre** | Editor delle formazioni, una squadra in un paio di minuti |
| **Svincolati** | Chi resta libero, con filtri e ordinamenti |
| **Obiettivi** | Strategia in markdown semplice e lista dei target |

### Command bar

```
dimarco              cerca
dimarco 60           chi può ancora rilanciare a 60
dimarco 60 mrc       assegna Dimarco a MRC per 60
```

Frecce per scegliere, Invio per confermare. `?` scheda del giocatore,
`o` obiettivi, `s` svincolati, `Esc` chiude e riporta il cursore nella barra
col testo intatto. `Ctrl+Z` annulla, `Ctrl+Shift+Z` ripristina — anche su
assegnazioni che non sono l'ultima.

La ricerca è filtrata sul ruolo della fase attiva, ma se in quella fase non
trova niente allarga a tutti i ruoli e lo dichiara: serve a recuperare una
chiamata persa di un reparto già chiuso.

### Editor formazioni

Scegli il modulo, premi *Compila dal primo slot vuoto* e batti Invio undici
volte: ogni slot propone solo i giocatori di quel club, compatibili di ruolo e
ordinati per `QUOT.` decrescente. Maiusc+Invio resta sullo slot e aggiunge il
ballottaggio.

## Il backup è il rischio numero uno

Tutto vive in IndexedDB, che una pulizia dati del browser azzera senza
preavviso. **Scarica un backup ogni volta che finisci di lavorare**
(Impostazioni → Backup). All'apertura l'app ne scarica uno da sola se l'ultimo
risale a più di un giorno, ma non è una rete su cui appoggiarsi.

L'import di un backup è non distruttivo e passa da una conferma che mostra cosa
entra, cosa viene saltato perché più vecchio di quello che hai già, e quali
eventi il reducer scarterà.

## Architettura

```
/src
  /domain      logica pura: reducer, formazioni, ricerca, backup, diff
  /parse       parser difensivo del listone .xlsx
  /store       Zustand + Dexie
  /features    live, teams, free, goals, player, settings
  /export      xlsx nativo, report, pdf
```

Tre vincoli che valgono più delle convenzioni:

1. **`/src/domain` è puro.** Non importa React, non importa Zustand, non tocca
   IndexedDB. La suite ne copre il 100% di branch, ed è una soglia che fa
   fallire `npm run test:cov`.
2. **Lo stato di lega è sempre `reduce(events, config)`.** Rose, crediti e slot
   non si mutano mai a mano. Niente hard delete: annullare è `undone: true`.
3. **Si scrive prima di renderizzare.** Ogni azione dello store attende la
   scrittura su IndexedDB e solo dopo aggiorna la vista, così un crash a metà
   asta non perde l'acquisto appena battuto. L'unica deroga dichiarata è
   l'editor formazioni, dove il render segue un ref sincrono per non perdere
   tasti; è commentata nel file.

Tutte le scritture passano da **una coda unica**: senza, due modifiche
ravvicinate partirebbero dallo stesso stato e l'ultima cancellerebbe la prima.
È il bug che è uscito due volte, ed è coperto dai test dello store.

## Export

`.xlsx` nativo reimportabile in Lega Fantacalcio — **riscrive dentro il file
originale** invece di rigenerarlo, così le 537 righe e le colonne che l'app non
usa sopravvivono intatte. Più report multi-foglio, PDF delle rose e `.json` di
backup.

## Re-import del listone

Il mercato chiude il 1° settembre e il listone va riscaricato. Il diff — nuovi,
usciti, cambio squadra, quotazione variata oltre ±20% — si mostra sempre prima
di applicarlo, insieme a cosa costa: quali giocatori su cui hai lavorato escono,
quali formazioni perdono qualcuno, quanti slot restano vuoti.

Le note dei giocatori usciti si **archiviano**, non si cancellano. Il re-import
è bloccato se ci sono assegnazioni attive; per sbloccarlo c'è *Annulla tutte le
assegnazioni*, che resta un soft delete.

`data/listone-prova-reimport.xlsx` è un listone modificato ad arte per provare
il flusso senza aspettare settembre.
