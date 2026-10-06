// Purpose: names for the households of a settlement. A Roman of standing bore three names: a
// praenomen (the given name, of which there were few), a nomen (the name of the clan) and a
// cognomen (the name of the family within the clan, often a nickname once). The lists below are
// names that are attested; put together they give well over a hundred thousand different names.
//
// A household's name follows from its number and the seed of its settlement, so the same
// settlement has the same names every time, and the names take nothing from the chance that
// drives the settlement itself.

import { placeHash } from './volume';

export const PRAENOMINA = [
  'Appius', 'Aulus', 'Decimus', 'Gaius', 'Gnaeus', 'Kaeso', 'Lucius', 'Mamercus', 'Manius', 'Marcus',
  'Numerius', 'Publius', 'Quintus', 'Servius', 'Sextus', 'Spurius', 'Tiberius', 'Titus', 'Vibius', 'Opiter',
];

export const NOMINA = [
  'Accius', 'Acilius', 'Aebutius', 'Aelius', 'Aemilius', 'Afranius', 'Albius', 'Annius', 'Antistius', 'Antonius',
  'Appuleius', 'Aquilius', 'Arrius', 'Asinius', 'Atilius', 'Atius', 'Aufidius', 'Aurelius', 'Baebius', 'Caecilius',
  'Caelius', 'Calpurnius', 'Caninius', 'Carvilius', 'Cassius', 'Claudius', 'Cloelius', 'Cluentius', 'Cocceius', 'Cominius',
  'Considius', 'Cornelius', 'Coruncanius', 'Curius', 'Curtius', 'Decius', 'Didius', 'Domitius', 'Duilius', 'Egnatius',
  'Ennius', 'Fabius', 'Fabricius', 'Fannius', 'Flaminius', 'Flavius', 'Fonteius', 'Fufius', 'Fulvius', 'Fundanius',
  'Furius', 'Gabinius', 'Gellius', 'Genucius', 'Hirtius', 'Horatius', 'Hortensius', 'Hostilius', 'Iulius', 'Iunius',
  'Iuventius', 'Laelius', 'Licinius', 'Livius', 'Lollius', 'Lucilius', 'Lucretius', 'Lutatius', 'Maecius', 'Maelius',
  'Mallius', 'Mamilius', 'Manilius', 'Manlius', 'Marcius', 'Marius', 'Memmius', 'Menenius', 'Minucius', 'Mucius',
  'Mummius', 'Munatius', 'Naevius', 'Nautius', 'Nonius', 'Norbanus', 'Numitorius', 'Octavius', 'Ogulnius', 'Opimius',
  'Oppius', 'Otacilius', 'Papirius', 'Petronius', 'Pinarius', 'Plautius', 'Poetelius', 'Pompeius', 'Pomponius', 'Popillius',
  'Porcius', 'Postumius', 'Publilius', 'Pupius', 'Quinctilius', 'Quinctius', 'Rabirius', 'Roscius', 'Rupilius', 'Rutilius',
  'Sallustius', 'Scribonius', 'Sempronius', 'Sentius', 'Sergius', 'Sertorius', 'Servilius', 'Sestius', 'Sextius', 'Sicinius',
  'Silius', 'Sosius', 'Statilius', 'Sulpicius', 'Tarquitius', 'Terentius', 'Titinius', 'Titius', 'Trebonius', 'Tullius',
  'Ulpius', 'Valerius', 'Vatinius', 'Vergilius', 'Verginius', 'Vettius', 'Veturius', 'Vibius', 'Villius', 'Vinicius',
  'Vipsanius', 'Vitellius', 'Volcatius', 'Volumnius',
];

export const COGNOMINA = [
  'Agricola', 'Ahala', 'Albinus', 'Aquila', 'Arvina', 'Asellio', 'Atticus', 'Balbus', 'Barbatus', 'Bassus',
  'Bestia', 'Bibulus', 'Blaesus', 'Brocchus', 'Brutus', 'Bubulcus', 'Buteo', 'Caecus', 'Caepio', 'Calvus',
  'Camillus', 'Caninus', 'Capito', 'Carbo', 'Catulus', 'Celer', 'Celsus', 'Cento', 'Cerco', 'Cethegus',
  'Cicero', 'Cinna', 'Clemens', 'Corvinus', 'Corvus', 'Cossus', 'Cotta', 'Crassus', 'Crispus', 'Curio',
  'Cursor', 'Dentatus', 'Dolabella', 'Drusus', 'Falco', 'Felix', 'Fidenas', 'Figulus', 'Fimbria', 'Flaccus',
  'Flamma', 'Florus', 'Frugi', 'Fullo', 'Fuscus', 'Galba', 'Gallus', 'Gemellus', 'Geta', 'Glabrio',
  'Glaucia', 'Gracchus', 'Gurges', 'Habitus', 'Hispallus', 'Labeo', 'Laenas', 'Laevinus', 'Lanatus', 'Lentulus',
  'Lepidus', 'Libo', 'Ligus', 'Longus', 'Lucullus', 'Lupus', 'Lurco', 'Macer', 'Macro', 'Magnus',
  'Malleolus', 'Mancinus', 'Marcellus', 'Maximus', 'Merula', 'Messalla', 'Metellus', 'Murena', 'Mus', 'Naso',
  'Natta', 'Nepos', 'Nerva', 'Niger', 'Novellus', 'Ocella', 'Orestes', 'Pacilus', 'Paetus', 'Pansa',
  'Papus', 'Paullus', 'Pennus', 'Pera', 'Philo', 'Pictor', 'Piso', 'Pius', 'Plancus', 'Priscus',
  'Proculus', 'Pulcher', 'Pullus', 'Purpureo', 'Quadratus', 'Regulus', 'Rufus', 'Rullus', 'Rutilus', 'Sabinus',
  'Saturninus', 'Scaevola', 'Scapula', 'Scaurus', 'Scipio', 'Seneca', 'Serranus', 'Severus', 'Silanus', 'Silo',
  'Sophus', 'Structus', 'Sulla', 'Sura', 'Taurus', 'Thermus', 'Torquatus', 'Tremulus', 'Tubero', 'Tubulus',
  'Tuditanus', 'Tullus', 'Turdus', 'Varro', 'Varus', 'Vatia', 'Verrucosus', 'Vespillo', 'Vetus', 'Vitulus',
  'Volusus', 'Vulso',
];

// The name of a household, by its number in its settlement. namesTaken (a Set) keeps the names
// that are given, so that no two households of a settlement bear the same one: where a name is
// taken, the next cognomen is tried.
export function nameOfHousehold(householdNumber, seed, namesTaken) {
  const praenomen = PRAENOMINA[Math.floor(placeHash(householdNumber, 1, seed) * PRAENOMINA.length)];
  const nomen = NOMINA[Math.floor(placeHash(householdNumber, 2, seed) * NOMINA.length)];
  const firstCognomen = Math.floor(placeHash(householdNumber, 3, seed) * COGNOMINA.length);
  for (let attempt = 0; attempt < COGNOMINA.length; attempt++) {
    const name = praenomen + ' ' + nomen + ' ' + COGNOMINA[(firstCognomen + attempt) % COGNOMINA.length];
    if (!namesTaken.has(name)) {
      namesTaken.add(name);
      return name;
    }
  }
  return praenomen + ' ' + nomen + ' ' + householdNumber; // every cognomen of that clan is taken
}
