/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TabNotes } = ChromeUtils.importESModule(
  "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs"
);

add_task(async function tabNotesBasicStorageTests() {
  let url = "https://example.com/abc";
  let value = "some note";

  let result = TabNotes.set(url, value);
  Assert.equal(result, value, "TabNotes.set returns note value");

  Assert.equal(
    TabNotes.has(url),
    true,
    "TabNotes.has indicates that URL has a note"
  );

  Assert.equal(
    TabNotes.get(url),
    value,
    "TabNotes.get returns previously set note value"
  );

  TabNotes.delete(url);

  Assert.equal(
    TabNotes.has(url),
    false,
    "TabNotes.has indicates that the deleted URL no longer has a note"
  );

  Assert.equal(
    TabNotes.get(url),
    undefined,
    "TabNotes.get returns undefined for URL that does not have a note"
  );

  TabNotes.reset();
});

add_task(async function tabNotesSanitizationTests() {
  let url = "https://example.com/";
  let tooLongValue = "x".repeat(1500);
  let correctValue = "x".repeat(1000);

  TabNotes.set(url, tooLongValue);
  let result = TabNotes.get(url);

  Assert.equal(result, correctValue, "TabNotes.set truncates note length");

  TabNotes.reset();
});
