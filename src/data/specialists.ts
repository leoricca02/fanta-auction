/**
 * Specialisti dei piazzati da SosFanta. GENERATO, non modificare a mano:
 * rigenera con `node scripts/build-specialists.mjs`.
 *
 * Punizioni e corner sono i nomi come li scrive la fonte. I rigoristi sono i
 * nomi **del listone**, perche' la fonte li racconta a parole e lo script li
 * riconosce leggendo la rosa: vedi lo script per il come e il perche'.
 *
 * Fonti:
 * - https://www.sosfanta.com/asta-fantacalcio/fantacalcio-asta-tutti-rigoristi-seriea-venti-squadre-campionato/
 * - https://www.sosfanta.com/asta-fantacalcio/serie-a-2026-2027-tiratori-punizioni-corner-specialisti-fantacalcio-asta/
 */
import type { SpecialistBlock } from '../domain/specialists';

export const SPECIALISTS_SOURCE_URLS = [
  'https://www.sosfanta.com/asta-fantacalcio/fantacalcio-asta-tutti-rigoristi-seriea-venti-squadre-campionato/',
  'https://www.sosfanta.com/asta-fantacalcio/serie-a-2026-2027-tiratori-punizioni-corner-specialisti-fantacalcio-asta/',
] as const;

/** Data di scarico delle pagine, mostrata all'utente. */
export const SPECIALISTS_UPDATED_AT = '2026-09-08';

