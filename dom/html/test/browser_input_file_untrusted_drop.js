/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const PAGE = TEST_PATH + "file_input_file_untrusted_drop.html";

const FILE_CONTENTS = "not for the page to see";

async function createDraggedFile() {
  const path = PathUtils.join(
    PathUtils.tempDir,
    "browser_input_file_untrusted_drop.txt"
  );
  await IOUtils.writeUTF8(path, FILE_CONTENTS);
  registerCleanupFunction(() => IOUtils.remove(path, { ignoreAbsent: true }));
  return File.createFromFileName(path);
}

function dragFileOverInput(browser, file) {
  return SpecialPowers.spawn(browser, [file], async draggedFile => {
    const doc = content.document;
    const input = doc.getElementById("fileinput");

    content.wrappedJSObject.installDragEnterStealer();

    const dragData = [[{ type: "application/x-moz-file", data: draggedFile }]];

    EventUtils.startDragSession(content, "copy");
    try {
      // Fires dragstart on #dragsource, then dragenter and dragover on the
      // file input. No drop.
      EventUtils.synthesizeDragOver(
        doc.getElementById("dragsource"),
        input,
        dragData,
        "copy",
        content
      );
    } finally {
      content.windowUtils.dragSession?.endDragSession(true);
    }

    const stolen = content.wrappedJSObject.stealResult;
    return {
      fileCountAfterDrag: input.files.length,
      stolen: stolen
        ? {
            types: Array.from(stolen.types),
            itemCount: stolen.itemCount,
            fileCountDuringDragEnter: stolen.fileCountDuringDragEnter,
            anyItemReadableAsFile: stolen.anyItemReadableAsFile,
            dropEventCancelled: stolen.dropEventCancelled,
            fileCountAfterUntrustedDrop: stolen.fileCountAfterUntrustedDrop,
          }
        : null,
    };
  });
}

add_task(async function test_stolen_datatransfer_in_untrusted_drop() {
  const file = await createDraggedFile();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const result = await dragFileOverInput(browser, file);

    if (!ok(result.stolen, "The page saw a dragenter event")) {
      return;
    }

    ok(
      result.stolen.types.includes("Files"),
      "The page can see that the drag carries a file"
    );
    is(result.stolen.itemCount, 1, "The page can see one item");
    is(
      result.stolen.fileCountDuringDragEnter,
      0,
      "DataTransfer.files is empty during dragenter"
    );
    ok(
      !result.stolen.anyItemReadableAsFile,
      "getAsFile() returns null during dragenter"
    );

    ok(
      !result.stolen.dropEventCancelled,
      "The untrusted drop event was not handled by the file control"
    );
    is(
      result.stolen.fileCountAfterUntrustedDrop,
      0,
      "The untrusted drop did not set input.files"
    );
    is(result.fileCountAfterDrag, 0, "input.files is still empty");
  });
});

add_task(async function test_untrusted_events_with_page_made_datatransfer() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const [dragOverAllowed, fileCount] = await SpecialPowers.spawn(
      browser,
      [],
      () => [
        content.wrappedJSObject.spoofUntrustedDragOver(),
        content.wrappedJSObject.spoofUntrustedDrop(),
      ]
    );

    ok(
      dragOverAllowed,
      "The file control did not preventDefault() an untrusted dragover"
    );
    is(fileCount, 0, "An untrusted drop did not set input.files");
  });
});

// Make sure the above isn't passing because dropping files stopped working.
add_task(async function test_trusted_drop_still_works() {
  const file = await createDraggedFile();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const result = await SpecialPowers.spawn(
      browser,
      [file],
      async draggedFile => {
        const doc = content.document;
        const input = doc.getElementById("fileinput");

        const changed = new Promise(resolve =>
          input.addEventListener("change", resolve, { once: true })
        );

        EventUtils.synthesizeDrop(
          doc.getElementById("dragsource"),
          input,
          [[{ type: "application/x-moz-file", data: draggedFile }]],
          "copy",
          content
        );

        // Only wait for the change event if the drop actually did something,
        // otherwise a regression here would hang until the test times out
        // instead of failing with a useful message.
        const fileCount = input.files.length;
        if (fileCount) {
          await changed;
        }

        return {
          fileCount,
          text: fileCount ? await input.files[0].text() : null,
        };
      }
    );

    is(result.fileCount, 1, "A trusted drop set input.files");
    is(result.text, FILE_CONTENTS, "The dropped file is readable");
  });
});
