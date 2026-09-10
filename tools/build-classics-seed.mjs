/**
 * Offline-Hilfsskript (NICHT Teil der Laufzeit, nicht in `package.json` `files`).
 *
 * Baut den Seed `assets/db-original.json` komplett neu aus einer kuratierten
 * Liste bekannter Belletristik-/Sachbuch-Titel (Harry Potter, Herr der Ringe,
 * Tribute von Panem, Das Rad der Zeit, Game of Thrones, …). Reihen tragen
 * `predecessorIsbn` / `successorIsbn`. Cover werden von Open Library geladen,
 * nach PNG konvertiert und nach `assets/public/covers/<isbn>.png` gelegt.
 *
 * Ablauf:
 *   1. Kandidaten (unten) – ~60 Titel, davon werden exakt 50 behalten.
 *   2. Pro ISBN Cover von covers.openlibrary.org holen (`default=false` → 404,
 *      wenn keins existiert). Titel ohne echtes Cover fallen raus.
 *   3. Reihen neu verketten (nur überlebende Bände), dann auf 50 trimmen
 *      (Reihen zuerst, dann Einzelbände in Kandidaten-Reihenfolge).
 *   4. Alte Cover löschen, neue als PNG schreiben, `assets/db-original.json`
 *      neu schreiben (`users` unverändert übernommen).
 *
 *   node tools/build-classics-seed.mjs
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const coversDir = join(repoRoot, 'assets', 'public', 'covers');
const seedPath = join(repoRoot, 'assets', 'db-original.json');
const TARGET_COUNT = 50;

/**
 * Kuratierte Kandidaten. `series: null` = Einzelband. `order` bestimmt die
 * Reihenfolge innerhalb einer Reihe (Prequels dürfen 0 / negativ sein).
 * ISBN-13 sind gängige Ausgaben; existiert dazu kein Open-Library-Cover, fällt
 * der Titel raus und wird durch einen späteren Einzelband ersetzt.
 */
