/**
 * Fasce della guida all'asta di SosFanta. GENERATO, non modificare a mano:
 * rigenera con `node scripts/build-tiers.mjs`.
 *
 * Fonte: https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere
 */
import type { TierBlock } from '../domain/tiers';

export const TIERS_SOURCE_URL = 'https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere';

/** Data di scarico della guida, mostrata all'utente per capire quanto e' vecchia. */
export const TIERS_UPDATED_AT = '2026-09-04';

export const TIER_BLOCKS: readonly TierBlock[] = [
  {
    role: 'P',
    tier: 'SUPER TOP',
    names: ['Svilar'],
  },
  {
    role: 'P',
    tier: 'TOP',
    names: ['Martinez Jo.', 'Carnesecchi', 'Maignan', 'Vicario', 'Butez'],
  },
  {
    role: 'P',
    tier: 'SEMITOP',
    names: ['Meret'],
  },
  {
    role: 'P',
    tier: 'FASCIA ALTA',
    names: ['Mandas', 'Okoye', 'Skorupski'],
  },
  {
    role: 'P',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Sanchez Ro.', 'Provedel', 'Milinkovic-Savic V.'],
  },
  {
    role: 'P',
    tier: 'FASCIA MEDIA',
    names: ['De Gea', 'Falcone', 'Caprile'],
  },
  {
    role: 'P',
    tier: 'SOPRA AI LOW COST',
    names: ['Bijlow'],
  },
  {
    role: 'P',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Muric', 'Corvi'],
  },
  {
    role: 'P',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Stankovic F.', 'Perri'],
  },
  {
    role: 'P',
    tier: 'LEGHE NUMEROSE',
    names: ['Palmisani', 'Tornqvist'],
  },
  {
    role: 'D',
    tier: 'SUPER TOP',
    names: ['Dimarco'],
  },
  {
    role: 'D',
    tier: 'TOP',
    names: ['Wesley', 'Bremer', 'Bastoni', 'Pavlovic', 'Molina N.', 'Solet'],
  },
  {
    role: 'D',
    tier: 'SEMITOP',
    names: ['Akanji', 'Spence', 'Kalulu', 'Di Lorenzo', 'Mancini', 'Rrahmani', 'Stones', 'Gila'],
  },
  {
    role: 'D',
    tier: 'SOTTO AI SEMITOP',
    names: ['Bisseck', 'Tavares N.', 'N\'Dicka', 'Ostigard', 'Ramon'],
  },
  {
    role: 'D',
    tier: 'FASCIA ALTA',
    names: ['Spinazzola', 'Zappacosta', 'Celik', 'Lucumì'],
  },
  {
    role: 'D',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Cambiaso', 'Carlos Augusto', 'Pavard', 'Kempf'],
  },
  {
    role: 'D',
    tier: 'POSSIBILI SORPRESE',
    names: ['Chalobah T.', 'Couto', 'Vojvoda', 'Koulierakis'],
  },
  {
    role: 'D',
    tier: 'FASCIA MEDIA',
    names: ['Hermoso', 'Miranda J.', 'Belghali', 'Valle', 'Delprato', 'Kristensen T.'],
  },
  {
    role: 'D',
    tier: 'INFORTUNATI',
    names: ['Buongiorno', 'Hien', 'Parisi'],
  },
  {
    role: 'D',
    tier: 'SCOMMESSE',
    names: ['Mangas', 'Jimenez A.', 'Kaiki', 'Obrador', 'Mitaj', 'Lulli', 'Viery', 'Valdepenas', 'Fortini'],
  },
  {
    role: 'D',
    tier: 'SOPRA AI LOW COST',
    names: ['Scalvini', 'Vasquez', 'Tiago Gabriel', 'Valeri', 'Kamara H.', 'Theate', 'Mina', 'Bernasconi'],
  },
  {
    role: 'D',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Dodò', 'Bartesaghi', 'Bellanova', 'Joao Mario', 'Balerdi', 'Beukema', 'Holm', 'Tomori', 'De Winter', 'Rensch'],
  },
  {
    role: 'D',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Diego Carlos', 'Gabbia', 'Zortea', 'Gallo', 'Leysen F.', 'Gaspar K.', 'Rodriguez R.', 'Provstgaard', 'Troilo', 'Van Der Brempt', 'Doekhi', 'Bracaglia', 'Dragusin', 'Idzes', 'Obert', 'Sugawara', 'Kelly L.', 'Mazzocchi'],
  },
  {
    role: 'D',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Comuzzo', 'Coco', 'Ismajli', 'Sutalo J.', 'Caleta-Car', 'Heggem', 'Kolasinac', 'Marcandalli', 'Marusic', 'Monterisi', 'Pedraza', 'Veiga D.', 'Bella-Kotchap', 'Zè Pedro', 'Juan Jesus', 'Kabasele', 'Vitik', 'Drameh', 'Estupinan', 'Ziolkowski'],
  },
  {
    role: 'D',
    tier: 'LEGHE NUMEROSE',
    names: ['Oyono A.', 'Correia T.', 'Haps', 'Comert', 'Ehizibue', 'Hainaut', 'Moreno M.', 'Rodriguez Ju.', 'Siebert', 'Smolcic I.', 'Terzic', 'Walukiewicz', 'Carboni A.', 'Schingtienne', 'Tchato', 'Goglichidze'],
  },
  {
    role: 'D',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Badiashile', 'Doig', 'Ghilardi', 'Olivera', 'Bertola', 'Floriani Mussolini', 'Kossounou', 'Valenti', 'Zanoli', 'Helland', 'Ranieri L.', 'Abankwah', 'Biraghi', 'Marin R.', 'Dembelè A.', 'Patterson'],
  },
  {
    role: 'D',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Calvani', 'Birindelli', 'Cittadini', 'Favasuli', 'Britschgi', 'Ebosse', 'Franjic', 'Halhal', 'Kambwala', 'Odenthal', 'Palma', 'Alhassane', 'Lazzari', 'Ndiaye', 'Otoa', 'Pellegrini Lu.', 'Puczka', 'Sabelli', 'Cabal', 'Carboni F.', 'Maye', 'Omar Fayed'],
  },
  {
    role: 'D',
    tier: 'A RISCHIO',
    names: ['Kofler', 'Arizala', 'Pongracic', 'Akpoguma', 'Candè', 'Casale', 'Kouadio', 'Lucchesi', 'Cinquegrano', 'Drobnic', 'Jean', 'Ndaba', 'Terracciano F.', 'De Silvestri', 'Marianucci', 'Rugani'],
  },
  {
    role: 'D',
    tier: 'DA EVITARE',
    names: ['Idrissi R.', 'Sverko', 'Aurelio', 'Bakoune', 'Diawara S.', 'Sagrado', 'Amey', 'Antov', 'Goldaniga', 'Gomes', 'Patric', 'Pieragnolo'],
  },
  {
    role: 'D',
    tier: 'MERCATO',
    names: ['Gatti'],
  },
  {
    role: 'C',
    tier: 'SUPER TOP',
    names: ['Paz N.', 'Calhanoglu'],
  },
  {
    role: 'C',
    tier: 'TOP',
    names: ['McTominay', 'Orsolini', 'Pulisic', 'Baturina', 'Rabiot', 'De Bruyne', 'Frattesi'],
  },
  {
    role: 'C',
    tier: 'SEMITOP',
    names: ['Zaniolo', 'Zaccagni', 'Mora', 'Atta', 'Mastantuono', 'Kessiè', 'Vlasic', 'McKennie', 'Zielinski'],
  },
  {
    role: 'C',
    tier: 'SOTTO AI SEMITOP',
    names: ['Jones C.', 'Alajbegovic', 'Conceicao', 'Rowe', 'Barella', 'Da Cunha', 'Taylor K.', 'Gudmundsson A.'],
  },
  {
    role: 'C',
    tier: 'FASCIA ALTA',
    names: ['Ekkelenkamp', 'Samardzic', 'Modric', 'Konè M.', 'Zambo Anguissa', 'Moreira', 'Politano', 'Isaksen', 'Chukwueze'],
  },
  {
    role: 'C',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Gonzalez N.', 'Sucic P.', 'Rodriguez Je.', 'Vergara', 'Pasalic'],
  },
  {
    role: 'C',
    tier: 'POSSIBILI SORPRESE',
    names: ['Diouf', 'Goncalves P.', 'Milla', 'Mbangula', 'Pisilli', 'Cacciamani', 'Cissè A.'],
  },
  {
    role: 'C',
    tier: 'FASCIA MEDIA',
    names: ['Ederson D.S.', 'Thorstvedt', 'El Shaarawy', 'Baldanzi', 'Perrone', 'Saelemaekers', 'Douglas Luiz', 'Bernardeschi', 'Sarr P.'],
  },
  {
    role: 'C',
    tier: 'INFORTUNATI',
    names: ['Thuram K.', 'Konè I.', 'Pessina', 'Addai'],
  },
  {
    role: 'C',
    tier: 'SCOMMESSE',
    names: ['Calò', 'Adzic', 'Njie', 'Romano', 'Liberali', 'Ndour', 'Oulai', 'Meichtry', 'Monteiro J.', 'Bakola', 'Amondarain', 'Traorè Hj.'],
  },
  {
    role: 'C',
    tier: 'SOPRA AI LOW COST',
    names: ['Casadei', 'Colpani', 'Mandragora', 'Gaetano', 'Schmid', 'Bernabè', 'Fagioli', 'Fitz-Jim', 'Fabbian', 'Folorunsho'],
  },
  {
    role: 'C',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Hutchinson', 'Cancellieri', 'Pellegrini Lo.', 'Volpato', 'Cambiaghi', 'Odgaard', 'Elmas', 'Zalewski', 'Caqueret', 'Oristanio', 'Stankovic A.', 'Dominguez B.', 'Loftus-Cheek', 'Ricci S.'],
  },
  {
    role: 'C',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Cristante', 'Locatelli', 'Frendrup', 'Fazzini', 'Lobotka', 'Coulibaly L.', 'Ferguson', 'Rovella', 'Basic', 'Busio', 'Sohm', 'Grillitsch'],
  },
  {
    role: 'C',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Adopo', 'Karlstrom', 'Sow', 'Braganca', 'Ellertsson', 'Matic', 'Pierotti', 'Piotrowski', 'Tourè I.', 'Winks', 'Keita M.', 'Perez K.', 'De Roon', 'Gandelman', 'Gorter', 'Hasa', 'Ilic'],
  },
  {
    role: 'C',
    tier: 'LEGHE NUMEROSE',
    names: ['Akinsanmiro', 'Unai Gomez', 'Zerbin', 'Gineitis', 'Amorim', 'Berisha M.', 'Miller L.', 'Deiola', 'Masini'],
  },
  {
    role: 'C',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Koopmeiners', 'Pobega', 'Dele-Bashiru', 'Jashari', 'Luis Henrique', 'Cataldi', 'Massolin', 'Mkhitaryan', 'Moro N.', 'Brescianini', 'Colombo L.', 'Diallo O.', 'Fernandez T.', 'Gilmour', 'Helgason', 'Sulemana I.', 'Jovanovic'],
  },
  {
    role: 'C',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Nicolussi Caviglia', 'Felici', 'Almqvist', 'Cichella', 'Fini', 'Ilkhan', 'Messias', 'Ngom', 'Gagliardini', 'Musah', 'Ordonez C.', 'Chakvetadze', 'Ciurria', 'El Azzouzi O.', 'Fadera', 'Venturino', 'Zarraga', 'Anjorin', 'Ciervo', 'Comotto', 'Fofana Sa.', 'Kaba', 'Mout', 'Przyborek'],
  },
  {
    role: 'C',
    tier: 'A RISCHIO',
    names: ['Zhegrova', 'Koutsoupias', 'Aboukhlal', 'Gelli F.', 'Maleh', 'Belahyane', 'Boloca', 'Cremaschi', 'Duncan', 'Foe Ondoa', 'Lipani', 'El Azzouzi A.', 'Lahdo', 'Liteta'],
  },
  {
    role: 'C',
    tier: 'DA EVITARE',
    names: ['Forson O.', 'Dagasso', 'Konaté A.', 'Kone B.', 'Laerke'],
  },
  {
    role: 'A',
    tier: 'SUPER TOP',
    names: ['Malen', 'Martinez L.'],
  },
  {
    role: 'A',
    tier: 'TOP',
    names: ['Ramos G.', 'Thuram', 'Hojlund'],
  },
  {
    role: 'A',
    tier: 'SEMITOP',
    names: ['Kean', 'Douvikas', 'Kolo Muani', 'Davis K.'],
  },
  {
    role: 'A',
    tier: 'SOTTO AI SEMITOP',
    names: ['Scamacca', 'Woltemade', 'Esposito F.P.', 'Krstovic', 'Dybala', 'Berardi'],
  },
  {
    role: 'A',
    tier: 'FASCIA ALTA',
    names: ['Beto', 'Pinamonti', 'Simeone'],
  },
  {
    role: 'A',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Castro S.', 'Pellegrino M.', 'Soulè', 'Bonny', 'Boga', 'Neres'],
  },
  {
    role: 'A',
    tier: 'POSSIBILI SORPRESE',
    names: ['Adams A.', 'Varela G.'],
  },
  {
    role: 'A',
    tier: 'FASCIA MEDIA',
    names: ['Santos A.', 'Dovbyk', 'De Ketelaere', 'Raspadori', 'Laurientè', 'Colombo', 'Diao', 'Esposito Se.'],
  },
  {
    role: 'A',
    tier: 'INFORTUNATI',
    names: ['Yildiz'],
  },
  {
    role: 'A',
    tier: 'SCOMMESSE',
    names: ['Raimondo', 'Kvernadze', 'Mendy P.', 'Romero D.'],
  },
  {
    role: 'A',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Piccoli', 'Gnonto', 'Lang', 'Lucca'],
  },
  {
    role: 'A',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Bowie', 'Adams C.', 'Cutrone', 'Maldini', 'Tourè E.', 'Geubbels', 'Ghedjemis', 'Vitinha O.', 'Yeboah J.'],
  },
  {
    role: 'A',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Kevin Carlos', 'Bobcek', 'Zapata D.', 'Zeballos', 'Ngonge', 'Fatah', 'Nzola', 'Elphege'],
  },
  {
    role: 'A',
    tier: 'LEGHE NUMEROSE',
    names: ['Rrahmani Al.', 'Stulic', 'Adorante', 'Mota'],
  },
  {
    role: 'A',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Osmajic', 'Noslin', 'Sulemana K.', 'Birligea', 'Borrelli', 'Camarda', 'Frigan', 'Giovane', 'Havel', 'Kulenovic', 'N\'Dri', 'Lontani'],
  },
  {
    role: 'A',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Gueye', 'Ekhator', 'Bayo V.', 'Robinho Junior'],
  },
  {
    role: 'A',
    tier: 'A RISCHIO',
    names: ['Milik', 'Robinson J.'],
  },
  {
    role: 'A',
    tier: 'DA EVITARE',
    names: ['De Martis', 'Lauberbach', 'Lisman', 'Trepy'],
  },
];
