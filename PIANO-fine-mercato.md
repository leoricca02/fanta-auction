# Piano di fine mercato — listone definitivo, fasce, specialisti

> Appuntamento: **chiusura del calciomercato, 1º settembre 2026**.
> Documento scritto il 2026-08-25, con le pagine sorgente verificate quel giorno.
> Serve a riaprire il lavoro da zero senza il contesto della sessione in cui è stato preparato.

Quando arrivano le tre cose — **listone definitivo `.xlsx`**, **link della guida alle fasce**,
**link di rigoristi e tiratori** — c'è da fare, nell'ordine: un backup, un import, **tre**
rigenerazioni di dataset e un giro di test da riallineare. Nessuna funzione da scrivere: gli
specialisti sono stati costruiti il 2026-08-25 e a settembre si limitano a rigenerarsi (§5).

Le statistiche della scorsa stagione **non si toccano**: il perché è al §4.

---

## Indice

- [§0 — Prima di toccare qualsiasi cosa](#0--prima-di-toccare-qualsiasi-cosa)
- [§1 — Import del listone definitivo](#1--import-del-listone-definitivo)
- [§2 — Il listone di test e i numeri che si romperanno](#2--il-listone-di-test-e-i-numeri-che-si-romperanno)
- [§3 — Rigenerare le fasce](#3--rigenerare-le-fasce)
- [§4 — Statistiche 2025/26: niente da fare, ed è giusto così](#4--statistiche-202526-niente-da-fare-ed-è-giusto-così)
- [§5 — Specialisti: rigoristi, punizioni, corner](#5--specialisti-rigoristi-punizioni-corner)
- [§6 — Verifiche finali prima dell'asta](#6--verifiche-finali-prima-dellasta)
- [§7 — Rollback](#7--rollback)
- [Appendice A — Stato del progetto al 2026-08-25](#appendice-a--stato-del-progetto-al-2026-08-25)
- [Appendice B — Decisioni da prendere, non da indovinare](#appendice-b--decisioni-da-prendere-non-da-indovinare)

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

Cadranno quasi certamente questi, tutti legati alle dimensioni del listone di agosto
(587 righe totali, 538 id in lista dopo il mercato 2026; 537 e 516 prima):

| File | Riga | Asserzione oggi |
| --- | --- | --- |
| `src/parse/listone.test.ts` | 62 | `totalRows` = **587** |
| `src/parse/listone.test.ts` | 75 | id unici = **538** |
| `src/export/native.test.ts` | 69, 72 | conserva **587** righe |
| `src/domain/free-agents.test.ts` | 225 | svincolati totali = **538** |
| `src/domain/free-agents.test.ts` | 280 | dopo un'assegnazione = **515** |
| `src/domain/listone-diff.test.ts` | 98 | `kept` = **538** |
| `src/domain/metrics.test.ts` | 251 | `freeAgents.total` = **538** |
| `src/store/appStore.test.ts` | 81 | `listone.count` = **538** |

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

`data/listone-prova-reimport.xlsx` è un listone modificato ad arte (giocatori tolti, squadre
cambiate) per provare il flusso di §1 senza aspettare settembre. **Nessun test lo usa**: è
materiale manuale. Dopo il mercato è vecchio; o lo rigeneri partendo dal listone nuovo, o lo
lasci lì com'è sapendo che serve solo a esercitare la UI.

---

## §3 — Rigenerare le fasce

### 3.1 Il comando

```bash
node scripts/build-tiers.mjs
```

Riscarica la guida SosFanta e riscrive `src/data/tiers.ts` (dataset generato, non si modifica a
mano). Aggiorna anche `TIERS_UPDATED_AT`, che l'app mostra per dire quanto è vecchia la guida.

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
