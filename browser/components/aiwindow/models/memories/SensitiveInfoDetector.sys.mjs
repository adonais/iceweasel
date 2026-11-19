/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Detects and filters sensitive personal information from text
 *
 * Detects:
 * - Government IDs (SSN, SIN, INSEE, National Insurance number, NHS number)
 * - Financial information (credit cards, bank accounts, routing numbers)
 * - Contact information (email, phone number)
 * - Network Identifiers (IP addresses, MAC addresses)
 * - Physical addresses
 *
 */
import { CreditCard } from "resource://gre/modules/CreditCard.sys.mjs";

const SENSITIVE_KEYWORDS = {
  medical: [
    // English (en-US)
    "diagnosis",
    "symptom",
    "disease",
    "illness",
    "medical",
    "physician",
    "hospital",
    "clinic",
    "prescription",
    "medication",
    "therapist",
    "mental health",
    "depression",
    "anxiety",
    "ptsd",
    "adhd",
    "autism",
    "pregnancy",
    "pregnant",
    "fertility",
    "contraception",
    "abortion",
    "miscarriage",
    "cancer",
    "diabetes",
    "hiv",
    "aids",
    "std",
    "addiction",
    "rehab",
    "surgery",
    "emergency room",
    "psychiatrist",
    "psychologist",
    // English (en-GB)
    "nhs",
    "paediatric",
    "paediatrician",
    "anaesthetic",
    "anaesthetist",
    "haemophilia",
    "oestrogen",
    "foetus",
    // French (fr-FR)
    "diagnostic",
    "symptôme",
    "traitement",
    "maladie",
    "pathologie",
    "médical",
    "médecin",
    "docteur",
    "hôpital",
    "clinique",
    "ordonnance",
    "médicament",
    "thérapie",
    "thérapeute",
    "santé mentale",
    "dépression",
    "anxiété",
    "tspt",
    "tdah",
    "autisme",
    "grossesse",
    "enceinte",
    "fertilité",
    "avortement",
    "fausse couche",
    "diabète",
    "vih",
    "sida",
    "désintoxication",
    "chirurgie",
    "urgences",
    "psychiatre",
    "psychologue",
  ],
  finance: [
    // English (en-US)
    "salary",
    "income",
    "wage",
    "paycheck",
    "bank account",
    "routing number",
    "credit score",
    "fico",
    "loan",
    "mortgage",
    "foreclosure",
    "debt",
    "bankruptcy",
    "tax",
    "irs",
    "audit",
    "portfolio",
    "brokerage",
    "401k",
    "retirement account",
    "net worth",
    "credit report",
    "payday loan",
    "refinance",
    // English (en-GB)
    "pay cheque",
    "paycheque",
    "hmrc",
    "payslip",
    "sort code",
    "ccj",
    // French (fr-FR)
    "salaire",
    "revenu",
    "rémunération",
    "indemnité",
    "fiche de paie",
    "compte bancaire",
    "numéro de routage",
    "score de crédit",
    "prêt",
    "hypothèque",
    "saisie",
    "dette",
    "faillite",
    "recouvrement",
    "impôt",
    "contrôle fiscal",
    "investissement",
    "portefeuille",
    "courtage",
    "plan épargne retraite",
    "compte retraite",
    "patrimoine",
    "dossier de crédit",
    "prêt sur salaire",
    "refinancement",
  ],
  legal: [
    // English (en-US)
    "lawsuit",
    "litigation",
    "subpoena",
    "warrant",
    "arrest",
    "criminal",
    "felony",
    "misdemeanor",
    "immigration",
    "green card",
    "asylum",
    "deportation",
    "divorce",
    "custody",
    "restraining order",
    "nda",
    "non-disclosure",
    "attorney",
    "lawyer",
    "legal counsel",
    "indictment",
    "probation",
    "parole",
    // English (en-GB)
    "solicitor",
    "barrister",
    "magistrate",
    "injunction",
    "crown court",
    // French (fr-FR)
    "poursuite",
    "litige",
    "règlement",
    "assignation",
    "mandat",
    "arrestation",
    "condamnation",
    "pénal",
    "crime",
    "délit",
    "tribunal",
    "procès",
    "carte de résident",
    "asile",
    "expulsion",
    "garde",
    "ordonnance d'éloignement",
    "non-divulgation",
    "avocat",
    "juriste",
    "conseil juridique",
    "inculpation",
    "liberté conditionnelle",
  ],
  political: [
    // English (en-US)
    "democrat",
    "republican",
    "liberal",
    "conservative",
    "libertarian",
    "socialist",
    "communist",
    "fascist",
    "vote",
    "voting",
    "election",
    "campaign",
    "ballot",
    "political party",
    "leftist",
    "right-wing",
    "left-wing",
    // English (en-GB)
    "tory",
    "lib dem",
    "snp",
    "plaid cymru",
    // French (fr-FR)
    "démocrate",
    "républicain",
    "libéral",
    "conservateur",
    "progressiste",
    "libertarien",
    "socialiste",
    "communiste",
    "fasciste",
    "voter",
    "élection",
    "campagne",
    "bulletin de vote",
    "parti politique",
    "gauchiste",
  ],
  religion: [
    // English (en-US)
    "religion",
    "religious",
    "catholic",
    "protestant",
    "muslim",
    "islamic",
    "jewish",
    "judaism",
    "christian",
    "christianity",
    "buddhist",
    "buddhism",
    "hindu",
    "hinduism",
    "atheist",
    "atheism",
    "agnostic",
    "mosque",
    "church",
    "temple",
    "synagogue",
    "spiritual",
    "faith",
    "prayer",
    // French (fr-FR)
    "religieux",
    "catholique",
    "musulman",
    "islamique",
    "juif",
    "judaïsme",
    "chrétien",
    "christianisme",
    "bouddhiste",
    "bouddhisme",
    "hindou",
    "hindouisme",
    "athée",
    "athéisme",
    "agnostique",
    "mosquée",
    "église",
    "spirituel",
    "prière",
  ],
  demographics: [
    // English (en-US)
    "ethnicity",
    "racial",
    "ethnic",
    "sexual orientation",
    "gender identity",
    "transgender",
    "lgbtq",
    "lgbt",
    "gay",
    "lesbian",
    "bisexual",
    "queer",
    "non-binary",
    "cisgender",
    // French (fr-FR)
    "ethnicité",
    "ethnique",
    "orientation sexuelle",
    "identité de genre",
    "transgenre",
    "lesbienne",
    "bisexuel",
    "non-binaire",
    "cisgenre",
  ],
};

