/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const storageDirName = "storage";
const storageFileName = "storage.sqlite";
const indexedDBDirName = "indexedDB";
const persistentStorageDirName = "storage/persistent";

// Every key that can be recorded in the first_initialization_attempt metric,
// see StringGenerator::GetString in dom/quota/InitializationTypes.cpp.
const allKeys = [
  "Storage",
  "TemporaryStorage",
  "DefaultRepository",
  "TemporaryRepository",
  "UpgradeStorageFrom0_0To1_0",
  "UpgradeStorageFrom1_0To2_0",
  "UpgradeStorageFrom2_0To2_1",
  "UpgradeStorageFrom2_1To2_2",
  "UpgradeStorageFrom2_2To2_3",
  "UpgradeStorageFrom2_3To2_4",
  "UpgradeFromIndexedDBDirectory",
  "UpgradeFromPersistentStorageDirectory",
  "PersistentRepository",
  "PersistentGroup",
  "TemporaryGroup",
  "PersistentOrigin",
  "TemporaryOrigin",
];

const allCategories = ["false", "true"];

const testcases = [
  {
    mainKey: "Storage",
    async setup(expectedInitResult) {
      if (!expectedInitResult) {
        // Make the database unusable by creating it as a directory (not a
        // file).
        const storageFile = getRelativeFile(storageFileName);
        storageFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "TemporaryStorage",
    async setup(expectedInitResult) {
      // We need to initialize storage before populating the repositories. If
      // we don't do that, the storage directory created for the repositories
      // would trigger storage upgrades (from version 0 to current version).
      let request = init();
      await requestFinished(request);

      populateRepository("temporary");
      populateRepository("default");

      if (!expectedInitResult) {
        makeRepositoryUnusable("temporary");
        makeRepositoryUnusable("default");
      }
    },
    initFunction: initTemporaryStorage,
    getExpectedSnapshots() {
      const expectedSnapshotsInNightly = {
        initFailure: {
          Storage: {
            false: 0,
            true: 1,
          },
          TemporaryRepository: {
            false: 1,
            true: 0,
          },
          DefaultRepository: {
            false: 1,
            true: 0,
          },
          // mainKey
          TemporaryStorage: {
            false: 1,
            true: 0,
          },
        },
        initFailureThenSuccess: {
          Storage: {
            false: 0,
            true: 2,
          },
          TemporaryRepository: {
            false: 1,
            true: 1,
          },
          DefaultRepository: {
            false: 1,
            true: 1,
          },
          // mainKey
          TemporaryStorage: {
            false: 1,
            true: 1,
          },
        },
      };

      const expectedSnapshotsInOthers = {
        initFailure: {
          Storage: {
            false: 0,
            true: 1,
          },
          TemporaryRepository: {
            false: 1,
            true: 0,
          },
          // mainKey
          TemporaryStorage: {
            false: 1,
            true: 0,
          },
        },
        initFailureThenSuccess: {
          Storage: {
            false: 0,
            true: 2,
          },
          TemporaryRepository: {
            false: 1,
            true: 1,
          },
          DefaultRepository: {
            false: 0,
            true: 1,
          },
          // mainKey
          TemporaryStorage: {
            false: 1,
            true: 1,
          },
        },
      };

      return AppConstants.NIGHTLY_BUILD
        ? expectedSnapshotsInNightly
        : expectedSnapshotsInOthers;
    },
  },
  {
    mainKey: "DefaultRepository",
    async setup(expectedInitResult) {
      // See the comment for "TemporaryStorage".
      let request = init();
      await requestFinished(request);

      populateRepository("default");

      if (!expectedInitResult) {
        makeRepositoryUnusable("default");
      }
    },
    initFunction: initTemporaryStorage,
    expectedSnapshots: {
      initFailure: {
        Storage: {
          false: 0,
          true: 1,
        },
        TemporaryRepository: {
          false: 0,
          true: 1,
        },
        // mainKey
        DefaultRepository: {
          false: 1,
          true: 0,
        },
        TemporaryStorage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        Storage: {
          false: 0,
          true: 2,
        },
        TemporaryRepository: {
          false: 0,
          true: 2,
        },
        // mainKey
        DefaultRepository: {
          false: 1,
          true: 1,
        },
        TemporaryStorage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "TemporaryRepository",
    async setup(expectedInitResult) {
      // See the comment for "TemporaryStorage".
      let request = init();
      await requestFinished(request);

      populateRepository("temporary");

      if (!expectedInitResult) {
        makeRepositoryUnusable("temporary");
      }
    },
    initFunction: initTemporaryStorage,
    getExpectedSnapshots() {
      const expectedSnapshotsInNightly = {
        initFailure: {
          Storage: {
            false: 0,
            true: 1,
          },
          // mainKey
          TemporaryRepository: {
            false: 1,
            true: 0,
          },
          DefaultRepository: {
            false: 0,
            true: 1,
          },
          TemporaryStorage: {
            false: 1,
            true: 0,
          },
        },
        initFailureThenSuccess: {
          Storage: {
            false: 0,
            true: 2,
          },
          // mainKey
          TemporaryRepository: {
            false: 1,
            true: 1,
          },
          DefaultRepository: {
            false: 0,
            true: 2,
          },
          TemporaryStorage: {
            false: 1,
            true: 1,
          },
        },
      };

      const expectedSnapshotsInOthers = {
        initFailure: {
          Storage: {
            false: 0,
            true: 1,
          },
          // mainKey
          TemporaryRepository: {
            false: 1,
            true: 0,
          },
          TemporaryStorage: {
            false: 1,
            true: 0,
          },
        },
        initFailureThenSuccess: {
          Storage: {
            false: 0,
            true: 2,
          },
          // mainKey
          TemporaryRepository: {
            false: 1,
            true: 1,
          },
          DefaultRepository: {
            false: 0,
            true: 1,
          },
          TemporaryStorage: {
            false: 1,
            true: 1,
          },
        },
      };

      return AppConstants.NIGHTLY_BUILD
        ? expectedSnapshotsInNightly
        : expectedSnapshotsInOthers;
    },
  },
  {
    mainKey: "UpgradeStorageFrom0_0To1_0",
    async setup(expectedInitResult) {
      // storage used prior FF 49 (storage version 0.0)
      installPackage("version0_0_profile");

      if (!expectedInitResult) {
        installPackage("version0_0_make_it_unusable");
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeStorageFrom0_0To1_0: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeStorageFrom0_0To1_0: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom1_0To2_0: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_0To2_1: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_1To2_2: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeStorageFrom1_0To2_0",
    async setup(expectedInitResult) {
      // storage used by FF 49-54 (storage version 1.0)
      installPackage("version1_0_profile");

      if (!expectedInitResult) {
        installPackage("version1_0_make_it_unusable");
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeStorageFrom1_0To2_0: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeStorageFrom1_0To2_0: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom2_0To2_1: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_1To2_2: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeStorageFrom2_0To2_1",
    async setup(expectedInitResult) {
      // storage used by FF 55-56 (storage version 2.0)
      installPackage("version2_0_profile");

      if (!expectedInitResult) {
        installPackage("version2_0_make_it_unusable");
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeStorageFrom2_0To2_1: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeStorageFrom2_0To2_1: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom2_1To2_2: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeStorageFrom2_1To2_2",
    async setup(expectedInitResult) {
      // storage used by FF 57-67 (storage version 2.1)
      installPackage("version2_1_profile");

      if (!expectedInitResult) {
        installPackage("version2_1_make_it_unusable");
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeStorageFrom2_1To2_2: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeStorageFrom2_1To2_2: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeStorageFrom2_2To2_3",
    async setup(expectedInitResult) {
      // storage used by FF 68-69 (storage version 2.2)
      installPackage("version2_2_profile");

      if (!expectedInitResult) {
        installPackage(
          "version2_2_make_it_unusable",
          /* allowFileOverwrites */ true
        );
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeStorageFrom2_2To2_3: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeStorageFrom2_2To2_3: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeFromIndexedDBDirectory",
    async setup(expectedInitResult) {
      const indexedDBDir = getRelativeFile(indexedDBDirName);
      indexedDBDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

      if (!expectedInitResult) {
        // "indexedDB" directory will be moved under "storage" directory and at
        // the same time renamed to "persistent". Create a storage file to cause
        // the moves to fail.
        const storageFile = getRelativeFile(storageDirName);
        storageFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o666);
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeFromIndexedDBDirectory: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeFromIndexedDBDirectory: {
          false: 1,
          true: 1,
        },
        UpgradeFromPersistentStorageDirectory: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom0_0To1_0: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom1_0To2_0: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_0To2_1: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_1To2_2: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "UpgradeFromPersistentStorageDirectory",
    async setup(expectedInitResult) {
      const persistentStorageDir = getRelativeFile(persistentStorageDirName);
      persistentStorageDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

      if (!expectedInitResult) {
        // Create a metadata directory to break creating or upgrading directory
        // metadata files.
        const metadataDir = getRelativeFile(
          "storage/persistent/https+++bad.example.com/.metadata"
        );
        metadataDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      }
    },
    initFunction: init,
    expectedSnapshots: {
      initFailure: {
        // mainKey
        UpgradeFromPersistentStorageDirectory: {
          false: 1,
          true: 0,
        },
        Storage: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        // mainKey
        UpgradeFromPersistentStorageDirectory: {
          false: 1,
          true: 1,
        },
        UpgradeStorageFrom0_0To1_0: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom1_0To2_0: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_0To2_1: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_1To2_2: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_2To2_3: {
          false: 0,
          true: 1,
        },
        UpgradeStorageFrom2_3To2_4: {
          false: 0,
          true: 1,
        },
        Storage: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "PersistentOrigin",
    async setup(expectedInitResult) {
      // We need to initialize storage before creating the origin files. If we
      // don't do that, the storage directory created for the origin files
      // would trigger storage upgrades (from version 0 to current version).
      let request = init();
      await requestFinished(request);

      if (!expectedInitResult) {
        const originFiles = [
          getRelativeFile("storage/permanent/https+++example.com"),
          getRelativeFile("storage/permanent/https+++example1.com"),
          getRelativeFile("storage/default/https+++example2.com"),
        ];

        for (const originFile of originFiles) {
          originFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o666);
        }
      }

      request = initTemporaryStorage();
      await requestFinished(request);
    },
    initFunctions: [
      {
        name: initPersistentOrigin,
        args: [getPrincipal("https://example.com")],
      },
      {
        name: initPersistentOrigin,
        args: [getPrincipal("https://example1.com")],
      },
      {
        name: initTemporaryOrigin,
        args: [
          "default",
          getPrincipal("https://example2.com"),
          /* createIfNonExistent */ true,
        ],
      },
    ],
    expectedSnapshots: {
      initFailure: {
        Storage: {
          false: 0,
          true: 1,
        },
        TemporaryRepository: {
          false: 0,
          true: 1,
        },
        DefaultRepository: {
          false: 0,
          true: 1,
        },
        TemporaryStorage: {
          false: 0,
          true: 1,
        },
        // mainKey
        PersistentOrigin: {
          false: 2,
          true: 0,
        },
        TemporaryOrigin: {
          false: 1,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        Storage: {
          false: 0,
          true: 2,
        },
        TemporaryRepository: {
          false: 0,
          true: 2,
        },
        DefaultRepository: {
          false: 0,
          true: 2,
        },
        TemporaryStorage: {
          false: 0,
          true: 2,
        },
        // mainKey
        PersistentOrigin: {
          false: 2,
          true: 2,
        },
        TemporaryOrigin: {
          false: 1,
          true: 1,
        },
      },
    },
  },
  {
    mainKey: "TemporaryOrigin",
    async setup(expectedInitResult) {
      // See the comment for "PersistentOrigin".
      let request = init();
      await requestFinished(request);

      if (!expectedInitResult) {
        const originFiles = [
          getRelativeFile("storage/temporary/https+++example.com"),
          getRelativeFile("storage/default/https+++example.com"),
          getRelativeFile("storage/default/https+++example1.com"),
          getRelativeFile("storage/permanent/https+++example2.com"),
        ];

        for (const originFile of originFiles) {
          originFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o666);
        }
      }

      request = initTemporaryStorage();
      await requestFinished(request);
    },
    initFunctions: [
      {
        name: initTemporaryOrigin,
        args: [
          "temporary",
          getPrincipal("https://example.com"),
          /* createIfNonExistent */ true,
        ],
      },
      {
        name: initTemporaryOrigin,
        args: [
          "default",
          getPrincipal("https://example.com"),
          /* createIfNonExistent */ true,
        ],
      },
      {
        name: initTemporaryOrigin,
        args: [
          "default",
          getPrincipal("https://example1.com"),
          /* createIfNonExistent */ true,
        ],
      },
      {
        name: initPersistentOrigin,
        args: [getPrincipal("https://example2.com")],
      },
    ],
    // Only the first result of EnsureTemporaryOriginIsInitialized per origin
    // should be reported. Thus, only the results for (temporary, example.com),
    // and (default, example1.com) should be reported.
    expectedSnapshots: {
      initFailure: {
        Storage: {
          false: 0,
          true: 1,
        },
        TemporaryRepository: {
          false: 0,
          true: 1,
        },
        DefaultRepository: {
          false: 0,
          true: 1,
        },
        TemporaryStorage: {
          false: 0,
          true: 1,
        },
        PersistentOrigin: {
          false: 1,
          true: 0,
        },
        // mainKey
        TemporaryOrigin: {
          false: 2,
          true: 0,
        },
      },
      initFailureThenSuccess: {
        Storage: {
          false: 0,
          true: 2,
        },
        TemporaryRepository: {
          false: 0,
          true: 2,
        },
        DefaultRepository: {
          false: 0,
          true: 2,
        },
        TemporaryStorage: {
          false: 0,
          true: 2,
        },
        PersistentOrigin: {
          false: 1,
          true: 1,
        },
        // mainKey
        TemporaryOrigin: {
          false: 2,
          true: 2,
        },
      },
    },
  },
];

loadScript("dom/quota/test/xpcshell/common/utils.js");

function verifyMetric(mainKey, expectedSnapshot) {
  const metric = Glean.domQuota.firstInitializationAttempt;

  ok(
    metric.get(mainKey, "false").testGetValue() != null ||
      metric.get(mainKey, "true").testGetValue() != null,
    `The metric must contain the main key ${mainKey}`
  );

  for (const key of allKeys) {
    for (const category of allCategories) {
      const value = metric.get(key, category).testGetValue() ?? 0;
      const expectedValue = expectedSnapshot[key]?.[category] ?? 0;

      is(
        value,
        expectedValue,
        `Expected counts should match for key ${key} and category ${category}`
      );
    }
  }
}

async function testSteps() {
  Services.fog.initializeFOG();

  let request;
  for (const testcase of testcases) {
    const mainKey = testcase.mainKey;

    info(`Verifying first_initialization_attempt for the main key ${mainKey}`);

    Services.fog.testResetFOG();

    for (const expectedInitResult of [false, true]) {
      info(
        `Verifying the metric when the initialization ` +
          `${expectedInitResult ? "failed and then succeeds" : "fails"}`
      );

      await testcase.setup(expectedInitResult);

      const msg = `Should ${expectedInitResult ? "not " : ""} have thrown`;

      // Call the initialization function twice, so we can verify below that
      // only the first initialization attempt has been reported.
      for (let i = 0; i < 2; ++i) {
        let initFunctions;

        if (testcase.initFunctions) {
          initFunctions = testcase.initFunctions;
        } else {
          initFunctions = [
            {
              name: testcase.initFunction,
              args: [],
            },
          ];
        }

        for (const initFunction of initFunctions) {
          request = initFunction.name(...initFunction.args);
          try {
            await requestFinished(request);
            ok(expectedInitResult, msg);
          } catch (ex) {
            ok(!expectedInitResult, msg);
          }
        }
      }

      const expectedSnapshots = testcase.getExpectedSnapshots
        ? testcase.getExpectedSnapshots()
        : testcase.expectedSnapshots;

      const expectedSnapshot = expectedInitResult
        ? expectedSnapshots.initFailureThenSuccess
        : expectedSnapshots.initFailure;

      verifyMetric(mainKey, expectedSnapshot);

      // The first initialization attempt has been reported in the metric
      // and any new attemps wouldn't be reported if we didn't reset or clear
      // the storage here. We need a clean profile for the next iteration
      // anyway.
      // However, the clear storage operation needs initialized storage, so
      // clearing can fail if the storage is unusable and it can also increase
      // some of the telemetry counters. Instead of calling clear, we can just
      // call reset and clear profile manually.
      request = reset();
      await requestFinished(request);

      const indexedDBDir = getRelativeFile(indexedDBDirName);
      if (indexedDBDir.exists()) {
        indexedDBDir.remove(false);
      }

      const storageDir = getRelativeFile(storageDirName);
      if (storageDir.exists()) {
        storageDir.remove(true);
      }

      const storageFile = getRelativeFile(storageFileName);
      if (storageFile.exists()) {
        // It could be a non empty directory, so remove it recursively.
        storageFile.remove(true);
      }
    }
  }
}
