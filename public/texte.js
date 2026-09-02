// Türkisch und Englisch für Snake.
//
// Deutsch steht im HTML und in den Aufrufen von `t()` bzw. als `text` in den
// Servermeldungen. Warteraum und Endstand kommen aus `schale-texte.js`.

import { SCHALE_WOERTER } from "./schale-texte.js";

const EIGEN = {
  tr: {
    "snake.tag": "Tek alan, bütün yılanlar, hiç yer yok.",
    "snake.runde": "Tur",
    "snake.laeuft": "sürüyor",
    "snake.pause": "Ara",
    "snake.wischen": "Kaydır ya da yön tuşlarını kullan.",
    "snake.runden": "Tur sayısı",

    // Was der Server schickt
    "snake.los": "Başla!",
    "snake.ueberlebt": "Turu {name} atlattı.",
    "snake.gleichzeitig": "Hepsi aynı anda – kimse kalmadı.",
    "snake.punkte": "{n} puan",
    "snake.gespielt": "{n} tur oynandı",

    // Die Hilfe
    "snake.h1": "<b>Bütün yılanlar tek alanda.</b> Herkesin kendi telefonu var, birbirinize karşı oynarsınız.",
    "snake.h2": "<b>Kaydırmak ya da yön tuşları</b> yönü değiştirir. Geri dönüş yoktur.",
    "snake.h3": "<b>Elmalar uzatır</b> ve 10 puan verir.",
    "snake.h4": "<b>Duvar, yabancı yılan, kendi gövden</b> – hepsi öldürür. En son hayatta kalan 20 puan alır.",
    "snake.h5": "<b>Hareket sunucuda işler</b>, böylece herkes aynı çarpışmayı görür.",
  },

  en: {
    "snake.tag": "One field, all the snakes, no room.",
    "snake.runde": "Round",
    "snake.laeuft": "running",
    "snake.pause": "Paused",
    "snake.wischen": "Swipe or use the arrow keys.",
    "snake.runden": "Rounds",

    // Was der Server schickt
    "snake.los": "Go!",
    "snake.ueberlebt": "{name} survives the round.",
    "snake.gleichzeitig": "All at once – nobody.",
    "snake.punkte": "{n} points",
    "snake.gespielt": "{n} rounds played",

    // Die Hilfe
    "snake.h1": "<b>All the snakes on one field.</b> Everyone has their own phone, and you play against each other.",
    "snake.h2": "<b>Swiping or the arrow keys</b> change direction. No turning back on yourself.",
    "snake.h3": "<b>Apples make you longer</b> and give 10 points.",
    "snake.h4": "<b>Wall, another snake, your own body</b> – all fatal. Whoever is last alive gets 20 points.",
    "snake.h5": "<b>The movement runs on the server</b>, so everyone sees the same crash.",
  },
};

export const WOERTER = {
  tr: { ...SCHALE_WOERTER.tr, ...EIGEN.tr },
  en: { ...SCHALE_WOERTER.en, ...EIGEN.en },
};