export const SPECIALIST_BLOCKS: readonly SpecialistBlock[] = [
  { team: 'Atalanta', kind: 'rigori', names: ['Kessiè', 'Scamacca', 'Samardzic', 'Ederson D.S.', 'De Ketelaere', 'Krstovic'] },
  { team: 'Bologna', kind: 'rigori', names: ['Orsolini', 'Dovbyk', 'Bernardeschi', 'Ferguson'] },
  { team: 'Cagliari', kind: 'rigori', names: ['Nzola', 'Fazzini', 'Deiola', 'Mina'] },
  { team: 'Como', kind: 'rigori', names: ['Da Cunha', 'Kean', 'Paz N.', 'Douvikas', 'Baturina'] },
  { team: 'Fiorentina', kind: 'rigori', names: ['Mastantuono', 'Pellegrino M.', 'Goncalves P.', 'Beto'] },
  { team: 'Frosinone', kind: 'rigori', names: ['Schmid', 'Calò', 'Bobcek'] },
  { team: 'Genoa', kind: 'rigori', names: ['Colombo', 'Messias', 'Vitinha O.', 'Baldanzi', 'Ostigard'] },
  { team: 'Inter', kind: 'rigori', names: ['Calhanoglu', 'Zielinski'] },
  { team: 'Juventus', kind: 'rigori', names: ['Kolo Muani', 'Locatelli', 'Woltemade', 'Yildiz'] },
  { team: 'Lazio', kind: 'rigori', names: ['Zaccagni', 'Taylor K.', 'Pinamonti', 'Cataldi'] },
  { team: 'Lecce', kind: 'rigori', names: ['Geubbels', 'Stulic', 'Pierotti', 'Berisha M.'] },
  { team: 'Milan', kind: 'rigori', names: ['Ramos G.', 'Pulisic', 'Modric'] },
  { team: 'Monza', kind: 'rigori', names: ['Pessina', 'Cutrone', 'Varela G.'] },
  { team: 'Napoli', kind: 'rigori', names: ['De Bruyne', 'Hojlund', 'Lukaku', 'Politano'] },
  { team: 'Parma', kind: 'rigori', names: ['Tourè E.', 'Elphege'] },
  { team: 'Roma', kind: 'rigori', names: ['Dybala', 'Malen', 'Pellegrini Lo.', 'Soulè', 'Castro S.'] },
  { team: 'Sassuolo', kind: 'rigori', names: ['Berardi', 'Esposito Se.', 'Laurientè', 'Bowie'] },
  { team: 'Torino', kind: 'rigori', names: ['Vlasic', 'Kulenovic', 'Zapata D.', 'Rodriguez R.'] },
  { team: 'Udinese', kind: 'rigori', names: ['Davis K.', 'Solet', 'Ekkelenkamp', 'Zaniolo'] },
  { team: 'Venezia', kind: 'rigori', names: ['Busio', 'Rrahmani Al.', 'Adams A.', 'Adorante'] },
  { team: 'Atalanta', kind: 'punizioni', names: ['Samardzic', 'Gaetano', 'De Ketelaere', 'Raspadori', 'Ederson'] },
  { team: 'Bologna', kind: 'punizioni', names: ['Orsolini', 'Bernardeschi', 'Ferguson'] },
  { team: 'Cagliari', kind: 'punizioni', names: ['Maldini', 'Fazzini', 'Winks', 'Obert'] },
  { team: 'Como', kind: 'punizioni', names: ['Nico Paz', 'Milla', 'Baturina', 'Da Cunha', 'Perrone'] },
  { team: 'Fiorentina', kind: 'punizioni', names: ['Mastantuono', 'Fagioli', 'Goncalves'] },
  { team: 'Frosinone', kind: 'punizioni', names: ['Calò', 'Ghedjemis', 'Kvernadze'] },
  { team: 'Genoa', kind: 'punizioni', names: ['Baldanzi', 'Messias', 'Mitaj', 'Frendrup'] },
  { team: 'Inter', kind: 'punizioni', names: ['Calhanoglu', 'Dimarco', 'Zielinski', 'Sucic'] },
  { team: 'Juventus', kind: 'punizioni', names: ['Yildiz', 'Cambiaso', 'Locatelli', 'Koopmeiners'] },
  { team: 'Lazio', kind: 'punizioni', names: ['Zaccagni', 'Gudmundsson', 'Cataldi', 'Taylor', 'Rovella'] },
  { team: 'Lecce', kind: 'punizioni', names: ['Ilic', 'Gallo', 'Berisha', 'Pierotti'] },
  { team: 'Milan', kind: 'punizioni', names: ['Modric', 'Pulisic', 'Jashari'] },
  { team: 'Monza', kind: 'punizioni', names: ['Colpani', 'Pessina', 'Ciurria'] },
  { team: 'Napoli', kind: 'punizioni', names: ['De Bruyne', 'Politano', 'Neres', 'Lobotka'] },
  { team: 'Parma', kind: 'punizioni', names: ['Bernabé', 'Nicolussi Caviglia', 'Valeri', 'Ordonez'] },
  { team: 'Roma', kind: 'punizioni', names: ['Dybala', 'Soulé', 'Pellegrini'] },
  { team: 'Sassuolo', kind: 'punizioni', names: ['Berardi', 'Laurienté', 'Seba Esposito', 'Volpato'] },
  { team: 'Torino', kind: 'punizioni', names: ['Vlasic', 'Mandragora', 'Rodriguez', 'Coco'] },
  { team: 'Udinese', kind: 'punizioni', names: ['Zaniolo', 'Ekkelenkamp', 'Vojvoda', 'Miller'] },
  { team: 'Venezia', kind: 'punizioni', names: ['Busio', 'Basic', 'Kike Perez', 'Helgason', 'Yeboah'] },
  { team: 'Atalanta', kind: 'corner', names: ['Samardzic', 'Gaetano', 'Bernasconi', 'Bellanova', 'Ederson'] },
  { team: 'Bologna', kind: 'corner', names: ['Orsolini', 'Bernardeschi', 'Miranda', 'Ferguson'] },
  { team: 'Cagliari', kind: 'corner', names: ['Fazzini', 'Obert', 'Romano', 'Maldini', 'Winks'] },
  { team: 'Como', kind: 'corner', names: ['Milla', 'Baturina', 'Nico Paz', 'Da Cunha', 'Perrone', 'Addai'] },
  { team: 'Fiorentina', kind: 'corner', names: ['Mastantuono', 'Fagioli', 'Goncalves', 'Jimenez'] },
  { team: 'Frosinone', kind: 'corner', names: ['Calò', 'Ghedjemis', 'Kvernadze'] },
  { team: 'Genoa', kind: 'corner', names: ['Mitaj', 'Baldanzi', 'Messias', 'Frendrup', 'Ellertsson'] },
  { team: 'Inter', kind: 'corner', names: ['Calhanoglu', 'Dimarco', 'Zielinski', 'Barella', 'Sucic'] },
  { team: 'Juventus', kind: 'corner', names: ['Yildiz', 'Cambiaso', 'Locatelli', 'Koopmeiners'] },
  { team: 'Lazio', kind: 'corner', names: ['Zaccagni', 'Taylor', 'Rovella', 'Cataldi'] },
  { team: 'Lecce', kind: 'corner', names: ['Ilic', 'Gallo', 'Berisha', 'Pierotti'] },
  { team: 'Milan', kind: 'corner', names: ['Modric', 'Pulisic', 'Bartesaghi', 'Jashari'] },
  { team: 'Monza', kind: 'corner', names: ['Pessina', 'Colpani', 'Ciurria', 'Birindelli'] },
  { team: 'Napoli', kind: 'corner', names: ['De Bruyne', 'Politano', 'Neres', 'Lobotka'] },
  { team: 'Parma', kind: 'corner', names: ['Bernabé', 'Nicolussi Caviglia', 'Valeri', 'Ordonez'] },
  { team: 'Roma', kind: 'corner', names: ['Dybala', 'Soulé', 'Pellegrini', 'Wesley'] },
  { team: 'Sassuolo', kind: 'corner', names: ['Berardi', 'Laurienté', 'Volpato', 'Doig/Obrador'] },
  { team: 'Torino', kind: 'corner', names: ['Vlasic', 'Rodriguez', 'Mandragora'] },
  { team: 'Udinese', kind: 'corner', names: ['Zaniolo', 'Vojvoda', 'Ekkelenkamp', 'Miller'] },
  { team: 'Venezia', kind: 'corner', names: ['Busio', 'Kike Perez', 'Basic', 'Helgason', 'Yeboah'] },
];
