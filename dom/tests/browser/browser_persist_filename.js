/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);

// Matches the _XXXX seed (4 base64url chars) that nsWebBrowserPersist appends
// to subresource filenames, immediately before any file extension.
const SEED_RE = /_[A-Za-z0-9_-]{4}(?=\.[^.]+$)/;

async function savePageToDir(url, name) {
  return BrowserTestUtils.withNewTab(url, async function (browser) {
    let doc = await new Promise(resolve => {
      browser.frameLoader.startPersistence(null, {
        onDocumentReady: resolve,
        onError(e) {
          ok(false, "startPersistence failed: " + e);
        },
      });
    });

    let browserPersist = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(Ci.nsIWebBrowserPersist);

    // saveDocument() requires nsIFile; derive paths from the nsIFile objects.
    let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
    let savedFile = tmp.clone();
    savedFile.append(name + ".html");
    let savedDir = tmp.clone();
    savedDir.append(name + "_files");

    registerCleanupFunction(async () => {
      await IOUtils.remove(savedFile.path, { ignoreAbsent: true });
      await IOUtils.remove(savedDir.path, {
        ignoreAbsent: true,
        recursive: true,
      });
    });

    await new Promise(resolve => {
      browserPersist.progressListener = {
        onProgressChange() {},
        onLocationChange() {},
        onStatusChange() {},
        onSecurityChange() {},
        onContentBlockingEvent() {},
        onStateChange(_persist, _req, state) {
          const done =
            Ci.nsIWebProgressListener.STATE_STOP |
            Ci.nsIWebProgressListener.STATE_IS_NETWORK;
          if ((state & done) === done) {
            resolve();
          }
        },
      };
      browserPersist.saveDocument(doc, savedFile, savedDir, null, 0, 0);
    });

    let children = await IOUtils.getChildren(savedDir.path, {
      ignoreAbsent: true,
    });
    return children.map(p => PathUtils.filename(p));
  });
}

// All subresources saved by one nsWebBrowserPersist instance must have a seed
// of the same value (it is generated once in the constructor).
add_task(async function test_seed_format_and_consistency() {
  let files = await savePageToDir(
    TEST_PATH + "file_browserPersist_filename.html",
    "browserPersist_seed_consistency"
  );

  Assert.greaterOrEqual(
    files.length,
    2,
    "At least two subresources were saved"
  );

  for (let name of files) {
    Assert.ok(SEED_RE.test(name), `${name} has a seed suffix`);
  }

  let seeds = new Set(files.map(name => (name.match(SEED_RE) || [""])[0]));
  Assert.equal(
    seeds.size,
    1,
    `All saved subresources share the same seed, got: ${Array.from(seeds)}`
  );
});

// When the filename exceeds kDefaultMaxFilenameLength the base is truncated,
// but the seed must still be present in the saved filename.
add_task(async function test_long_filename_truncated_with_seed() {
  let files = await savePageToDir(
    TEST_PATH + "file_browserPersist_filename.html",
    "browserPersist_truncation"
  );

  let longFile = files.find(name =>
    name.startsWith("file_browserPersist_a_very_long")
  );
  Assert.ok(longFile, "Long-named CSS file was saved");
  Assert.lessOrEqual(
    longFile.length,
    64,
    `Saved filename length ${longFile.length} is at most 64 chars`
  );
  Assert.ok(
    SEED_RE.test(longFile),
    `Truncated filename still has a seed: ${longFile}`
  );
});

// When two subresource URLs produce the same base filename, the second one gets
// a uniqueness counter (_002, _003, …) inserted before the seed.
add_task(async function test_uniqueness_counter_with_seed() {
  let files = await savePageToDir(
    TEST_PATH + "file_browserPersist_filename.html",
    "browserPersist_uniqueness"
  );

  let dummyFiles = files.filter(name => name.startsWith("dummy"));
  Assert.equal(
    dummyFiles.length,
    2,
    "Both dummy.png references were saved separately"
  );

  let seeds = dummyFiles.map(name => (name.match(SEED_RE) || [""])[0]);
  Assert.equal(seeds[0], seeds[1], "Both files share the same seed");

  Assert.ok(
    dummyFiles.some(name => /_\d{3}_[A-Za-z0-9_-]{4}\./.test(name)),
    "One dummy file has a uniqueness counter before the seed"
  );
});

