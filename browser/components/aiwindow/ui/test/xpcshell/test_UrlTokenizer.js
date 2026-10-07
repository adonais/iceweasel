/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { UrlTokenizer, expandUrlTokens, stripUnresolvedUrlTokens } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/UrlTokenizer.sys.mjs"
  );

add_task(async function test_UrlTokenizer_encodeToken() {
  const cases = [
    {
      message: "Works for a URL with a path.",
      url: "http://www.github.com/foo/bar/baz",
      expected: "GITHUB_COM_FOO_BAR_BAZ_1",
    },
    {
      message:
        "Returns a new number for a URL that is different but creates the same token.",
      url: "http://www.github.com/foo/bar/baz?ignored",
      expected: "GITHUB_COM_FOO_BAR_BAZ_2",
    },
    {
      message: "Returns the exact same token given another URL",
      url: "http://www.github.com/foo/bar/baz",
      expected: "GITHUB_COM_FOO_BAR_BAZ_1",
    },
    {
      message:
        "Returns a different token given the same URL with a different protocol",
      url: "https://www.github.com/foo/bar/baz",
      expected: "GITHUB_COM_FOO_BAR_BAZ_3",
    },
    {
      message: "Can handle about URLs.",
      url: "about:config",
      expected: "ABOUT_CONFIG_1",
    },
    {
      message: "Uses non-http protocols",
      url: "ftp://github.com/foo/bar/baz",
      expected: "FTP_GITHUB_COM_FOO_BAR_BAZ_1",
    },
    {
      message: "Uses invalid protocols",
      url: "asdf://github.com/foo/bar/baz",
      expected: "ASDF_GITHUB_COM_FOO_BAR_BAZ_1",
    },
    {
      message: "Ignores the port.",
      url: "http://github.com:1234/ignore/port",
      expected: "GITHUB_COM_IGNORE_PORT_1",
    },
    {
      message: "Ignores the params.",
      url: "http://www.github.com/ignore/params?token=xxx",
      expected: "GITHUB_COM_IGNORE_PARAMS_1",
    },
    {
      message: "Ignores the hash.",
      url: "http://www.github.com/ignore/hash/part?token=xxx#hash",
      expected: "GITHUB_COM_IGNORE_HASH_PART_1",
    },
    {
      message: "Truncates text in the host from 110 to 100.",
      url: `http://www.${"a".repeat(110)}.com/foo`,
      expected: "A".repeat(100) + "_1",
    },
    {
      message: "Skips text in the path that is too long",
      url: `http://github.com/skip/long/path/` + "A".repeat(100),
      expected: "GITHUB_COM_SKIP_LONG_PATH_1",
    },
  ];

  const urlTokenizer = new UrlTokenizer({});

  for (const { message, url, expected } of cases) {
    const token = urlTokenizer.encodeToken(url);
    Assert.equal(token, expected, message);

    const decodedUrl = urlTokenizer.tokenToUrl.get(token);
    Assert.equal(
      decodedUrl,
      url,
      `Expected the decoded token (${token}) to equal '${url}' but got: ${decodedUrl}`
    );
  }
});

// expandUrlTokens tests

add_task(function test_expandUrlTokens_bare_token() {
  const mapping = new Map([["GITHUB_COM_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "Check out §url_token: GITHUB_COM_1§ for details.",
    mapping
  );
  Assert.equal(
    result,
    "Check out https://github.com/foo for details.",
    "Bare token should be replaced with full URL"
  );
});

add_task(function test_expandUrlTokens_bracketed_id_in_href_resolved() {
  const mapping = new Map([["GITHUB_COM_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](§url_token: GITHUB_COM_1§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](https://github.com/foo)",
    "Bracketed ID in href should be expanded to full URL"
  );
});

add_task(function test_expandUrlTokens_same_domain() {
  const mapping = new Map([
    ["GITHUB_COM_1", "https://github.com/foo"],
    ["GITHUB_COM_2", "https://github.com/foo/bar"],
  ]);
  const result = expandUrlTokens(
    "[Click here](§url_token: GITHUB_COM_2§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](https://github.com/foo/bar)",
    "Bracketed ID in href should be expanded to longer URL"
  );
});

add_task(function test_expandUrlTokens_no_space() {
  const mapping = new Map([["GITHUB_COM_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](§url_token:GITHUB_COM_1§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](https://github.com/foo)",
    "Should handle missing space after token type and still expand to correct URL"
  );
});

add_task(function test_expandUrlTokens_no_mapping() {
  const mapping = new Map();
  const result = expandUrlTokens(
    "[Click here](§url_token: GITHUB_COM_2§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](§url_token: GITHUB_COM_2§)",
    "ID should remain unchanged if not in mapping"
  );
});

add_task(function test_expandUrlTokens_lowercase() {
  const mapping = new Map([["github_com_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](§url_token: github_com_1§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](§url_token: github_com_1§)",
    "Shouldn't match lowercase ID"
  );
});

add_task(function test_expandUrlTokens_no_digits() {
  const mapping = new Map([["GITHUB_COM", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](§url_token: GITHUB_COM§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](§url_token: GITHUB_COM§)",
    "Shouldn't match tags missing digits"
  );
});

add_task(function test_expandUrlTokens_special_characters() {
  const mapping = new Map([["GITHUB_COM$_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](§url_token: GITHUB_COM$_1§)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](§url_token: GITHUB_COM$_1§)",
    "Shouldn't match tags with special characters"
  );
});

add_task(function test_expandUrlTokens_missing_separator() {
  const mapping = new Map([["GITHUB_COM_1", "https://github.com/foo"]]);
  const result = expandUrlTokens(
    "[Click here](url_token: GITHUB_COM_1)",
    mapping
  );
  Assert.equal(
    result,
    "[Click here](url_token: GITHUB_COM_1)",
    "Shouldn't match missing § separators"
  );
});

add_task(function test_expandUrlTokens_wrong_tag_name() {
  const mapping = new Map([["GITHUB_COM_1", "https://github.com/foo"]]);
  const result = expandUrlTokens("[Click here](§url: GITHUB_COM_1§)", mapping);
  Assert.equal(
    result,
    "[Click here](§url: GITHUB_COM_1§)",
    "Shouldn't match wrong tag name"
  );
});

// stripUnresolvedUrlTokens tests

add_task(function test_stripUnresolvedUrlTokens() {
  Assert.equal(
    stripUnresolvedUrlTokens("Try §url_token: GITHUB_COM_1§ next."),
    "Try  next.",
    "An unresolved token should be removed from the text"
  );
  Assert.equal(
    stripUnresolvedUrlTokens("[Click here](§url: GITHUB_COM_1§)"),
    "[Click here](§url: GITHUB_COM_1§)",
    "Text that is not a URL token should be left alone"
  );
});
