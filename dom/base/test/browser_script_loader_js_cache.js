// ev, unordered, and runJSCacheTests are defined in head.js

add_task(async function testDiskCache() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    // A small file shouldn't be saved to the disk.
    {
      title: "small file",
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
      ],
    },

    // A large file should be saved to the disk on the 4th load, and should be
    // used on the 5th load.  Also the 5th load shouldn't overwrite the cache.
    {
      title: "large file",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    // A file with compile error shouldn't be saved to the disk.
    {
      title: "syntax error",
      items: [
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  // If in-memory cache is enabled, the disk cache is handled by the
  // SharedScriptCache, and following differences happen:
  //  * diskcache:disabled and diskcache:register are not notified for
  //    each script
  //  * diskcache:noschedule is notified without associated script
  //    if there's no script to be saved

  await runJSCacheTests([
    // A small file should be saved to the memory on the 1st load, and used on
    // the 2nd load.  But it shouldn't be saved to the disk cache.
    {
      title: "small file",
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("memorycache:saved", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A large file should be saved to the memory on the 1st load, and used on
    // the 2nd load.  Also it should be saved to the disk on the 4th load.
    // Also the 5th load shouldn't overwrite the cache.
    // Once the memory cache is purged, it should be populated from the disk
    // cache response.
    {
      title: "large file",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },

        {
          clearMemory: true,
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A file with compile error shouldn't be saved to any cache.
    {
      title: "syntax error",
      items: [
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_modules() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    // A small module shouldn't be saved to the disk.
    {
      title: "small module",
      module: true,
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
      ],
    },

    // A large module file should be saved to the disk.
    {
      title: "large module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },

    // All imported modules should be saved to the disk.
    {
      title: "imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
            // non-top-level modules that don't pass the condition
            // don't emit events.
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:register", "file_js_cache_importer.mjs"),
            ev("diskcache:register", "file_js_cache_imported1.mjs", false),
            ev("diskcache:register", "file_js_cache_imported2.mjs", false),
            ev("diskcache:register", "file_js_cache_imported3.mjs", false),
            ev("diskcache:saved", "file_js_cache_importer.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported1.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported2.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:diskcache", "file_js_cache_importer.mjs"),
            ev("load:diskcache", "file_js_cache_imported1.mjs", false),
            ev("load:diskcache", "file_js_cache_imported2.mjs", false),
            ev("load:diskcache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_modules() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    // A small module shouldn't be saved to the disk.
    {
      title: "small module",
      module: true,
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("memorycache:saved", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A large module file should be saved to the disk.
    {
      title: "large module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // All imported modules should be saved to the disk.
    {
      title: "imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("memorycache:saved", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            // SharedScriptCache iterates over unordered hashmap while
            // saving.
            unordered([
              ev("diskcache:saved", "file_js_cache_importer.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported1.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported2.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported3.mjs", false),
            ]),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_classicVsModules() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    // A classic script's disk cache shouldn't be used by module.
    // A large module file should be saved to the disk.
    {
      title: "classic script disk cache vs module",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            // This should load source.
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },

    {
      title: "module script disk cache vs classic",
      items: [
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            // This should load source.
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_classicVsModules() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    // A classic script's disk cache shouldn't be used by module.
    // A large module file should be saved to the disk.
    {
      title: "classic script disk cache vs module",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            // Memory cached item is classic.
            // Module load should immediately fetch source from necko.
            ev("load:source", "file_js_cache_large.js"),
            // and save a separate item.
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "module script disk cache vs script",
      items: [
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_InvalidSRI() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    // Invalid integrity attribute should be ignored.
    {
      title: "invalid SRI on classic",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on classic only after cached",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on module only after cached",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_InvalidSRI() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    // Invalid integrity attribute should be ignored.
    {
      title: "invalid SRI on classic",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on classic only after cached",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            // Integrity attribute contributes to the memory cache key
            // even if it's invalid.
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "invalid SRI on module only after cached",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "invalid",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_SRI() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    {
      title: "SRI on classic",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "SRI on module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_SRI() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    {
      title: "SRI on classic",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "SRI on module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_SRIAfterSave() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  // If SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "SRI on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "SRI on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_SRIAfterSave() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  // If SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "SRI on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            // Memory cache doesn't support different SRI, but
            // disk cache does.
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "SRI on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_DifferentSRI() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  // If different SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "different SRI on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "different SRI on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_DifferentSRI() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  // If different SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "different SRI on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            // Disk cache's fetch count is not incremented for non-first
            // load, and the fetch count here doesn't hit the minimum.
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "different SRI on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-NN5Pp0blZjckIohQdMbZwclYHNV3QXnL/UiR1R0h66KMc2zRCgfFQ56zpTd8UCYB/RkAQ6HUbPzlGr8JWUp6AQ==",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_SRIMismatchAfterSave() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  // If different SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "wrong SRI with same algorithm on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-fxijQE3W3lWbCjRZx0MCS6pJpCz+dGnNujsFYBzzag9G/fz/6ZiWdM/GAsMzGlAI",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with different algorithm on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-8fAu+4y0SKpriy0fz4IuLgiXLyTCGVInfJHvIl8JOdxm+xKJVHVhX7RTfEUpExZYoOJqzpVRkK/6nfglpK7Dow==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with same algorithm on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-fxijQE3W3lWbCjRZx0MCS6pJpCz+dGnNujsFYBzzag9G/fz/6ZiWdM/GAsMzGlAI",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with different algorithm on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-8fAu+4y0SKpriy0fz4IuLgiXLyTCGVInfJHvIl8JOdxm+xKJVHVhX7RTfEUpExZYoOJqzpVRkK/6nfglpK7Dow==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_SRIMismatchAfterSave() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  // If different SRI is specified after the disk cache is created, it should
  // fallback to the source, and then save again with the SRI.
  await runJSCacheTests([
    {
      title: "wrong SRI with same algorithm on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-fxijQE3W3lWbCjRZx0MCS6pJpCz+dGnNujsFYBzzag9G/fz/6ZiWdM/GAsMzGlAI",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with different algorithm on classic after save",
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-8fAu+4y0SKpriy0fz4IuLgiXLyTCGVInfJHvIl8JOdxm+xKJVHVhX7RTfEUpExZYoOJqzpVRkK/6nfglpK7Dow==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with same algorithm on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-fxijQE3W3lWbCjRZx0MCS6pJpCz+dGnNujsFYBzzag9G/fz/6ZiWdM/GAsMzGlAI",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    {
      title: "wrong SRI with different algorithm on module after save",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha384-vJ7r8qsSxGVQwKbj+5A1avW8CEb6bODkGULlUVOmqN81D6XQzaTFhspcWmO+PVSQ",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          sri: "sha512-8fAu+4y0SKpriy0fz4IuLgiXLyTCGVInfJHvIl8JOdxm+xKJVHVhX7RTfEUpExZYoOJqzpVRkK/6nfglpK7Dow==",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("load:fallback", "file_js_cache_large.js"),
            ev("load:source", "file_js_cache_large.js"),
            ev("sri:corrupt", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_compression() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
      ["browser.cache.jsbc_compression_level", 2],
    ],
  });

  await runJSCacheTests([
    {
      title: "large file with compression",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_compression() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
      ["browser.cache.jsbc_compression_level", 2],
    ],
  });

  await runJSCacheTests([
    {
      title: "large file with compression",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_dynamicImport() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    {
      title: "dynamically imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:register", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_importer.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:diskcache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:diskcache", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:diskcache", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:diskcache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_dynamicImport() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    {
      title: "dynamically imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("memorycache:saved", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            unordered([
              ev("diskcache:saved", "file_js_cache_dyn_importer.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported1.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported2.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported3.mjs", false),
            ]),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_dynamicImport() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runJSCacheTests([
    {
      title: "dynamically imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:register", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:register", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_importer.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:saved", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:diskcache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_dyn_importer.mjs"),
            ev("load:diskcache", "file_js_cache_dyn_imported1.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:diskcache", "file_js_cache_dyn_imported2.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:diskcache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:disabled", "file_js_cache_dyn_imported3.mjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_dynamicImport() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runJSCacheTests([
    {
      title: "dynamically imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_dyn_importer.mjs"),
            ev("memorycache:saved", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:source", "file_js_cache_dyn_imported1.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported2.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:source", "file_js_cache_dyn_imported3.mjs", false),
            ev("memorycache:saved", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            unordered([
              ev("diskcache:saved", "file_js_cache_dyn_importer.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported1.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported2.mjs", false),
              ev("diskcache:saved", "file_js_cache_dyn_imported3.mjs", false),
            ]),
          ],
        },
        {
          file: "file_js_cache_dyn_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_dyn_importer.mjs"),
            ev("evaluate:module", "file_js_cache_dyn_importer.mjs"),
            ev("load:memorycache", "file_js_cache_dyn_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_dyn_imported3.mjs", false),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});
