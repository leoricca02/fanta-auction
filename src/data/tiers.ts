/**
 * Fasce della guida all'asta di SosFanta. GENERATO, non modificare a mano:
 * rigenera con `node scripts/build-tiers.mjs`.
 *
 * Fonte: https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere
 */
import type { TierBlock } from '../domain/tiers';

export const TIERS_SOURCE_URL = 'https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere';

/** Data di scarico della guida, mostrata all'utente per capire quanto e' vecchia. */
export const TIERS_UPDATED_AT = '2026-09-08';

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
    names: ['Mandas', 'Okoye'],
  },
  {
    role: 'P',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Sanchez Ro.', 'Provedel', 'Milinkovic-Savic V.'],
  },
  {
    role: 'P',
    tier: 'FASCIA MEDIA',
    names: ['De Gea', 'Skorupski', 'Falcone', 'Caprile'],
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
    names: ['Spinazzola', 'Dodò', 'Zappacosta', 'Celik', 'Lucumì'],
  },
  {
    role: 'D',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Cambiaso', 'Carlos Augusto', 'Pavard', 'Kempf', 'Balerdi'],
  },
  {
    role: 'D',
    tier: 'POSSIBILI SORPRESE',
    names: ['Chalobah T.', 'Couto', 'Vojvoda', 'Koulierakis'],
  },
  {
    role: 'D',
    tier: 'FASCIA MEDIA',
    names: ['Hermoso', 'Belghali', 'Valle', 'Delprato', 'Kristensen T.'],
  },
  {
    role: 'D',
    tier: 'INFORTUNATI',
    names: ['Buongiorno', 'Hien', 'Parisi'],
  },
  {
    role: 'D',
    tier: 'SCOMMESSE',
    names: ['Mangas', 'Jimenez A.', 'Kaiki', 'Obrador', 'Lulli', 'Mitaj', 'Valdepenas', 'Viery', 'Fortini'],
  },
  {
    role: 'D',
    tier: 'SOPRA AI LOW COST',
    names: ['Scalvini', 'Miranda J.', 'Valeri', 'Vasquez', 'Tiago Gabriel', 'Kamara H.', 'Theate', 'Mina', 'Bernasconi'],
  },
  {
    role: 'D',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Bartesaghi', 'Bellanova', 'Joao Mario', 'Holm', 'Tomori', 'Beukema', 'De Winter', 'Gatti', 'Rensch'],
  },
  {
    role: 'D',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Diego Carlos', 'Gabbia', 'Leysen F.', 'Zortea', 'Gallo', 'Gaspar K.', 'Rodriguez R.', 'Provstgaard', 'Troilo', 'Van Der Brempt', 'Bracaglia', 'Doekhi', 'Obert', 'Dragusin', 'Idzes', 'Sugawara', 'Kelly L.', 'Mazzocchi'],
  },
  {
    role: 'D',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Comuzzo', 'Ismajli', 'Coco', 'Caleta-Car', 'Kolasinac', 'Marcandalli', 'Marusic', 'Monterisi', 'Pedraza', 'Sutalo J.', 'Zè Pedro', 'Bella-Kotchap', 'Heggem', 'Veiga D.', 'Juan Jesus', 'Kabasele', 'Vitik', 'Drameh', 'Estupinan', 'Ziolkowski'],
  },
  {
    role: 'D',
    tier: 'LEGHE NUMEROSE',
    names: ['Oyono A.', 'Comert', 'Correia T.', 'Hainaut', 'Haps', 'Rodriguez Ju.', 'Carboni A.', 'Ehizibue', 'Moreno M.', 'Siebert', 'Smolcic I.', 'Terzic', 'Schingtienne', 'Tchato', 'Walukiewicz', 'Goglichidze'],
  },
  {
    role: 'D',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Doig', 'Badiashile', 'Ghilardi', 'Bertola', 'Cinquegrano', 'Floriani Mussolini', 'Kossounou', 'Olivera', 'Valenti', 'Abankwah', 'Helland', 'Zanoli', 'Marin R.', 'Ranieri L.', 'Biraghi', 'Dembelè A.', 'Patterson'],
  },
  {
    role: 'D',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Calvani', 'Birindelli', 'Britschgi', 'Cittadini', 'Ebosse', 'Favasuli', 'Halhal', 'Kambwala', 'Odenthal', 'Alhassane', 'Franjic', 'Otoa', 'Palma', 'Sabelli', 'Cabal', 'Carboni F.', 'Lazzari', 'Maye', 'Ndiaye', 'Omar Fayed', 'Pellegrini Lu.', 'Puczka'],
  },
  {
    role: 'D',
    tier: 'A RISCHIO',
    names: ['Kofler', 'Kouadio', 'Lucchesi', 'Arizala', 'Pongracic', 'Akpoguma', 'Candè', 'Casale', 'Drobnic', 'De Silvestri', 'Jean', 'Marianucci', 'Ndaba', 'Rugani', 'Terracciano F.'],
  },
  {
    role: 'D',
    tier: 'DA EVITARE',
    names: ['Sagrado', 'Idrissi R.', 'Sverko', 'Amey', 'Antov', 'Aurelio', 'Bakoune', 'Diawara S.', 'Goldaniga', 'Gomes', 'Patric', 'Pieragnolo'],
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
    names: ['Jones C.', 'Alajbegovic', 'Conceicao', 'Rowe', 'Da Cunha', 'Barella', 'Taylor K.', 'Gudmundsson A.'],
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
    names: ['Diouf', 'Goncalves P.', 'Milla', 'Mbangula', 'Cissè A.', 'Pisilli', 'Cacciamani'],
  },
  {
    role: 'C',
    tier: 'FASCIA MEDIA',
    names: ['Ederson D.S.', 'Thorstvedt', 'El Shaarawy', 'Baldanzi', 'Perrone', 'Saelemaekers', 'Douglas Luiz', 'Bernardeschi', 'Sarr P.'],
  },
  {
    role: 'C',
    tier: 'INFORTUNATI',
    names: ['Locatelli', 'Thuram K.', 'Konè I.', 'Pessina', 'Addai'],
  },
  {
    role: 'C',
    tier: 'SCOMMESSE',
    names: ['Calò', 'Adzic', 'Njie', 'Romano', 'Liberali', 'Ndour', 'Oulai', 'Meichtry', 'Monteiro J.', 'Bakola', 'Amondarain', 'Traorè Hj.'],
  },
  {
    role: 'C',
    tier: 'SOPRA AI LOW COST',
    names: ['Mandragora', 'Casadei', 'Colpani', 'Gaetano', 'Schmid', 'Bernabè', 'Fagioli', 'Fitz-Jim', 'Fabbian', 'Folorunsho'],
  },
  {
    role: 'C',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Hutchinson', 'Cancellieri', 'Pellegrini Lo.', 'Volpato', 'Cambiaghi', 'Odgaard', 'Caqueret', 'Elmas', 'Zalewski', 'Oristanio', 'Stankovic A.', 'Loftus-Cheek', 'Dominguez B.', 'Ricci S.'],
  },
  {
    role: 'C',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Cristante', 'Fazzini', 'Frendrup', 'Ferguson', 'Lobotka', 'Coulibaly L.', 'Rovella', 'Basic', 'Busio', 'Sohm', 'Grillitsch'],
  },
  {
    role: 'C',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Karlstrom', 'Adopo', 'Sow', 'Winks', 'Braganca', 'Ellertsson', 'Matic', 'Pierotti', 'Piotrowski', 'Keita M.', 'Perez K.', 'Tourè I.', 'Gandelman', 'De Roon', 'Gorter', 'Hasa', 'Ilic'],
  },
  {
    role: 'C',
    tier: 'LEGHE NUMEROSE',
    names: ['Akinsanmiro', 'Unai Gomez', 'Zerbin', 'Gineitis', 'Masini', 'Amorim', 'Berisha M.', 'Deiola', 'Miller L.'],
  },
  {
    role: 'C',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Koopmeiners', 'Pobega', 'Jashari', 'Luis Henrique', 'Brescianini', 'Dele-Bashiru', 'Fernandez T.', 'Massolin', 'Mkhitaryan', 'Moro N.', 'Cataldi', 'Diallo O.', 'Sulemana I.', 'Colombo L.', 'Gilmour', 'Helgason', 'Jovanovic'],
  },
  {
    role: 'C',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Felici', 'Fini', 'Messias', 'Nicolussi Caviglia', 'Almqvist', 'Cichella', 'Ilkhan', 'Musah', 'Ngom', 'Fadera', 'Gagliardini', 'Ordonez C.', 'El Azzouzi O.', 'Zarraga', 'Chakvetadze', 'Ciervo', 'Ciurria', 'Comotto', 'Fofana Sa.', 'Kaba', 'Mout', 'Przyborek', 'Venturino', 'Sierro'],
  },
  {
    role: 'C',
    tier: 'A RISCHIO',
    names: ['Zhegrova', 'Aboukhlal', 'Belahyane', 'Maleh', 'Cremaschi', 'Foe Ondoa', 'Gelli F.', 'Lipani', 'Boloca', 'Duncan', 'El Azzouzi A.', 'Lahdo', 'Liteta'],
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
    names: ['Kean', 'Douvikas', 'Davis K.'],
  },
  {
    role: 'A',
    tier: 'SOTTO AI SEMITOP',
    names: ['Kolo Muani', 'Woltemade', 'Scamacca', 'Esposito F.P.', 'Krstovic', 'Dybala', 'Berardi'],
  },
  {
    role: 'A',
    tier: 'FASCIA ALTA',
    names: ['Pinamonti', 'Simeone', 'Beto', 'Pellegrino M.'],
  },
  {
    role: 'A',
    tier: 'JOLLY 1ª FASCIA',
    names: ['Soulè', 'Castro S.', 'Bonny', 'Boga', 'Neres'],
  },
  {
    role: 'A',
    tier: 'POSSIBILI SORPRESE',
    names: ['Raimondo', 'Adams A.', 'Varela G.'],
  },
  {
    role: 'A',
    tier: 'FASCIA MEDIA',
    names: ['Santos A.', 'Dovbyk', 'Diao', 'De Ketelaere', 'Raspadori', 'Laurientè', 'Colombo', 'Esposito Se.'],
  },
  {
    role: 'A',
    tier: 'INFORTUNATI',
    names: ['Yildiz'],
  },
  {
    role: 'A',
    tier: 'SCOMMESSE',
    names: ['Kvernadze', 'Mendy P.', 'Romero D.', 'Lontani', 'Robinson J.'],
  },
  {
    role: 'A',
    tier: 'JOLLY 2ª FASCIA',
    names: ['Piccoli', 'Gnonto', 'Lang', 'Lucca'],
  },
  {
    role: 'A',
    tier: 'LOW COST 1ª FASCIA',
    names: ['Bowie', 'Adams C.', 'Cutrone', 'Maldini', 'Tourè E.', 'Ghedjemis', 'Geubbels', 'Vitinha O.', 'Yeboah J.', 'Osmajic'],
  },
  {
    role: 'A',
    tier: 'LOW COST 2ª FASCIA',
    names: ['Kevin Carlos', 'Bobcek', 'Zapata D.', 'Zeballos', 'Fatah', 'Ngonge', 'Nzola', 'Elphege'],
  },
  {
    role: 'A',
    tier: 'LEGHE NUMEROSE',
    names: ['Rrahmani Al.', 'Stulic', 'Mota', 'Adorante'],
  },
  {
    role: 'A',
    tier: 'JOLLY 3ª FASCIA',
    names: ['Noslin', 'Sulemana K.', 'Birligea', 'Camarda', 'Frigan', 'Kulenovic', 'N\'Dri', 'Giovane', 'Havel', 'Enem'],
  },
  {
    role: 'A',
    tier: 'JOLLY 4ª FASCIA',
    names: ['Gueye', 'Ekhator', 'Bayo V.', 'Robinho Junior'],
  },
  {
    role: 'A',
    tier: 'DA EVITARE',
    names: ['Milik', 'Lauberbach', 'De Martis', 'Lisman', 'Trepy'],
  },
];