const ROUTING_KEYWORDS = [
  // English
  "routing number",
  "routing num",
  "routing no",
  "routing no.",
  "routing #",
  "ABA number",
  "ABA num",
  "ABA no",
  "ABA no.",
  "ABA #",
  "RTN",
  // French (fr-FR)
  "numéro de routage",
  "n° de routage",
  "numéro ABA",
  "n° ABA",
];

// Up to 5 words without digits or sentence punctuation, on the same line.
const KEYWORD_GAP = String.raw`(?:,?[^\S\n]+[^\s\d.!?:#]+){0,5}?`;

/**
 * Build a regex source matching any of the keywords as whole words, allowing
 * the spaces inside a keyword to be omitted.
 *
 * @param {string[]} keywords
 * @returns {string}
 */
function keywordPattern(keywords) {
  return String.raw`(?<!\w)(?:${keywords
    .map(keyword =>
      keyword
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/ /g, String.raw`[^\S\n]*`)
    )
    .join("|")})(?![a-z])`;
}

/**
 * Build a regex source matching a value with a keyword shortly before or
 * after it, in the same sentence and on the same line.
 *
 * @param {string} keyword - Regex source from keywordPattern
 * @param {string} value - Regex source for the value, which must contain a digit
 * @returns {string}
 */
function nearKeyword(keyword, value) {
  return String.raw`(?:${keyword}${KEYWORD_GAP},?[^\S\n]*[:#]?[^\S\n]*${value}|${value}${KEYWORD_GAP},?[^\S\n]+${keyword})`;
}

