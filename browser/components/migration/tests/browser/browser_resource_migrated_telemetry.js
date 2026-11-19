/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const AVAILABLE_BOOKMARKS = 5;
const MIGRATED_BOOKMARKS = 3;
const MIGRATED_HISTORY = 2;

let gSandbox;

add_setup(async () => {
  // Load the initial tab at example.com so that the wizard opens
  // about:preferences in a new tab that we can close afterwards.
  let browser = gBrowser.selectedBrowser;
  BrowserTestUtils.startLoadingURIString(browser, "https://example.com");
  await BrowserTestUtils.browserLoaded(browser);
});

/**
 * Makes the InternalTestingProfileMigrator offer a bookmarks resource that
 * knows how many bookmarks it has available, and a history resource that
 * does not. Both go through the real MigratorBase.migrate.
 */
function prepareResources() {
  gSandbox = sinon.createSandbox();
  gSandbox
    .stub(InternalTestingProfileMigrator.prototype, "getResources")
    .resolves([
      {
        type: MigrationUtils.resourceTypes.BOOKMARKS,
        available: AVAILABLE_BOOKMARKS,
        migrate(callback) {
          MigrationUtils._importQuantities.bookmarks += MIGRATED_BOOKMARKS;
          callback(true);
        },
      },
      {
        type: MigrationUtils.resourceTypes.HISTORY,
        migrate(callback) {
          MigrationUtils._importQuantities.history += MIGRATED_HISTORY;
          callback(true);
        },
      },
    ]);
}

async function cleanupResources() {
  gSandbox.restore();
  let migrator = await MigrationUtils.getMigrator(
    InternalTestingProfileMigrator.key
  );
  migrator.flushResourceCache();
  Services.prefs.clearUserPref("browser.migrate.interactions.bookmarks");
  Services.prefs.clearUserPref("browser.migrate.interactions.history");
}

async function migrateBookmarksAndHistory(wizard) {
  let wizardDone = BrowserTestUtils.waitForEvent(
    wizard,
    "MigrationWizard:DoneMigration"
  );
  await selectResourceTypesAndStartMigration(wizard, [
    MigrationWizardConstants.DISPLAYED_RESOURCE_TYPES.BOOKMARKS,
    MigrationWizardConstants.DISPLAYED_RESOURCE_TYPES.HISTORY,
  ]);
  await wizardDone;
}

function assertResourceMigratedEvents(expectedEntrypoint) {
  let events = Glean.browserMigration.resourceMigrated.testGetValue();
  Assert.equal(events?.length, 2, "Recorded one event per resource type.");

  let bookmarksEvent = events.find(
    e => e.extra.resource_type == "bookmarks"
  ).extra;
  Assert.deepEqual(
    bookmarksEvent,
    {
      migrator_key: InternalTestingProfileMigrator.key,
      entrypoint: expectedEntrypoint,
      resource_type: "bookmarks",
      available: String(AVAILABLE_BOOKMARKS),
      migrated: String(MIGRATED_BOOKMARKS),
    },
    "Bookmarks event reports the available and migrated quantities."
  );

  let historyEvent = events.find(e => e.extra.resource_type == "history").extra;
  Assert.deepEqual(
    historyEvent,
    {
      migrator_key: InternalTestingProfileMigrator.key,
      entrypoint: expectedEntrypoint,
      resource_type: "history",
      migrated: String(MIGRATED_HISTORY),
    },
    "History event leaves out the available quantity when it isn't known."
  );
}

/**
 * Tests that the entrypoint passed to MigrationUtils.showMigrationWizard is
 * reported alongside the available and migrated quantities.
 */
add_task(async function test_resource_migrated_from_entrypoint() {
  Services.fog.testResetFOG();
  prepareResources();

  let migrationDialogPromise = waitForMigrationWizardDialogTab();
  await MigrationUtils.showMigrationWizard(window, {
    entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.FILE_MENU,
  });
  let prefsBrowser = await migrationDialogPromise;

  try {
    let wizard = prefsBrowser.contentDocument.querySelector("migration-wizard");
    await migrateBookmarksAndHistory(wizard);
    assertResourceMigratedEvents(
      MigrationUtils.MIGRATION_ENTRYPOINTS.FILE_MENU
    );
  } finally {
    BrowserTestUtils.removeTab(gBrowser.getTabForBrowser(prefsBrowser));
    await cleanupResources();
  }
});

/**
 * Tests that opening the wizard from inside about:preferences reports the
 * preferences entrypoint.
 */
add_task(async function test_resource_migrated_from_preferences() {
  Services.fog.testResetFOG();
  prepareResources();

  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let wizardReady = BrowserTestUtils.waitForEvent(
      window,
      "MigrationWizard:Ready"
    );
    browser.contentWindow.gMainPane.showMigrationWizardDialog();
    await wizardReady;

    let wizard = browser.contentDocument.querySelector("migration-wizard");
    await migrateBookmarksAndHistory(wizard);
    assertResourceMigratedEvents(
      MigrationUtils.MIGRATION_ENTRYPOINTS.PREFERENCES
    );
  });

  await cleanupResources();
});
