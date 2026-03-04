/**
 * Creates a small test SQLite database for development and testing.
 * Run: bun scripts/create_test_db.ts
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

mkdirSync("data", { recursive: true });
const db = new Database("data/simple.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    excerpt TEXT,
    thumb TEXT
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS article_categories (
    article_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (article_id, category_id)
  );
  CREATE TABLE IF NOT EXISTS article_links (
    article_id INTEGER NOT NULL,
    target_page_id INTEGER NOT NULL,
    PRIMARY KEY (article_id, target_page_id)
  );
`);

// Insert test categories
const categories = [
  "science", "nature", "animals", "places", "technology",
  "music", "art", "mathematics", "history", "geography",
  "mammals", "birds", "physics", "chemistry", "biology",
  "europe", "asia", "programming", "computers", "space",
];
const catInsert = db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)");
categories.forEach((name, i) => catInsert.run(i, name));

// Insert test articles
const articles = [
  { id: 1, title: "Dog", excerpt: "The dog is a domesticated descendant of the wolf. It was the first species to be domesticated by humans.", thumb: "Dog_poster_1.jpg", cats: [2, 10] },
  { id: 2, title: "Cat", excerpt: "The cat is a domestic species of small carnivorous mammal. It is the only domesticated species in the family Felidae.", thumb: "Cat_poster_1.jpg", cats: [2, 10] },
  { id: 3, title: "Sun", excerpt: "The Sun is the star at the center of the Solar System. It is a massive, hot ball of plasma, inflated and heated by nuclear fusion reactions.", thumb: "The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA.jpg", cats: [0, 19] },
  { id: 4, title: "Moon", excerpt: "The Moon is Earth's only natural satellite. It orbits at an average distance of 384,400 km, about 30 times the diameter of Earth.", thumb: "FullMoon2010.jpg", cats: [0, 19] },
  { id: 5, title: "Python (programming language)", excerpt: "Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability.", thumb: "Python-logo-notext.svg.png", cats: [4, 17, 18] },
  { id: 6, title: "JavaScript", excerpt: "JavaScript is a programming language and core technology of the World Wide Web, alongside HTML and CSS.", thumb: null, cats: [4, 17, 18] },
  { id: 7, title: "Albert Einstein", excerpt: "Albert Einstein was a German-born theoretical physicist who is widely held to be one of the greatest physicists of all time.", thumb: "Einstein_1921_by_F_Schmutzer.jpg", cats: [0, 11, 12] },
  { id: 8, title: "Paris", excerpt: "Paris is the capital and largest city of France. With an estimated population of 2,102,650 in an area of more than 105 km².", thumb: "Tour_Eiffel_Wikimedia_Commons.jpg", cats: [3, 15] },
  { id: 9, title: "Tokyo", excerpt: "Tokyo is the capital and most populous city of Japan. It is the seat of the Emperor of Japan, the Japanese government and the National Diet.", thumb: "Skyscrapers_of_Shinjuku_2009_January.jpg", cats: [3, 16] },
  { id: 10, title: "Guitar", excerpt: "The guitar is a fretted musical instrument that typically has six strings. It is usually held flat against the player's body.", thumb: "GuitareClassique5.png", cats: [5, 6] },
  { id: 11, title: "Piano", excerpt: "The piano is a keyboard instrument that produces sound when its keys are pressed. Each key triggers a hammer to strike a steel string.", thumb: "Steinway_&_Sons_concert_grand_piano.jpg", cats: [5, 6] },
  { id: 12, title: "Water", excerpt: "Water is an inorganic compound with the chemical formula H₂O. It is a transparent, tasteless, odorless, and nearly colorless chemical substance.", thumb: "Water_drop_001.jpg", cats: [0, 13] },
  { id: 13, title: "Gold", excerpt: "Gold is a chemical element with the symbol Au and atomic number 79. It is a bright, slightly orange-yellow, dense, soft, malleable, and ductile metal.", thumb: "Gold-98752.jpg", cats: [0, 13] },
  { id: 14, title: "Tiger", excerpt: "The tiger is the largest living cat species and a member of the genus Panthera. It is most recognizable for its dark vertical stripes on orange fur.", thumb: "Panthera_tigris_tigris.jpg", cats: [1, 2, 10] },
  { id: 15, title: "Eagle", excerpt: "Eagles are large birds of prey in the family Accipitridae. They are known for their keen eyesight and powerful build.", thumb: "Bald_Eagle_Portrait.jpg", cats: [1, 2, 11] },
  { id: 16, title: "Mount Everest", excerpt: "Mount Everest is Earth's highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas.", thumb: "Mt._Everest_from_Gokyo_Ri.jpg", cats: [1, 3, 9, 16] },
  { id: 17, title: "Amazon River", excerpt: "The Amazon River is a river in South America. It is the longest river in the world by discharge volume of water.", thumb: "Amazon_river.jpg", cats: [1, 3, 9] },
  { id: 18, title: "Quantum mechanics", excerpt: "Quantum mechanics is a fundamental theory that describes the behavior of nature at and below the scale of atoms.", thumb: null, cats: [0, 12] },
  { id: 19, title: "DNA", excerpt: "Deoxyribonucleic acid is a polymer composed of two polynucleotide chains that coil around each other to form a double helix.", thumb: "DNA_Overview.png", cats: [0, 14] },
  { id: 20, title: "Internet", excerpt: "The Internet is the global system of interconnected computer networks that uses the Internet protocol suite to communicate.", thumb: null, cats: [4, 18] },
  { id: 21, title: "Elephant", excerpt: "Elephants are the largest living land animals. Three living species are currently recognised: the African bush elephant, the African forest elephant, and the Asian elephant.", thumb: "African_Bush_Elephant.jpg", cats: [1, 2, 10] },
  { id: 22, title: "Mars", excerpt: "Mars is the fourth planet from the Sun. The surface of Mars is orange-red because it is covered in iron(III) oxide dust, giving it the nickname 'the Red Planet'.", thumb: "OSIRIS_Mars_true_color.jpg", cats: [0, 19] },
  { id: 23, title: "Leonardo da Vinci", excerpt: "Leonardo di ser Piero da Vinci was an Italian polymath of the High Renaissance who is widely considered one of the greatest painters of all time.", thumb: "Leonardo_self.jpg", cats: [6, 8, 15] },
  { id: 24, title: "Beethoven", excerpt: "Ludwig van Beethoven was a German composer and pianist. He is one of the most admired composers in the history of Western music.", thumb: "Beethoven.jpg", cats: [5, 8, 15] },
  { id: 25, title: "Great Wall of China", excerpt: "The Great Wall of China is a series of fortifications that were built across the historical northern borders of ancient Chinese states.", thumb: "The_Great_Wall_of_China_at_Jinshanling-edit.jpg", cats: [3, 8, 16] },
  { id: 26, title: "Oxygen", excerpt: "Oxygen is a chemical element with the symbol O and atomic number 8. It is a member of the chalcogen group in the periodic table.", thumb: null, cats: [0, 13] },
  { id: 27, title: "Photosynthesis", excerpt: "Photosynthesis is a biological process used by many cellular organisms to convert light energy into chemical energy.", thumb: "Photosynthesis_en.svg.png", cats: [0, 14] },
  { id: 28, title: "World War II", excerpt: "World War II was a global conflict that lasted from 1939 to 1945. It involved the vast majority of the world's countries.", thumb: "WWII_collage.png", cats: [8] },
  { id: 29, title: "Shakespeare", excerpt: "William Shakespeare was an English playwright, poet, and actor. He is widely regarded as the greatest writer in the English language.", thumb: "Shakespeare.jpg", cats: [6, 8, 15] },
  { id: 30, title: "Artificial intelligence", excerpt: "Artificial intelligence (AI) is the intelligence of machines or software, as opposed to the intelligence of living beings, primarily of humans.", thumb: null, cats: [4, 17, 18] },
];

const artInsert = db.prepare("INSERT INTO articles (id, title, excerpt, thumb) VALUES (?, ?, ?, ?)");
const acInsert = db.prepare("INSERT INTO article_categories (article_id, category_id) VALUES (?, ?)");
const alInsert = db.prepare("INSERT INTO article_links (article_id, target_page_id) VALUES (?, ?)");

for (const art of articles) {
  artInsert.run(art.id, art.title, art.excerpt, art.thumb);
  for (const catId of art.cats) {
    acInsert.run(art.id, catId);
  }
}

// Add some inter-article links
const links = [
  [1, 2], [1, 14], [2, 1], [3, 4], [3, 22], [4, 3], [5, 6], [5, 30],
  [6, 5], [6, 20], [7, 18], [8, 23], [9, 25], [10, 11], [11, 10],
  [14, 21], [15, 14], [19, 27], [20, 30], [22, 3], [22, 4],
];
for (const [from, to] of links) {
  alInsert.run(from, to);
}

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ac_article ON article_categories(article_id);
  CREATE INDEX IF NOT EXISTS idx_ac_category ON article_categories(category_id);
  CREATE INDEX IF NOT EXISTS idx_al_article ON article_links(article_id);
  CREATE INDEX IF NOT EXISTS idx_cat_name ON categories(name);
`);

db.close();
console.log("Test database created at data/simple.db with 30 articles");
