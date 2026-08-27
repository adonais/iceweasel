/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function testPageRenders() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    const dropzone = doc.getElementById("dropzone");
    ok(dropzone, "dropzone exists");
    ok(doc.getElementById("dropzone-hint"), "dropzone-hint exists");
    ok(doc.getElementById("browse-files"), "browse button exists");

    await ContentTaskUtils.waitForCondition(
      () => dropzone.title,
      "dropzone title is localized"
    );
    ok(dropzone.title, "dropzone exposes a native title tooltip");

    const errorEl = doc.getElementById("dropzone-error");
    ok(errorEl.hidden, "error is hidden initially");
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testDragVisualState() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const dropzone = content.document.getElementById("dropzone");
    ok(!dropzone.classList.contains("drag-over"), "no drag-over initially");

    dropzone.dispatchEvent(
      new content.DragEvent("dragenter", { bubbles: true, cancelable: true })
    );
    ok(
      dropzone.classList.contains("drag-over"),
      "drag-over added on dragenter"
    );

    dropzone.dispatchEvent(
      new content.DragEvent("dragleave", {
        bubbles: true,
        cancelable: true,
        relatedTarget: content.document.body,
      })
    );
    ok(
      !dropzone.classList.contains("drag-over"),
      "drag-over removed when leaving dropzone"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testDropOnlyCancelsNonPDFs() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const doc = content.document;
    const dropzone = doc.getElementById("dropzone");
    const errorEl = doc.getElementById("dropzone-error");

    // Build the DataTransfer in the page's principal so its files are readable.
    const sandbox = SpecialPowers.Cu.Sandbox(doc.nodePrincipal, {
      sandboxPrototype: content,
    });
    const buildDataTransfer = SpecialPowers.Cu.evalInSandbox(
      `files => {
         const dataTransfer = new DataTransfer();
         for (const { name, type } of files) {
           dataTransfer.items.add(new File(["%PDF-1.4"], name, { type }));
         }
         return dataTransfer;
       }`,
      sandbox
    );

    // Record whether the page canceled the drop before canceling it for the test.
    function drop(...files) {
      const dataTransfer = buildDataTransfer(
        SpecialPowers.Cu.cloneInto(files, sandbox)
      );
      let canceledByPage;
      doc.addEventListener(
        "drop",
        e => {
          canceledByPage = e.defaultPrevented;
          // Prevent native drop handling in this synthetic test.
          e.preventDefault();
        },
        { once: true }
      );
      dropzone.dispatchEvent(
        new content.DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        })
      );
      return canceledByPage;
    }

    const pdf = { name: "doc.pdf", type: "application/pdf" };
    const text = { name: "doc.txt", type: "text/plain" };

    ok(!drop(pdf), "a dropped PDF is left to the browser to open");
    ok(errorEl.hidden, "no error is shown for a PDF");

    ok(drop(text), "a dropped non-PDF is canceled");
    ok(!errorEl.hidden, "the invalid file error is shown");

    ok(
      drop({ name: "doc.pdf", type: "text/plain" }),
      "a .pdf name with another type is canceled"
    );
    ok(drop(pdf, text), "a mixed set of dropped files is canceled");
    ok(drop(), "a drop without any file is canceled");
  });
  BrowserTestUtils.removeTab(tab);
});
