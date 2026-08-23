/**
 * Guscio dell'applicazione.
 *
 * M0 e' solo dati e logica: parser, reducer, formazioni e backup vivono in
 * /src/parse e /src/domain e sono coperti dai test. La UI arriva da M2 in poi,
 * con l'editor delle formazioni.
 */
export function App(): JSX.Element {
  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Fanta Auction Assistant</h1>
      <p className="mt-2 text-sm text-neutral-600">
        M0 completata: modello di prezzo rimosso, backup dei dati utente e stato di formazione.
        Nessuna interfaccia prima di M2.
      </p>
    </main>
  );
}
