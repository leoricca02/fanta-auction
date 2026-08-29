import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { requestPersistentStorage } from './store/persist';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Elemento #root non trovato in index.html.');

// Prima del render e senza attenderla: se il browser concede la persistenza
// e' meglio averla chiesta subito, se la nega non cambia nulla di visibile.
void requestPersistentStorage();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
