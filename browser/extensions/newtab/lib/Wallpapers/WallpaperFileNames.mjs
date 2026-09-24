/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// An image is v1-<type>-<theme>-<position>-<number>-<uuid>. Its details file
// is <image>.txt and its picker thumbnail is <image>.thumb.

// The library lives one level down, where the wallpaper cleanup in older New Tab
// versions cannot reach it. That cleanup only removes files, never folders.
export const LIBRARY_DIRECTORY_NAME = "library";

const SAVED_WALLPAPER_VERSION = "v1";
const DETAILS_FILE_EXTENSION = ".txt";
const THUMBNAIL_FILE_EXTENSION = ".thumb";
const TEMPORARY_FILE_EXTENSION = ".tmp";

export const WALLPAPER_TYPES = {
  Custom: "custom",
  Builtin: "builtin",
  PictureOfTheDay: "potd",
};

// Every type above can be saved. A Picture of the Day is only kept when
// someone chooses "Set wallpaper", so it is an image like any other.
const SAVED_TYPES = Object.values(WALLPAPER_TYPES);

const THEMES = ["light", "dark"];

// Token in the filename to the CSS background-position it stands for.
const POSITIONS = new Map([
  ["center", "center"],
  ["top", "top"],
  ["bottom", "bottom"],
  ["left", "left"],
  ["right", "right"],
  ["topleft", "top left"],
  ["topright", "top right"],
  ["bottomleft", "bottom left"],
  ["bottomright", "bottom right"],
]);

const DEFAULT_POSITION = "center";

// Counts up once per saved image and is never reused, so an image keeps the
// same number for life even when an earlier one is removed. Never a position.
const NUMBER_PATTERN = /^[1-9][0-9]*$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A Remote Settings background_position as a filename token, "center" if we
// don't recognize it.
const encodeBackgroundPosition = position => {
  const token = String(position ?? "")
    .toLowerCase()
    .replace(/[\s-]/g, "");
  return POSITIONS.has(token) ? token : DEFAULT_POSITION;
};

const decodeBackgroundPosition = token =>
  POSITIONS.get(token) || DEFAULT_POSITION;

export const buildSavedWallpaperFilename = ({
  type,
  theme,
  position,
  number,
  uuid,
}) => {
  if (!SAVED_TYPES.includes(type)) {
    throw new Error(`Unknown wallpaper type: ${type}`);
  }
  if (!THEMES.includes(theme)) {
    throw new Error(`Unknown wallpaper theme: ${theme}`);
  }
  if (!NUMBER_PATTERN.test(String(number))) {
    throw new Error("Wallpaper filenames need a counting number");
  }
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error("Wallpaper filenames need a plain lowercase UUID");
  }
  const positionToken = encodeBackgroundPosition(position);
  return `${SAVED_WALLPAPER_VERSION}-${type}-${theme}-${positionToken}-${number}-${uuid}`;
};

// Longest name kept. It is sent with every library update and is only ever read
// aloud, so there is no reason to carry a pathological one.
const MAX_SAVED_NAME_LENGTH = 100;

// Below this, whatever ended the sentence was almost certainly an abbreviation
// rather than the end of a thought, so the whole name is not worth keeping.
const MIN_SENTENCE_NAME_LENGTH = 20;

// Cleans up a Picture of the Day description so a screen reader can read it
// out. An uploaded image never has one: it is numbered, and its file name is
// not kept.
export const sanitizeSavedName = savedName => {
  if (typeof savedName !== "string") {
    return "";
  }
  // Control characters would garble the label a screen reader reads out.
  // eslint-disable-next-line no-control-regex
  const printable = savedName.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (printable.length <= MAX_SAVED_NAME_LENGTH) {
    return printable;
  }

  // These run to a paragraph, and the opening sentences are the part worth
  // hearing: Wikimedia leads with the subject and where it was taken, then goes
  // into detail. Cutting on a character count alone ends mid-word, and a screen
  // reader reads that out as it stands.
  //
  // Greedy on purpose, so it takes the last sentence that ends in range rather
  // than the first. An abbreviation early on, "St. Peter's Basilica, Rome",
  // would otherwise cut the name down to "St.".
  const sentence = printable
    .slice(0, MAX_SAVED_NAME_LENGTH + 1)
    .match(/^.*[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= MIN_SENTENCE_NAME_LENGTH) {
    return sentence[0];
  }

  // No sentence ends in range, so fall back to the last whole word.
  const clipped = printable.slice(0, MAX_SAVED_NAME_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped;
};

export const getDetailsFilename = imageFilename =>
  `${imageFilename}${DETAILS_FILE_EXTENSION}`;

export const getThumbnailFilename = imageFilename =>
  `${imageFilename}${THUMBNAIL_FILE_EXTENSION}`;

const EXTRA_FILE_KINDS = [
  [DETAILS_FILE_EXTENSION, "details"],
  [THUMBNAIL_FILE_EXTENSION, "thumbnail"],
];

// Reads a filename back. `kind` is saved, details, thumbnail, temporary (.tmp),
// legacy (a bare UUID from before the library), or unknown.
export const parseWallpaperFilename = filename => {
  if (!filename) {
    return { kind: "unknown" };
  }

  if (filename.endsWith(TEMPORARY_FILE_EXTENSION)) {
    return { kind: "temporary" };
  }

  for (const [extension, kind] of EXTRA_FILE_KINDS) {
    if (filename.endsWith(extension)) {
      return { kind, imageFilename: filename.slice(0, -extension.length) };
    }
  }

  const parts = filename.split("-");

  if (parts[0] === SAVED_WALLPAPER_VERSION) {
    const [, type, theme, positionToken, number, ...rest] = parts;
    const uuid = rest.join("-");
    const known =
      SAVED_TYPES.includes(type) &&
      THEMES.includes(theme) &&
      POSITIONS.has(positionToken) &&
      NUMBER_PATTERN.test(number ?? "") &&
      UUID_PATTERN.test(uuid);
    if (known) {
      return {
        kind: "saved",
        type,
        theme,
        position: decodeBackgroundPosition(positionToken),
        number: Number(number),
        uuid,
      };
    }
    return { kind: "unknown" };
  }

  if (UUID_PATTERN.test(filename)) {
    return { kind: "legacy", uuid: filename };
  }

  return { kind: "unknown" };
};
