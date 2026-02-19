/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(function type_typed() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens },
    expected: {
      value: "https://test.example.com/",
      highlights: [[8, 4]],
    },
  });
});

add_task(function type_suggested() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.SEARCH,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      suggestion: "test search test",
    },
    highlights: {
      suggestion: UrlbarUtils.HIGHLIGHT.SUGGESTED,
    },
  });

  doTest({
    result,
    target: "suggestion",
    options: { tokens: queryContext.tokens },
    expected: {
      value: "test search test",
      highlights: [[4, 8]],
    },
  });
});

add_task(function type_all() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.ALL,
    },
  });

  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens },
    expected: {
      value: "https://test.example.com/",
      highlights: [[0, 25]],
    },
  });
});

add_task(function option_isURL() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens, isURL: true },
    expected: {
      value: "test.example.com",
      highlights: [[0, 4]],
    },
  });
});

add_task(function option_no_tokens() {
  let queryContext = createContext("");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens },
    expected: {
      value: "https://test.example.com/",
      highlights: undefined,
    },
  });
});

add_task(function option_nothing() {
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  doTest({
    result,
    target: "url",
    expected: {
      value: "https://test.example.com/",
      highlights: undefined,
    },
  });
});

add_task(function invalid_target() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  doTest({
    result,
    target: "invalid",
    options: { tokens: queryContext.tokens },
    expected: {
      value: undefined,
      highlights: undefined,
    },
  });
});

add_task(function cache() {
  let queryContext = createContext("test");
  let result = new UrlbarResult({
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    payload: {
      url: "https://test.example.com/",
    },
    highlights: {
      url: UrlbarUtils.HIGHLIGHT.TYPED,
    },
  });

  info("Get without any options");
  doTest({
    result,
    target: "url",
    expected: {
      value: "https://test.example.com/",
      highlights: undefined,
    },
  });

  info("Get with tokens");
  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens },
    expected: {
      value: "https://test.example.com/",
      highlights: [[8, 4]],
    },
  });

  info("Get with different isURL");
  doTest({
    result,
    target: "url",
    options: { tokens: queryContext.tokens, isURL: true },
    expected: {
      value: "test.example.com",
      highlights: [[0, 4]],
    },
  });

  info("Get without tokens");
  doTest({
    result,
    target: "url",
    options: { isURL: true },
    expected: {
      value: "test.example.com",
      highlights: [[0, 4]],
    },
  });

  info("Get without different tokens");
  let anotherQueryContext = createContext("example");
  doTest({
    result,
    target: "url",
    options: { tokens: anotherQueryContext.tokens },
    expected: {
      value: "https://test.example.com/",
      highlights: [[13, 7]],
    },
  });
});

function doTest({ result, target, options, expected }) {
  let { value, highlights } = result.getDisplayableValueAndHighlights(
    target,
    options
  );
  Assert.equal(value, expected.value);
  Assert.deepEqual(highlights, expected.highlights);
}
