/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AboutNewTabResourceMapping } = ChromeUtils.importESModule(
  "resource:///modules/AboutNewTabResourceMapping.sys.mjs"
);
const { NewTabGleanUtils } = ChromeUtils.importESModule(
  "resource://newtab/lib/NewTabGleanUtils.sys.mjs"
);

// When the XPI is train-hopped onto Beta or Release, every event in the
// runtime metrics payload, including existing events that gained extra_keys,
// must record with all of its allowed extra keys.
add_task(async function test_runtime_events_record_all_extra_keys() {
  // Runtime metrics are only registered when running from the XPI.
  if (!AboutNewTabResourceMapping.addonIsXPI) {
    Assert.ok(true, "Not running from the train-hop XPI");
    return;
  }

  await NewTabGleanUtils.registrationDone;

  const [version] = Services.appinfo.version.match(/\d+/);
  const data = await NewTabGleanUtils.readJSON(
    `resource://newtab/webext-glue/metrics/runtime-metrics-${version}.json`
  );

  let checked = 0;
  for (const [category, metrics] of Object.entries(data.metrics ?? {})) {
    for (const [name, config] of Object.entries(metrics)) {
      if (config.type !== "event") {
        continue;
      }
      const keys = config.extraArgs?.allowed_extra_keys ?? [];
      const extra = Object.fromEntries(keys.map(key => [key, "test"]));
      const metric =
        Glean[NewTabGleanUtils.dottedSnakeToCamel(category)][
          NewTabGleanUtils.dottedSnakeToCamel(name)
        ];

      metric.record(extra);

      // testGetValue throws if the event was rejected for an unknown key.
      const events = metric.testGetValue(config.pings[0]) ?? [];
      Assert.ok(
        events.some(event => keys.every(key => event.extra?.[key] === "test")),
        `${category}.${name} records all of its extra keys`
      );
      checked++;
    }
  }

  // Hosts with no runtime events still need a check to pass.
  Assert.ok(true, `Checked ${checked} runtime event(s) for ${version}`);
});
