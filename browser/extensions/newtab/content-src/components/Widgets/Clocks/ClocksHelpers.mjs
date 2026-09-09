/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BASE_ZONE_IATA_CODES,
  CLOCK_CITIES,
  CLOCK_CITY_BY_ID,
  CLOCK_CITY_BY_NAME,
} from "./ClockCityRegistry.mjs";

// Fixed-order palette; each name needs a matching `.clocks-chip-<name>` in
// _Clocks.scss and drives isValidPaletteName's allow-list.
const LABEL_PALETTE = [
  "cyan",
  "green",
  "yellow",
  "purple",
  "red",
  "orange",
  "blue",
  "pink",
  "violet",
  "neutral",
];
const RANDOM_LABEL_PALETTE = LABEL_PALETTE.filter(
  colorName => colorName !== "neutral"
);

/**
 * Allow-list for `clock.labelColor` before interpolating it into a
 * `clocks-chip-<name>` class, so a malformed value can't inject classes.
 */
export function isValidPaletteName(paletteName) {
  return typeof paletteName === "string" && LABEL_PALETTE.includes(paletteName);
}

export function getRandomLabelColor() {
  return RANDOM_LABEL_PALETTE[
    Math.floor(Math.random() * RANDOM_LABEL_PALETTE.length)
  ];
}

const FIXED_DEFAULT_ZONES = [
  "Europe/Berlin",
  "Australia/Sydney",
  "America/New_York",
  "America/Los_Angeles",
];
export const MAX_CLOCK_COUNT = 4;

function is12HourLocale(locale) {
  try {
    const opts = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
    }).resolvedOptions();
    if (typeof opts.hour12 === "boolean") {
      return opts.hour12;
    }
    // On older platforms `hour12` may be missing; derive it from `hourCycle`.
    return opts.hourCycle === "h11" || opts.hourCycle === "h12";
  } catch (e) {
    return false;
  }
}

/**
 * Resolves 12h vs 24h. Pref ("12"/"24") wins over locale default.
 */
export function shouldUse12HourTimeFormat({ prefValue, locale }) {
  if (prefValue === "12") {
    return true;
  }
  if (prefValue === "24") {
    return false;
  }
  return is12HourLocale(locale);
}

/**
 * Read-only landing zones: local first, then fixed samples, deduped, cap 4.
 */
export function getDefaultTimeZones() {
  let localTz = null;
  try {
    localTz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    // Some environments can't resolve the local zone; fall back to the fixed set.
  }
  const result = [];
  const seen = new Set();
  if (localTz) {
    result.push(localTz);
    seen.add(localTz);
  }
  for (const tz of FIXED_DEFAULT_ZONES) {
    if (result.length >= 4) {
      break;
    }
    if (!seen.has(tz)) {
      result.push(tz);
      seen.add(tz);
    }
  }
  return result;
}

export function decorateDefaultZones(timeZones) {
  return timeZones.map(timeZone => ({
    timeZone,
    label: null,
    labelColor: null,
  }));
}

/**
 * Convenience wrapper returning the decorated default zones ready to render.
 */
export function buildDefaultZones() {
  return decorateDefaultZones(getDefaultTimeZones());
}

export const isValidTimeZone = timeZone => {
  if (typeof timeZone !== "string" || !timeZone) {
    return false;
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone }).format(new Date(0));
    return true;
  } catch (e) {
    return false;
  }
};

export const getSupportedTimeZones = () => {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const timeZones = Intl.supportedValuesOf("timeZone");
      if (timeZones.length) {
        return timeZones;
      }
    }
  } catch (e) {
    // Fall through to the fixed defaults below.
  }
  return FIXED_DEFAULT_ZONES;
};

/**
 * Returns a localized generic time-zone name, or the IANA id on failure.
 */
export const getLocalizedTimeZoneName = (timeZone, locale) => {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    const part = parts.find(p => p.type === "timeZoneName");
    return part?.value || timeZone;
  } catch (e) {
    return timeZone;
  }
};

