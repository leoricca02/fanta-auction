/**
 * Fasce della guida all'asta di SosFanta. GENERATO, non modificare a mano:
 * rigenera con `node scripts/build-tiers.mjs`.
 *
 * Fonte: https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere
 */
import type { TierBlock } from '../domain/tiers';

export const TIERS_SOURCE_URL = 'https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere';

/** Data di scarico della guida, mostrata all'utente per capire quanto e' vecchia. */
export const TIERS_UPDATED_AT = '2026-08-24';

export const TIER_BLOCKS: readonly TierBlock[] = [
  {
    role: 'P',
    tier: 'SUPER TOP',
    names: ['Svilar'],
  },
  {
    role: 'P',
    tier: 'TOP',
    names: ['Maignan', 'Martinez Jo.', 'Carnesecchi', 'Butez', 'Vicario'],
  },
  {
    role: 'P',
    tier: 'SEMITOP',
    names: ['Meret'],
  },
  {
    role: 'P',
    tier: 'FASCIA ALTA',
    names: ['De Gea', 'Skorupski', 'Mandas', 'Okoye'],
  },
  {
    role: 'P',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Milinkovic-Savic V.', 'Provedel'],
  },
  {
    role: 'P',
    tier: 'FASCIA MEDIA',
    names: ['Caprile', 'Falcone'],
  },
  {
    role: 'P',
    tier: 'SOPRA AI LOW COST',
    names: ['Bijlow'],
  },
  {
    role: 'P',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Daffara', 'Perin', 'Motta'],
  },
  {
    role: 'P',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Muric', 'Corvi'],
  },
  {
    role: 'P',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Stankovic F.'],
  },
  {
    role: 'P',
    tier: 'LEGHE NUMEROSE',
    names: ['Thiam', 'Palmisani'],
  },
  {
    role: 'P',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Desplanches', 'Turati'],
  },
  {
    role: 'P',
    tier: 'MERCATO',
    names: ['Paleari'],
  },
  {
    role: 'D',
    tier: 'SUPER TOP',
    names: ['Dimarco'],
  },
  {
    role: 'D',
    tier: 'TOP',
    names: ['Wesley', 'Spence', 'Bremer', 'Bastoni', 'Pavlovic', 'Solet'],
  },
  {
    role: 'D',
    tier: 'SEMITOP',
    names: ['Akanji', 'Stones', 'Molina N.', 'Di Lorenzo', 'Gila', 'Rrahmani'],
  },
  {
    role: 'D',
    tier: 'SOTTO AI SEMITOP',
    names: ['Mancini', 'Kalulu', 'Cambiaso', 'Zappacosta', 'Spinazzola'],
  },
  {
    role: 'D',
    tier: 'FASCIA ALTA',
    names: ['N\'Dicka', 'Lucumì', 'Bisseck', 'Ramon'],
  },
  {
    role: 'D',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Carlos Augusto', 'Celik'],
  },
  {
    role: 'D',
    tier: 'POSSIBILI SORPRESE',
    names: ['Chalobah T.', 'Koulierakis', 'Vojvoda', 'Kaiki', 'Obrador', 'Mitaj'],
  },
  {
    role: 'D',
    tier: 'FASCIA MEDIA',
    names: ['Ostigard', 'Kristensen T.', 'Hermoso', 'Bartesaghi', 'Delprato', 'Miranda J.', 'Valle', 'Kempf', 'Bernasconi'],
  },
  {
    role: 'D',
    tier: 'INFORTUNATI',
    names: ['Buongiorno', 'Parisi'],
  },
  {
    role: 'D',
    tier: 'SCOMMESSE',
    names: ['Couto', 'Jimenez A.', 'Viery', 'Ahanor', 'Valdepenas'],
  },
  {
    role: 'D',
    tier: 'SOPRA AI LOW COST',
    names: ['Vasquez', 'Dragusin', 'Valeri', 'Gabbia', 'Scalvini', 'Hien', 'Mina', 'Norton-Cuffy', 'Tiago Gabriel', 'Pedraza'],
  },
  {
    role: 'D',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Bellanova', 'Joao Mario', 'Beukema', 'Holm', 'Rensch'],
  },
  {
    role: 'D',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Zortea', 'Kelly L.', 'Gatti', 'Doekhi', 'Idzes', 'Bella-Kotchap', 'Comuzzo', 'Gallo', 'Gaspar K.', 'Pedersen', 'Troilo'],
  },
  {
    role: 'D',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Coco', 'Ismajli', 'Heggem', 'Kamara H.', 'Mangas', 'Kolasinac', 'Oyono A.', 'Veiga D.', 'Vitik', 'Comert', 'Kabasele', 'Walukiewicz', 'Favasuli'],
  },
  {
    role: 'D',
    tier: 'LEGHE NUMEROSE',
    names: ['Obert', 'Marcandalli', 'Marusic', 'Monterisi', 'Bracaglia', 'Haps', 'Moreno M.', 'Zè Pedro', 'Correia T.', 'Halhal', 'Siebert', 'Smolcic I.', 'Carboni A.', 'Hainaut', 'Kossounou', 'Rodriguez Ju.', 'Pellegrini Lu.', 'Leysen F.', 'Terzic'],
  },
  {
    role: 'D',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Pavard', 'Fortini', 'Olivera', 'Bertola', 'Doig', 'Ghilardi', 'Valenti', 'Zanoli', 'De Winter', 'Idrissi R.', 'Provstgaard', 'Ranieri L.', 'Biraghi', 'Helland', 'Puczka', 'Van Der Brempt', 'Cabal', 'Ziolkowski'],
  },
  {
    role: 'D',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Kofler', 'Arizala', 'Birindelli', 'Zappa', 'Britschgi', 'Casale', 'Alhassane', 'Ebosse', 'Lazzari', 'Otoa', 'Palma', 'Sabelli', 'Carboni F.', 'De Silvestri', 'Mazzocchi', 'Mlacic', 'Ndiaye', 'Oyono J.', 'Odenthal', 'Omar Fayed'],
  },
  {
    role: 'D',
    tier: 'A RISCHIO',
    names: ['Calvani', 'Pongracic', 'Akpoguma', 'Candè', 'Cittadini', 'Diawara S.', 'Marin R.', 'Terracciano F.', 'Corrado', 'Marianucci', 'Missori', 'Ndaba', 'Rugani'],
  },
  {
    role: 'D',
    tier: 'DA EVITARE',
    names: ['Delli Carri', 'Lucchesi', 'Kouadio', 'Schingtienne', 'Sverko', 'Aurelio', 'Franjic', 'Jean', 'Sagrado', 'Abankwah', 'Amey', 'Antov', 'Bakoune', 'Cinquegrano', 'Goldaniga', 'Gomes', 'Matturro', 'Patric', 'Pieragnolo'],
  },
  {
    role: 'D',
    tier: 'MERCATO',
    names: ['Dodò', 'Romagnoli', 'Tavares N.', 'Tomori', 'Martin', 'Estupinan', 'Floriani Mussolini'],
  },
  {
    role: 'C',
    tier: 'SUPER TOP',
    names: ['Paz N.', 'McTominay'],
  },
  {
    role: 'C',
    tier: 'TOP',
    names: ['Orsolini', 'Calhanoglu', 'Pulisic', 'De Bruyne', 'Rabiot', 'Zaniolo'],
  },
  {
    role: 'C',
    tier: 'SEMITOP',
    names: ['Zaccagni', 'Mastantuono', 'Atta', 'Baturina', 'Jones C.', 'Gudmundsson A.', 'Alajbegovic', 'Vlasic'],
  },
  {
    role: 'C',
    tier: 'SOTTO AI SEMITOP',
    names: ['Mora', 'Taylor K.', 'Da Cunha', 'Barella', 'McKennie', 'Rowe'],
  },
  {
    role: 'C',
    tier: 'FASCIA ALTA',
    names: ['Conceicao', 'Zielinski', 'Modric', 'Saelemaekers', 'Zambo Anguissa', 'Isaksen', 'Frattesi', 'Samardzic', 'Politano'],
  },
  {
    role: 'C',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Rodriguez Je.', 'Sucic P.', 'Pasalic', 'Odgaard', 'Chukwueze', 'Zhegrova', 'Pellegrini Lo.'],
  },
  {
    role: 'C',
    tier: 'POSSIBILI SORPRESE',
    names: ['Diouf', 'Cissè A.', 'Oulai', 'Cacciamani', 'Pisilli'],
  },
  {
    role: 'C',
    tier: 'FASCIA MEDIA',
    names: ['Ederson D.S.', 'Konè M.', 'Thuram K.', 'Baldanzi', 'Thorstvedt', 'Bernardeschi', 'Ekkelenkamp', 'Perrone', 'Moreira'],
  },
  {
    role: 'C',
    tier: 'INFORTUNATI',
    names: ['Konè I.', 'Pessina', 'Addai'],
  },
  {
    role: 'C',
    tier: 'SCOMMESSE',
    names: ['Ndour', 'Calò', 'Liberali', 'Traorè Hj.', 'Adzic', 'Amondarain', 'Bakola'],
  },
  {
    role: 'C',
    tier: 'SOPRA AI LOW COST',
    names: ['Fagioli', 'Gaetano', 'Casadei', 'Mandragora', 'Locatelli', 'Schmid', 'Bernabè', 'Oristanio'],
  },
  {
    role: 'C',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Vergara', 'Elmas', 'Stankovic A.', 'Cancellieri', 'Cambiaghi', 'Caqueret', 'Zalewski', 'Milla'],
  },
  {
    role: 'C',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Cristante', 'Fazzini', 'Frendrup', 'De Roon', 'Colpani', 'Ferguson', 'Lobotka', 'Sow', 'Basic', 'Coulibaly L.', 'Rovella', 'Winks', 'Busio', 'Gandelman', 'Grillitsch', 'Matic', 'Sohm', 'El Aynaoui', 'Fitz-Jim', 'Dominguez B.'],
  },
  {
    role: 'C',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Adopo', 'Ellertsson', 'Karlstrom', 'Nicolussi Caviglia', 'Pierotti', 'Tourè I.', 'Keita M.', 'Perez K.', 'Hasa'],
  },
  {
    role: 'C',
    tier: 'LEGHE NUMEROSE',
    names: ['Unai Gomez', 'Akinsanmiro', 'Berisha M.', 'Gineitis', 'Piotrowski', 'Romano', 'Zerbin', 'Amorim', 'Cataldi', 'Koutsoupias', 'Deiola', 'Diallo O.', 'Helgason', 'Miller L.', 'Sorensen O.', 'Masini'],
  },
  {
    role: 'C',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Pobega', 'Dele-Bashiru', 'Koopmeiners', 'Meichtry', 'Mkhitaryan', 'Fabbian', 'Jashari', 'Luis Henrique', 'Moro N.', 'Brescianini', 'Colombo L.', 'Gilmour'],
  },
  {
    role: 'C',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Volpato', 'Felici', 'Ilkhan', 'Loftus-Cheek', 'Ngom', 'Njie', 'Prati', 'Ricci S.', 'Aboukhlal', 'Fini', 'Messias', 'Chakvetadze', 'Ciurria', 'Duncan', 'Fadera', 'Musah', 'Ordonez C.', 'Venturino', 'Anjorin', 'Comotto', 'Fofana Sa.', 'Ilic', 'Kaba', 'Przyborek', 'Zarraga'],
  },
  {
    role: 'C',
    tier: 'A RISCHIO',
    names: ['Almqvist', 'Gelli F.', 'Sulemana I.', 'Boloca', 'El Azzouzi O.', 'Lipani', 'Maleh', 'Belahyane', 'Cremaschi', 'El Azzouzi A.', 'Iannoni', 'Lahdo', 'Liteta'],
  },
  {
    role: 'C',
    tier: 'DA EVITARE',
    names: ['Cichella', 'Dagasso', 'Foe Ondoa', 'Forson O.', 'Gorter', 'Konaté A.', 'Kone B.', 'Laerke', 'Mout'],
  },
  {
    role: 'C',
    tier: 'MERCATO',
    names: ['Fofana Y.', 'Douglas Luiz', 'Folorunsho', 'Miretti'],
  },
  {
    role: 'A',
    tier: 'SUPER TOP',
    names: ['Martinez L.', 'Malen'],
  },
  {
    role: 'A',
    tier: 'TOP',
    names: ['Thuram', 'Ramos G.', 'Hojlund', 'Kolo Muani'],
  },
  {
    role: 'A',
    tier: 'SEMITOP',
    names: ['Kean', 'Douvikas', 'Yildiz', 'Davis K.'],
  },
  {
    role: 'A',
    tier: 'SOTTO AI SEMITOP',
    names: ['Berardi', 'Scamacca', 'Krstovic'],
  },
  {
    role: 'A',
    tier: 'FASCIA ALTA',
    names: ['Simeone', 'Dybala', 'Santos A.', 'Dovbyk', 'Pinamonti'],
  },
  {
    role: 'A',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Esposito F.P.', 'Castro S.', 'Leao', 'Soulè', 'Neres', 'Boga', 'Pellegrino M.', 'Lucca'],
  },
  {
    role: 'A',
    tier: 'POSSIBILI SORPRESE',
    names: ['Adams A.'],
  },
  {
    role: 'A',
    tier: 'FASCIA MEDIA',
    names: ['De Ketelaere', 'Laurientè', 'Raspadori', 'Diao'],
  },
  {
    role: 'A',
    tier: 'SCOMMESSE',
    names: ['Romero D.', 'Mendy P.'],
  },
  {
    role: 'A',
    tier: 'SOPRA AI LOW COST',
    names: ['Colombo'],
  },
  {
    role: 'A',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Bonny', 'David', 'Giovane', 'Piccoli'],
  },
  {
    role: 'A',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Cutrone', 'Adams C.', 'Maldini', 'Tourè E.', 'Vitinha O.', 'Kevin Carlos', 'Geubbels', 'Ghedjemis'],
  },
  {
    role: 'A',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Zapata D.', 'Bowie', 'Elphege', 'Rrahmani Al.', 'Yeboah J.', 'Raimondo'],
  },
  {
    role: 'A',
    tier: 'LEGHE NUMEROSE',
    names: ['Stulic', 'Adorante', 'Mota', 'Havel', 'Kvernadze', 'Varela G.'],
  },
  {
    role: 'A',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Ratkov', 'Sulemana K.', 'Ekhator', 'Dia', 'Noslin', 'Borrelli', 'Kulenovic', 'Kuhn', 'Buksa', 'Vaz'],
  },
  {
    role: 'A',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Camarda', 'Frigan', 'Gueye', 'N\'Dri'],
  },
  {
    role: 'A',
    tier: 'A RISCHIO',
    names: ['Milik', 'Robinson J.', 'Azon', 'Bayo V.', 'Lauberbach', 'Trepy'],
  },
  {
    role: 'A',
    tier: 'DA EVITARE',
    names: ['Mutandwa', 'Albarracin', 'De Martis', 'Lisman', 'Lontani'],
  },
  {
    role: 'A',
    tier: 'MERCATO',
    names: ['Nkunku', 'Esposito Se.', 'Gimenez', 'Morata', 'Lang'],
  },
];
