/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Two Firefox releases can be served from one Remote Settings collection only
// if each build reads the aitab records for its own major and ignores the
// rest. These tasks publish aitab records at two majors through a fake client
// and check that loadPrompt() picks by FEATURE_MAJOR_VERSIONS.aitab (or by
// majorVersionOverride), never by "highest version".

const { loadPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);

const {
  MODEL_FEATURES,
  FEATURE_MAJOR_VERSIONS,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const AITAB = MODEL_FEATURES.AITAB;
const CURRENT_MAJOR = FEATURE_MAJOR_VERSIONS[AITAB];
const NEXT_MAJOR = CURRENT_MAJOR + 1;

/**
 * A complete aitab record set (params + the two modules) at one major, in the
 * shape the prompts updater publishes.
 *
 * @param {object} version
 * @param {number} version.major
 * @param {number} version.minor
 * @returns {object[]}
 */
function aitabRecords({ major, minor }) {
  const version = `${major}.${minor}`;
  const id = (module, model) => `aitab--${module}--${model}--v${major}`;
  return [
    {
      id: id("params", "generic"),
      kind: "params",
      feature: AITAB,
      model: "generic",
      version,
      is_default: true,
      purpose: "aitab",
      service_type: "ai",
      parameters: { temperature: 0.7 },
      modules: [
        { name: "system-instructions", version },
        { name: "user-data", version: `${major}.0` },
      ],
    },
    {
      id: id("system-instructions", "generic"),
      kind: "module",
      feature: AITAB,
      module: "system-instructions",
      model: "generic",
      version,
      prompts: `SYSTEM v${version}\n{schemas}`,
    },
    {
      id: id("user-data", "generic"),
      kind: "module",
      feature: AITAB,
      module: "user-data",
      model: "generic",
      version: `${major}.0`,
      prompts: `USER v${major}.0\n{focus}\n{pageContent}`,
    },
  ];
}

function publish(records) {
  _setRemoteClientForTesting({ get: async () => records });
}

registerCleanupFunction(() => {
  _clearRemoteClientForTesting();
});

add_task(async function test_build_reads_its_own_major_when_two_coexist() {
  // Current major at minor 4, next major at minor 0: the newer major must win
  // on major alone. A build pinned to the current major must still read the
  // current-major prompts even though 2.0 > 1.4.
  publish([
    ...aitabRecords({ major: CURRENT_MAJOR, minor: 4 }),
    ...aitabRecords({ major: NEXT_MAJOR, minor: 0 }),
  ]);

  const system = await loadPrompt(AITAB, {
    module: "system-instructions",
    model: "generic",
  });
  Assert.equal(
    system.prompt,
    `SYSTEM v${CURRENT_MAJOR}.4\n{schemas}`,
    "system-instructions come from the build's major, not the newest records"
  );
  Assert.equal(system.version, `${CURRENT_MAJOR}.4`, "reported version");

  const user = await loadPrompt(AITAB, {
    module: "user-data",
    model: "generic",
  });
  Assert.equal(
    user.prompt,
    `USER v${CURRENT_MAJOR}.0\n{focus}\n{pageContent}`,
    "user-data follows the same params manifest"
  );
});

add_task(async function test_next_release_reads_the_next_major() {
  // The same collection, seen by a build whose aitab major has been bumped.
  publish([
    ...aitabRecords({ major: CURRENT_MAJOR, minor: 4 }),
    ...aitabRecords({ major: NEXT_MAJOR, minor: 0 }),
  ]);

  const { prompt, version } = await loadPrompt(AITAB, {
    module: "system-instructions",
    model: "generic",
    majorVersionOverride: NEXT_MAJOR,
  });
  Assert.equal(prompt, `SYSTEM v${NEXT_MAJOR}.0\n{schemas}`);
  Assert.equal(version, `${NEXT_MAJOR}.0`);
});

add_task(async function test_minor_bumps_within_a_major_are_picked_up() {
  // A minor edit is published by updating the record in place; the build
  // follows the params manifest to the new module version.
  publish(aitabRecords({ major: CURRENT_MAJOR, minor: 4 }));
  let { version } = await loadPrompt(AITAB, {
    module: "system-instructions",
    model: "generic",
  });
  Assert.equal(version, `${CURRENT_MAJOR}.4`);

  publish(aitabRecords({ major: CURRENT_MAJOR, minor: 5 }));
  ({ version } = await loadPrompt(AITAB, {
    module: "system-instructions",
    model: "generic",
  }));
  Assert.equal(version, `${CURRENT_MAJOR}.5`, "the in-place minor bump wins");
});

add_task(async function test_missing_major_fails_loud() {
  // Only the next major is published: an old build must not fall forward onto
  // prompts written for a catalog it does not have.
  publish(aitabRecords({ major: NEXT_MAJOR, minor: 0 }));

  await Assert.rejects(
    loadPrompt(AITAB, { module: "system-instructions", model: "generic" }),
    err => err.clientReason === "v2ParamsUnavailable",
    "no params record at the build's major is an error, not a fallback"
  );
});
