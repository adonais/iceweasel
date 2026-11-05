/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { JourneyStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/journeys/JourneyStore.sys.mjs"
);

const path = PathUtils.join(
  PathUtils.profileDir,
  "memories",
  "journeys.json.lz4"
);

add_setup(async function setup() {
  registerCleanupFunction(async () => {
    await JourneyStore.clear();
    await JourneyStore.testOnlyFlushAndResetCache();
  });
  await JourneyStore.testOnlyFlushAndResetCache();
  await IOUtils.remove(path, { ignoreAbsent: true });
});

add_task(async function test_init_empty_state() {
  Assert.deepEqual(
    await JourneyStore.getAll(),
    [],
    "A missing file starts empty"
  );
});

add_task(function singleton_identity() {
  const imported = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/memories/journeys/JourneyStore.sys.mjs"
  );
  Assert.strictEqual(
    imported.JourneyStore,
    JourneyStore,
    "Repeated imports return the same JourneyStore instance"
  );
});

add_task(async function metadata_persistence_round_trip() {
  try {
    const expected = {
      memory_id: "memory-1",
      headline: "Compare hotels",
      status: "Compared two hotels.",
      dismissed: false,
      dismissed_until: null,
    };

    Assert.strictEqual(
      await JourneyStore.addOrUpdateJourney({
        memoryId: "memory-1",
        headline: expected.headline,
        status: expected.status,
      }),
      true,
      "Creating metadata returns true"
    );
    Assert.deepEqual(
      await JourneyStore.get("memory-1"),
      expected,
      "New journey defaults to not dismissed and null dismissal time"
    );
    Assert.strictEqual(
      await JourneyStore.addOrUpdateJourney({
        memoryId: "memory-1",
        dismissed: true,
        dismissed_until: 1000,
      }),
      true,
      "Updating dismissal fields returns true"
    );
    expected.dismissed = true;
    expected.dismissed_until = 1000;
    Assert.deepEqual(
      await JourneyStore.get("memory-1"),
      expected,
      "Updates to dismissal fields preserve other metadata fields"
    );

    Assert.strictEqual(
      await JourneyStore.addOrUpdateJourney({
        memoryId: "memory-1",
        headline: "Book a hotel",
        status: "Selected a hotel.",
      }),
      true,
      "Refreshing generated text returns true"
    );
    expected.headline = "Book a hotel";
    expected.status = "Selected a hotel.";

    Assert.strictEqual(
      await JourneyStore.addOrUpdateJourney({ memoryId: "memory-1" }),
      true,
      "An empty update to existing metadata returns true"
    );

    const record = await JourneyStore.get("memory-1");
    Assert.deepEqual(
      record,
      expected,
      "Text refresh preserves dismissal state while updating text"
    );

    const records = await JourneyStore.getAll();
    Assert.deepEqual(
      records,
      [expected],
      "getAll returns all records, including suppressed ones"
    );

    record.headline = "Changed outside the store";
    Assert.deepEqual(
      await JourneyStore.get("memory-1"),
      expected,
      "Changing a get result does not change stored metadata"
    );
    records[0].status = "Changed outside the store";
    records.length = 0;
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [expected],
      "Changing getAll records or its array does not change stored metadata"
    );

    await JourneyStore.testOnlyFlushAndResetCache();
    Assert.deepEqual(
      await JourneyStore.get("memory-1"),
      expected,
      "Flush + reset reloads the created and updated metadata from disk"
    );
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function delete_and_clear() {
  try {
    const fields = {
      headline: "Compare hotels",
      status: "Compared two hotels.",
    };

    for (const id of ["memory-1", "memory-2", "memory-3"]) {
      await JourneyStore.addOrUpdateJourney({ memoryId: id, ...fields });
    }
    await JourneyStore.testOnlyFlushAndResetCache();

    Assert.strictEqual(
      await JourneyStore.deleteJourney("memory-1"),
      true,
      "Removing an existing entry returns true"
    );
    Assert.strictEqual(
      await JourneyStore.get("memory-1"),
      null,
      "Entry is removed"
    );
    Assert.strictEqual(
      await JourneyStore.deleteJourney("memory-1"),
      false,
      "Removing an absent entry returns false"
    );
    const remaining = [
      await JourneyStore.get("memory-2"),
      await JourneyStore.get("memory-3"),
    ];
    Assert.deepEqual(
      (await JourneyStore.getAll()).sort((a, b) =>
        a.memory_id.localeCompare(b.memory_id)
      ),
      remaining,
      "Removing one entry leaves the others unchanged"
    );

    await JourneyStore.testOnlyFlushAndResetCache();
    Assert.deepEqual(
      (await JourneyStore.getAll()).sort((a, b) =>
        a.memory_id.localeCompare(b.memory_id)
      ),
      remaining,
      "Removal persists after reopening"
    );

    await JourneyStore.clear();
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [],
      "Clear removes every entry"
    );

    await JourneyStore.testOnlyFlushAndResetCache();
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [],
      "Clear persists after reopening"
    );
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function drops_invalid_records_on_load() {
  try {
    await JourneyStore.testOnlyFlushAndResetCache();
    const usable = {
      memory_id: "memory-1",
      headline: "Compare hotels",
      status: "Compared two hotels.",
      dismissed: true,
      dismissed_until: 1000,
    };
    const unusable = [
      null,
      "memory-2",
      [],
      { headline: "No ID", status: "No ID." },
      { memory_id: "   ", headline: "Blank ID", status: "Blank ID." },
      { memory_id: "memory-3", status: "No headline." },
      { memory_id: "memory-4", headline: "No status." },
      { memory_id: "memory-5", headline: "", status: "Blank headline." },
      {
        memory_id: "memory-6",
        headline: "Bad dismissal",
        status: "Bad.",
        dismissed: "true",
      },
      {
        memory_id: "memory-7",
        headline: "Bad expiry",
        status: "Bad.",
        dismissed_until: -1,
      },
    ];

    await IOUtils.writeJSON(
      path,
      { version: 1, journeys_metadata: [usable, ...unusable] },
      { compress: true }
    );
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [usable],
      "Loading drops invalid records and preserves the valid record"
    );
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function rejects_unsupported_store_shapes() {
  try {
    const usable = {
      memory_id: "memory-1",
      headline: "Compare hotels",
      status: "Compared two hotels.",
      dismissed: true,
      dismissed_until: 1000,
    };
    const cases = [
      {
        name: "Unsupported version",
        contents: { version: 2, journeys_metadata: [usable] },
      },
      {
        name: "Records are an object instead of an array",
        contents: { version: 1, journeys_metadata: {} },
      },
      { name: "Missing records", contents: { version: 1 } },
      { name: "Top-level array", contents: [usable] },
      { name: "Top-level string", contents: "not an object" },
    ];
    for (const { name, contents } of cases) {
      await JourneyStore.testOnlyFlushAndResetCache();
      await IOUtils.writeJSON(path, contents, { compress: true });
      Assert.deepEqual(
        await JourneyStore.getAll(),
        [],
        `${name} loads as an empty store`
      );
    }
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function drops_unknown_fields_on_load() {
  try {
    await JourneyStore.testOnlyFlushAndResetCache();
    const expected = {
      memory_id: "memory-1",
      headline: "Compare hotels",
      status: "Compared two hotels.",
      dismissed: true,
      dismissed_until: 1000,
    };
    await IOUtils.writeJSON(
      path,
      { version: 1, journeys_metadata: [{ ...expected, unknown: true }] },
      { compress: true }
    );
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [expected],
      "Loading retains supported fields only"
    );
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function defaults_missing_dismissal_fields_on_load() {
  try {
    await JourneyStore.testOnlyFlushAndResetCache();
    const record = {
      memory_id: "memory-1",
      headline: "Compare hotels",
      status: "Compared two hotels.",
    };
    await IOUtils.writeJSON(
      path,
      { version: 1, journeys_metadata: [record] },
      { compress: true }
    );
    Assert.deepEqual(
      await JourneyStore.getAll(),
      [{ ...record, dismissed: false, dismissed_until: null }],
      "Loading supplies correct default values for omitted dismissal fields"
    );
  } finally {
    await JourneyStore.clear();
  }
});

add_task(async function validates_before_storing() {
  try {
    const fields = {
      headline: "Compare hotels",
      status: "Compared two hotels.",
      dismissed: false,
      dismissed_until: null,
    };
    const expected = [{ memory_id: "existing", ...fields }];

    await JourneyStore.addOrUpdateJourney({ memoryId: "existing", ...fields });

    for (const memoryId of ["", "   ", null, undefined, 42]) {
      await Assert.rejects(
        JourneyStore.addOrUpdateJourney({ memoryId, ...fields }),
        /TypeError/,
        `Reject invalid memory ID: ${String(memoryId)}`
      );
    }

    await Assert.rejects(
      JourneyStore.addOrUpdateJourney(fields),
      /TypeError/,
      "Reject inputs missing a memory ID"
    );

    for (const invalid of [null, undefined, [], "headline"]) {
      await Assert.rejects(
        JourneyStore.addOrUpdateJourney(invalid),
        /TypeError/,
        `Reject invalid journey argument: ${String(invalid)}`
      );
      Assert.deepEqual(
        await JourneyStore.getAll(),
        expected,
        "Rejected arguments do not change stored metadata"
      );
    }

    const invalidFields = [
      { headline: "" },
      { headline: "   " },
      { headline: 42 },
      { headline: undefined },
      { status: "" },
      { status: "   " },
      { status: null },
      { status: undefined },
      { dismissed: "false" },
      { dismissed: null },
      { dismissed: undefined },
      { dismissed_until: -1 },
      { dismissed_until: 1.5 },
      { dismissed_until: Number.MAX_SAFE_INTEGER + 1 },
      { dismissed_until: NaN },
      { dismissed_until: Infinity },
      { dismissed_until: "1000" },
      { dismissed_until: undefined },
      { memory_id: "replacement" },
      { unknown: true },
    ];
    for (const memoryId of ["new", "existing"]) {
      for (const [index, invalid] of invalidFields.entries()) {
        const input = {
          memoryId,
          ...fields,
          headline: "Changed headline",
          ...invalid,
        };
        await Assert.rejects(
          JourneyStore.addOrUpdateJourney(input),
          /TypeError/,
          `Reject invalid fields case ${index} for ${memoryId}`
        );
        Assert.deepEqual(
          await JourneyStore.getAll(),
          expected,
          "Rejected input neither creates a record nor partially updates one"
        );
      }
    }

    for (const incomplete of [
      {},
      { headline: fields.headline },
      { status: fields.status },
      { dismissed: true },
    ]) {
      Assert.strictEqual(
        await JourneyStore.addOrUpdateJourney({
          memoryId: "new",
          ...incomplete,
        }),
        false,
        "Creation requires both headline and status"
      );
    }
    Assert.deepEqual(
      await JourneyStore.getAll(),
      expected,
      "Only valid data is stored"
    );

    await JourneyStore.testOnlyFlushAndResetCache();
    Assert.deepEqual(
      await JourneyStore.getAll(),
      expected,
      "Rejected creates and updates do not change persisted metadata"
    );
  } finally {
    await JourneyStore.clear();
  }
});
