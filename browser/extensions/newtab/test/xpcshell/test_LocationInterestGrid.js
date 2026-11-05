/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  LocationInterestGrid:
    "resource://newtab/lib/InferredModel/LocationInterestGrid.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const TOPICS = [
  "sports",
  "arts",
  "government",
  "society-parenting",
  "food",
  "tech",
  "education-science",
];

function expectedVector(digits) {
  return Object.fromEntries(
    TOPICS.map((topic, index) => [topic, Number(digits[index])])
  );
}

function makeGrid() {
  const metadata = {
    format_version: 1,
    encoding: "packed16",
    dtype: "uint16",
    byte_order: "little",
    layout: "row-major",
    bits_per_topic: 2,
    topic_order: "most-significant-first",
    levels_max: 3,
    topics: TOPICS,
    no_data: 65535,
    default_radius_km: 25,
    no_prior_above_km: 300,
    bands: [1, 10, 25, 50, 100].map(radius => ({
      radius_km: radius,
      lat0: 0,
      lon0: 0,
      step_deg: 1,
      n_lat: 2,
      n_lon: 2,
      byte_length: 8,
      file: `topic_grid_${radius}km.bin`,
    })),
  };
  const buffer = new ArrayBuffer(8);
  const raster = new DataView(buffer);
  [8375, 65535, 0, 16383].forEach((value, index) =>
    raster.setUint16(2 * index, value, true)
  );
  const fetchResource = sinon.stub().callsFake(async () => ({
    ok: true,
    json: async () => metadata,
    arrayBuffer: async () => buffer,
  }));
  return {
    grid: new LocationInterestGrid({ fetch: fetchResource }),
    fetchResource,
  };
}

add_task(async function test_decodingAndBoundaries() {
  const { grid, fetchResource } = makeGrid();
  for (const location of [
    {},
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    ...[NaN, Infinity, -1, 0, "25"].map(radius => ({
      latitude: 0,
      longitude: 0,
      radius,
    })),
  ]) {
    Assert.equal(await grid.lookup(location), null, "Reject invalid inputs");
  }
  Assert.ok(fetchResource.notCalled, "Invalid inputs do not load resources");
  for (const [latitude, longitude] of [
    [-0.01, 0],
    [0, -0.01],
    [2, 0],
    [0, 2],
  ]) {
    Assert.equal(await grid.lookup({ latitude, longitude }), null, "Off grid");
  }
  Assert.equal(fetchResource.callCount, 1, "Off-grid lookup loads no raster");
  for (const [latitude, longitude, vector] of [
    [0, 0, "2002313"],
    [0, 1, null],
    [1, 0, "0000000"],
    [1.999, 1.999, "3333333"],
  ]) {
    Assert.deepEqual(
      await grid.lookup({ latitude, longitude }),
      vector === null ? null : expectedVector(vector),
      "Decode row-major little-endian cells, including zero and no data"
    );
  }
});

add_task(async function test_radiusSelectionAndCaching() {
  const { grid, fetchResource } = makeGrid();
  const location = { latitude: 0.25, longitude: 0.25 };
  for (const [radius, band] of [
    [1, 1],
    [3, 1],
    [4, 10],
    [16, 25],
    [36, 50],
    [71, 100],
    [300, 100],
  ]) {
    await grid.lookup({ ...location, radius });
    Assert.ok(
      fetchResource.calledWithMatch(`topic_grid_${band}km.bin`),
      `Radius ${radius} selects band ${band}`
    );
  }
  for (const radius of [undefined, null]) {
    Assert.deepEqual(
      await grid.lookup({ ...location, radius }),
      expectedVector("2002313"),
      "Missing radius uses the default band"
    );
  }
  Assert.equal(await grid.lookup({ ...location, radius: 301 }), null);
  Assert.equal(
    fetchResource.callCount,
    6,
    "Metadata and each band loaded once"
  );

  const fresh = makeGrid();
  await Promise.all([fresh.grid.lookup(location), fresh.grid.lookup(location)]);
  Assert.equal(
    fresh.fetchResource.callCount,
    2,
    "Concurrent lookups share loads"
  );
  Assert.ok(fresh.fetchResource.calledWithMatch("topic_grid_25km.bin"));
});

add_task(async function test_loadingFailuresCanBeRetried() {
  const { grid, fetchResource } = makeGrid();
  const location = { latitude: 0.25, longitude: 0.25 };
  fetchResource.onFirstCall().rejects(new Error("Metadata unavailable"));
  await Assert.rejects(grid.lookup(location), /Metadata unavailable/);
  fetchResource.onCall(2).resolves({ ok: false });
  await Assert.rejects(grid.lookup(location), /Unable to load/);
  fetchResource.onCall(3).resolves({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(2),
  });
  await Assert.rejects(
    grid.lookup(location),
    /Invalid location interest grid size/
  );
  Assert.deepEqual(await grid.lookup(location), expectedVector("2002313"));
});