const ROUTING_KEYWORD = keywordPattern(ROUTING_KEYWORDS);
const ROUTING_DIGITS = String.raw`\b(?:0\d|1[0-2]|2[1-9]|3[0-2]|6[1-9]|7[0-2]|80)\d{7}\b`;

const NINO_KEYWORD = keywordPattern([
  "national insurance",
  "NI number",
  "NI num",
  "NI no",
  "NI no.",
  "NI #",
  "NINO",
]);
const NINO_PREFIX = String.raw`(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]`;

// Function words that appear in sentences but not in street names.
const STREET_STOPWORDS = new Set([
  // English
  ...(
    "a about an and are at be been but by down for from he her his i in " +
    "into is it its me my of off on onto or our out over she than that " +
    "the their them then these they this those to under up us was we were " +
    "with you your"
  ).split(" "),
  // French (fr-FR)
  ..."à au aux avec dans en est et ma mes mon par pour sur un une".split(" "),
]);

// Checks that exactly 10 national digits follow, each optionally preceded by a
// space or dash. The rest of the GB phone number pattern below controls where separators can go.
const GB_PHONE_NATIONAL_DIGITS = String.raw`(?=[127](?:[\s-]?\d){9}(?![\s-]?\d))`;

// Captures the street type, any particles, and the first word of the name.
const FR_STREET_ADDRESS = String.raw`\b\d{1,4}(?:\s?(?:bis|ter|quater))?\s+(rue|avenue|av\.?|boulevard|bd|place|impasse|all[ée]e|chemin|quai|cours|passage|route|square|voie|esplanade)\s+((?:(?:de|du|des|la|le|les)\s+|[dl]['’])*)([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*)`;

const FR_LOWERCASE_STREET_TYPES = new Set([
  "rue",
  "boulevard",
  "bd",
  "av.",
  "impasse",
  "allée",
  "allee",
  "quai",
  "chemin",
]);

// Additional French street types that are also English words, so require a French particle to match properly
const FR_STREET_TYPES_NEEDING_PARTICLE = new Set([
  "place",
  "route",
  "square",
  "passage",
  "esplanade",
]);