export const buildLocalizedTimeZoneMap = (timeZones, locale) => {
  const map = new Map();
  for (const tz of timeZones) {
    map.set(tz, getLocalizedTimeZoneName(tz, locale));
  }
  return map;
};

const normalizeClockZone = clock => {
  const normalizedClock =
    typeof clock === "string" ? { timeZone: clock } : clock;
  if (!normalizedClock || !isValidTimeZone(normalizedClock.timeZone)) {
    return null;
  }
  const label =
    typeof normalizedClock.label === "string" && normalizedClock.label.trim()
      ? normalizedClock.label.trim()
      : null;
  const labelColor = isValidPaletteName(normalizedClock.labelColor)
    ? normalizedClock.labelColor
    : null;
  const city =
    typeof normalizedClock.city === "string" && normalizedClock.city.trim()
      ? normalizedClock.city.trim()
      : undefined;
  // Only a cityId still in the registry survives; a stale or hand-edited one
  // is dropped so the clock falls back to its stored city or zone name.
  const cityId =
    typeof normalizedClock.cityId === "string" &&
    CLOCK_CITY_BY_ID.has(normalizedClock.cityId.trim())
      ? normalizedClock.cityId.trim()
      : undefined;
  return {
    timeZone: normalizedClock.timeZone,
    ...(cityId !== undefined && { cityId }),
    ...(city !== undefined && { city }),
    label,
    labelColor,
  };
};

export const parseClockZonesPref = prefValue => {
  if (!prefValue) {
    return null;
  }
  try {
    const parsed =
      typeof prefValue === "string" ? JSON.parse(prefValue) : prefValue;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const clocks = parsed
      .map(normalizeClockZone)
      .filter(Boolean)
      .slice(0, MAX_CLOCK_COUNT);
    return clocks.length ? clocks : null;
  } catch (e) {
    return null;
  }
};

/**
 * Derives a human-readable city from an IANA zone id
 * (e.g. "America/Los_Angeles" -> "Los Angeles").
 */
export function getCityFromTimeZone(tz) {
  if (!tz) {
    return "";
  }
  const segments = tz.split("/");
  const last = segments[segments.length - 1];
  return last.replace(/_/g, " ");
}

/**
 * Builds a fresh clock-zone object for a newly-added or zone-changed
 * clock. Seeds `city` from the IANA id so the manage panel and aria
 * label have a display name before any user customization; label and
 * color start null and are filled in later only if the user adds a
 * nickname.
 */
export const buildClockZone = (
  timeZone,
  city = getCityFromTimeZone(timeZone),
  cityId = null
) => ({
  timeZone,
  city,
  ...(cityId ? { cityId } : {}),
  label: null,
  labelColor: null,
});

export const backfillClockLabelColors = clockZones =>
  clockZones.map(clock =>
    clock.label && !clock.labelColor
      ? {
          ...clock,
          labelColor: getRandomLabelColor(),
        }
      : clock
  );

// The same zone is spelled differently across tzdata vintages (Asia/Kolkata
// vs Asia/Calcutta); resolve both sides to whichever id this platform uses.
const canonicalZoneCache = new Map();
const canonicalTimeZone = timeZone => {
  if (!timeZone) {
    return "";
  }
  if (!canonicalZoneCache.has(timeZone)) {
    let canonical = timeZone;
    try {
      canonical = new Intl.DateTimeFormat(undefined, {
        timeZone,
      }).resolvedOptions().timeZone;
    } catch (e) {
      // Not a zone this platform knows; match on the id as given.
    }
    canonicalZoneCache.set(timeZone, canonical);
  }
  return canonicalZoneCache.get(timeZone);
};

// Either spelling of an abbreviated prefix should find the other.
const PREFIX_EXPANSIONS = [
  [/\bst\s/g, "saint "],
  [/\bft\s/g, "fort "],
  [/\bmt\s/g, "mount "],
];

/**
 * Folds accents, case and punctuation so matching ignores how a name is
 * written: "Washington, D.C." and "washington dc" normalize alike, as do
 * "America/Los_Angeles" and "los angeles". `+` and `:` survive for offsets.
 */
