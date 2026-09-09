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

const PDF_EMBED_FALLBACK_WEB_PAGE = "resource://pdf.js/embedFallback.html";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

function getDOMWindow(channel, principal) {
  const requestor =
    channel.notificationCallbacks ?? channel.loadGroup.notificationCallbacks;
  const window = requestor.getInterface(Ci.nsIDOMWindow);
  // Ensure the window wasn't navigated to something that is not the fallback.
  return window.document.nodePrincipal.equals(principal) ? window : null;
}

/**
 * Asks the parent process to reopen the PDF. A cross-site fallback process
 * cannot initiate a load with the embedding page's principal, so the parent
 * derives the URI and principal from the browsing context. The original
 * referrer is forwarded.
 *
 * The fallback retains no PDF bytes, so opening it starts a new request that may
 * return different content. The retry is a frame load checked by frame-src
 * rather than object-src; the fallback converter handles only object loads.
 *
 * @param {Window} domWindow the window displaying the fallback page.
 * @param {nsIReferrerInfo|null} referrerInfo the original request's referrer.
 */
function openPdf(domWindow, referrerInfo) {
  domWindow.windowGlobalChild
    .getActor("PdfEmbedFallback")
    .sendAsyncMessage("PdfEmbedFallback:OpenPdf", {
      referrerInfo: lazy.E10SUtils.serializeReferrerInfo(referrerInfo),
    });
}

/**
 * Stream converter serving a page that lets the user open a PDF embedded with
 * an object or embed element through the normal PDF handling flow, when the
 * built-in viewer is disabled: such an element cannot invoke the configured PDF
 * handler by itself. The page is built on the in-content design system, which
 * is desktop-only, hence pdfjs.embedFallback defaults to false on Android.
 *
 * PdfStreamConverter handles the PDFs the viewer displays, and only one of the
 * two converters is registered at a time (see StreamConverterFactory).
 */
export class PdfEmbedFallbackStreamConverter {
  QueryInterface = ChromeUtils.generateQI([
    "nsIStreamConverter",
    "nsIStreamListener",
    "nsIRequestObserver",
  ]);

  #binaryStream = null;
  #listener = null;

  convert() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  asyncConvertData(aFromType, aToType, aListener, aContext) {
    if (aContext && aContext instanceof Ci.nsIChannel) {
      aContext.QueryInterface(Ci.nsIChannel);
    }
    this.getConvertedType(aFromType, aContext);
    this.#listener = aListener;
  }

  getConvertedType(aFromType, aChannel) {
    if (!aChannel) {
      Components.returnCode = Cr.NS_ERROR_INVALID_ARG;
      return "";
    }
    if (aChannel instanceof Ci.nsIMultiPartChannel) {
      throw Components.Exception(
        "The embedded PDF fallback doesn't support multipart responses.",
        Cr.NS_ERROR_NOT_IMPLEMENTED
      );
    }
    if (
      aFromType != "application/pdf" ||
      aChannel.loadInfo?.externalContentPolicyType !=
        Ci.nsIContentPolicy.TYPE_OBJECT
    ) {
      // The open button retries as TYPE_SUBDOCUMENT. Decline quietly so normal
      // handler selection does not produce a console error.
      Components.returnCode = Cr.NS_ERROR_FAILURE;
      return "";
    }
    return "text/html";
  }

