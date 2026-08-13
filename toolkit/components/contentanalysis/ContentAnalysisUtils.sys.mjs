/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Contains helper methods for JS code that need to call into
 * Content Analysis. Note that most JS code will not need to explicitly
 * use this - this is only for edge cases that the existing C++ code
 * does not handle, such as pasting into a prompt() or pasting into
 * the GenAI chatbot shortcut menu.
 */
// @ts-check

export const ContentAnalysisUtils = {
  /**
   * Builds an nsIContentAnalysisRequest from the given parameters.
   *
   * @param {object} data The core properties of the request.
   * @param {nsIContentAnalysisRequest.AnalysisType} data.analysisType The type of analysis being requested.
   * @param {nsIContentAnalysisRequest.OperationType} data.operationTypeForDisplay The operation to display to the user.
   * @param {nsIContentAnalysisRequest.Reason} data.reason The reason the request was created.
   * @param {nsIURI} data.url An nsIURI that indicates where the content would be sent to.
   * @param {WindowGlobalParent} data.windowGlobalParent The WindowGlobalParent associated with the request.
   * @param {object} [extraProps] Additional properties to set on the returned request.
   * @returns {nsIContentAnalysisRequest}
   */
  createContentAnalysisRequest(
    { analysisType, operationTypeForDisplay, reason, url, windowGlobalParent },
    extraProps
  ) {
    return /** @type {nsIContentAnalysisRequest} */ ({
      QueryInterface: ChromeUtils.generateQI(["nsIContentAnalysisRequest"]),
      analysisType,
      dataTransfer: undefined,
      email: undefined,
      fileNameForDisplay: undefined,
      filePath: undefined,
      operationTypeForDisplay,
      printerName: undefined,
      reason,
      requestToken: undefined,
      sha256Digest: undefined,
      sourceWindowGlobal: undefined,
      testOnlyIgnoreCanceledAndAlwaysSubmitToAgent: false,
      textContent: undefined,
      timeoutMultiplier: 1,
      transferable: undefined,
      url,
      userActionId: "",
      userActionRequestsCount: 0,
      windowGlobalParent,
      getPrintData: () => {
        return [];
      },
      resources: [],
      ...extraProps,
    });
  },

  /**
   * Sets up Content Analysis to monitor clipboard pastes and drag-and-drop
   * and send the text on to Content Analysis for approval. This method
   * will check if Content Analysis is active and if not it will return early.
   *
   * @param {HTMLInputElement} textElement The DOM element to monitor
   * @param {CanonicalBrowsingContext} browsingContext The browsing context that the textElement
   *                                                   is part of. Used to show the "DLP busy" dialog.
   * @param {nsIURI} url An nsIURI that indicates where the content would be sent to.
   *                       If this is undefined, this method will get the URI from the browsingContext.
   */
  setupContentAnalysisEventsForTextElement(textElement, browsingContext, url) {
    // Do not use a lazy service getter for this, because tests set up different mocks,
    // so if multiple tests run that call into this we can end up calling into an old mock.
    const contentAnalysis = Cc["@mozilla.org/contentanalysis;1"].getService(
      Ci.nsIContentAnalysis
    );
    if (!textElement || !contentAnalysis.isActive) {
      return;
    }
    let caEventChecker = async event => {
      let isPaste = event.type == "paste";
      let dataTransfer = isPaste ? event.clipboardData : event.dataTransfer;
      let data = dataTransfer.getData("text/plain");
      if (!data || !data.length) {
        return;
      }

      // Prevent the paste/drop from happening until content analysis returns a response
      event.preventDefault();
      // Selections can be forward or backward, so use min/max
      const startIndex = Math.min(
        textElement.selectionStart,
        textElement.selectionEnd
      );
      const endIndex = Math.max(
        textElement.selectionStart,
        textElement.selectionEnd
      );
      const selectionDirection = endIndex < startIndex ? "backward" : "forward";
      try {
        const response = await contentAnalysis.analyzeContentRequests(
          [
            this.createContentAnalysisRequest(
              {
                analysisType: Ci.nsIContentAnalysisRequest.eBulkDataEntry,
                operationTypeForDisplay: isPaste
                  ? Ci.nsIContentAnalysisRequest.eClipboard
                  : Ci.nsIContentAnalysisRequest.eDroppedText,
                reason: isPaste
                  ? Ci.nsIContentAnalysisRequest.eClipboardPaste
                  : Ci.nsIContentAnalysisRequest.eDragAndDrop,
                url:
                  url ??
                  contentAnalysis.getURIForBrowsingContext(browsingContext),
                /* browsingContext can sometimes be undefined in tests where content
                   is being pasted into chrome (specifically the GenAI custom chat shortcut) */
                windowGlobalParent: browsingContext?.currentWindowContext,
              },
              { textContent: data }
            ),
          ],
          true
        );
        if (response.shouldAllowContent) {
          textElement.value =
            textElement.value.slice(0, startIndex) +
            data +
            textElement.value.slice(endIndex);
          textElement.focus();
          if (startIndex !== endIndex) {
            // Select the pasted text
            textElement.setSelectionRange(
              startIndex,
              startIndex + data.length,
              selectionDirection
            );
          }
        }
      } catch (error) {
        console.error("Content analysis request returned error: ", error);
      }
    };
    textElement.addEventListener("paste", caEventChecker);
    textElement.addEventListener("drop", caEventChecker);
  },
};
