/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  PictureOfTheDayFeed:
    "resource://newtab/lib/Widgets/PictureOfTheDayFeed.sys.mjs",
});

const ENDPOINT =
  "https://merino.services.mozilla.com/api/v1/rss/picture-of-the-day";

const ENABLED_PREFS = {
  "widgets.enabled": true,
  "widgets.pictureOfTheDay.enabled": true,
  "widgets.system.pictureOfTheDay.enabled": true,
  "widgets.pictureOfTheDay.endpoint": ENDPOINT,
  "discoverystream.endpoints": "https://merino.services.mozilla.com/",
  "newtabWallpapers.enabled": true,
  "newtabWallpapers.customWallpaper.enabled": true,
};

function makeFeed(sandbox, { prefs = {}, cache = {} } = {}) {
  const proto = PictureOfTheDayFeed.prototype;
  // Tests may build more than one feed per sandbox; only wrap the prototype
  // once, then reset the return value for each feed.
  if (!proto.PersistentCache.isSinonProxy) {
    sandbox.stub(proto, "PersistentCache");
  }
  proto.PersistentCache.returns({
    get: async () => cache,
    set: sandbox.stub().resolves(),
  });
  const feed = new PictureOfTheDayFeed();
  feed.store = {
    dispatch: sandbox.spy(),
    getState: () => ({ Prefs: { values: prefs } }),
  };
  return feed;
}

function findUpdate(feed) {
  return feed.store.dispatch
    .getCalls()
    .find(c => c.args[0]?.type === actionTypes.PICTURE_OF_THE_DAY_UPDATE);
}

add_task(async function test_construction() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox);
  Assert.strictEqual(feed.loaded, false, "not loaded initially");
  Assert.strictEqual(feed.merino, null, "merino is null initially");
  Assert.strictEqual(feed.currentImageUrl, "", "no current image initially");
  sandbox.restore();
});

add_task(async function test_isEnabled() {
  const sandbox = sinon.createSandbox();
  Assert.ok(
    makeFeed(sandbox, { prefs: ENABLED_PREFS }).isEnabled(),
    "enabled when user + system prefs are true"
  );
  Assert.ok(
    !makeFeed(sandbox, {
      prefs: {
        ...ENABLED_PREFS,
        "widgets.system.pictureOfTheDay.enabled": false,
      },
    }).isEnabled(),
    "disabled when the system pref is false"
  );
  sandbox.restore();
});

add_task(async function test_getEndpoint_allowlist() {
  const sandbox = sinon.createSandbox();
  Assert.equal(
    makeFeed(sandbox, { prefs: ENABLED_PREFS }).getEndpoint(),
    ENDPOINT,
    "returns an allowlisted endpoint"
  );
  Assert.equal(
    makeFeed(sandbox, {
      prefs: {
        ...ENABLED_PREFS,
        "discoverystream.endpoints": "https://other.example.com/",
      },
    }).getEndpoint(),
    null,
    "rejects an endpoint not in the allowlist"
  );
  sandbox.restore();
});

add_task(async function test_isStale() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox);
  Assert.ok(feed.isStale(null), "no lastUpdated is stale");
  Assert.ok(!feed.isStale(Date.now()), "today is fresh");
  Assert.ok(
    feed.isStale(Date.now() - 2 * 24 * 60 * 60 * 1000),
    "two days ago is stale"
  );
  sandbox.restore();
});

