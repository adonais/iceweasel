// ev, unordered, and runJSCacheTests are defined in head.js

// Adding script element performs no preloads.
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
    {
      title: "charset dependent file",
      items: [
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // Loading with different charset should hit the disk cache, and then
        // fall back to the network.
        // The fetch count already hits the threshold, and it should overwrite
        // the disk cache.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("load:fallback", "file_js_cache_charset_js.sjs"),
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // Loading with different charset should hit the disk cache, and then
        // fall back to the network.
        // The fetch count already hits the threshold, and it should overwrite
        // the disk cache.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("load:fallback", "file_js_cache_charset_js.sjs"),
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // The disk cache for Shift_JIS is already overwritten.
        // Loading with Shift_JIS should hit the disk cache, and then fall back
        // to the network.
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("load:fallback", "file_js_cache_charset_js.sjs"),
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
      ["dom.script_loader.disk_cache_delay_ms", 0],
    ],
  });

  await runJSCacheTests([
    {
      title: "charset dependent file",
      items: [
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            // At this point, the necko cache has fetchCount == 2.
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // At this point, the necko cache has fetchCount == 3.
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // The UTF-8 memory cache's fetch count becomes 4.
            // Disk cache is created for UTF-8.
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },

        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            // The Shift_JIS memory cache's fetch count is still 3.
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            // The no-charset memory cache's fetch count becomes 4.
            // Disk cache is overwritten with no charset.
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            // The Shift_JIS memory cache's fetch count becomes 4.
            // Disk cache is overwritten with Shift_JIS.
            ev("load:memorycache", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },

        {
          clearMemory: true,
          file: "file_js_cache_charset_js.sjs",
          charset: "Shift_JIS",
          verifyText: "\u3042",
          events: [
            // After clearing the memory cache, the disk cache should be used
            // for Shift_JIS load.
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "",
          verifyText: "\u201a\xa0",
          events: [
            // The disk cache was already overwritten, and it should fall back
            // to the source.
            // The necko cache's fetch count already hits 4, and loading
            // source immediately created a disk cache.
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("load:fallback", "file_js_cache_charset_js.sjs"),
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        {
          file: "file_js_cache_charset_js.sjs",
          charset: "UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // The disk cache was already overwritten, and it should fall back
            // to the source.
            // The necko cache's fetch count already hits 4, and loading
            // source immediately created a disk cache.
            ev("load:diskcache", "file_js_cache_charset_js.sjs"),
            ev("load:fallback", "file_js_cache_charset_js.sjs"),
            ev("load:source", "file_js_cache_charset_js.sjs"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

// Loading HTML document with script element performs preloads.
add_task(async function testPageDiskCache() {
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
      title: "charset dependent file",
      items: [
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // Loading with different charset should hit the disk cache, and then
        // fall back to the network.
        // The fetch count already hits the threshold, and it should overwrite
        // the disk cache.
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:fallback", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // Loading with different charset should hit the disk cache, and then
        // fall back to the network.
        // The fetch count already hits the threshold, and it should overwrite
        // the disk cache.
        {
          page: "file_js_cache_charset_html.sjs?script=UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:fallback", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        // Loading with the same charset after the disk cache creation should
        // use the disk cache.
        {
          page: "file_js_cache_charset_html.sjs?script=UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:disabled", "file_js_cache_charset_js.sjs"),
          ],
        },
        // The disk cache for Shift_JIS is already overwritten.
        // Loading with Shift_JIS should hit the disk cache, and then fall back
        // to the network.
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:fallback", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:register", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testPageMemoryCache() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
      ["dom.script_loader.disk_cache_delay_ms", 0],
    ],
  });

  await runJSCacheTests([
    {
      title: "charset dependent file",
      items: [
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // Preload from the memory cache does not have the associated
            // script element.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            // At this point, the necko cache has fetchCount == 2.
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // At this point, the necko cache has fetchCount == 3.
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // The UTF-8 memory cache's fetch count becomes 4.
            // Disk cache is created for UTF-8.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },

        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // The Shift_JIS memory cache's fetch count is still 3.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            // The no-charset memory cache's fetch count becomes 4.
            // Disk cache is overwritten with no charset.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // The Shift_JIS memory cache's fetch count becomes 4.
            // Disk cache is overwritten with Shift_JIS.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },

        {
          clearMemory: true,
          page: "file_js_cache_charset_html.sjs?script=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // After clearing the memory cache, the disk cache should be used
            // for Shift_JIS load.
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=none",
          verifyText: "\u201a\xa0",
          events: [
            // The disk cache was already overwritten, and it should fall back
            // to the source.
            // The necko cache's fetch count already hits 4, and loading
            // source immediately created a disk cache.
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:fallback", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?script=UTF-8",
          verifyText: "\ufffd\ufffd",
          events: [
            // The disk cache was already overwritten, and it should fall back
            // to the source.
            // The necko cache's fetch count already hits 4, and loading
            // source immediately created a disk cache.
            ev("load:diskcache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:fallback", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:saved", "file_js_cache_charset_js.sjs", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testPageMemoryCacheDifferentDocumentEncoding() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
      ["dom.script_loader.disk_cache_delay_ms", 0],
    ],
  });

  await runJSCacheTests([
    {
      title: "charset dependent file with different document encoding",
      items: [
        {
          page: "file_js_cache_charset_html.sjs?",
          verifyText: "\u201a\xa0",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            // The document uses windows-1252 encoding, and the script is
            // decoded with windows-1252, and cached with windows-1252.
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?document=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // At the point of preload, the document's encoding is still the
            // *default* UTF-8, and not yet stabilized.
            //
            // The cache entry uses windows-1252, and the script's fallback
            // encoding is UTF-8.
            // Given that this is a preload with no hint charset, the mismatch
            // is ignored and the check is deferred to the actual load.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            // At this point, the document's encoding becomes windows-1252.
            //
            // The actual load ignores the preload above, given the encoding
            // mismatch, and starts another load.
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            // A cache entry with windows-1252 encoding already exists, where
            // the encoding is a part of cache value, not cache key.
            // The new entry with Shift_JIS encoding is not inserted into the
            // cache.
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?document=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // Given that the cache entry is still windows-1252,
            // performing the same request shows the same behavior again.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testPageMemoryCacheSameDocumentEncoding() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
      ["dom.script_loader.disk_cache_delay_ms", 0],
    ],
  });

  await runJSCacheTests([
    {
      title: "charset dependent file with same document encoding",
      items: [
        {
          page: "file_js_cache_charset_html.sjs?document=Shift_JIS",
          verifyText: "\u3042",
          events: [
            ev("load:source", "file_js_cache_charset_js.sjs", "dontcare"),
            // The document uses Shift_JIS encoding, and the script is
            // decoded with Shift_JIS, and cached with Shift_JIS.
            ev("memorycache:saved", "file_js_cache_charset_js.sjs"),
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          page: "file_js_cache_charset_html.sjs?document=Shift_JIS",
          verifyText: "\u3042",
          events: [
            // At the point of preload, the document's encoding is still the
            // *default* UTF-8, and not yet set to Shift_JIS.
            //
            // The cache entry uses Shift_JIS, and the script's fallback
            // encoding is UTF-8.
            // Given that this is a preload with no hint charset, the mismatch
            // is ignored and the check is deferred to OnDelayedReady.
            ev("load:memorycache", "file_js_cache_charset_js.sjs", "dontcare"),
            // Before OnDelayedReady, the document's encoding becomes Shift_JIS,
            // and the script's fallback encoding becomes Shift_JIS.
            // The encoding now matches, and the cache entry is used.
            ev("evaluate:classic", "file_js_cache_charset_js.sjs"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});
