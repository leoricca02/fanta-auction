/**
 * Guscio dell'applicazione.
 *
 * M1 e' solo dati e logica: parser, reducer e metriche vivono in /src/parse e
 * /src/domain e sono coperti dai test. La UI arriva da M2 in poi.
 */
export function App(): JSX.Element {
  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Fanta Auction Assistant</h1>
      <p className="mt-2 text-sm text-neutral-600">
        M1 completata: parser del listone e domain layer. Nessuna interfaccia prima di M2.
      </p>
    </main>
  );
}