add_task(async function test_normalize() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox);

  Assert.equal(feed.normalize(null), null, "null input -> null");
  Assert.equal(feed.normalize({ title: "x" }), null, "no image -> null");

  const picture = feed.normalize({
    high_res_image_url: "https://img/hi.jpg",
    thumbnail_image_url: "https://img/th.jpg",
    title: "T",
    description: "D",
    published_date: "2026-06-30",
    file_page: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    author: "Bruce Wayne",
    license_label: "CC BY-SA 4.0",
    license_link: "https://creativecommons.org/licenses/by-sa/4.0/",
  });
  Assert.equal(picture.imageUrl, "https://img/hi.jpg", "prefers high-res");
  Assert.equal(picture.description, "D");
  Assert.equal(picture.publishedDate, "2026-06-30", "maps the published date");
  Assert.equal(
    picture.sourceUrl,
    "https://commons.wikimedia.org/wiki/File:Example.jpg",
    "maps file_page to sourceUrl"
  );
  Assert.equal(picture.author, "Bruce Wayne", "maps the author");
  Assert.equal(picture.licenseLabel, "CC BY-SA 4.0", "maps the license label");
  Assert.equal(
    picture.licenseUrl,
    "https://creativecommons.org/licenses/by-sa/4.0/",
    "maps license_link to licenseUrl"
  );

  const noAttribution = feed.normalize({
    high_res_image_url: "https://img/hi.jpg",
  });
  Assert.equal(noAttribution.sourceUrl, "", "attribution fields default empty");
  Assert.equal(noAttribution.author, "");
  Assert.equal(noAttribution.licenseLabel, "");
  Assert.equal(noAttribution.licenseUrl, "");
  sandbox.restore();
});

add_task(async function test_fetch_caches_and_broadcasts() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.merino = {
    fetchPictureOfTheDay: sandbox.stub().resolves({
      data: { high_res_image_url: "https://img/hi.jpg", description: "D" },
      error: null,
    }),
  };

  await feed.fetch();

  Assert.ok(feed.cache.set.calledWith("picture"), "caches the picture");
  const update = findUpdate(feed);
  Assert.ok(update, "broadcasts PICTURE_OF_THE_DAY_UPDATE");
  Assert.equal(update.args[0].data.imageUrl, "https://img/hi.jpg");
  Assert.equal(feed.currentImageUrl, "https://img/hi.jpg", "tracks the url");
  sandbox.restore();
});

add_task(async function test_fetch_error_falls_back() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.merino = {
    fetchPictureOfTheDay: sandbox
      .stub()
      .resolves({ data: null, error: "load_error" }),
  };

  await feed.fetch();

  Assert.ok(!feed.cache.set.calledWith("picture"), "does not cache on error");
  const update = findUpdate(feed);
  Assert.equal(update.args[0].data.imageUrl, "", "broadcasts empty image");
  Assert.equal(update.args[0].data.error, "load_error", "reports the error");
  sandbox.restore();
});

add_task(async function test_setWallpaper_keeps_the_picture_it_started_with() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "https://img/yesterday.jpg";

  let potd = {
    description: "Yesterday's picture",
    publishedDate: "2026-07-01",
  };
  feed.store.getState = () => ({
    Prefs: { values: ENABLED_PREFS },
    PictureOfTheDay: potd,
  });

  // The refresh lands while the image is still downloading. Read after the
  // fetch, the name and date belong to a picture these bytes are not.
  let finishFetch;
  const fetching = new Promise(resolve => {
    finishFetch = resolve;
  });
  sandbox.stub(feed, "fetchImage").callsFake(async () => {
    await fetching;
    return {
      ok: true,
      headers: { get: () => "image/jpeg" },
      blob: async () => new Blob(["yesterday"], { type: "image/jpeg" }),
    };
  });

  const setting = feed.setWallpaper();
  potd = { description: "Today's picture", publishedDate: "2026-07-02" };
  finishFetch();
  await setting;

  const calls = feed.store.dispatch.getCalls();
  const upload = calls.find(
    c => c.args[0]?.type === actionTypes.WALLPAPER_UPLOAD
  );
  Assert.equal(
    upload.args[0].data.name,
    "Yesterday's picture",
    "The image is saved under the name of the picture it actually is"
  );
  Assert.equal(
    upload.args[0].data.publishedDate,
    "2026-07-01",
    "And with that picture's date"
  );

  const active = calls.find(
    c => c.args[0]?.data?.name === "widgets.pictureOfTheDay.wallpaperActive"
  );
  Assert.equal(
    active.args[0].data.value,
    "2026-07-01",
    "The widget marks the day that is actually on the page"
  );

  sandbox.restore();
});

