---
name: frontend-design
description: Linee guida avanzate per creare interfacce web moderne, ad alta densità informativa e visivamente distintive, eliminando i pattern generici da template AI.
---

# Frontend Design & UI/UX Skill

Quando progetti, crei o esegui il refactoring di componenti e pagine web, applica tassativamente questi principi di design system:

## 1. Rifiuto dei Pattern Generici ("AI Slop")
- **No ai gradienti banali**: Evita gradienti viola/indaco su sfondi neri o pillole con bagliori diffusi senza scopo funzionale.
- **No alle griglie simmetriche noiose**: Evita la classica griglia 3x1 di card identiche. Se ci sono metriche o dati, assegna priorità visiva con layout a bento box asimmetrico.
- **No a ombre pesanti**: Sostituisci `shadow-2xl` invasive con bordi sottili semi-trasparenti (`border-border/50` o `ring-1 ring-white/10`) e sfondi stratificati.

## 2. Tipografia e Dati Numerici
- **Gerarchia marcata**: Usa `tracking-tight` sui titoli principali in combinazione con pesi bold o semibold.
- **Micro-copy ed etichette**: Usa `text-xs font-medium uppercase tracking-wider text-muted-foreground` per label di dati e intestazioni di sezione.
- **Dati numerici**: Per valori contabili, crediti, punteggi o statistiche, usa sempre `font-mono tabular-nums` per evitare il tremolio del testo durante gli aggiornamenti.

## 3. Densità e Informazione
- Per dashboard e tool operativi (aste, tabelle, gestionale), privilegia una densità medio-alta: padding compatti (`px-3 py-2`), icone a dimensione fissa (`size-4` o `size-3.5`) e badge informativi essenziali.
- Evita spazi vuoti ingiustificati: ogni elemento visivo deve veicolare informazioni o guidare l'azione.

## 4. Tattilità e Micro-interazioni
- **Hover & Active**: Aggiungi feedback tattile a pulsanti e card interattive (`transition-all duration-150 active:scale-[0.98] hover:bg-accent/50`).
- **Accessibilità**: Assicura sempre indicatori di focus visibili (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`).
- **Loading states**: Non usare spinner isolati a centro pagina; preferisci skeleton loader con le esatte dimensioni del layout previsto.

## 5. Vincoli di Integrazione
- Usa i token semantici del progetto (`bg-background`, `text-foreground`, `bg-card`, `border-border`) anziché colori esadecimali statici.
- Utilizza le icone della suite `lucide-react`.
