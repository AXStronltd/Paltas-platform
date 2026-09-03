/**
 * City names, in the reader's language.
 *
 * `Intl.DisplayNames` knows countries and languages but not cities, so the
 * exonyms that actually differ are written down. It is a short list on purpose:
 * only the destinations PALTAS puts in a heading of its own, where "Explore
 * Gothenburg" would otherwise appear in the middle of a Swedish sentence.
 *
 * Everything else falls through unchanged, which is the right default in both
 * directions — most city names are the same in most languages, and a city a
 * host typed themselves is theirs to spell. A listing's own location line still
 * shows the host's words; these are ours.
 */

type Names = Record<string, string>;

/** Keyed by the canonical English name, which is what listings carry. */
const CITIES: Record<string, Names> = {
  "Cape Town": {
    ar: "كيب تاون", zh: "开普敦", de: "Kapstadt", es: "Ciudad del Cabo",
    fr: "Le Cap", it: "Città del Capo", pt: "Cidade do Cabo", lt: "Keiptaunas",
    sv: "Kapstaden", tr: "Cape Town",
    hi: "केप टाउन", ur: "کیپ ٹاؤن", am: "ኬፕ ታውን", so: "Keyp Taun",
  },
  Bali: {
    ar: "بالي", zh: "巴厘岛", hi: "बाली", ur: "بالی", am: "ባሊ", lt: "Balis",
  },
  Paris: {
    ar: "باريس", zh: "巴黎", es: "París", it: "Parigi", pt: "Paris",
    lt: "Paryžius", hi: "पेरिस", ur: "پیرس", am: "ፓሪስ", sv: "Paris",
  },
  Dubai: {
    ar: "دبي", zh: "迪拜", tr: "Dubai", lt: "Dubajus", hi: "दुबई",
    ur: "دبئی", am: "ዱባይ", sv: "Dubai",
  },
  "Abu Dhabi": {
    ar: "أبوظبي", zh: "阿布扎比", lt: "Abu Dabis", hi: "अबू धाबी",
    ur: "ابوظہبی", am: "አቡ ዳቢ",
  },
  Stockholm: {
    ar: "ستوكهولم", zh: "斯德哥尔摩", es: "Estocolmo", it: "Stoccolma",
    pt: "Estocolmo", lt: "Stokholmas", tr: "Stokholm", hi: "स्टॉकहोम",
    ur: "اسٹاک ہوم", am: "ስቶክሆልም",
  },
  Gothenburg: {
    sv: "Göteborg", de: "Göteborg", ar: "يوتيبوري", zh: "哥德堡",
    es: "Gotemburgo", fr: "Göteborg", it: "Göteborg", pt: "Gotemburgo",
    lt: "Geteborgas", tr: "Göteborg", hi: "गोथेनबर्ग", ur: "گوتھنبرگ",
    am: "ዬተቦሪ", so: "Göteborg",
  },
  London: {
    ar: "لندن", zh: "伦敦", es: "Londres", fr: "Londres", it: "Londra",
    pt: "Londres", lt: "Londonas", tr: "Londra", hi: "लंदन", ur: "لندن",
    am: "ለንደን", so: "London",
  },
  Marrakesh: {
    ar: "مراكش", zh: "马拉喀什", de: "Marrakesch", es: "Marrakech",
    fr: "Marrakech", it: "Marrakech", pt: "Marraquexe", lt: "Marakešas",
    tr: "Marakeş", sv: "Marrakech", hi: "मराकेश", ur: "مراکش", am: "ማራካሽ",
  },
  Zanzibar: {
    ar: "زنجبار", zh: "桑给巴尔", es: "Zanzíbar", fr: "Zanzibar",
    it: "Zanzibar", pt: "Zanzibar", lt: "Zanzibaras", hi: "ज़ांज़ीबार",
    ur: "زنجبار", am: "ዛንዚባር", sw: "Unguja",
  },
  Nairobi: {
    ar: "نيروبي", zh: "内罗毕", hi: "नैरोबी", ur: "نیروبی", am: "ናይሮቢ",
    lt: "Nairobis",
  },
  Mombasa: {
    ar: "مومباسا", zh: "蒙巴萨", hi: "मोम्बासा", ur: "مومباسا", am: "ሞምባሳ",
  },
  Kwale: { ar: "كوالي", zh: "夸莱", am: "ክዋሌ" },
  Naivasha: { ar: "نايفاشا", zh: "奈瓦沙", am: "ናይቫሻ" },
  Nanyuki: { ar: "نانيوكي", zh: "纳纽基", am: "ናንዩኪ" },
};

/**
 * The city as this reader would write it, or exactly as it was given.
 *
 * Falling through unchanged is deliberate: a host in a town we have never heard
 * of should see their own spelling, not a guess.
 */
export function cityName(city: string | null | undefined, locale: string): string {
  if (!city) return "";
  const names = CITIES[city];
  if (!names) return city;
  // "pt-BR" and "zh-Hans" should both find their base language.
  const base = locale.split("-")[0].toLowerCase();
  return names[base] ?? city;
}

/** Every city we carry a translation for, for tests to walk. */
export const TRANSLATED_CITIES = Object.keys(CITIES);