export const normalizeCityQuery = value => {
  const folded = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Dropped rather than spaced, so "D.C." folds to "dc" and not "d c".
    .replace(/['\u2019.]/g, "")
    .replace(/[^\p{L}\p{N}+:]+/gu, " ")
    .trim();
  return PREFIX_EXPANSIONS.reduce(
    (text, [pattern, expanded]) => text.replace(pattern, expanded),
    folded
  );
};

const MAX_CLOCK_RESULTS = 8;
// Below this, a query is too short for substring matches to be meaningful:
// "a" would otherwise return eight arbitrary cities.
const MIN_SUBSTRING_QUERY = 3;

// How well a key matched, best first; results sort on this.
const MATCH_EXACT = 0;
const MATCH_PREFIX = 1;
const MATCH_SUBSTRING = 2;
const MATCH_FUZZY = 3;
const MATCH_NONE = 4;

// Typo budget scales with length so short queries can't fuzzy-match everything.
const maxTypos = query => {
  if (query.length <= 3) {
    return 0;
  }
  if (query.length <= 6) {
    return 1;
  }
  return 2;
};

/**
 * Optimal string alignment distance (Levenshtein plus adjacent transposition),
 * answering only "within `max`?" so it can bail out a row at a time.
 */
const isWithinEditDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) {
    return false;
  }
  let twoRowsBack = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoRowsBack[j - 2] + 1);
      }
      current[j] = value;
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > max) {
      return false;
    }
    twoRowsBack = previous;
    previous = current;
  }
  return previous[b.length] <= max;
};

const matchScore = (searchKeys, query, { allowSubstring, allowFuzzy }) => {
  let best = MATCH_NONE;
  for (const key of searchKeys) {
    if (key === query) {
      return MATCH_EXACT;
    }
    if (key.startsWith(query)) {
      best = Math.min(best, MATCH_PREFIX);
    } else if (allowSubstring && key.includes(query)) {
      best = Math.min(best, MATCH_SUBSTRING);
    }
  }
  const budget = maxTypos(query);
  if (best === MATCH_NONE && allowFuzzy && budget) {
    for (const key of searchKeys) {
      if (isWithinEditDistance(key, query, budget)) {
        return MATCH_FUZZY;
      }
    }
  }
  return best;
};

export const buildNextClockZones = (clockZones, editingClockIndex, zone) =>
  editingClockIndex === null
    ? [...clockZones, zone]
    : clockZones.map((clock, index) =>
        index === editingClockIndex ? zone : clock
      );

export const removeClockZoneAtIndex = (clockZones, indexToRemove) =>
  clockZones.filter((_, index) => index !== indexToRemove);

/**
 * Compact code for a clock. A curated clock's `cityId` gives a locale-proof
 * code from the registry; otherwise fall back to the code for the display
 * name (curated by fallbackName, then base-zone/legacy), else the first three
 * non-whitespace characters upcased.
 */
export function getCityAbbreviation(cityName, cityId) {
  const byId = cityId && CLOCK_CITY_BY_ID.get(cityId);
  if (byId) {
    return byId.iataCode;
  }
  if (!cityName) {
    return "";
  }
  const byName = CLOCK_CITY_BY_NAME.get(cityName);
  if (byName) {
    return byName.iataCode;
  }
  if (BASE_ZONE_IATA_CODES[cityName]) {
    return BASE_ZONE_IATA_CODES[cityName];
  }
  return cityName.replace(/\s/g, "").slice(0, 3).toUpperCase();
}

// Display name for a saved clock: curated clocks resolve the current localized
// name from cityId (so they follow a locale switch); custom clocks use the
// stored city, falling back to the zone-derived name.
export const getClockCityDisplay = (clock, curatedNames = null) =>
  curatedNames?.[clock.cityId] ||
  clock.city ||
  CLOCK_CITY_BY_ID.get(clock.cityId)?.fallbackName ||
  getCityFromTimeZone(clock.timeZone);

