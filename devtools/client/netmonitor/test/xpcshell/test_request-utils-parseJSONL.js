/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Test devtools/client/netmonitor/src/utils/request-utils.js functions
// |isJsonlContentType|, |isJsonlResponse| and |parseJSONL|, which detect and
// parse JSON Lines (JSONL/NDJSON) payloads.

"use strict";

const { require } = ChromeUtils.importESModule(
  "resource://devtools/shared/loader/Loader.sys.mjs"
);
const {
  isJsonlContentType,
  isJsonlResponse,
  parseJSONL,
} = require("resource://devtools/client/netmonitor/src/utils/request-utils.js");
const { JsonlLineError } = ChromeUtils.importESModule(
  "resource://devtools/client/shared/jsonl-utils.mjs"
);

add_task(function testIsJsonlContentType() {
  for (const contentType of [
    "application/jsonl",
    "application/jsonlines",
    "application/x-ndjson",
    "text/jsonl",
    "application/jsonl; charset=utf-8",
    "APPLICATION/JSONL",
    "application/vnd.mozilla.jsonlines.view",
  ]) {
    ok(isJsonlContentType(contentType), `${contentType} is JSON Lines`);
  }

  for (const contentType of [
    "application/json",
    "text/json",
    "application/manifest+json",
    "text/plain",
    "application/jsonlx",
    "",
    null,
    undefined,
  ]) {
    ok(!isJsonlContentType(contentType), `${contentType} is not JSON Lines`);
  }
});

add_task(function testIsJsonlResponse() {
  ok(
    isJsonlResponse("application/jsonl", "https://example.com/records"),
    "The content type alone is enough."
  );
  ok(
    isJsonlResponse("text/plain", "https://example.com/records.jsonl"),
    "A .jsonl file is recognized even when served as text/plain."
  );
  ok(
    isJsonlResponse("text/plain", "https://example.com/records.JSONL?since=1"),
    "The extension check is case insensitive and ignores the query string."
  );
  ok(
    !isJsonlResponse("text/plain", "https://example.com/jsonl/records.txt"),
    "A .jsonl path segment is not a .jsonl file."
  );
  ok(
    !isJsonlResponse("application/json", "https://example.com/records.json"),
    "Plain JSON is left alone."
  );
});

add_task(function testParseJSONL() {
  const { json } = parseJSONL('{"a":1}\n\n["b"]\nnot json\n{"c":{"d":2}}\n');

  equal(json.length, 4, "Blank lines are skipped.");
  equal(json[0].a, 1, "The first line is parsed.");
  equal(json[1][0], "b", "A top level array is parsed.");
  ok(
    JsonlLineError.isInstance(json[2]),
    "A line which isn't valid JSON becomes a JsonlLineError."
  );
  equal(json[2].raw, "not json", "The line's original text is kept.");
  ok(
    json[2].message.includes("at line 4 column 1 of the JSON data"),
    "The error message points at the line in the document, not at line 1."
  );
  equal(
    Object.keys(json[2]).length,
    0,
    "A JsonlLineError has no enumerable property, so it is a leaf in the tree."
  );
  equal(json[3].c.d, 2, "Parsing carries on after an invalid line.");

  Assert.deepEqual(parseJSONL(""), {}, "An empty payload has nothing to show.");
  Assert.deepEqual(
    parseJSONL("\n \n"),
    {},
    "A payload of blank lines has nothing to show."
  );
});