add_task(async function test_setWallpaper_uploads_and_selects() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "https://img/hi.jpg";
  // setWallpaper records the current picture's published date, read from the
  // PictureOfTheDay redux state.
  feed.store.getState = () => ({
    Prefs: { values: ENABLED_PREFS },
    PictureOfTheDay: { publishedDate: "2026-07-01" },
  });

  const blob = new Blob(["fake"], { type: "image/jpeg" });
  sandbox.stub(feed, "fetchImage").resolves({
    ok: true,
    headers: { get: () => "image/jpeg" },
    blob: async () => blob,
  });

  await feed.setWallpaper();

  const calls = feed.store.dispatch.getCalls();
  const upload = calls.find(
    c => c.args[0]?.type === actionTypes.WALLPAPER_UPLOAD
  );
  Assert.ok(upload, "dispatches WALLPAPER_UPLOAD");
  Assert.ok(Blob.isInstance(upload.args[0].data.file), "uploads a Blob");
  Assert.ok(
    ["dark", "light"].includes(upload.args[0].data.theme),
    "uploads a valid theme"
  );
  Assert.equal(
    upload.args[0].data.type,
    "potd",
    "marks the upload as the Picture of the Day so it is kept in the library"
  );
  Assert.ok(
    !calls.some(c => c.args[0]?.data?.name === "newtabWallpapers.enabled"),
    "does not force-enable the wallpaper feature"
  );
  Assert.ok(
    calls.some(c => c.args[0]?.data?.name === "newtabWallpapers.wallpaper"),
    "selects the custom wallpaper"
  );
  Assert.ok(
    calls.some(
      c =>
        c.args[0]?.data?.name === "widgets.pictureOfTheDay.wallpaperActive" &&
        c.args[0]?.data?.value === "2026-07-01"
    ),
    "records the set picture's published date as the active wallpaper"
  );
  sandbox.restore();
});

add_task(async function test_setWallpaper_noop_without_image() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "";
  const fetchStub = sandbox.stub(feed, "fetchImage");

  await feed.setWallpaper();

  Assert.ok(fetchStub.notCalled, "does nothing when there is no picture");
  sandbox.restore();
});

add_task(async function test_setWallpaper_ignores_non_image_response() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "https://img/hi.jpg";
  sandbox.stub(feed, "fetchImage").resolves({
    ok: true,
    headers: { get: () => "text/html" },
    blob: async () => new Blob(["<html>"], { type: "text/html" }),
  });

  await feed.setWallpaper();

  Assert.ok(
    !feed.store.dispatch
      .getCalls()
      .some(c => c.args[0]?.type === actionTypes.WALLPAPER_UPLOAD),
    "does not upload a non-image response"
  );
  sandbox.restore();
});

add_task(async function test_setWallpaper_throws_when_custom_disabled() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, {
    prefs: {
      ...ENABLED_PREFS,
      "newtabWallpapers.customWallpaper.enabled": false,
    },
  });
  feed.currentImageUrl = "https://img/hi.jpg";
  const fetchStub = sandbox.stub(feed, "fetchImage");

  await Assert.rejects(
    feed.setWallpaper(),
    /custom wallpapers are disabled/,
    "throws when custom wallpapers are disabled"
  );
  Assert.ok(fetchStub.notCalled, "does not fetch the image when disabled");
  sandbox.restore();
});