/**
 * Returns the short name for a time zone at a given moment, like "CET"
 * or "EST". Pass the same `date` you use for formatTime: DST-observing
 * zones flip between two abbreviations (CET/CEST, EST/EDT) at the
 * transition boundary, and using a mismatched date can leave the
 * displayed time and the label out of sync. Falls back to the zone id
 * (e.g. "Europe/Berlin") if the platform can't produce a short name.
 */
export function getTimeZoneAbbreviation(tz, locale, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    const part = parts.find(p => p.type === "timeZoneName");
    return part?.value ?? tz;
  } catch (e) {
    return tz;
  }
}

/**
 * Current UTC offset of a zone as a compact label, e.g. "UTC+5:30",
 * "UTC-8", or "UTC". DST-dependent, so pass the same `date` you display.
 */
export const getTimeZoneOffsetLabel = (timeZone, date = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const raw = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) {
      return "UTC";
    }
    const [, sign, hours, minutes] = match;
    const h = String(parseInt(hours, 10));
    return `UTC${sign}${h}${minutes === "00" ? "" : `:${minutes}`}`;
  } catch (e) {
    return "";
  }
};

// Readable label for the custom-add zone picker, e.g. "Los Angeles · UTC-7".
export const formatCustomZoneLabel = (timeZone, date = new Date()) =>
  `${getCityFromTimeZone(timeZone)} · ${getTimeZoneOffsetLabel(timeZone, date)}`;

