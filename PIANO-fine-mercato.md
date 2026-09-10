# Piano di fine mercato — listone definitivo, fasce, specialisti

> Appuntamento: **chiusura del calciomercato, 1º settembre 2026**.
> Documento scritto il 2026-08-25, con le pagine sorgente verificate quel giorno.
> Serve a riaprire il lavoro da zero senza il contesto della sessione in cui è stato preparato.

Quando arrivano le tre cose — **listone definitivo `.xlsx`**, **link della guida alle fasce**,
**link di rigoristi e tiratori** — c'è da fare, nell'ordine: un backup, un import, le
rigenerazioni di dataset e un giro di test da riallineare. Nessuna funzione da scrivere: gli
specialisti sono stati costruiti il 2026-08-25 e a settembre si limitano a rigenerarsi (§5).

Dal 2026-09-04 c'è un quarto script, `build-injuries.mjs`, e la sua fonte è una quarta pagina:
la **tabella indisponibili** (§3-bis).

Le statistiche della scorsa stagione **non si toccano**: il perché è al §4.

---

## Indice

- [§0 — Prima di toccare qualsiasi cosa](#0--prima-di-toccare-qualsiasi-cosa)
- [§1 — Import del listone definitivo](#1--import-del-listone-definitivo)
- [§2 — Il listone di test e i numeri che si romperanno](#2--il-listone-di-test-e-i-numeri-che-si-romperanno)
- [§3 — Rigenerare le fasce](#3--rigenerare-le-fasce)
- [§3-bis — Rigenerare gli indisponibili](#3-bis--rigenerare-gli-indisponibili)
- [§4 — Statistiche 2025/26: niente da fare, ed è giusto così](#4--statistiche-202526-niente-da-fare-ed-è-giusto-così)
- [§5 — Specialisti: rigoristi, punizioni, corner](#5--specialisti-rigoristi-punizioni-corner)
- [§6 — Verifiche finali prima dell'asta](#6--verifiche-finali-prima-dellasta)
- [§7 — Rollback](#7--rollback)
- [Appendice A — Stato del progetto al 2026-08-25](#appendice-a--stato-del-progetto-al-2026-08-25)
- [Appendice E — Passata del 5 settembre 2026](#appendice-e--passata-del-5-settembre-2026-campionato-iniziato)
- [Appendice F — Passata dell'8 settembre 2026](#appendice-f--passata-dell8-settembre-2026-ultima-prima-dellasta)
- [Appendice G — Passata del 10 settembre 2026](#appendice-g--passata-del-10-settembre-2026-il-giorno-dellasta)
- [Appendice B — Decisioni da prendere, non da indovinare](#appendice-b--decisioni-da-prendere-non-da-indovinare)
- [Appendice C — Passata del 1º settembre 2026](#appendice-c--passata-del-1º-settembre-2026-mercato-chiuso-fonti-non-ancora-definitive)
- [Appendice D — Passata del 4 settembre 2026](#appendice-d--passata-del-4-settembre-2026-fonti-aggiornate)

---

## §0 — Prima di toccare qualsiasi cosa

**1. Scarica il backup dei dati.**
Impostazioni → *Backup dei dati* → **Scarica backup .json**. Contiene formazioni, note
giocatore, note squadra, obiettivi ed event log: è l'unica cosa che un re-import non
ricostruisce. Fallo anche se il re-import promette di non toccarli — costa dieci secondi.

**2. Esporta anche l'`.xlsx` nativo.**
Impostazioni → *.xlsx nativo reimportabile*. È il listone corrente con `FantaSquadra` e `Costo`
compilate: serve come fotografia di dov'eri, ed è l'unico formato che un altro tool leggerebbe.

**3. Metti tutto su un branch.**

```bash
git checkout -b fine-mercato-2026
git status            # deve essere pulito prima di iniziare
```

**4. Verifica che il verde di partenza sia verde.**

```bash
npm test              # atteso: 24 file, 594 test verdi
npx tsc -b --noEmit
```

Se qualcosa è già rosso adesso, sistemalo **prima**: dopo l'import non si distingue più il
guasto vecchio da quello nuovo.

---

## §1 — Import del listone definitivo

### 1.1 Dove si prende

Il listone Classic ufficiale è quello di Fantacalcio.it
(`Quotazioni_Fantacalcio_Stagione_*.xlsx`, foglio `Lista calciatori`). Il parser si aspetta
queste intestazioni, in questo ordine di significato, non di posizione:

`#` · `Nome` · `Fuori lista` · `Sq.` · `Under` · `R.` · `R.MANTRA` · `PGv` · `MV` · `FM` ·
`FVM/1000` · `QUOT.` · `FantaSquadra` · `Costo`

Il parser (`src/parse/listone.ts`) è difensivo: se una colonna manca o cambia nome, muore
nominandola invece di importare righe mute.

### 1.2 L'import è bloccato ad asta iniziata

`blockingReason()` in `src/domain/listone-diff.ts:183` blocca il re-import finché esiste
**anche una sola assegnazione applicata**: cambiare il listone ad asta iniziata invaliderebbe
l'event log. Quindi il re-import va fatto **prima** che parta l'asta. Se stai riusando un
database di prova con assegnazioni dentro, annullale tutte o riparti da un profilo pulito.

### 1.3 Cosa succede ai dati quando applichi

`applyListoneChange()` (`src/domain/listone-diff.ts:209`), con la conferma di
`ListoneConfirm.tsx` che mostra il diff **prima**:

| Cosa | Che fine fa |
| --- | --- |
| Note dei giocatori usciti dalla Serie A | **Archiviate**, mai cancellate (`archived: true`) |
| Giocatori usciti, se schierati | Tolti dalle formazioni: sarebbero id fantasma |
| Giocatori che hanno cambiato club | Tolti dalla formazione del **vecchio** club |
| Obiettivi, testo di strategia, note squadra | Intatti: sono il tuo piano, non il listone |
| Quotazioni cambiate oltre il 20% | Solo segnalate nel diff, nessuna azione |

Leggi la schermata di conferma per intero: la riga che conta è quella dei
**giocatori su cui avevi lavorato che escono**, perché è lavoro che non torna indietro da solo.

### 1.4 Dopo l'import

Annota da qualche parte i due numeri che la schermata Impostazioni mostra sotto *Listone*:
**nome file** e **conteggio giocatori**. Servono al §2.

---

## §2 — Il listone di test e i numeri che si romperanno

Questo è il passo che si dimentica sempre.

L'app carica il listone in IndexedDB, ma **i test leggono un file nel repo**:
`data/lista_calciatori_classic.xlsx`, via `LISTONE_PATH` in `src/test/fixtures.ts:24`. Se non
lo sostituisci, tutti i test continuano a girare sul listone di agosto e le asserzioni sulle
fasce e sulle statistiche misurano una realtà che non esiste più.

```bash
cp /percorso/del/nuovo/listone.xlsx data/lista_calciatori_classic.xlsx
npm test    # adesso serve a qualcosa: guarda cosa cade
```

### 2.1 I numeri fissi da riallineare

Cadranno quasi certamente questi. I valori in tabella sono quelli della revisione del
2026-09-04 (592 righe totali, 533 id in lista; l'ultima revisione, quella dell'8 settembre, sta a 594 e 532 — Appendice F):

| File | Riga | Asserzione oggi |
| --- | --- | --- |
| `src/parse/listone.test.ts` | 62 | `totalRows` = **592** |
| `src/parse/listone.test.ts` | 63 | fuori lista = **59** |
| `src/parse/listone.test.ts` | 70 | ruoli = **P 65 / D 189 / C 192 / A 87** |
| `src/parse/listone.test.ts` | 75 | id unici = **533** |
| `src/export/native.test.ts` | 69, 72 | conserva **592** righe |
| `src/domain/free-agents.test.ts` | 225 | svincolati totali = **533** |
| `src/domain/free-agents.test.ts` | 280 | dopo un'assegnazione = **532** |
| `src/domain/listone-diff.test.ts` | 98 | `kept` = **533** |
| `src/domain/metrics.test.ts` | 251 | `freeAgents.total` = **533** |
| `src/store/appStore.test.ts` | 81 | `listone.count` = **533** |

Il grosso si fa con due sostituzioni sui file di test — il vecchio totale col nuovo, le vecchie
righe con le nuove — e poi restano la distribuzione per ruolo e i due conteggi degli obiettivi,
che vanno letti dall'output di `npm test`.

Sono numeri da **aggiornare al valore nuovo**, non da rendere generici: valgono come
protezione proprio perché sono espliciti. Se un domani il parser perdesse cinquanta righe in
silenzio, questi test sono l'unica cosa che se ne accorgerebbe.

### 2.2 Le due asserzioni che vanno *ripensate*, non solo aggiornate

**`src/domain/tiers.test.ts:133`** — «aggancia la quasi totalità del listone reale». La
tolleranza è `total - 10`. Con le fasce nuove sul listone nuovo il numero di nomi che non
agganciano cambia: se ne restano fuori più di dieci, **non alzare la soglia** — vai a vedere
*chi* non aggancia, perché a quel punto è un problema di convenzione dei nomi, non di mercato.

**`src/domain/player-stats.test.ts:133`** — «non aggancia chi in Serie A non ha mai giocato»,
con i nomi `Stones` e `Kolo Muani` presi come esempi di arrivi dall'estero. Se a settembre uno
dei due non è più nel listone, il test fallisce sull'`expect(newcomers.length).toBeGreaterThan(0)`:
sostituisci i nomi con due arrivi veri dell'estate, oppure ricava il campione dal confronto
`listone ∖ SEASON_STATS` invece che a mano.

### 2.3 Il listone finto per provare il re-import

C'era `data/listone-prova-reimport.xlsx`, un listone modificato ad arte (giocatori tolti,
squadre cambiate) per provare il flusso di §1 senza aspettare settembre. Nessun test lo usava:
era materiale manuale, ed è stato **tolto dal repo l'8 settembre 2026**, a mercato chiuso e
flusso ormai esercitato sul serio quattro volte. Se dovesse riservire, si rifa' da una copia
del listone vero togliendo qualche riga e cambiando due `Sq.`.

---

## §3 — Rigenerare le fasce

### 3.1 Il comando

```bash
node scripts/build-tiers.mjs
```

Riscarica la guida SosFanta e riscrive `src/data/tiers.ts`, che non si modifica a mano.
Aggiorna anche `TIERS_UPDATED_AT`, che l'app mostra per dire quanto è vecchia la fonte.

> **Dal 2026-09-04 scrive un file solo.** Fino a quella data raccoglieva anche i commenti della
> fascia `INFORTUNATI` e li metteva in `src/data/injuries.ts`. Adesso gli infortuni hanno una
> fonte loro, la tabella indisponibili: §3-bis.

### 3.2 Le due cose da cambiare a mano prima di lanciarlo

**1. L'URL.** In `scripts/build-tiers.mjs` la costante `BASE` punta alla guida 2026-27:

```js
const BASE =
  'https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere';
```

Sostituiscila col link nuovo, **senza lo slash finale e senza il numero di pagina**: lo script
compone da sé `/`, `/2/`, `/3/`, `/4/` per portieri, difensori, centrocampisti, attaccanti. Se
la guida aggiornata cambia impaginazione (tutto su una pagina, o un ruolo per URL diverso), va
adattato l'array `PAGES`.

**2. Le fasce note.** `KNOWN_TIERS` nello script elenca le venti fasce ammesse, e deve restare
allineato a `TIER_ORDER` in `src/domain/tiers.ts:30`. Se la guida nuova introduce una fascia che
non c'è (`SUPER TOP 2ª FASCIA`, `DA PRENDERE A FINE ASTA`, quello che sia), **lo script muore
nominandola** — è il comportamento voluto. In quel caso:

1. aggiungi il nome a `TIER_ORDER`, **nella posizione giusta**: l'indice nell'array *è* il rank,
   e determina l'ordinamento della colonna fascia negli svincolati;
2. aggiungi lo stesso nome a `KNOWN_TIERS` nello script;
3. rilancia.

### 3.3 Cosa controllare dopo

Lo script stampa una riga per ruolo (`P: 12 fasce, 78 giocatori`). Poi:

- `git diff --stat src/data/tiers.ts` — un file che cambia di poche righe dopo un mercato intero
  è sospetto: vuol dire che hai riscaricato la guida vecchia;
- l'aggancio è **per nome normalizzato**, non per id, perché la guida non pubblica gli id. Il
  test di §2.2 è il termometro;
- apri l'app e guarda tre schede: un top, uno da `SCOMMESSE`, un neopromosso.

---

## §3-bis — Rigenerare gli indisponibili

```bash
node scripts/build-injuries.mjs
```

Fonte, una pagina sola:

```
https://www.sosfanta.com/indisponibili-e-squalificati/tabella-indisponibili-seriea-fantacalcio-asta-infortunati-tempi-recupero-squalificati-diffidati/
```

È una **tabella**, non una guida, ed è il posto in cui SosFanta scrive *quando torna*:

```html
<p><strong>ATALANTA</strong></p>
<p><em>Infortunati:</em></p>
<p><strong>Hien</strong> - Fuori per una lesione ..., in dubbio per la 6a.</p>
<p><em>Squalificati:</em> -</p>
<p><em>Diffidati:</em> -</p>
```

Tre cose da sapere prima di toccarla:

1. **Legge il listone**, come `build-specialists.mjs`, ma solo per i nomi dei venti club: servono
   a riconoscere le intestazioni e a scrivere il club come lo scrive il listone. Quindi va
   lanciato **dopo** §2, non prima.
2. **L'aggancio nome → giocatore lo fa il dominio**, dentro la rosa di quel club
   (`src/domain/injuries.ts`). È più sicuro di quello delle fasce, che va per ruolo: due omonimi
   nella stessa rosa non prendono niente, nessuno dei due.
3. **La giornata è un campo, la frase resta prosa.** `matchday` c'è solo quando la fonte scrive
   `per la 6a`; "in dubbio per la 6a" e "rientro previsto per la 6a" restano due frasi diverse,
   che la scheda mostra per intero. Il test *«legge la giornata di rientro dalla quasi totalità
   degli infortuni»* è il sensore: se la fonte cambiasse forma alla frase, il chip resterebbe
   muto senza fallire da nessun'altra parte.

Squalificati e diffidati vengono letti dallo stesso giro e finiscono nello stesso file. Fuori dal
campionato sono vuoti — al 2026-09-04 lo erano tutti e venti — e lo script accetta sia i nomi in
riga dopo l'etichetta sia i paragrafi in grassetto degli infortunati.

Se non legge nessun infortunato in venti squadre, muore: "nessuno infortunato" è un risultato
plausibile a leggersi ed è il più insidioso dei file monchi.

---

## §4 — Statistiche 2025/26: niente da fare, ed è giusto così

`src/data/stats.ts` contiene **tutti i 663** giocatori che hanno messo piede in Serie A nel
2025/26, non i soli presenti nel listone di agosto. L'aggancio è **per id** Fantacalcio.it, e
gli id non cambiano con il mercato.

Conseguenza: un giocatore che entra nel listone il 30 agosto — arriva in Serie A da un'altra
squadra italiana, o rientra da un prestito — **si aggancia da solo**, senza rigenerare niente.
Chi arriva dall'estero o dalla B continua a non avere storico, e la scheda dice *"non ha
giocato"* invece di mostrare zeri.

Rigenerare (`node scripts/build-stats.mjs`) serve solo in due casi:

- Fantacalcio.it corregge a posteriori voti o bonus della scorsa stagione (succede, raramente);
- vuoi **un'altra stagione**: cambia `SEASON` e `SEASON_LABEL` in cima allo script — il selettore
  del sito copre dal 2015/16 in poi.

> **Nota per la stagione in corso.** Se a campionato iniziato ti venisse voglia di mostrare
> anche le statistiche 2026/27 accanto a quelle 2025/26, è lo stesso script con `SEASON` diverso
> e un secondo dataset. Ma con due o tre giornate giocate le cifre sono rumore: la scheda già
> avvisa sotto le 12 presenze, e a settembre *tutti* sarebbero sotto quella soglia.

---

## §5 — Specialisti: rigoristi, punizioni, corner

> **Stato: fatto il 2026-08-25.** Script, dominio, interfaccia e test esistono e girano sui dati
> di agosto. A settembre **non c'è niente da progettare**: si rigenera il dataset e si legge
> quello che lo script stampa.

### 5.1 I tre passi di settembre

**1. Gli URL, solo se i link nuovi sono diversi.** In cima a `scripts/build-specialists.mjs`:

```js
const RIGORISTI_URL = 'https://www.sosfanta.com/asta-fantacalcio/fantacalcio-asta-tutti-rigoristi-seriea-venti-squadre-campionato/';
const PIAZZATI_URL  = 'https://www.sosfanta.com/asta-fantacalcio/serie-a-2026-2027-tiratori-punizioni-corner-specialisti-fantacalcio-asta/';
```

SosFanta aggiorna gli articoli **in place** (la guida alle fasce risultava pubblicata il 22
agosto e modificata il 24), quindi con ogni probabilità questi due URL serviranno già la
versione finale e non c'è niente da cambiare. Se invece arriva un articolo nuovo, sostituisci le
costanti. Se il link finale è **uno solo** che contiene sia rigoristi sia piazzati, cambia solo
la lista `SOURCES` sotto: i due parser restano identici.

**2. Rigenera, ma dopo il listone.**

```bash
# prima: data/lista_calciatori_classic.xlsx aggiornato (§2)
node scripts/build-specialists.mjs
```

L'ordine non è un dettaglio. Questo script, unico dei tre, **legge il listone**: i rigoristi
sulla fonte sono raccontati a parole, e senza la rosa del club la prosa non è interpretabile
(§5.3). Lanciarlo sul listone vecchio produce le gerarchie delle rose di agosto.

**3. Leggi le sessanta righe che stampa.** Sono venti squadre per tre piazzati, con i nomi in
gerarchia:

```
== rigori ==
Inter        Calhanoglu, Zielinski
Juventus     Kolo Muani, Locatelli, Yildiz, David
```

Il parser della prosa non si verifica con un totale, si verifica leggendolo. Cinque minuti.

### 5.2 Com'è fatta la fonte

Due pagine, entrambe con il contenuto dentro `<div class="… article-body">`, tutto in `<p>`.
`curl` con user-agent Mozilla basta: niente login, niente rendering JS.

**Punizioni e corner** — elenchi già in gerarchia:

```html
<p>✅ ATALANTA</p>
<p>Punizioni: Samardzic, Gaetano, De Ketelaere, Raspadori, Ederson</p>
<p>Corner: Samardzic, Gaetano, Bernasconi, Bellanova, Ederson</p>
```

**Rigoristi** — prosa, nessun elenco:

```html
<p>🎯 ATALANTA</p>
<p>Primo: Gianluca Scamacca è il primissimo candidato dal dischetto… 3 su 3 nella passata stagione…</p>
<p>Note: alle sue spalle Samardzic (2 su 2) e Ederson (1 su 1)…</p>
```

L'intestazione di squadra **non** viene riconosciuta dall'emoji, ma dal fatto che il paragrafo,
tolti simboli e punteggiatura, *è* il nome di un club del listone. Un cambio di emoji — la cosa
più probabile che cambi di anno in anno — non rompe niente.

### 5.3 Come vengono estratti i rigoristi dalla prosa

Lo script ribalta il problema: invece di cercare nomi nel testo, prende la **rosa di quel club
dal listone** e guarda quali dei suoi giocatori sono citati, come parola intera, senza accenti e
senza l'iniziale di disambiguazione (`Esposito Se.` → `esposito`). Chi compare nel paragrafo
`Primo:` viene prima di chi compare solo nelle `Note:`; dentro ogni gruppo vale l'ordine in cui
il testo li nomina.

Cercare *dentro la rosa* invece che nel listone intero è ciò che tiene bassi i falsi positivi:
un cognome comune trova sé stesso solo fra venticinque compagni di squadra.

**Omonimi nella stessa rosa: nessuno dei due.** La fonte cita "Martinez" fra i rigoristi
dell'Inter e in rosa ci sono Lautaro e il portiere Josep — dare il badge a sorte è peggio che
non darlo. È la stessa regola delle fasce, e c'è un test apposta.

### 5.4 Cosa fa lo script quando la fonte cambia

Muore, nominando il problema, invece di scrivere un dataset monco:

| Sintomo | Messaggio |
| --- | --- |
| Meno di 20 squadre riconosciute | `N squadre riconosciute invece di 20` |
| Intestazione che non è un club del listone | stesso errore: le intestazioni devono combaciare |
| Manca la riga `Punizioni:` o `Corner:` | `<Squadra> non ha la riga "Punizioni:"` |
| Nessun giocatore della rosa citato nella prosa | `o il listone è vecchio, o la convenzione dei nomi è cambiata` |
| `article-body` sparito | `blocco "article-body" non trovato` |

### 5.5 Cosa c'è già nel codice

```
scripts/build-specialists.mjs   → src/data/specialists.ts   (60 blocchi, 233 nomi a fine mercato)
scripts/build-tiers.mjs         → src/data/injuries.ts      (commenti sugli infortunati)
src/domain/specialists.ts       → tipi, rosterKey, makeSpecialistIndex, specialistLabel
src/domain/specialists.test.ts  → 16 test
src/features/player/PlayerCard.tsx → chip "rigorista" e sezione "Piazzati"
```

L'aggancio a runtime è per nome **dentro la rosa del club**, con tre chiavi in cascata: nome
intero → ultima parola → prima parola. L'ultima parola recupera l'ordine invertito, che è
l'unico scarto sistematico fra fonte e listone (`Nico Paz` contro `Paz N.`, `Kike Perez` contro
`Perez K.`). Ad agosto aggancia oltre il 90% dei nomi, con tutte e venti le squadre che hanno un
primo rigorista riconosciuto — sono due test, non una stima.

Nella scheda: il **primo rigorista** ha un chip acceso in cima, accanto allo stato di
formazione, perché è il fatto più pesante dopo "titolare". Sotto, la sezione *Piazzati* elenca
gli incarichi fino al terzo posto, primo acceso e gli altri spenti. Oltre il terzo la gerarchia
è teorica e la scheda tace: il dato resta comunque nel dataset.

Accanto, la sezione delle statistiche 2025/26 dà il riscontro gratis: `rigorista 1º` sopra un
`rigori segn./tir. 4/5` è un ruolo vero, sopra uno `0/0` è una promozione sulla fiducia.

### 5.6 I due test che potrebbero cadere a settembre

In `src/domain/specialists.test.ts`, e sono entrambi **sensori, non formalità**:

- *«aggancia la grande maggioranza dei nomi al listone reale»* — soglia al 90%. Se scende, la
  fonte ha cambiato convenzione dei nomi: guarda **quali** nomi restano fuori prima di toccare
  la soglia.
- *«dà a ogni squadra almeno un rigorista agganciato»* — pretende tutte e 20. Se una squadra
  sparisce, quasi sempre è una rosa cambiata dopo la pubblicazione della fonte, e la risposta è
  rigenerare **dopo** l'ultimo aggiornamento della pagina, non rilassare il test.

---

## §6 — Verifiche finali prima dell'asta

```bash
npm test                       # tutti verdi, numeri di §2 aggiornati
npx tsc -b --noEmit
npm run build
npm run dev                    # e poi a mano, nell'app:
```

Nell'app, in quest'ordine:

1. **Impostazioni** → il listone mostra il file nuovo, la data di oggi, il conteggio giusto.
2. **Scheda giocatore** su tre casi scelti apposta:
   - un big rimasto → fascia, statistiche 2025/26, specialisti, tutto pieno;
   - un arrivo dall'estero → fascia sì, statistiche *"non ha giocato"*, nessuna bugia;
   - un portiere titolare → porte inviolate e rigori parati al posto di gol e assist.
3. **Command bar**: digita tre nomi, controlla che la fantamedia in verde ci sia dove deve e sia
   un trattino dove non c'è storico.
4. **Rigoristi a campione**: apri la scheda dei primi rigoristi di due o tre squadre e
   confrontali con la pagina sorgente aperta di fianco. È l'unico controllo che smaschera un
   parser della prosa che ha agganciato l'uomo sbagliato senza fallire.
5. **Checklist pre-asta** (§5.5 del PRD, `ReadinessCheck`): dopo un re-import le formazioni
   perdono i giocatori usciti, quindi qualche club torna *incompleto*. È il momento di rifarle,
   ed è esattamente quello che la checklist ti dirà.
6. **Backup**: scaricane uno nuovo. Il primo backup dopo il re-import è quello che vale.

Commit finale, un messaggio per cosa:

```bash
git add -A
git commit -m "Listone definitivo, fasce e specialisti di fine mercato"
```

---

## §7 — Rollback

Se qualcosa va storto **prima** del commit:

```bash
git checkout -- src/data/tiers.ts src/data/specialists.ts
git checkout -- data/lista_calciatori_classic.xlsx
```

Se il problema è nei **dati dell'app** e non nel repo: Impostazioni → *Importa backup…* e ricarica
il `.json` di §0. I dati utente sono l'unica cosa irrecuperabile del progetto; tutto il resto —
listone, fasce, statistiche, specialisti — si riscarica.

Se il re-import ha già archiviato note che non volevi archiviare: l'archiviazione **non cancella**,
il testo è ancora lì. Ma il ripristino da backup è comunque la strada più corta.

---

## Appendice A — Stato del progetto al 2026-08-25

Cosa esiste già, per non riscriverlo per sbaglio:

| Dataset | File generato | Script | Aggancio |
| --- | --- | --- | --- |
| Fasce guida SosFanta | `src/data/tiers.ts` | `scripts/build-tiers.mjs` | per **nome** normalizzato |
| Indisponibili, quanto stanno fuori | `src/data/injuries.ts` | `scripts/build-injuries.mjs` | per **nome, dentro la rosa** |
| Statistiche 2025/26 | `src/data/stats.ts` | `scripts/build-stats.mjs` | per **id** Fantacalcio.it |
| Specialisti piazzati | `src/data/specialists.ts` | `scripts/build-specialists.mjs` | per **nome, dentro la rosa** |

Impianto da ricalcare per qualsiasi dataset nuovo:

```
scripts/build-*.mjs   →  src/data/*.ts        (generato, mai a mano)
src/domain/*.ts       →  tipi + indice + aggancio, puro, testato
src/features/…        →  la UI, che non conosce la fonte
```

Numeri di riferimento del listone di agosto, utili come metro di paragone:
**537 righe**, **516 id in lista**, **479 su 482** nomi delle fasce agganciati,
**399 su 537** giocatori con statistiche 2025/26, **663** giocatori nel dataset statistiche,
**237 nomi** in 60 blocchi di specialisti, oltre il 90% agganciati.

## Appendice C — Passata del 1º settembre 2026 (mercato chiuso, fonti non ancora definitive)

Piano eseguito per intero sul listone definitivo di Fantacalcio.it e sulle pagine SosFanta
raggiunte dal *kit asta* (`kit-asta-fantacalcio-guida-formazioni-tipo-rigoristi-tiratori-portieri-budget`):
i tre URL delle fonti **non sono cambiati**, quindi non c'è stato niente da modificare negli script.

Numeri nuovi, da usare come metro al prossimo giro:
**587 righe**, **538 id in lista** (P 64, D 189, C 194, A 91), **49 fuori lista**,
**490 su 492** nomi delle fasce agganciati, **371 su 538** giocatori con statistiche 2025/26,
**233 nomi** in 60 blocchi di specialisti, tutte e 20 le squadre con un primo rigorista.

Da rifare quando SosFanta avrà finito di aggiornare: `build-tiers.mjs` e `build-specialists.mjs`.
La guida ai portieri, in particolare, elenca 22 nomi contro i 27 di agosto, e le prose dei
rigoristi citano ancora giocatori usciti — per la Fiorentina il paragrafo `Primo:` parla di
Gudmundsson e Mandragora, che nel listone definitivo non sono più in rosa, e infatti l'unico
rigorista viola agganciato è Mastantuono. Lo script li scarta correttamente, ma è il segnale che
la fonte è indietro rispetto al mercato. Il listone, invece, è quello definitivo:
non va riscaricato.

## Appendice D — Passata del 4 settembre 2026 (fonti aggiornate)

Il giro annunciato in Appendice C, più una fonte nuova. **Gli URL degli script non sono
cambiati**: il *kit asta* linka gli stessi tre.

**Il listone era di nuovo diverso.** Fantacalcio.it ne aveva pubblicato una revisione il
4 settembre, quindi §1 e §2 si sono rifatti per intero. Numeri nuovi, questi sì da usare come
metro al prossimo giro: **592 righe**, **533 id in lista** (P 65, D 189, C 192, A 87),
**59 fuori lista**, **490 su 492** nomi delle fasce agganciati, **365 su 533** giocatori con
statistiche 2025/26, **240 nomi** in 60 blocchi di specialisti, **41 infortunati** tutti
agganciati, **663 test** verdi.

Nel repo, alla riapertura, `data/lista_calciatori_classic.xlsx` non era più tracciato: un commit
precedente aveva versionato al suo posto `data/lista calciatori_classic.xlsx`, con uno spazio, e
i test morivano con `ENOENT` prima di arrivare a un'asserzione. Se ricapita, il sintomo è
inconfondibile: **tutti** i file di test rossi, nessuna asserzione fallita.

Le fonti erano finalmente allineate al mercato: le prose dei rigoristi non parlano più di
Gudmundsson, e la Fiorentina ha una gerarchia intera. La guida ai portieri resta corta, 23 nomi.

**Fonte nuova: la tabella indisponibili** (§3-bis). Ha sostituito i commenti della guida come
sorgente degli infortuni — decisione dell'utente, presa sapendo che si perdeva la prosa lunga
sui big. In cambio il chip vale per tutti e 41 gli infortunati invece che per gli 8 commentati,
e porta la giornata di rientro.

**Aggiunto in Squadre il pannello *Piazzati***
(`src/features/teams/SetPiecePanel.tsx`): le tre gerarchie del club sotto la formazione, fino al
terzo nome, con i nomi agganciati che aprono la scheda. Stessa fonte dei badge nella scheda
giocatore, domanda opposta — non "questo che posto ha" ma "di questi undici, chi calcia".

---

## Appendice E — Passata del 5 settembre 2026 (campionato iniziato)

Prima passata a **stagione in corso**: la 3ª giornata si stava giocando mentre girava.
Gli URL degli script non sono cambiati, di nuovo. Le quattro fonti risultavano tutte più
fresche del giro precedente — fasce e rigoristi modificati lo stesso 5 settembre alle 13:57
e 13:58, piazzati e indisponibili il 3 settembre.

**Il listone era ancora diverso**: Fantacalcio.it lo rifà a ogni giornata, e adesso le colonne
delle presenze si muovono. Numeri nuovi, da usare come metro al prossimo giro: **593 righe**,
**531 id in lista** (P 64, D 189, C 192, A 86), **62 fuori lista**, **489 su 492** nomi delle
fasce agganciati, **362 su 531** giocatori con statistiche 2025/26, **241 nomi** in 60 blocchi
di specialisti, **41 infortunati**, **708 test** verdi.

**Due dataset non si sono mossi di una riga.** `injuries.ts` e `stats.ts` hanno cambiato solo la
data di scarico: la tabella indisponibili non era stata toccata dal 3 settembre, e le statistiche
2025/26 sono una stagione chiusa (§4 lo diceva, e ora è verificato invece che assunto).

**Una cosa nuova, che da qui in avanti ricapita ogni sabato.** `build-calendar.mjs` è morto su
*«Giornata 3: stato partita "1" sconosciuto»*: `data-match-status` vale `0` da giocare, `4`
giocata, e `1` **in corso** — comparso su Roma-Atalanta mentre si giocava. Era il comportamento
voluto di un parser difensivo, ma a campionato iniziato non è più un caso limite: lo script ora
conosce il terzo codice e lo conta come *non ancora giocata*, perché il risultato non è
definitivo e la griglia di alternanza guarda le giornate chiuse.

Da sapere per il prossimo giro: **le date delle giornate future si spostano**. Il diff di
`calendar.ts` è stato di 52 righe, quasi tutte rinvii di orario e giornata sui turni da
settembre in poi, non solo i `played` della 3ª.

**Le statistiche avanzate (Sofascore) restano ferme** e non si rigenerano da riga di comando:
l'API risponde 403 a `curl` e il dump si riprende dal browser (vedi il README). Sono comunque
cifre 2025/26, cioè una stagione chiusa: non c'è niente da riscaricare finché non si vuole
passare alla stagione in corso.

---

## Appendice F — Passata dell'8 settembre 2026 (ultima prima dell'asta)

Asta fissata per il **10 settembre 2026**: questa è l'ultima rigenerazione prevista. Gli URL
degli script non sono cambiati nemmeno stavolta — i cinque link mandati dall'utente sono gli
stessi quattro di sempre più il *kit asta*, con `?refresh_ce` in coda a spurgare la cache di
SosFanta.

**Il listone era di nuovo diverso**, come ogni giornata: **594 righe**, **532 id in lista**
(P 64, **D 190**, C 192, A 86), **62 fuori lista**. Un difensore in più rispetto al 5 settembre,
e le quotazioni si muovono a campionato in corso: Lautaro è passato da QUOT. 33 a 35 e da FVM
289 a 312, il che fa cadere anche i due test che lo usano come campione
(`listone.test.ts` e `report.test.ts`) oltre ai soliti conteggi. Numeri di aggancio:
**490 su 491** nomi delle fasce, **362 su 532** con statistiche 2025/26, **240 su 241** nomi di
specialisti in 60 blocchi con tutte e 20 le squadre a posto, **58 indisponibili** tutti
agganciati, **712 test** verdi.

**Due fonti su quattro non si erano mosse.** `specialists.ts` ha cambiato solo la data di
scarico — la pagina di rigoristi e piazzati è identica al 5 settembre — e le statistiche
2025/26 restano ferme per costruzione (§4). Si sono mosse le fasce (86 righe: Dodò in
`FASCIA ALTA` fra i difensori, Skorupski scalato da alta a media fra i portieri, e 491 nomi
invece di 492) e soprattutto gli indisponibili.

**Gli infortunati sono passati da 41 a 57**, ed è comparso il primo **squalificato** della
stagione (Gaetano, Atalanta): a campionato fermo quelle due sezioni erano vuote tutte e venti,
adesso no. È il dato che invecchia più in fretta di tutti, e a due giorni dall'asta è anche
quello che vale di più.

**Una riga di script cambiata, per un refuso della fonte.** Su Piotrowski (Udinese) SosFanta ha
scritto *"in dubbio per la. 6a"*, con un punto di troppo, e `readMatchday()` non riconosceva
più la giornata: l'infortunio finiva nel dataset con `matchday: null`, cioè col chip muto e
nessun test rosso — esattamente il guasto silenzioso che il *sensore* di §3-bis è tarato per
non prendere quando è uno solo. La regex adesso tollera il punto
(`/per la\.? (\d{1,2})[ªa]/i`) e i 57 infortunati hanno tutti la giornata; l'unica voce
senza è lo squalificato, che giustamente non ne ha una.

**Il calendario ha chiuso la 3ª giornata**: le sette partite lasciate `played: false` la volta
scorsa sono ora giocate (30 su 380), e una sola data si è spostata, Udinese-Roma dal 1º
novembre al 31 ottobre. Nessun `data-match-status` sconosciuto: il codice `1` imparato il
5 settembre è bastato.

---

## Appendice G — Passata del 10 settembre 2026 (il giorno dell'asta)

L'8 settembre doveva essere l'ultima; questa lo è davvero, fatta il giorno stesso dell'asta.
I link mandati sono di nuovo i cinque soliti — i quattro delle fonti più il *kit asta*, con
`?refresh_ce` — e nessun URL degli script è cambiato. Il listone era già aggiornato in
`data/` dall'utente, quindi si è partiti direttamente dagli script.

**Il listone si è mosso ancora**: **595 righe**, **532 id in lista** (**P 63**, D 190,
**C 193**, A 86), **63 fuori lista**. Rispetto all'8 settembre un portiere in meno e un
centrocampista in più, con il totale in lista fermo a 532. Le quotazioni invece stavolta non si
sono mosse: i due test che usano Lautaro come campione (`listone.test.ts`, `report.test.ts`)
sono rimasti verdi, e sono caduti solo i sei conteggi di §2.1 — le tre asserzioni in
`listone.test.ts` (62, 63, 70), le due in `native.test.ts` (72, 89) e le due in
`free-agents.test.ts` (`countByRole` e il `63` che dopo un'assegnazione diventa **62**).

**Tre fonti su quattro erano identiche all'8 settembre.** `tiers.ts`, `specialists.ts` e
`calendar.ts` hanno cambiato **solo la data di scarico**: le fasce restano 65 blocchi e 491
nomi (490 agganciati), gli specialisti 60 blocchi e 241 nomi (240 agganciati, tutte e venti le
squadre con il primo rigorista), il calendario 380 partite di cui 30 giocate — la 4ª giornata
non si è ancora giocata, di mezzo c'è la sosta. Le statistiche 2025/26 restano ferme per
costruzione (§4): 362 su 532.

**Gli indisponibili sono l'unica cosa che è cambiata davvero**, come sempre: da 58 voci a
**60** (59 infortunati + Gaetano, ancora l'unico squalificato). Fuori Gabbia e Cutrone, dentro
Cambiaso, Meret e Santos A., più qualche prognosi riscritta.

**Di nuovo un refuso della fonte, di nuovo muto.** Su Felici (Cagliari) SosFanta ha scritto
*"in dubbio per 29a"* **senza l'articolo**, e `readMatchday()` — che l'8 settembre era stato
insegnato a tollerare il punto di troppo — pretendeva ancora `per la`. Risultato: una rottura
del crociato, cioè la voce che pesa di più di tutte, finita nel dataset con `matchday: null` e
nessun test rosso. La regex adesso ha l'articolo opzionale quanto il punto
(`/\bper (?:la\.? )?(\d{1,2})[ªa]\b/i`) e l'unica voce senza giornata è lo squalificato, che
giustamente non ne ha una. Due passate di fila con lo stesso guasto: la forma della frase in
quella tabella **non è stabile**, e il controllo da fare a ogni giro è `grep "matchday: null"`
su `src/data/injuries.ts`.

Chiusura: **712 test verdi**, `tsc -b --noEmit` pulito, `npm run build` completato.

---

## Appendice B — Decisioni da prendere, non da indovinare

Quattro cose che vanno chieste invece che decise di testa propria quando si riapre il lavoro:

1. **I link sono due o tre?** Se rigoristi e piazzati arrivano come pagina unica, cambia solo
   `SOURCES` (§5.4).
2. ~~Filtro `solo specialisti` negli svincolati?~~ **Deciso il 2026-08-27: no, nessun filtro.**
   Vale la stessa logica per cui le statistiche 2025/26 erano già state tenute fuori da quella
   tabella: la riga in più costa più di quanto renda. Non c'è niente da implementare.
3. ~~Quanti nomi mostrare per squadra?~~ **Deciso**: la scheda si ferma al terzo, il dataset
   li tiene tutti. Da rivedere solo se all'uso i primi tre risultassero ancora troppi.
4. **Il rigorista entra nella checklist pre-asta?** Una voce tipo *"conosci il rigorista delle 20
   squadre"* è verificabile, ed è il genere di omissione che l'asta punisce. Ma la checklist è
   corta apposta.
