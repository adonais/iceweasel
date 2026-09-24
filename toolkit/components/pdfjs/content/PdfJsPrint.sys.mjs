/* Copyright 2026 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Match ISO 32000-1's 14,400-unit implementation limit (72 units/in).
const MAX_PRINT_TO_PDF_PAGE_SIZE_IN_INCHES = 200;
// Cap the generated PDF's storage stream at 100 MiB.
const MAX_PRINT_TO_PDF_SIZE = 100 * 1024 * 1024;
// "%PDF-"
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];
// "%%EOF"
const PDF_EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46];
// Acrobat accepts the EOF marker anywhere in the final 1 KiB.
const PDF_EOF_SEARCH_SIZE = 1024;
// nsIStorageStream's allocation unit, not its total-size limit.
const STORAGE_STREAM_SEGMENT_SIZE = 4096;

// Accept only a same-principal descendant of the viewer.
function doesViewerOwnTarget(viewer, target) {
  let isDescendant = false;
  for (let bc = target?.parent; bc; bc = bc.parent) {
    if (bc === viewer) {
      isDescendant = true;
      break;
    }
  }
  if (!isDescendant) {
    return false;
  }
  const viewerPrincipal = viewer.currentWindowGlobal?.documentPrincipal;
  const targetPrincipal = target.currentWindowGlobal?.documentPrincipal;
  return (
    !!viewerPrincipal &&
    !!targetPrincipal &&
    viewerPrincipal.equals(targetPrincipal)
  );
}

// Check the expected boundary markers; this is not a general PDF validator.
export function hasPDFHeaderAndEOF(buffer) {
  if (!buffer || buffer.byteLength <= PDF_HEADER.length) {
    return false;
  }
  const header = new Uint8Array(buffer, 0, PDF_HEADER.length);
  if (!PDF_HEADER.every((byte, index) => header[index] === byte)) {
    return false;
  }
  // Search for PDF_EOF_MARKER in the final 1 KiB "tail" of the buffer, working
  // backwards from the end of the "tail" since it's more likely to be there.
  const tailLength = Math.min(buffer.byteLength, PDF_EOF_SEARCH_SIZE);
  const tail = new Uint8Array(buffer, buffer.byteLength - tailLength);
  for (let i = tail.length - PDF_EOF_MARKER.length; i >= 0; i--) {
    if (PDF_EOF_MARKER.every((byte, index) => tail[i + index] === byte)) {
      return true;
    }
  }
  return false;
}

export const PdfJsPrint = {
  /**
   * Print `target` to a PDF and return its bytes.
   *
   * @param {CanonicalBrowsingContext} viewer - the pdf.js viewer's browsing
   *   context (the actor's own context), used to authenticate `target`.
   * @param {CanonicalBrowsingContext} target - the hidden iframe, owned by
   *   `viewer`, holding the content to print.
   * @param {number} width - the paper width, in inches.
   * @param {number} height - the paper height, in inches.
   * @returns {Promise<ArrayBuffer|null>} the PDF bytes, or null if validation
   *   fails or printing produces no usable output.
   */
  async printToPDF(viewer, target, width, height) {
    if (!doesViewerOwnTarget(viewer, target)) {
      return null;
    }
    // Reject invalid sizes and cap valid ones before allocating print surfaces.
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    width = Math.min(width, MAX_PRINT_TO_PDF_PAGE_SIZE_IN_INCHES);
    height = Math.min(height, MAX_PRINT_TO_PDF_PAGE_SIZE_IN_INCHES);

    const stream = Cc["@mozilla.org/storagestream;1"].createInstance(
      Ci.nsIStorageStream
    );
    stream.init(STORAGE_STREAM_SEGMENT_SIZE, MAX_PRINT_TO_PDF_SIZE);

    const psService = Cc["@mozilla.org/gfx/printsettings-service;1"].getService(
      Ci.nsIPrintSettingsService
    );
    const printSettings = psService.createNewPrintSettings();
    printSettings.outputFormat = Ci.nsIPrintSettings.kOutputFormatPDF;
    // Select Firefox's built-in PDF destination.
    printSettings.printerName = "Mozilla Save to PDF";
    printSettings.printSilent = true;

    printSettings.paperSizeUnit = Ci.nsIPrintSettings.kPaperSizeInches;
    printSettings.paperWidth = width;
    printSettings.paperHeight = height;

    printSettings.marginBottom =
      printSettings.marginLeft =
      printSettings.marginRight =
      printSettings.marginTop =
      printSettings.unwriteableMarginTop =
      printSettings.unwriteableMarginLeft =
      printSettings.unwriteableMarginBottom =
      printSettings.unwriteableMarginRight =
        0;

    printSettings.shrinkToFit = false;

    printSettings.headerStrCenter =
      printSettings.headerStrLeft =
      printSettings.headerStrRight =
      printSettings.footerStrCenter =
      printSettings.footerStrLeft =
      printSettings.footerStrRight =
        "";

    printSettings.outputDestination =
      Ci.nsIPrintSettings.kOutputDestinationStream;
    const outputStream = stream.getOutputStream(0);
    printSettings.outputStream = outputStream;

    let inputStream;
    try {
      await target.print(printSettings);

      inputStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream
      );
      inputStream.setInputStream(stream.newInputStream(0));

      // All of the PDF data is available on the input stream, because the
      // stream's source is the print operation which already completed.
      const available = inputStream.available();
      const buffer = new ArrayBuffer(available);
      inputStream.readArrayBuffer(available, buffer);

      if (!hasPDFHeaderAndEOF(buffer)) {
        console.warn("PdfJsPrint: printing produced no usable PDF.");
        return null;
      }
      return buffer;
    } finally {
      try {
        outputStream.close();
      } catch (ex) {
        console.warn("PdfJsPrint: failed to close PDF output stream.", ex);
      }
      try {
        inputStream?.close();
      } catch (ex) {
        console.warn("PdfJsPrint: failed to close PDF input stream.", ex);
      }
    }
  },
};