add_task(async function test_setAsWallpaper_cleared_on_wallpaper_change() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, {
    prefs: {
      ...ENABLED_PREFS,
      "widgets.pictureOfTheDay.wallpaperActive": "2026-07-01",
      "newtabWallpapers.wallpaper": "dark-landscape",
    },
  });

  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "newtabWallpapers.wallpaper", value: "dark-landscape" },
  });

  Assert.ok(
    feed.store.dispatch
      .getCalls()
      .some(
        c =>
          c.args[0]?.data?.name === "widgets.pictureOfTheDay.wallpaperActive" &&
          c.args[0]?.data?.value === ""
      ),
    "clears wallpaperActive when a non-custom wallpaper is selected"
  );
  sandbox.restore();
});

add_task(async function test_wallpaperActive_cleared_on_foreign_upload() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, {
    prefs: {
      ...ENABLED_PREFS,
      "widgets.pictureOfTheDay.wallpaperActive": "2026-07-01",
    },
  });

  await feed.onAction({ type: actionTypes.WALLPAPER_UPLOAD, data: {} });

  Assert.ok(
    feed.store.dispatch
      .getCalls()
      .some(
        c =>
          c.args[0]?.data?.name === "widgets.pictureOfTheDay.wallpaperActive" &&
          c.args[0]?.data?.value === ""
      ),
    "clears wallpaperActive when the user uploads a different custom wallpaper"
  );
  sandbox.restore();
});

add_task(async function test_wallpaperActive_kept_on_own_upload() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, {
    prefs: {
      ...ENABLED_PREFS,
      "widgets.pictureOfTheDay.wallpaperActive": "2026-07-01",
    },
  });
  feed.settingWallpaper = true;

  await feed.onAction({ type: actionTypes.WALLPAPER_UPLOAD, data: {} });

  Assert.ok(
    !feed.store.dispatch
      .getCalls()
      .some(
        c => c.args[0]?.data?.name === "widgets.pictureOfTheDay.wallpaperActive"
      ),
    "does not clear wallpaperActive for the feed's own upload"
  );
  Assert.equal(
    feed.settingWallpaper,
    false,
    "consumes the self-upload guard flag"
  );
  sandbox.restore();
});

add_task(async function test_a_picture_with_no_description_is_saved_unnamed() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "https://img/today.jpg";

  info("Merino leaves the description out sometimes, so it must degrade");

  feed.store.getState = () => ({
    Prefs: { values: ENABLED_PREFS },
    PictureOfTheDay: { title: "Picture of the Day for August 31" },
  });
  sandbox.stub(feed, "fetchImage").resolves({
    ok: true,
    headers: { get: () => "image/jpeg" },
    blob: async () => new Blob(["today"], { type: "image/jpeg" }),
  });

  await feed.setWallpaper();

  const upload = feed.store.dispatch
    .getCalls()
    .find(c => c.args[0]?.type === actionTypes.WALLPAPER_UPLOAD);

  Assert.equal(
    upload.args[0].data.name,
    "",
    "No name is sent, so the picture is numbered like any other saved image"
  );

  sandbox.restore();
});

add_task(async function test_set_wallpaper_names_the_page_that_asked() {
  const sandbox = sinon.createSandbox();
  const feed = makeFeed(sandbox, { prefs: ENABLED_PREFS });
  feed.currentImageUrl = "https://img/today.jpg";

  info("Without the page, the parent has nobody to report the save to");

  feed.store.getState = () => ({
    Prefs: { values: ENABLED_PREFS },
    PictureOfTheDay: { description: "A heron", publishedDate: "2026-08-31" },
  });
  sandbox.stub(feed, "fetchImage").resolves({
    ok: true,
    headers: { get: () => "image/jpeg" },
    blob: async () => new Blob(["today"], { type: "image/jpeg" }),
  });

  await feed.onAction({
    type: actionTypes.WIDGETS_PICTURE_SET_WALLPAPER,
    meta: { fromTarget: "port-1" },
  });

  const upload = feed.store.dispatch
    .getCalls()
    .find(c => c.args[0]?.type === actionTypes.WALLPAPER_UPLOAD);

  Assert.equal(
    upload.args[0].meta?.fromTarget,
    "port-1",
    "The upload names the page that asked for it"
  );

  sandbox.restore();
});