const CANDIDATES = [
  // --- Harry Potter (J.K. Rowling / Bloomsbury) ---
  { series: 'Harry Potter', order: 1, title: 'Harry Potter and the Philosopher’s Stone', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747532699', numPages: 223, publishedAt: '1997-06-26', price: 12.99, abstract: 'Harry Potter has never heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment, they are swiftly confiscated by his aunt and uncle. Then, on Harry’s eleventh birthday, a giant of a man bursts in with news: Harry is a wizard, and a place awaits him at Hogwarts School of Witchcraft and Wizardry.' },
  { series: 'Harry Potter', order: 2, title: 'Harry Potter and the Chamber of Secrets', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747538493', numPages: 251, publishedAt: '1998-07-02', price: 12.99, abstract: 'Harry Potter’s summer with the Dursleys has been awful. He is counting the days back to Hogwarts when a warning from a house-elf named Dobby comes true and the Chamber of Secrets is opened once more – unleashing a monster that petrifies the school’s pupils one by one.' },
  { series: 'Harry Potter', order: 3, title: 'Harry Potter and the Prisoner of Azkaban', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747542155', numPages: 317, publishedAt: '1999-07-08', price: 13.99, abstract: 'When the Knight Bus crashes through the darkness and screeches to a halt in front of him, it is the start of another far-from-ordinary year at Hogwarts for Harry Potter. Sirius Black, escaped mass-murderer and follower of Lord Voldemort, is on the loose – and they say he is coming after Harry.' },
  { series: 'Harry Potter', order: 4, title: 'Harry Potter and the Goblet of Fire', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747546245', numPages: 636, publishedAt: '2000-07-08', price: 16.99, abstract: 'The Triwizard Tournament is to be held at Hogwarts. Only wizards who are over seventeen are allowed to enter – but that doesn’t stop Harry dreaming that he will win the competition. Then at Hallowe’en, when the Goblet of Fire makes its selection, Harry is amazed to find his name is one of those that the magical cup picks out.' },
  { series: 'Harry Potter', order: 5, title: 'Harry Potter and the Order of the Phoenix', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747551003', numPages: 766, publishedAt: '2003-06-21', price: 18.99, abstract: 'Dark times have come to Hogwarts. After the Dementors’ attack on his cousin Dudley, Harry Potter knows that Voldemort will stop at nothing to find him. There are many who deny the Dark Lord’s return, but Harry is not alone: a secret order gathers at Grimmauld Place to fight against the Dark forces.' },
  { series: 'Harry Potter', order: 6, title: 'Harry Potter and the Half-Blood Prince', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747581086', numPages: 607, publishedAt: '2005-07-16', price: 17.99, abstract: 'When Dumbledore arrives at Privet Drive one summer night to collect Harry Potter, his wand hand is blackened and shrivelled, but he does not reveal why. Meanwhile, for the first time in living memory, Hogwarts has a new Potions master and Harry finds an old book annotated by a mysterious Half-Blood Prince.' },
  { series: 'Harry Potter', order: 7, title: 'Harry Potter and the Deathly Hallows', author: 'J. K. Rowling', publisher: 'Bloomsbury', isbn: '9780747591054', numPages: 607, publishedAt: '2007-07-21', price: 19.99, abstract: 'As he climbs into the sidecar of Hagrid’s motorbike and takes to the skies, leaving Privet Drive for the last time, Harry Potter knows that Lord Voldemort and the Death Eaters are close behind. The protective charm that has kept him safe until now is broken, and the final battle must begin.' },

  // --- A Song of Ice and Fire (George R. R. Martin / Bantam) ---
  { series: 'A Song of Ice and Fire', order: 1, title: 'A Game of Thrones', subtitle: 'A Song of Ice and Fire, Book One', author: 'George R. R. Martin', publisher: 'Bantam Books', isbn: '9780553588484', numPages: 835, publishedAt: '1996-08-01', price: 14.99, abstract: 'In the game of thrones, you win or you die. Long ago, in a time forgotten, a preternatural event threw the seasons out of balance. Now, as winter approaches again, the noble houses of the Seven Kingdoms are drawn into a web of alliance and conflict from the frozen Wall in the north to the sun-drenched south.' },
  { series: 'A Song of Ice and Fire', order: 2, title: 'A Clash of Kings', subtitle: 'A Song of Ice and Fire, Book Two', author: 'George R. R. Martin', publisher: 'Bantam Books', isbn: '9780553579901', numPages: 761, publishedAt: '1998-11-16', price: 14.99, abstract: 'A comet the colour of blood and flame cuts across the sky. Six factions vie for control of a divided land, and the Iron Throne of the Seven Kingdoms awaits the winner. Through it all, the Stark children scatter across a war-torn continent while an exiled queen nurtures three young dragons.' },
  { series: 'A Song of Ice and Fire', order: 3, title: 'A Storm of Swords', subtitle: 'A Song of Ice and Fire, Book Three', author: 'George R. R. Martin', publisher: 'Bantam Books', isbn: '9780553573428', numPages: 973, publishedAt: '2000-08-08', price: 15.99, abstract: 'Of the five contenders for power, one is dead, one is in disfavour, and still the wars rage. Amid the chaos, Jon Snow rises among the Night’s Watch, Robb Stark wins battle after battle, and Daenerys Targaryen frees a city of slaves – but every triumph carries a terrible price.' },
  { series: 'A Song of Ice and Fire', order: 4, title: 'A Feast for Crows', subtitle: 'A Song of Ice and Fire, Book Four', author: 'George R. R. Martin', publisher: 'Bantam Books', isbn: '9780553582024', numPages: 1060, publishedAt: '2005-10-17', price: 15.99, abstract: 'The war in the Seven Kingdoms has burned itself out, but its survivors emerge into a changed landscape of ruined castles and unquiet dead. In the north, Cersei Lannister rules an uneasy regency, while in the Riverlands the smallfolk pick over the bones of the fallen.' },
  { series: 'A Song of Ice and Fire', order: 5, title: 'A Dance with Dragons', subtitle: 'A Song of Ice and Fire, Book Five', author: 'George R. R. Martin', publisher: 'Bantam Books', isbn: '9780553385953', numPages: 1056, publishedAt: '2011-07-12', price: 16.99, abstract: 'In the aftermath of a colossal battle, Daenerys Targaryen rules Meereen as queen of a city built on dust and death, beset by enemies. Far away, Tyrion Lannister has escaped King’s Landing with a price on his head, and at the Wall Jon Snow faces the fury of a betrayed people.' },

  // --- The Lord of the Rings + The Hobbit (J.R.R. Tolkien / Houghton Mifflin) ---
  { series: null, order: 0, title: 'The Hobbit', subtitle: 'or There and Back Again', author: 'J. R. R. Tolkien', publisher: 'Houghton Mifflin', isbn: '9780547928227', numPages: 300, publishedAt: '1937-09-21', price: 13.99, abstract: 'Bilbo Baggins is a hobbit who enjoys a comfortable, unambitious life, rarely travelling further than the pantry of his hobbit-hole. But his contentment is disturbed when the wizard Gandalf and a company of thirteen dwarves arrive to whisk him away on an adventure to reclaim a stolen treasure guarded by the dragon Smaug.' },
  { series: 'The Lord of the Rings', order: 1, title: 'The Fellowship of the Ring', subtitle: 'The Lord of the Rings, Part One', author: 'J. R. R. Tolkien', publisher: 'Houghton Mifflin', isbn: '9780547928210', numPages: 423, publishedAt: '1954-07-29', price: 15.99, abstract: 'In a sleepy village in the Shire, a young hobbit is entrusted with an immense task. He must make a perilous journey across Middle-earth to the Cracks of Doom, there to destroy the Ruling Ring of Power – the only thing that prevents the Dark Lord Sauron’s dominion.' },
  { series: 'The Lord of the Rings', order: 2, title: 'The Two Towers', subtitle: 'The Lord of the Rings, Part Two', author: 'J. R. R. Tolkien', publisher: 'Houghton Mifflin', isbn: '9780547928203', numPages: 352, publishedAt: '1954-11-11', price: 15.99, abstract: 'The Fellowship is scattered. Some are bracing hopelessly for war against the ancient evil of Mordor; others are contending with the treachery of the wizard Saruman. Frodo and Sam, meanwhile, are journeying into the very heart of the Shadow, guided by the treacherous Gollum.' },
  { series: 'The Lord of the Rings', order: 3, title: 'The Return of the King', subtitle: 'The Lord of the Rings, Part Three', author: 'J. R. R. Tolkien', publisher: 'Houghton Mifflin', isbn: '9780547928197', numPages: 416, publishedAt: '1955-10-20', price: 15.99, abstract: 'The armies of the Dark Lord are massing as his evil shadow spreads ever wider. Men, dwarves, elves and ents unite forces to do battle against the Dark. Meanwhile, Frodo and Sam struggle towards Mount Doom, the last stage of their journey to destroy the Ring of Power.' },

  // --- The Hunger Games / Tribute von Panem (Suzanne Collins / Scholastic) ---
  { series: 'The Hunger Games', order: 0, title: 'The Ballad of Songbirds and Snakes', subtitle: 'A Hunger Games Novel', author: 'Suzanne Collins', publisher: 'Scholastic Press', isbn: '9781338635171', numPages: 528, publishedAt: '2020-05-19', price: 16.99, abstract: 'It is the morning of the reaping that will kick off the tenth annual Hunger Games. In the Capitol, eighteen-year-old Coriolanus Snow is preparing for his one shot at glory as a mentor in the Games. The odds are against him: he has been given the humiliating assignment of mentoring the girl tribute from impoverished District 12.' },
  { series: 'The Hunger Games', order: 1, title: 'The Hunger Games', author: 'Suzanne Collins', publisher: 'Scholastic Press', isbn: '9780439023481', numPages: 374, publishedAt: '2008-09-14', price: 12.99, abstract: 'In the ruins of a place once known as North America lies the nation of Panem. The Capitol keeps the twelve districts in line by forcing them to send one boy and one girl to fight to the death in a televised Hunger Games. When her little sister is chosen, sixteen-year-old Katniss Everdeen volunteers to take her place.' },
  { series: 'The Hunger Games', order: 2, title: 'Catching Fire', author: 'Suzanne Collins', publisher: 'Scholastic Press', isbn: '9780439023498', numPages: 391, publishedAt: '2009-09-01', price: 12.99, abstract: 'Katniss Everdeen has survived the Hunger Games twice, but she has angered the Capitol by defying its rules. Now, as the districts stir with the first sparks of rebellion, President Snow makes it clear that the price of her survival – and her family’s – is very high indeed.' },
  { series: 'The Hunger Games', order: 3, title: 'Mockingjay', author: 'Suzanne Collins', publisher: 'Scholastic Press', isbn: '9780439023511', numPages: 390, publishedAt: '2010-08-24', price: 12.99, abstract: 'Katniss Everdeen has survived the arena twice, but nothing is safe. The Capitol wants revenge, and the rebels of District 13 want Katniss to become the Mockingjay – the symbol of their revolution – whatever the personal cost.' },

  // --- The Wheel of Time (Robert Jordan / Tor) ---
  { series: 'The Wheel of Time', order: 1, title: 'The Eye of the World', subtitle: 'The Wheel of Time, Book One', author: 'Robert Jordan', publisher: 'Tor Books', isbn: '9780812511819', numPages: 814, publishedAt: '1990-01-15', price: 14.99, abstract: 'The Wheel of Time turns and Ages come and pass. When the village of Emond’s Field is attacked by monstrous Trollocs, three young men flee into a wider world with the Aes Sedai Moiraine, who tells them that one of them may be the Dragon Reborn – the champion prophesied to save the world, or break it.' },
  { series: 'The Wheel of Time', order: 2, title: 'The Great Hunt', subtitle: 'The Wheel of Time, Book Two', author: 'Robert Jordan', publisher: 'Tor Books', isbn: '9780812517729', numPages: 705, publishedAt: '1990-11-15', price: 14.99, abstract: 'Rand al’Thor has been proclaimed neither Aes Sedai nor Warder, and yet he can channel the One Power. Now he must ride in pursuit of the stolen Horn of Valere, an artefact that can call dead heroes back from the grave to fight in the Last Battle.' },
  { series: 'The Wheel of Time', order: 3, title: 'The Dragon Reborn', subtitle: 'The Wheel of Time, Book Three', author: 'Robert Jordan', publisher: 'Tor Books', isbn: '9780812513714', numPages: 675, publishedAt: '1991-10-15', price: 14.99, abstract: 'Rand al’Thor has fled from those who would call him the Dragon Reborn, but the Pattern weaves on. Drawn towards the city of Tear and the sword Callandor, which only the true Dragon can wield, Rand must decide whether to embrace the destiny the world has thrust upon him.' },
  { series: 'The Wheel of Time', order: 4, title: 'The Shadow Rising', subtitle: 'The Wheel of Time, Book Four', author: 'Robert Jordan', publisher: 'Tor Books', isbn: '9780812513738', numPages: 981, publishedAt: '1992-09-15', price: 15.99, abstract: 'The seals of Shayol Ghul are weakening, and the Forsaken are loose upon the world. Rand al’Thor journeys into the Aiel Waste to learn the secret history of a proud desert people, while in the White Tower a hidden enemy moves against the Amyrlin Seat.' },
  { series: 'The Wheel of Time', order: 5, title: 'The Fires of Heaven', subtitle: 'The Wheel of Time, Book Five', author: 'Robert Jordan', publisher: 'Tor Books', isbn: '9780812550306', numPages: 963, publishedAt: '1993-10-15', price: 15.99, abstract: 'Prophecy is being fulfilled as Rand al’Thor leads the Aiel out of the Three-fold Land, but the way is barred by the renegade Couladin and by the Forsaken Rahvin, who has seized power in Andor. Meanwhile Nynaeve and Elayne hunt the Black Ajah across the nations.' },

  // --- Mistborn (Brandon Sanderson / Tor) ---
  { series: 'Mistborn', order: 1, title: 'Mistborn: The Final Empire', author: 'Brandon Sanderson', publisher: 'Tor Books', isbn: '9780765350381', numPages: 541, publishedAt: '2006-07-17', price: 13.99, abstract: 'For a thousand years the ash fell and no flowers bloomed. For a thousand years the Skaa slaved in misery and lived in fear while the Lord Ruler reigned with absolute power. Then a half-Skaa street urchin named Vin discovers she can wield the magic of Allomancy – and a notorious crew of thieves plans the ultimate heist.' },
  { series: 'Mistborn', order: 2, title: 'Mistborn: The Well of Ascension', author: 'Brandon Sanderson', publisher: 'Tor Books', isbn: '9780765356130', numPages: 590, publishedAt: '2007-08-21', price: 13.99, abstract: 'The Lord Ruler is dead, and the impossible has been accomplished. But now Vin and Elend must contend with the chaos left behind: three armies besiege their city, a mysterious mist-spirit stalks Vin, and the power hidden in the Well of Ascension may be the world’s only hope – or its doom.' },
  { series: 'Mistborn', order: 3, title: 'Mistborn: The Hero of Ages', author: 'Brandon Sanderson', publisher: 'Tor Books', isbn: '9780765356147', numPages: 572, publishedAt: '2008-10-14', price: 13.99, abstract: 'The ash falls ever harder, the mists kill, and the world slowly dies. Vin and Elend have discovered the secret at the heart of the Lord Ruler’s empire, but releasing the force imprisoned in the Well of Ascension may have doomed them all. Now the hunt for the hoards of the Lord Ruler is the last hope.' },

  // --- The Kingkiller Chronicle (Patrick Rothfuss / DAW) ---
  { series: 'The Kingkiller Chronicle', order: 1, title: 'The Name of the Wind', subtitle: 'The Kingkiller Chronicle: Day One', author: 'Patrick Rothfuss', publisher: 'DAW Books', isbn: '9780756404741', numPages: 662, publishedAt: '2007-03-27', price: 14.99, abstract: 'Told in Kvothe’s own voice, this is the tale of the magically gifted young man who grows to be the most notorious wizard his world has ever seen. From his childhood in a troupe of traveling players to his years spent as a near-feral orphan in a crime-ridden city, this is a masterpiece of storytelling.' },
  { series: 'The Kingkiller Chronicle', order: 2, title: 'The Wise Man’s Fear', subtitle: 'The Kingkiller Chronicle: Day Two', author: 'Patrick Rothfuss', publisher: 'DAW Books', isbn: '9780756407919', numPages: 994, publishedAt: '2011-03-01', price: 15.99, abstract: 'Kvothe continues the story of his life, recounting how he leaves the University to seek his fortune abroad. He crosses swords with a legendary assassin, learns the intricacies of the Fae realm, and inches ever closer to the truth about the Chandrian who murdered his family.' },

  // --- His Dark Materials (Philip Pullman / Knopf) ---
  { series: 'His Dark Materials', order: 1, title: 'The Golden Compass', subtitle: 'His Dark Materials, Book One', author: 'Philip Pullman', publisher: 'Alfred A. Knopf', isbn: '9780679879244', numPages: 399, publishedAt: '1995-07-09', price: 12.99, abstract: 'Lyra Belacqua and her daemon Pantalaimon live half-wild in the corridors of Jordan College, Oxford. When children begin to vanish, taken by the sinister Gobblers, Lyra travels north to a land of armoured bears and witch-clans to rescue her friend – and stumbles into a war that spans worlds.' },
  { series: 'His Dark Materials', order: 2, title: 'The Subtle Knife', subtitle: 'His Dark Materials, Book Two', author: 'Philip Pullman', publisher: 'Alfred A. Knopf', isbn: '9780679879251', numPages: 326, publishedAt: '1997-07-22', price: 12.99, abstract: 'In a sun-scorched, deserted city between the worlds, Lyra meets Will, a boy fleeing a killing. Together they find the subtle knife, a blade that can cut windows between universes – and become the most-wanted fugitives in every world they enter.' },
  { series: 'His Dark Materials', order: 3, title: 'The Amber Spyglass', subtitle: 'His Dark Materials, Book Three', author: 'Philip Pullman', publisher: 'Alfred A. Knopf', isbn: '9780679879268', numPages: 518, publishedAt: '2000-10-10', price: 13.99, abstract: 'Will and Lyra, whose fates are bound together, are drawn into a war of cosmic scale: the Authority’s forces gather, an ex-nun builds a spyglass that reveals the elusive Dust, and the two children must journey even to the land of the dead to set the universe right.' },

  // --- The Chronicles of Narnia (C. S. Lewis / HarperCollins) ---
  { series: 'The Chronicles of Narnia', order: 1, title: 'The Lion, the Witch and the Wardrobe', author: 'C. S. Lewis', publisher: 'HarperCollins', isbn: '9780064404990', numPages: 206, publishedAt: '1950-10-16', price: 8.99, abstract: 'Four siblings step through the back of a wardrobe into the frozen land of Narnia, held a hundred years in winter by the White Witch. With the great lion Aslan on the move, Lucy, Edmund, Susan and Peter are caught up in a battle to free Narnia from the Witch’s spell.' },
  { series: 'The Chronicles of Narnia', order: 2, title: 'Prince Caspian', subtitle: 'The Return to Narnia', author: 'C. S. Lewis', publisher: 'HarperCollins', isbn: '9780064405010', numPages: 223, publishedAt: '1951-10-15', price: 8.99, abstract: 'The Pevensie children are pulled back into Narnia to find that centuries have passed and their beloved land is oppressed by the Telmarines. Prince Caspian, the rightful king, has blown Susan’s magic horn, and a war for the soul of Narnia begins.' },
  { series: 'The Chronicles of Narnia', order: 3, title: 'The Voyage of the Dawn Treader', author: 'C. S. Lewis', publisher: 'HarperCollins', isbn: '9780064405027', numPages: 271, publishedAt: '1952-09-15', price: 8.99, abstract: 'Lucy and Edmund, along with their odious cousin Eustace, are swallowed into a painting and onto the deck of the Dawn Treader. King Caspian is sailing to the end of the world in search of seven lost lords – and the very edge of Aslan’s country.' },

  // --- Percy Jackson & the Olympians (Rick Riordan / Disney-Hyperion) ---
  { series: 'Percy Jackson and the Olympians', order: 1, title: 'The Lightning Thief', author: 'Rick Riordan', publisher: 'Disney-Hyperion', isbn: '9780786838653', numPages: 377, publishedAt: '2005-06-28', price: 9.99, abstract: 'Twelve-year-old Percy Jackson is on the most dangerous quest of his life. With the help of a satyr and a daughter of Athena, Percy must journey across the United States to catch a thief who has stolen the original weapon of mass destruction – Zeus’s master bolt.' },
  { series: 'Percy Jackson and the Olympians', order: 2, title: 'The Sea of Monsters', author: 'Rick Riordan', publisher: 'Disney-Hyperion', isbn: '9780786856855', numPages: 279, publishedAt: '2006-04-01', price: 9.99, abstract: 'After a summer spent trying to prevent a catastrophic war among the Greek gods, Percy Jackson finds his mission at Camp Half-Blood interrupted by bad news: the magical borders that protect the camp are failing, and only the Golden Fleece can save it.' },
  { series: 'Percy Jackson and the Olympians', order: 3, title: 'The Titan’s Curse', author: 'Rick Riordan', publisher: 'Disney-Hyperion', isbn: '9781423101451', numPages: 312, publishedAt: '2007-05-01', price: 9.99, abstract: 'When the goddess Artemis goes missing, she is believed to have been kidnapped. Now there is only one way to find her, and a prophecy that leads Percy and his friends on a desperate cross-country rescue against a rising army of monsters.' },

  // --- Dune (Frank Herbert / Ace) ---
  { series: 'Dune', order: 1, title: 'Dune', author: 'Frank Herbert', publisher: 'Ace Books', isbn: '9780441172719', numPages: 604, publishedAt: '1965-08-01', price: 13.99, abstract: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the spice melange. When treachery destroys his house, Paul is driven into the deep desert and a destiny greater than he could have imagined.' },
  { series: 'Dune', order: 2, title: 'Dune Messiah', author: 'Frank Herbert', publisher: 'Ace Books', isbn: '9780441172696', numPages: 331, publishedAt: '1969-10-01', price: 12.99, abstract: 'Twelve years after his victory over House Harkonnen, Paul Atreides rules as emperor and reluctant god, his jihad having claimed sixty billion lives. Now a web of conspiracy – spun by a Guild navigator, a Bene Gesserit, a Tleilaxu Face Dancer and Paul’s own sister – tightens around the throne.' },

  // --- Einzelbände: Sachbuch / moderne Klassiker (Reihenfolge = Priorität) ---
  { series: null, order: 0, title: 'The Willpower Instinct', subtitle: 'How Self-Control Works, Why It Matters, and What You Can Do to Get More of It', author: 'Kelly McGonigal', publisher: 'Avery', isbn: '9781583335086', numPages: 275, publishedAt: '2011-12-29', price: 17.00, abstract: 'Drawing on the latest research and the practical wisdom of her hugely popular Stanford course, health psychologist Kelly McGonigal explains what willpower is, how it works, and why it matters – for example, that willpower is a mind-body response, not a virtue, and that it can be strengthened like a muscle.' },
  { series: null, order: 0, title: 'How to Win Friends and Influence People', author: 'Dale Carnegie', publisher: 'Simon & Schuster', isbn: '9780671027032', numPages: 320, publishedAt: '1936-10-01', price: 15.99, abstract: 'One of the best-known motivational guides in history, Dale Carnegie’s classic distils decades of experience into simple principles: make friends quickly and easily, win people to your way of thinking, and become a better speaker and a more entertaining conversationalist.' },
  { series: null, order: 0, title: 'Atomic Habits', subtitle: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones', author: 'James Clear', publisher: 'Avery', isbn: '9780735211292', numPages: 320, publishedAt: '2018-10-16', price: 21.99, abstract: 'No matter your goals, Atomic Habits offers a proven framework for improving every day. James Clear reveals practical strategies that will teach you how to form good habits, break bad ones, and master the tiny behaviours that lead to remarkable results.' },
  { series: null, order: 0, title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', publisher: 'Farrar, Straus and Giroux', isbn: '9780374533557', numPages: 499, publishedAt: '2011-10-25', price: 20.00, abstract: 'The Nobel laureate Daniel Kahneman takes us on a groundbreaking tour of the mind and explains the two systems that drive the way we think: System 1 is fast, intuitive and emotional; System 2 is slower, more deliberative and more logical. He exposes the faults and biases of fast thinking.' },
  { series: null, order: 0, title: 'Sapiens', subtitle: 'A Brief History of Humankind', author: 'Yuval Noah Harari', publisher: 'Harper', isbn: '9780062316097', numPages: 443, publishedAt: '2015-02-10', price: 24.99, abstract: 'One hundred thousand years ago, at least six human species inhabited the earth. Today there is just one. Us. Sapiens explores how an unremarkable ape became the ruler of planet Earth – and asks what, if anything, we have learned from our tumultuous history.' },
  { series: null, order: 0, title: 'Deep Work', subtitle: 'Rules for Focused Success in a Distracted World', author: 'Cal Newport', publisher: 'Grand Central Publishing', isbn: '9781455586691', numPages: 296, publishedAt: '2016-01-05', price: 18.99, abstract: 'Deep work is the ability to focus without distraction on a cognitively demanding task – a skill that allows you to master complicated information and produce better results in less time. Cal Newport argues it is becoming increasingly rare and increasingly valuable.' },
  { series: null, order: 0, title: 'The Alchemist', author: 'Paulo Coelho', publisher: 'HarperOne', isbn: '9780061122415', numPages: 197, publishedAt: '1988-01-01', price: 16.99, abstract: 'Santiago, an Andalusian shepherd boy, dreams of finding a worldly treasure and sets out on a journey to the Egyptian pyramids. Along the way he meets a gypsy woman, a man who calls himself king, and an alchemist, all of whom point him toward his own Personal Legend.' },
  { series: null, order: 0, title: '1984', subtitle: 'Nineteen Eighty-Four', author: 'George Orwell', publisher: 'Signet Classics', isbn: '9780451524935', numPages: 328, publishedAt: '1949-06-08', price: 9.99, abstract: 'Winston Smith works for the Ministry of Truth in a nation ruled by the Party and its ever-watchful leader, Big Brother. Everything Winston does is monitored, thought is policed, and history is rewritten daily. Then he begins a forbidden diary – and a forbidden love affair.' },
  { series: null, order: 0, title: 'Brave New World', author: 'Aldous Huxley', publisher: 'Harper Perennial', isbn: '9780060850524', numPages: 288, publishedAt: '1932-01-01', price: 15.99, abstract: 'Far in the future, the World Controllers have created the ideal society: citizens are genetically engineered, conditioned from birth, and kept happy by the drug soma. Into this stable world comes a man raised outside it, and his presence forces everyone to confront what they have given up.' },
  { series: null, order: 0, title: 'Pride and Prejudice', author: 'Jane Austen', publisher: 'Penguin Classics', isbn: '9780141439518', numPages: 435, publishedAt: '1813-01-28', price: 8.99, abstract: 'When Elizabeth Bennet first meets the proud Mr Darcy, she declares she could never marry him. As the two are thrown together and apart across the drawing rooms of Regency England, first impressions give way to a slow and hard-won understanding.' },
  { series: null, order: 0, title: 'To Kill a Mockingbird', author: 'Harper Lee', publisher: 'Harper Perennial Modern Classics', isbn: '9780061120084', numPages: 336, publishedAt: '1960-07-11', price: 16.99, abstract: 'The unforgettable novel of a childhood in a sleepy Southern town and the crisis of conscience that rocked it. Through the eyes of Scout Finch, we watch her father, the lawyer Atticus Finch, defend a black man falsely accused, and learn what courage really means.' },
  { series: null, order: 0, title: 'The Little Prince', author: 'Antoine de Saint-Exupéry', publisher: 'Harcourt', isbn: '9780156012195', numPages: 96, publishedAt: '1943-04-06', price: 11.00, abstract: 'A pilot stranded in the desert meets a young prince fallen to Earth from a tiny asteroid. The prince’s childlike observations about grown-ups, love and loss have made this gentle fable one of the most translated books in the world.' },
  { series: null, order: 0, title: 'Good Omens', subtitle: 'The Nice and Accurate Prophecies of Agnes Nutter, Witch', author: 'Terry Pratchett', coAuthors: ['Neil Gaiman'], publisher: 'William Morrow', isbn: '9780060853983', numPages: 288, publishedAt: '1990-05-01', price: 17.99, abstract: 'According to The Nice and Accurate Prophecies of Agnes Nutter, the world will end on a Saturday. Next Saturday, in fact. The armies of Good and Evil are amassing, and the only people standing in the way of Armageddon are an angel and a demon who have grown rather fond of life on Earth.' },
  { series: null, order: 0, title: 'The Name of the Rose', author: 'Umberto Eco', publisher: 'Mariner Books', isbn: '9780156001311', numPages: 536, publishedAt: '1980-01-01', price: 17.99, abstract: 'In 1327, the Franciscan monk William of Baskerville arrives at a wealthy Italian abbey to attend a theological disputation, only to find the community terrorised by a series of bizarre deaths. As bodies accumulate, William turns detective, following a trail that leads into the abbey’s labyrinthine library.' },
  { series: null, order: 0, title: 'The Book Thief', author: 'Markus Zusak', publisher: 'Alfred A. Knopf', isbn: '9780375842207', numPages: 552, publishedAt: '2005-09-01', price: 12.99, abstract: 'Narrated by Death, this is the story of Liesel Meminger, a foster girl living outside Munich in Nazi Germany. Liesel scratches out a meagre existence by stealing when she encounters something she can’t resist – books – and shares them with her neighbours and with the Jewish man hidden in her basement.' },
  { series: null, order: 0, title: 'The Kite Runner', author: 'Khaled Hosseini', publisher: 'Riverhead Books', isbn: '9781594631931', numPages: 371, publishedAt: '2003-05-29', price: 17.00, abstract: 'Amir, the son of a wealthy Kabul merchant, and Hassan, the son of his father’s servant, are inseparable playmates until a single act of betrayal tears them apart. Years later, from a comfortable life in America, Amir returns to a Taliban-ruled Afghanistan to make amends.' },
  { series: null, order: 0, title: 'Man’s Search for Meaning', author: 'Viktor E. Frankl', publisher: 'Beacon Press', isbn: '9780807014295', numPages: 165, publishedAt: '1946-01-01', price: 15.00, abstract: 'Psychiatrist Viktor Frankl’s memoir of survival in Auschwitz and other Nazi concentration camps, and the school of psychotherapy he founded on what he learned there: that the primary human drive is not pleasure but the pursuit of what we find meaningful.' },
  { series: null, order: 0, title: 'The 7 Habits of Highly Effective People', author: 'Stephen R. Covey', publisher: 'Free Press', isbn: '9780743269513', numPages: 381, publishedAt: '1989-08-15', price: 19.99, abstract: 'Stephen Covey presents a principle-centred approach for solving personal and professional problems. With penetrating insights and pointed anecdotes, he reveals a step-by-step pathway for living with fairness, integrity, honesty and human dignity.' },
  { series: null, order: 0, title: 'Mindset', subtitle: 'The New Psychology of Success', author: 'Carol S. Dweck', publisher: 'Ballantine Books', isbn: '9780345472328', numPages: 320, publishedAt: '2006-02-28', price: 17.00, abstract: 'After decades of research, world-renowned Stanford psychologist Carol Dweck discovered a simple but groundbreaking idea: the power of mindset. She shows how success in almost every area of human endeavour can be dramatically influenced by how we think about our talents and abilities.' },
  { series: null, order: 0, title: 'The Power of Habit', subtitle: 'Why We Do What We Do in Life and Business', author: 'Charles Duhigg', publisher: 'Random House', isbn: '9780812981605', numPages: 371, publishedAt: '2012-02-28', price: 17.00, abstract: 'Award-winning business reporter Charles Duhigg takes us to the thrilling edge of scientific discoveries that explain why habits exist and how they can be changed, arguing that the key to exercising regularly, losing weight and being more productive is understanding how habits work.' },
];

async function fetchCover(isbn) {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return { ok: false, reason: `network: ${err.message}` };
  }
  if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };
  const buffer = Buffer.from(await res.arrayBuffer());
  // Open-Library-Blindbild ist ~800 Bytes; echte L-Cover sind deutlich größer.
  if (buffer.length < 3000) return { ok: false, reason: `too small (${buffer.length} B)` };
  return { ok: true, buffer };
}

async function main() {
  if (!existsSync('/usr/bin/sips')) {
    throw new Error('sips (macOS) nicht gefunden – wird zur PNG-Konvertierung gebraucht.');
  }

  // 1. Cover verifizieren.
  const survivors = [];
  for (const cand of CANDIDATES) {
    const cover = await fetchCover(cand.isbn);
    if (!cover.ok) {
      console.warn(`  ✗ ${cand.isbn}  ${cand.title}  (${cover.reason})`);
      continue;
    }
    survivors.push({ cand, buffer: cover.buffer });
    console.log(`  ✓ ${cand.isbn}  ${cand.title}`);
  }

  // 2. Reihen gruppieren + neu verketten (nur Überlebende), Einzelbände sammeln.
  const bySeries = new Map();
  const singles = [];
  for (const s of survivors) {
    if (s.cand.series) {
      if (!bySeries.has(s.cand.series)) bySeries.set(s.cand.series, []);
      bySeries.get(s.cand.series).push(s);
    } else {
      singles.push(s);
    }
  }

  const ordered = [];
  for (const [series, members] of bySeries) {
    members.sort((a, b) => a.cand.order - b.cand.order);
    members.forEach((m, i) => {
      m.series = series;
      m.predecessorIsbn = i > 0 ? members[i - 1].cand.isbn : null;
      m.successorIsbn = i < members.length - 1 ? members[i + 1].cand.isbn : null;
    });
    ordered.push(...members);
  }
  for (const s of singles) {
    s.predecessorIsbn = null;
    s.successorIsbn = null;
    ordered.push(s);
  }

  // 3. Auf exakt TARGET_COUNT trimmen: Reihen zuerst, dann Einzelbände nach Priorität.
  if (ordered.length < TARGET_COUNT) {
    console.warn(`\n⚠  Nur ${ordered.length} Titel mit Cover – Ziel ${TARGET_COUNT} nicht erreicht.`);
  }
  const finalList = ordered.slice(0, TARGET_COUNT);
  const keptIsbns = new Set(finalList.map((s) => s.cand.isbn));
  // Verweise kappen, falls ein Nachfolger dem Trim zum Opfer fiel.
  for (const s of finalList) {
    if (s.predecessorIsbn && !keptIsbns.has(s.predecessorIsbn)) s.predecessorIsbn = null;
    if (s.successorIsbn && !keptIsbns.has(s.successorIsbn)) s.successorIsbn = null;
  }

  // 4. Alte Cover löschen.
  for (const file of await fs.readdir(coversDir)) {
    if (file.endsWith('.png')) await fs.unlink(join(coversDir, file));
  }

  // 5. Neue Cover schreiben (JPEG → PNG via sips) + Buch-Datensätze bauen.
  const base = Date.parse('2024-01-01T09:00:00.000Z');
  const books = [];
  for (const [i, s] of finalList.entries()) {
    const { cand } = s;
    const tmpJpg = join(tmpdir(), `bm-cover-${cand.isbn}.jpg`);
    await fs.writeFile(tmpJpg, s.buffer);
    execFileSync(
      '/usr/bin/sips',
      ['-s', 'format', 'png', tmpJpg, '--out', join(coversDir, `${cand.isbn}.png`)],
      { stdio: 'ignore' },
    );
    await fs.unlink(tmpJpg);

    const ts = new Date(base + i * 3_600_000).toISOString();
    const book = {
      id: randomUUID(),
      title: cand.title,
      isbn: cand.isbn,
      abstract: cand.abstract,
      author: cand.author,
      publisher: cand.publisher,
      numPages: cand.numPages,
      cover: `http://localhost:4730/covers/${cand.isbn}.png`,
      userId: 1,
      publishedAt: cand.publishedAt,
      coAuthors: cand.coAuthors ?? [],
      price: cand.price,
      currency: 'EUR',
      predecessorIsbn: s.predecessorIsbn,
      successorIsbn: s.successorIsbn,
      createdAt: ts,
      updatedAt: ts,
    };
    if (cand.subtitle) {
      // Reihenfolge wie im alten Seed: subtitle direkt nach title.
      const { title, ...rest } = book;
      books.push({ title, subtitle: cand.subtitle, ...rest });
    } else {
      books.push(book);
    }
  }

  const existing = JSON.parse(readFileSync(seedPath, 'utf-8'));
  await fs.writeFile(
    seedPath,
    JSON.stringify({ users: existing.users, books }, null, 2) + '\n',
  );

  const seriesCount = finalList.filter((s) => s.cand.series).length;
  console.log(
    `\n${books.length} books (${seriesCount} in series, ${books.length - seriesCount} standalone), ` +
      `${books.length} covers → ${seedPath}`,
  );
}

await main();
