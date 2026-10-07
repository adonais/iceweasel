const { E10SUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/E10SUtils.sys.mjs"
);

var TEST_PREFERRED_REMOTE_TYPES = [
  E10SUtils.WEB_REMOTE_TYPE,
  E10SUtils.NOT_REMOTE,
];

var TEST_USE_REMOTE_SUBFRAMES = [true, false];

// These test cases give a nestedURL and a plainURL that should always load in
// the same remote type. By making these tests comparisons, they should work
// with any pref combination.
var TEST_CASES = [
  {
    nestedURL: "jar:file:///some.file!/",
    plainURL: "file:///some.file",
  },
  {
    nestedURL: "jar:jar:file:///some.file!/!/",
    plainURL: "file:///some.file",
  },
  {
    nestedURL: "jar:http://some.site/file!/",
    plainURL: "http://some.site/file",
  },
  {
    nestedURL: "view-source:http://some.site",
    plainURL: "http://some.site",
  },
  {
    nestedURL: "view-source:file:///some.file",
    plainURL: "file:///some.file",
  },
  {
    nestedURL: "view-source:about:home",
    plainURL: "about:home",
  },
  {
    nestedURL: "view-source:about:robots",
    plainURL: "about:robots",
  },
];

// The "url" parameter of an about:reader URI steers process selection like a
// nested URI does, but about:reader only ever loads http(s) and file
// documents, so for any other scheme the parameter must be ignored.
var READER_HONOURS_URL = [
  {
    readerURL: "about:reader?url=http%3A%2F%2Fsome.site",
    plainURL: "http://some.site",
  },
  {
    readerURL: "about:reader?url=file%3A%2F%2F%2Fsome.file",
    plainURL: "file:///some.file",
  },
];

var READER_IGNORES_URL = [
  "about:reader?url=about%3Aconfig",
  "about:reader?url=about%3Alogins",
  "about:reader?url=chrome%3A%2F%2Fglobal%2Fcontent%2Freader%2FaboutReader.html",
  "about:reader?url=resource%3A%2F%2Fgre%2Fmodules%2FE10SUtils.sys.mjs",
  "about:reader?url=moz-extension%3A%2F%2F6c56e6dd-e2c1-4d2f-9c9d-6d0e6f0d3b62%2Fx.html",
  "about:reader?url=jar%3Afile%3A%2F%2F%2Fsome.file!%2F",
];

function run_test() {
  for (let testCase of TEST_CASES) {
    for (let preferredRemoteType of TEST_PREFERRED_REMOTE_TYPES) {
      for (let useRemoteSubframes of TEST_USE_REMOTE_SUBFRAMES) {
        let plainUri = Services.io.newURI(testCase.plainURL);
        let plainRemoteType = ChromeUtils.predictRemoteTypeForURI(plainUri, {
          useRemoteTabs: true,
          useRemoteSubframes,
          preferredRemoteType,
        });

        let nestedUri = Services.io.newURI(testCase.nestedURL);
        let nestedRemoteType = ChromeUtils.predictRemoteTypeForURI(nestedUri, {
          useRemoteTabs: true,
          useRemoteSubframes,
          preferredRemoteType,
        });

        let nestedStr = nestedUri.scheme + ":";
        do {
          nestedUri = nestedUri.QueryInterface(Ci.nsINestedURI).innerURI;
          if (nestedUri.scheme == "about") {
            nestedStr += nestedUri.spec;
            break;
          }

          nestedStr += nestedUri.scheme + ":";
        } while (nestedUri instanceof Ci.nsINestedURI);

        let plainStr =
          plainUri.scheme == "about" ? plainUri.spec : plainUri.scheme + ":";
        equal(
          nestedRemoteType,
          plainRemoteType,
          `Check that ${nestedStr} loads in same remote type as ${plainStr}` +
            ` with preferred remote type: ${preferredRemoteType}` +
            ` and remote subframes: ${useRemoteSubframes}`
        );
      }
    }
  }

  for (let preferredRemoteType of TEST_PREFERRED_REMOTE_TYPES) {
    for (let useRemoteSubframes of TEST_USE_REMOTE_SUBFRAMES) {
      let options = {
        useRemoteTabs: true,
        useRemoteSubframes,
        preferredRemoteType,
      };
      let suffix =
        ` with preferred remote type: ${preferredRemoteType}` +
        ` and remote subframes: ${useRemoteSubframes}`;

      for (let { readerURL, plainURL } of READER_HONOURS_URL) {
        equal(
          ChromeUtils.predictRemoteTypeForURI(
            Services.io.newURI(readerURL),
            options
          ),
          ChromeUtils.predictRemoteTypeForURI(
            Services.io.newURI(plainURL),
            options
          ),
          `Check that ${readerURL} loads in same remote type as ${plainURL}` +
            suffix
        );
      }

      let bareReaderRemoteType = ChromeUtils.predictRemoteTypeForURI(
        Services.io.newURI("about:reader"),
        options
      );
      for (let readerURL of READER_IGNORES_URL) {
        equal(
          ChromeUtils.predictRemoteTypeForURI(
            Services.io.newURI(readerURL),
            options
          ),
          bareReaderRemoteType,
          `Check that ${readerURL} loads in same remote type as about:reader` +
            suffix
        );
      }
    }
  }
}
