/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const MODULE = "resource://newtab/lib/Wallpapers/WallpaperFileNames.mjs";

ChromeUtils.defineESModuleGetters(this, {
  WALLPAPER_TYPES: MODULE,
  buildSavedWallpaperFilename: MODULE,
  getDetailsFilename: MODULE,
  parseWallpaperFilename: MODULE,
  sanitizeSavedName: MODULE,
});

const UUID = "550e8400-e29b-41d4-a716-446655440000";

add_task(async function test_buildSavedWallpaperFilename() {
  info("A saved wallpaper filename should carry type, theme and position");

  Assert.equal(
    buildSavedWallpaperFilename({
      type: WALLPAPER_TYPES.Custom,
      theme: "dark",
      position: "center",
      number: 1,
      uuid: UUID,
    }),
    `v1-custom-dark-center-1-${UUID}`
  );

  Assert.equal(
    buildSavedWallpaperFilename({
      type: WALLPAPER_TYPES.Builtin,
      theme: "light",
      position: "top right",
      number: 1,
      uuid: UUID,
    }),
    `v1-builtin-light-topright-1-${UUID}`,
    "A two word background position loses its space"
  );

  Assert.equal(
    buildSavedWallpaperFilename({
      type: WALLPAPER_TYPES.Custom,
      theme: "light",
      position: "somewhere else",
      number: 1,
      uuid: UUID,
    }),
    `v1-custom-light-center-1-${UUID}`,
    "A position we do not recognize falls back to center"
  );

  Assert.throws(
    () =>
      buildSavedWallpaperFilename({
        type: "something",
        theme: "light",
        position: "center",
        number: 1,
        uuid: UUID,
      }),
    /Unknown wallpaper type/,
    "An unknown type is refused"
  );

  Assert.throws(
    () =>
      buildSavedWallpaperFilename({
        type: WALLPAPER_TYPES.Custom,
        theme: "sepia",
        position: "center",
        number: 1,
        uuid: UUID,
      }),
    /Unknown wallpaper theme/,
    "An unknown theme is refused"
  );

  Assert.throws(
    () =>
      buildSavedWallpaperFilename({
        type: WALLPAPER_TYPES.Custom,
        theme: "light",
        position: "center",
        number: 1,
        uuid: "not-a-uuid",
      }),
    /lowercase UUID/,
    "Something that is not a UUID is refused"
  );

  Assert.throws(
    () =>
      buildSavedWallpaperFilename({
        type: WALLPAPER_TYPES.Custom,
        theme: "light",
        position: "center",
        number: 0,
        uuid: UUID,
      }),
    /counting number/,
    "Counting starts at one, so zero is refused"
  );

  Assert.throws(
    () =>
      buildSavedWallpaperFilename({
        type: WALLPAPER_TYPES.Custom,
        theme: "light",
        position: "center",
        uuid: UUID,
      }),
    /counting number/,
    "A saved wallpaper always has a number"
  );
});

add_task(async function test_parseWallpaperFilename() {
  info("Reading a filename back should give us what we wrote into it");

  Assert.deepEqual(parseWallpaperFilename(`v1-custom-dark-center-1-${UUID}`), {
    kind: "saved",
    type: "custom",
    theme: "dark",
    position: "center",
    number: 1,
    uuid: UUID,
  });

  Assert.deepEqual(
    parseWallpaperFilename(`v1-builtin-light-topright-1-${UUID}`),
    {
      kind: "saved",
      type: "builtin",
      theme: "light",
      position: "top right",
      number: 1,
      uuid: UUID,
    },
    "A two word position comes back with its space"
  );

  Assert.deepEqual(
    parseWallpaperFilename(`potd-light-${UUID}`),
    { kind: "unknown" },
    "The type token only means something in the second slot"
  );

  Assert.deepEqual(
    parseWallpaperFilename(`v1-custom-dark-center-1-${UUID}.txt`),
    {
      kind: "details",
      imageFilename: `v1-custom-dark-center-1-${UUID}`,
    },
    "A credit says which image it belongs to"
  );

  Assert.deepEqual(parseWallpaperFilename(`${UUID}.tmp`), {
    kind: "temporary",
  });

  Assert.deepEqual(
    parseWallpaperFilename(UUID),
    { kind: "legacy", uuid: UUID },
    "A bare UUID is a wallpaper from before the library"
  );

  for (const filename of [
    "",
    "holiday-photo.jpg",
    `v2-custom-dark-center-${UUID}`,
    `v1-custom-sepia-center-1-${UUID}`,
    "v1-custom-dark-center-1-not-a-uuid",
    // What someone calls their own file never reaches this, but a name that
    // looks like one of our own tokens must still be refused.
    "custom.png",
    "center.jpg",
    "builtin",
    "potd-sepia-nope",
  ]) {
    Assert.deepEqual(
      parseWallpaperFilename(filename),
      { kind: "unknown" },
      `"${filename}" is left alone`
    );
  }
});

add_task(async function test_getDetailsFilename() {
  Assert.equal(
    getDetailsFilename(`v1-builtin-light-topright-1-${UUID}`),
    `v1-builtin-light-topright-1-${UUID}.txt`,
    "An image's details sit next to it under the same name"
  );
});

add_task(async function test_sanitizeSavedName_cuts_on_a_sentence() {
  info("A screen reader reads this out, so it must not stop mid-word");

  const long =
    "Red Sea bannerfish (Heniochus intermedius), Red Sea, Egypt. The Red " +
    "Sea bannerfish attains as maximum length 18 cm and lives in the Red Sea.";

  Assert.equal(
    sanitizeSavedName(long),
    "Red Sea bannerfish (Heniochus intermedius), Red Sea, Egypt.",
    "It stops at the end of the first sentence"
  );

  // An abbreviation must not cut the name down to two letters, so the last
  // sentence ending in range wins rather than the first.
  Assert.equal(
    sanitizeSavedName(
      "St. Peter's Basilica, Rome, Italy. Built between 1506 and 1626 by " +
        "several architects including Michelangelo."
    ),
    "St. Peter's Basilica, Rome, Italy.",
    "An opening abbreviation is not mistaken for the end of a thought"
  );

  // Nothing ends in range, so it falls back to the last whole word.
  const noStop = `${"word ".repeat(40)}`.trim();
  const clipped = sanitizeSavedName(noStop);
  Assert.lessOrEqual(clipped.length, 100, "Still within the limit");
  Assert.ok(clipped.endsWith("word"), "And it ends on a whole word");

  Assert.equal(
    sanitizeSavedName("A heron at dawn"),
    "A heron at dawn",
    "A short one is left exactly as it is"
  );
});

add_task(async function test_sanitizeSavedName() {
  info("A title is only ever read aloud, so it is cleaned, not parsed");

  Assert.equal(
    sanitizeSavedName("Beach holiday.png"),
    "Beach holiday.png",
    "An ordinary name comes back unchanged"
  );
  Assert.equal(
    sanitizeSavedName("  spaced.png  "),
    "spaced.png",
    "Surrounding whitespace goes"
  );
  Assert.equal(
    sanitizeSavedName("line\nbreak.png"),
    "linebreak.png",
    "Control characters that would garble a label go"
  );
  Assert.equal(sanitizeSavedName(undefined), "", "A missing name is empty");
  Assert.equal(sanitizeSavedName(null), "", "A null name is empty");
  Assert.equal(
    sanitizeSavedName("a".repeat(500)).length,
    100,
    "A pathological name is capped"
  );
});