// Truncation must not split a multi-byte UTF-8 character. U+9234 is 3 bytes
// in UTF-8, and a base is cut to 64 - 5 (seed) - 4 (".css") = 55 bytes.
add_task(async function test_truncation_keeps_utf8_characters_whole() {
  const { HttpServer } = ChromeUtils.importESModule(
    "resource://testing-common/httpd.sys.mjs"
  );
  const CJK = "鈴".repeat(5);
  const prefixA = "truncation-splits-a-character-a".padEnd(53, "-");
  const prefixB = "truncation-splits-a-character-b".padEnd(46, "-");
  const extC = "a".repeat(56);
  const extD = "x".repeat(53);
  const prefixE = "emoji-clean-cut".padEnd(51, "-");
  const prefixF = "emoji-split-cut".padEnd(52, "-");
  const emojiControl = "c".repeat(51) + "😀.css";
  const SEED = "_[A-Za-z0-9_-]{4}";

  const cases = [
    {
      desc: "3-byte base truncation before a split character",
      name: prefixA + CJK + ".css",
      expected: `^${prefixA}${SEED}\\.css$`,
    },
    {
      desc: "3-byte base truncation at a character boundary",
      name: prefixB + CJK + ".css",
      expected: `^${prefixB}${"鈴".repeat(3)}${SEED}\\.css$`,
    },
    {
      desc: "uniqueness counter truncates at a character boundary",
      name: prefixB + CJK + ".css",
      query: "?v=2",
      expected: `^${prefixB}鈴_002${SEED}\\.css$`,
    },
    {
      desc: "ASCII extension truncation keeps the first base character",
      name: "鈴鈴." + extC,
      expected: `^鈴${SEED}\\.${extC.slice(1)}$`,
    },
    {
      desc: "3-byte extension truncation ends at a character boundary",
      name: "鈴." + "鈴".repeat(20),
      expected: `^鈴${SEED}\\.${"鈴".repeat(18)}$`,
    },
    {
      desc: "4-byte base truncation at a character boundary",
      name: prefixE + "😀".repeat(3) + ".css",
      expected: `^${prefixE}😀${SEED}\\.css$`,
    },
    {
      desc: "4-byte base truncation inside a character",
      name: prefixF + "😀".repeat(3) + ".css",
      expected: `^${prefixF}${SEED}\\.css$`,
    },
    {
      desc: "name that fits the limit remains unchanged",
      name: emojiControl,
      expected: `^${emojiControl.slice(0, -4)}${SEED}\\.css$`,
    },
    {
      desc: "uniqueness counter fits before the 4-byte character",
      name: emojiControl,
      query: "?v=2",
      expected: `^${"c".repeat(51)}_002${SEED}\\.css$`,
    },
    {
      desc: "short base remains intact for the uniqueness counter",
      name: "a." + extD,
      expected: `^a${SEED}\\.${extD}$`,
    },
    {
      desc: "short base keeps the uniqueness counter",
      name: "a." + extD,
      query: "?v=2",
      expected: `^a_002${SEED}\\.${extD}$`,
    },
  ];

  let server = new HttpServer();
  server.registerPrefixHandler("/", (request, response) => {
    if (request.path == "/page.html") {
      let links = cases.map(
        ({ name, query = "" }) =>
          `<link rel="stylesheet" href="${encodeURIComponent(name)}${query}">`
      );
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.write("<!DOCTYPE html>" + links.join(""));
      return;
    }
    if (request.path.endsWith(".css")) {
      response.setHeader("Content-Type", "text/css");
    } else {
      response.setHeader("Content-Type", "application/octet-stream");
    }
    response.write("body {}");
  });
  server.start(-1);
  registerCleanupFunction(() => new Promise(resolve => server.stop(resolve)));

  let files = await savePageToDir(
    `http://localhost:${server.identity.primaryPort}/page.html`,
    "browserPersist_utf8_truncation"
  );

  for (const { desc, expected } of cases) {
    Assert.ok(
      files.some(name => new RegExp(expected).test(name)),
      `${desc}: expected /${expected}/ in ${files}`
    );
  }
});