const PATTERNS = {
  ssn: {
    regex: /\b\d{3}([- ])\d{2}\1\d{4}\b/g,
    name: "ssn",
    description: "US Social Security Number",
    validator: validateSSN,
  },
  sin: {
    regex: /\b[1-79]\d{2}([- ])\d{3}\1\d{3}\b/g,
    name: "sin",
    description: "Canadian Social Insurance Number",
    validator: validateSIN,
  },
  insee: {
    regex:
      /\b[1-478]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
    name: "INSEE",
    description: "French National ID Number",
    validator: validateINSEE,
  },
  gb_nino: {
    regex: new RegExp(
      String.raw`\b${NINO_PREFIX} \d{2} \d{2} \d{2} [A-D]\b|${nearKeyword(NINO_KEYWORD, String.raw`\b${NINO_PREFIX}\d{6}[A-D]\b`)}`,
      "gi"
    ),
    name: "gb_nino",
    description: "UK National Insurance number",
  },
  gb_nhs: {
    regex: /\b[0-467]\d{2}([- ])\d{3}\1\d{4}\b/g,
    name: "gb_nhs",
    description: "UK NHS number",
    validator: validateNHSNumber,
  },
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    name: "email",
    description: "Email address",
  },
  phone: {
    regex:
      /(?:(?<![\w+])\+?1[-.\s]?)?(?:\([2-9]\d{2}\)\s?[2-9]\d{2}[-.\s]?|(?<![\w+])[2-9]\d{2}[-.\s][2-9]\d{2}[-.\s])\d{4}\b|(?<![\w+])\+1[2-9]\d{2}[2-9]\d{6}\b/g,
    name: "phone",
    description: "US & Canada phone number",
  },
  fr_phone: {
    regex:
      /(?:(?<![\w+])(?:\+|00)33[-.\s]?(?:\(0\)[-.\s]?)?[1-9](?:[-.\s]?\d{2}){4}|\b0[1-9]([-.\s])\d{2}(?:\1\d{2}){3})\b/g,
    name: "fr_phone",
    description: "French phone number",
  },
  gb_phone: {
    regex: new RegExp(
      String.raw`(?:(?<![\w+])(?:\+|00)44\s?(?:\(0\)\s?)?${GB_PHONE_NATIONAL_DIGITS}[127]\d{1,4}(?:[\s-]?\d{3,6}){0,2}|\b0${GB_PHONE_NATIONAL_DIGITS}[127]\d{1,4}(?:[\s-]\d{3,6}){1,2})(?![\s-]?\d)`,
      "g"
    ),
    name: "gb_phone",
    description: "UK phone number",
  },
  creditCard: {
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    name: "creditCard",
    description: "Credit card number",
    validator: validateCreditCard,
  },
  ipv4: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    name: "ipv4",
    description: "IPv4 address",
    validator: isPublicIPv4,
  },
  ipv6: {
    regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    name: "ipv6",
    description: "IPv6 address",
  },
  macAddress: {
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    name: "macAddress",
    description: "MAC address",
  },
  streetAddress: {
    regex:
      /\b\d{1,5}[A-Z]?\s(?:(?:[A-Z][a-z]+|\d+(?:st|nd|rd|th))\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b/gi,
    name: "streetAddress",
    description: "English-speaking country street address",
    validator: makeStreetAddressValidator(
      new Set([
        "street",
        "st",
        "avenue",
        "ave",
        "road",
        "rd",
        "boulevard",
        "blvd",
      ])
    ),
  },
  gb_streetAddress: {
    regex:
      /\b\d{1,5}[A-Z]?\s(?:(?:[A-Z][a-z]+|\d+(?:st|nd|rd|th))\s){1,3}(?:Close|Crescent|Gardens|Grove|Terrace|Mews)\b/gi,
    name: "gb_streetAddress",
    description: "UK street address",
    validator: makeStreetAddressValidator(
      new Set(["terrace", "crescent", "mews"])
    ),
  },
  fr_streetAddress: {
    regex: new RegExp(FR_STREET_ADDRESS, "gi"),
    name: "fr_streetAddress",
    description: "French street address",
    validator: validateFrenchStreetAddress,
  },
  gb_postcode: {
    regex: /\b[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s\d[ABD-HJLNP-UW-Z]{2}\b/gi,
    name: "gb_postcode",
    description: "UK postcode",
    validator: validateUKPostcode,
  },
  poBox: {
    regex: /\b(?:P\.?\s*O\.?|Post\s+Office)\s+Box\s+\d+\b/gi,
    name: "poBox",
    description: "PO Box address",
  },
  routingNumber: {
    regex: new RegExp(nearKeyword(ROUTING_KEYWORD, ROUTING_DIGITS), "gi"),
    name: "routingNumber",
    description: "Bank routing number",
    validator: validateRoutingNumber,
  },
};

const UK_POSTCODE_AREAS = new Set(
  (
    "AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA " +
    "DD DE DG DH DL DN DT DY E EC EH EN EX FK FY G GL GU GY HA HD HG HP HR " +
    "HS HU HX IG IM IP IV JE KA KT KW KY L LA LD LE LL LN LS LU M ME MK ML " +
    "N NE NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA SE SG SK SL " +
    "SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF " +
    "WN WR WS WV YO ZE"
  ).split(" ")
);

/**
 * Validate that an SSN uses an area, group and serial the SSA can issue
 *
 * @param {string} ssn
 * @returns {boolean} - True if the SSN could be issued
 */
function validateSSN(ssn) {
  const digits = ssn.replace(/\D/g, "");
  const area = Number(digits.slice(0, 3));
  return (
    area !== 0 &&
    area !== 666 &&
    area < 900 &&
    digits.slice(3, 5) !== "00" &&
    digits.slice(5) !== "0000"
  );
}

/**
 * Validate a SIN using the Luhn checksum
 *
 * @param {string} sin
 * @returns {boolean} - True if the SIN passes the Luhn check
 */
function validateSIN(sin) {
  const digits = sin.replace(/\D/g, "").split("").map(Number).reverse();
  const sum = digits.reduce((acc, digit, i) => {
    if (i % 2 === 0) {
      return acc + digit;
    }
    const doubled = digit * 2;
    return acc + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return sum % 10 === 0;
}

/**
 * Validate an INSEE number using its 2-digit key
 *
 * @param {string} insee
 * @returns {boolean} - True if the key matches the first 13 characters
 */
function validateINSEE(insee) {
  const compact = insee.replace(/\s/g, "");
  const body = Number(
    compact.slice(0, 13).replace("2A", "19").replace("2B", "18")
  );
  return 97 - (body % 97) === Number(compact.slice(13));
}

/**
 * Validate an NHS number using its modulus 11 check digit. Numbers below 320
 * are Scottish CHI numbers, which start with a DDMMYY date of birth.
 *
 * @param {string} nhsNumber
 * @returns {boolean} - True if the check digit matches
 */
function validateNHSNumber(nhsNumber) {
  const digits = nhsNumber.replace(/\D/g, "").split("").map(Number);
  if (digits[0] * 100 + digits[1] * 10 + digits[2] < 320) {
    const day = digits[0] * 10 + digits[1];
    const month = digits[2] * 10 + digits[3];
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return false;
    }
  }
  const sum = digits
    .slice(0, 9)
    .reduce((acc, digit, i) => acc + digit * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return check !== 10 && check === digits[9];
}

/**
 * Create a validator that double checks street address regex matches.
 *
 * Street addresses start with a number and end with a "road" word. It's possible
 * for the regex to catch unintended sequences, so this function servers as a
 * secondary check.
 *
 * REJECTED: "3 hours on the road" -> contains stopwords "on" and "the"
 * ACCEPTED: "123 main street"
 * ACCEPTED: "12 Hawthorn Close"
 *
 * @param {Set<string>} lowercaseSuffixes - Lowercase suffixes that can follow
 *   a lowercase street name
 * @returns {function(string): boolean}
 */
function makeStreetAddressValidator(lowercaseSuffixes) {
  return address => {
    const words = address.split(/\s+/);
    const nameWords = words.slice(1, -1);

    // Reject if the match contains stopwords (check for overly greedy matches)
    if (nameWords.some(word => STREET_STOPWORDS.has(word.toLowerCase()))) {
      return false;
    }

    return (
      lowercaseSuffixes.has(words.at(-1).toLowerCase()) ||
      nameWords.every(word => /^[A-Z\d]/.test(word))
    );
  };
}

/**
 * Create a validator that double checks street address regex matches.
 *
 * Street addresses start with a number and end with a "road" word. It's possible
 * for the regex to catch unintended sequences, so this function servers as a
 * secondary check.
 *
 * This is the French counterpart to makeStreetAddressValidator above
 *
 * REJECTED: "3 rue the day" -> English stopword "the"
 * REJECTED: "2 Square Feet" -> English word "square" without a French particle
 * ACCEPTED: "12 rue de la paix"
 * ACCEPTED: "3 place de la Concorde"
 *
 * @param {string} address
 * @returns {boolean} - True if the address passes the checks above and any
 *   street type that is also an English word is followed by a particle
 */
function validateFrenchStreetAddress(address) {
  const [, type, particles, name] = address.match(
    new RegExp(FR_STREET_ADDRESS, "i")
  );

  // Reject if the match contains stopwords (check for overly greedy matches)
  if (STREET_STOPWORDS.has(name.toLowerCase())) {
    return false;
  }

  // Reject if the street name isn't capitalized and contains a street word
  // that's also a common French word
  // This prevents overly greedy regex matches at the expense of some recall.
  if (
    !/^[A-ZÀ-ÖØ-Þ]/.test(name) &&
    !FR_LOWERCASE_STREET_TYPES.has(type.toLowerCase())
  ) {
    return false;
  }

  // Reject if a particle is needed but there isn't one
  return (
    !FR_STREET_TYPES_NEEDING_PARTICLE.has(type.toLowerCase()) || !!particles
  );
}

/**
 * Validate that a UK postcode starts with a real postcode area and doesn't
 * end in an ordinal like "2ND" or a storage size like "1TB"
 *
 * @param {string} postcode
 * @returns {boolean} - True if the postcode area exists and the postcode
 *   doesn't end in an ordinal or storage size
 */
function validateUKPostcode(postcode) {
  const upper = postcode.toUpperCase();
  return (
    UK_POSTCODE_AREAS.has(upper.match(/^[A-Z]+/)[0]) &&
    !/\s(?:1ST|2ND|3RD|[04-9]TH|\d[GPT]B)$/.test(upper)
  );
}

/**
 * Validate credit card number
 *
 * @param {string} cardNumber
 * @returns {boolena} - True if valid credit card number
 */
function validateCreditCard(cardNumber) {
  return CreditCard.isValidNumber(cardNumber);
}

/**
 * Check if IPv4 address is public (not private / local)
 *
 * @param {string} ip - IPv4 address
 * @returns {boolean} - True if public IP
 */
function isPublicIPv4(ip) {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  if (
    a === 10 || // 10.0.0.0/8 (private class A)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (private class B)
    (a === 192 && b === 168) || // 192.168.0.0/16 (private class C)
    a === 127 || // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local)
    a === 0 // 0.0.0.0/8 (Current network)
  ) {
    return false;
  }

  return true;
}

/**
 * Validate routing number using checksum algorithm.
 *
 * Logic based on https://en.wikipedia.org/wiki/Routing_transit_number#Check_digit
 *
 * @param {string} routingNumber - Text containing a 9-digit routing number
 *   and no other digits
 * @returns {boolean} - True if valid routing number
 */
function validateRoutingNumber(routingNumber) {
  const number = routingNumber.replace(/\D/g, "");
  if (!/^\d{9}$/.test(number)) {
    return false;
  }

  const digits = number.split("").map(Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
}

/**
 *
 */
export class SensitiveInfoDetector {
  constructor() {
    this.patterns = PATTERNS;
  }

  /**
   * Check if text contains any sensitive information.
   *
   * @param {string} text - Text to check
   * @returns {boolen} - True if sensitive info found
   */
  containsSensitiveInfo(text) {
    if (!text || typeof text !== "string") {
      return false;
    }

    for (const pattern of Object.values(this.patterns)) {
      const regex = new RegExp(pattern.regex);
      const matches = text.match(regex);

      if (matches) {
        if (pattern.validator) {
          for (const match of matches) {
            if (pattern.validator(match)) {
              return true;
            }
          }
        } else {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if text contains sensitive keywords related to medical, financial,
   * legal, political, religious, or demographic topics.
   *
   * @param {string} text - Text to check
   * @returns {boolean} - True if sensitive keywords found
   */
  containsSensitiveKeywords(text) {
    if (!text || typeof text !== "string") {
      return false;
    }

    const lowerText = text.toLowerCase();

    for (const category of Object.values(SENSITIVE_KEYWORDS)) {
      for (const keyword of category) {
        let pattern;
        if (keyword.endsWith("y")) {
          const stem = keyword.slice(0, -1);
          pattern = new RegExp(`\\b(?:${keyword}(?:e?s)?|${stem}ies)\\b`, "i");
        } else {
          pattern = new RegExp(`\\b${keyword}(?:e?s)?\\b`, "i");
        }
        if (pattern.test(lowerText)) {
          return true;
        }
      }
    }

    return false;
  }
}