// Offset variants so "utc+5:30", "gmt+5:30", "+5:30", "+05:30", and "5:30"
// all match a zone at UTC+5:30.
const offsetSearchKeys = offsetLabel => {
  const match = offsetLabel.match(/UTC([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return ["utc"];
  }
  const [, sign, hours, minutes] = match;
  const hh = hours.padStart(2, "0");
  const min = minutes ? `:${minutes}` : "";
  const minPad = minutes ? `:${minutes}` : ":00";
  return [
    `utc${sign}${hours}${min}`,
    `utc${sign}${hh}${minPad}`,
    `gmt${sign}${hours}${min}`,
    `${sign}${hours}${min}`,
    `${sign}${hh}${minPad}`,
    `${hours}${min}`,
  ];
};

const dedupeKeys = keys => [...new Set(keys.filter(Boolean))];

// Localized country name per ISO 3166-1 alpha-2 code, "" where unavailable.
const buildRegionNameLookup = locale => {
  let displayNames = null;
  try {
    displayNames = new Intl.DisplayNames(locale, { type: "region" });
  } catch (e) {
    return () => "";
  }
  return code => {
    try {
      return displayNames.of(code) || "";
    } catch (e) {
      return "";
    }
  };
};

// Curated keys per canonical zone, so "mumbai" finds Asia/Calcutta in the zone
// picker. Localized names are not folded in; those belong to the city entries.
let curatedKeysByZone = null;
const getCuratedKeysByZone = () => {
  if (!curatedKeysByZone) {
    curatedKeysByZone = new Map();
    for (const entry of CLOCK_CITIES) {
      const zone = canonicalTimeZone(entry.timeZone);
      curatedKeysByZone.set(zone, [
        ...(curatedKeysByZone.get(zone) ?? []),
        normalizeCityQuery(entry.fallbackName),
        ...(entry.aliases ?? []).map(normalizeCityQuery),
      ]);
    }
  }
  return curatedKeysByZone;
};

const buildZoneEntries = (
  supportedTimeZones,
  localizedTimeZoneMap,
  locale,
  date
) => {
  const curatedKeys = getCuratedKeysByZone();
  return supportedTimeZones.map(timeZone => {
    const zone = canonicalTimeZone(timeZone);
    const city = getCityFromTimeZone(timeZone);
    const zoneName =
      localizedTimeZoneMap?.get(timeZone) ||
      getLocalizedTimeZoneName(timeZone, locale);
    const offsetLabel = getTimeZoneOffsetLabel(timeZone, date);
    return {
      kind: "zone",
      cityId: null,
      timeZone,
      zone,
      city,
      zoneName,
      offsetLabel,
      searchKeys: dedupeKeys([
        normalizeCityQuery(timeZone),
        normalizeCityQuery(city),
        normalizeCityQuery(zoneName),
        normalizeCityQuery(getTimeZoneAbbreviation(timeZone, locale, date)),
        ...offsetSearchKeys(offsetLabel).map(normalizeCityQuery),
        ...(curatedKeys.get(zone) ?? []),
      ]),
    };
  });
};

/**
 * One index behind both clock searches, so the add form and the custom-zone
 * picker match identically. Curated entries (`kind: "city"`) match their
 * en-US and localized names, aliases and country; zone entries
 * (`kind: "zone"`) match the IANA id, exemplar city, localized zone name,
 * abbreviation, UTC offset, and any curated name sharing that zone.
 */
export const buildClockSearchIndex = ({
  supportedTimeZones = [],
  localizedTimeZoneMap = null,
  curatedCities = CLOCK_CITIES,
  curatedNames = null,
  locale = undefined,
  date = new Date(),
} = {}) => {
  const regionNameOf = buildRegionNameLookup(locale);
  const zoneEntries = buildZoneEntries(
    supportedTimeZones,
    localizedTimeZoneMap,
    locale,
    date
  );
  // Curated cities show the same zone name as the zone they sit in.
  const zoneNameByZone = new Map(
    zoneEntries.map(entry => [entry.zone, entry.zoneName])
  );

  const cityEntries = curatedCities.map(entry => {
    const zone = canonicalTimeZone(entry.timeZone);
    const city = curatedNames?.[entry.id] || entry.fallbackName;
    return {
      kind: "city",
      cityId: entry.id,
      timeZone: entry.timeZone,
      zone,
      city,
      zoneName:
        zoneNameByZone.get(zone) ||
        getLocalizedTimeZoneName(entry.timeZone, locale),
      searchKeys: dedupeKeys([
        normalizeCityQuery(entry.fallbackName),
        normalizeCityQuery(city),
        ...(entry.aliases ?? []).map(normalizeCityQuery),
        // `id` is `<iso2>-<slug>`, so the country comes free.
        normalizeCityQuery(regionNameOf(entry.id.slice(0, 2).toUpperCase())),
      ]),
    };
  });

  return [...cityEntries, ...zoneEntries];
};

/**
 * Ranks the index against a query, best first, each entry carrying its
 * `score`. Exact and prefix always count; substring needs a query of at
 * least MIN_SUBSTRING_QUERY, and a typo-tolerant pass runs only when nothing
 * else matched. Pass `kinds` to restrict to curated cities or zones.
 */
export const filterClockSearchIndex = (
  index,
  query,
  { limit = MAX_CLOCK_RESULTS, kinds = null } = {}
) => {
  const normalized = normalizeCityQuery(query);
  if (!normalized) {
    return [];
  }
  const pool = kinds
    ? index.filter(entry => kinds.includes(entry.kind))
    : index;
  const allowSubstring = normalized.length >= MIN_SUBSTRING_QUERY;
  const rank = allowFuzzy =>
    pool
      .map(entry => ({
        entry,
        score: matchScore(entry.searchKeys, normalized, {
          allowSubstring,
          allowFuzzy,
        }),
      }))
      .filter(({ score }) => score < MATCH_NONE);

  let scored = rank(false);
  if (!scored.length) {
    scored = rank(true);
  }

  // A zone row a matched curated city already stands for is a duplicate
  // ("Kolkata" and "Calcutta" are one place), so drop it.
  const citiesMatchedZones = new Set(
    scored
      .filter(({ entry }) => entry.kind === "city")
      .map(({ entry }) => entry.zone)
  );
  return scored
    .filter(
      ({ entry }) =>
        entry.kind !== "zone" || !citiesMatchedZones.has(entry.zone)
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ entry, score }) => ({ ...entry, score }));
};

/**
 * Zone-only results for the custom-add picker, where the user names the city
 * themselves and only needs to land on a zone.
 */