  onStartRequest(aRequest) {
    const isHttpRequest = aRequest instanceof Ci.nsIHttpChannel;
    aRequest.QueryInterface(Ci.nsIChannel);
    aRequest.QueryInterface(Ci.nsIWritablePropertyBag);
    // Change the content type so we don't get stuck in a loop.
    aRequest.setProperty("contentType", aRequest.contentType);
    aRequest.contentType = "text/html";
    if (isHttpRequest) {
      // These headers describe the PDF, not the fallback page: it carries its
      // own CSP and must not be redirected or made to preload anything.
      aRequest.setResponseHeader("Content-Security-Policy", "", false);
      aRequest.setResponseHeader(
        "Content-Security-Policy-Report-Only",
        "",
        false
      );
      aRequest.setResponseHeader("Refresh", "", false);
      aRequest.setResponseHeader("Link", "", false);
    }
    aRequest.contentDisposition = Ci.nsIChannel.DISPOSITION_FORCE_INLINE;
    this.#binaryStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
      Ci.nsIBinaryInputStream
    );
    this.#serveFallback(aRequest, isHttpRequest ? aRequest.referrerInfo : null);
  }

  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    if (!this.#binaryStream) {
      return;
    }
    // Read the data even though the fallback page doesn't use it:
    // nsInputStreamPump::OnStateTransfer fails the request when onDataAvailable
    // consumes nothing, which it detects by comparing nsITellableStream::Tell
    // before and after. nsIInputStream offers no scriptable way to skip data
    // (read and readSegments are [noscript]), so it really has to be read.
    this.#binaryStream.setInputStream(aInputStream);
    this.#binaryStream.readArrayBuffer(aCount, new ArrayBuffer(aCount));
  }

  onStopRequest() {
    // Neither argument is needed: nothing consumed the PDF data, so how the
    // request ended doesn't matter. It usually ended because we cancelled it.
    this.#binaryStream = null;
  }

  /*
   * Serve a page that lets the user open an embedded PDF through the normal PDF
   * handling flow when the built-in viewer is disabled.
   *
   * The page is streamed from its own resource:// channel, exactly like
   * PdfStreamConverter does for the viewer: its data is handed to our listener
   * as if it came from aRequest, so the docshell builds the fallback document
   * from aRequest and keeps showing the PDF URI.
   *
   * aRequest is therefore the request the document loader tracks for this load,
   * which is what dictates the order below. We have no use for the PDF it keeps
   * downloading, since the page doesn't display it and its button starts a
   * brand new load, but it can only be dropped once it is out of the load group
   * and the fallback page has loaded or is being torn down.
   */
  #serveFallback(aRequest, referrerInfo) {
    const channel = lazy.NetUtil.newChannel({
      uri: PDF_EMBED_FALLBACK_WEB_PAGE,
      loadUsingSystemPrincipal: true,
    });
    const resourcePrincipal =
      Services.scriptSecurityManager.createContentPrincipal(
        lazy.NetUtil.newURI(PDF_EMBED_FALLBACK_WEB_PAGE),
        aRequest.loadInfo.originAttributes
      );
    const listener = this.#listener;
    const stopDownloadingPdf = () => {
      if (aRequest.isPending()) {
        aRequest.cancel(Cr.NS_BINDING_ABORTED);
      }
    };
    // Like the viewer proxy in PdfStreamConverter, these deliberately forward
    // aRequest and not the fallback request they are called with: the docshell
    // must keep seeing the channel this load started with, so the document it
    // builds still belongs to the PDF URI.
    const proxy = {
      onStartRequest() {
        listener.onStartRequest(aRequest);
      },
      onDataAvailable(fallbackRequest, inputStream, offset, count) {
        listener.onDataAvailable(aRequest, inputStream, offset, count);
      },
      onStopRequest(fallbackRequest, statusCode) {
        // The fallback page has been streamed. Take aRequest out of the load
        // group so it doesn't keep the page loading until the PDF finishes.
        // removeRequest synchronously notifies nsDocLoader, but fallbackRequest
        // remains in the same load group until this callback returns. It keeps
        // the loader busy while the lifecycle listeners are installed and the
        // downstream listener receives onStopRequest below, so the document
        // cannot finish midway through this setup. If aRequest already
        // completed, it removed itself and removeRequest throws
        // NS_ERROR_FAILURE.
        const { loadGroup } = aRequest;
        if (loadGroup) {
          try {
            loadGroup.removeRequest(aRequest, null, Cr.NS_OK);
          } catch (error) {
            if (error.result !== Cr.NS_ERROR_FAILURE) {
              throw error;
            }
          }
          aRequest.loadGroup = null;
        }

        let domWindow = null;
        try {
          domWindow = getDOMWindow(channel, resourcePrincipal);
        } catch {
          // The frame may have gone away before the fallback page loaded.
        }
        const hasFallbackPage =
          Components.isSuccessCode(statusCode) && !!domWindow;
        if (hasFallbackPage) {
          // Cancelling the document request before load aborts the fallback,
          // but pagehide must also cancel it if the frame is torn down first.
          const stopWhenFallbackIsDone = () => {
            domWindow.removeEventListener("load", stopWhenFallbackIsDone);
            domWindow.removeEventListener("pagehide", stopWhenFallbackIsDone);
            Services.tm.dispatchToMainThread(stopDownloadingPdf);
          };
          domWindow.addEventListener("load", stopWhenFallbackIsDone);
          domWindow.addEventListener("pagehide", stopWhenFallbackIsDone);

          domWindow.document.addEventListener(
            "DOMContentLoaded",
            () => {
              domWindow.document
                .getElementById("fallbackOpenButton")
                .addEventListener("click", event => {
                  if (event.isTrusted) {
                    openPdf(domWindow, referrerInfo);
                  }
                });
            },
            { once: true }
          );
        }

        listener.onStopRequest(aRequest, statusCode);
        if (!hasFallbackPage) {
          // There is no page to wait for.
          stopDownloadingPdf();
        }
      },
    };

    // Preserve the original PDF URI on the replacement channel.
    channel.originalURI = aRequest.URI;
    channel.loadGroup = aRequest.loadGroup;
    channel.loadInfo.originAttributes = aRequest.loadInfo.originAttributes;
    aRequest.owner = resourcePrincipal;
    channel.asyncOpen(proxy);
  }
}