export const filterCustomZoneResults = (
  index,
  query,
  limit = MAX_CLOCK_RESULTS
) =>
  filterClockSearchIndex(index, query, { limit, kinds: ["zone"] }).map(
    ({ timeZone, city, zoneName, offsetLabel }) => ({
      timeZone,
      city,
      zoneName,
      offsetLabel,
    })
  );

export const getClockFormDerivedState = ({
  canAddClock,
  clockSearchQuery,
  clockSelectedTimeZone,
  clockSelectedCity,
  clockSelectedCityId,
  isEditingClock,
  searchIndex = [],
}) => {
  const query = normalizeCityQuery(clockSearchQuery);
  const matches = filterClockSearchIndex(searchIndex, clockSearchQuery);
  const hasExactMatch = matches.some(({ score }) => score === MATCH_EXACT);
  const filteredResults = matches.map(entry => ({
    timeZone: entry.timeZone,
    city: entry.city,
    ...(entry.zoneName ? { zoneName: entry.zoneName } : {}),
    ...(entry.cityId ? { cityId: entry.cityId } : {}),
  }));

  let resolvedClockTimeZone = "";
  let resolvedClockCity = "";
  let resolvedClockCityId = "";
  if (clockSelectedTimeZone && isValidTimeZone(clockSelectedTimeZone)) {
    resolvedClockTimeZone = clockSelectedTimeZone;
    resolvedClockCity =
      clockSelectedCity || getCityFromTimeZone(clockSelectedTimeZone);
    resolvedClockCityId = clockSelectedCityId || "";
  } else if (query) {
    const zoneEntries = searchIndex.filter(entry => entry.kind === "zone");
    const exactCity = filteredResults.find(
      result => normalizeCityQuery(result.city) === query
    );
    const exactId = zoneEntries.find(
      entry => normalizeCityQuery(entry.timeZone) === query
    );
    if (exactCity) {
      resolvedClockTimeZone = exactCity.timeZone;
      resolvedClockCity = exactCity.city;
      resolvedClockCityId = exactCity.cityId || "";
    } else if (exactId) {
      resolvedClockTimeZone = exactId.timeZone;
      resolvedClockCity = exactId.city;
    } else {
      // A localized zone name that uniquely identifies one zone resolves too.
      const localizedMatches = zoneEntries.filter(
        entry => normalizeCityQuery(entry.zoneName) === query
      );
      if (localizedMatches.length === 1) {
        const [only] = localizedMatches;
        resolvedClockTimeZone = only.timeZone;
        resolvedClockCity = only.city;
      }
    }
  }

  return {
    canAddSelectedClock:
      (isEditingClock || canAddClock) && !!resolvedClockTimeZone,
    filteredResults,
    resolvedClockTimeZone,
    resolvedClockCity,
    resolvedClockCityId,
    hasExactMatch,
    showLocationDropdown: !!(query && !clockSelectedTimeZone),
  };
};

/**
 * Formats Date as a local datetime string (YYYY-MM-DDTHH:mm) in the given
 * timezone, suitable for <time>'s datetime attribute. Falls back to the UTC
 * ISO string if the platform can't format the zone.
 */
export function formatDateTimeAttr(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = type => parts.find(p => p.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch (e) {
    return date.toISOString();
  }
}

/**
 * Formats Date as hh:mm in a zone; "" if the zone can't be formatted.
 */
export function formatTime(date, tz, locale, hour12) {
  try {
    const opts = {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    };
    if (typeof hour12 === "boolean") {
      opts.hour12 = hour12;
    }
    return new Intl.DateTimeFormat(locale, opts).format(date);
  } catch (e) {
    return "";
  }
}

/**
 * Screen-reader label. Prepends label when present; omits the time until
 * it becomes available.
 */
export const buildClocksRowAriaLabel = (city, tzLabel, timeDisplay, label) => {
  const parts = label ? [label, city, tzLabel] : [city, tzLabel];
  if (timeDisplay) {
    parts.push(timeDisplay);
  }
  return parts.join(", ");
};
