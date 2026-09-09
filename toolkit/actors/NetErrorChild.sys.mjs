/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AppInfo: "chrome://remote/content/shared/AppInfo.sys.mjs",
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
});

import { RemotePageChild } from "moz-src:///toolkit/actors/RemotePageChild.sys.mjs";

/**
 * Record a click on the injected "did you mean" alternate-host suggestion
 * (bug 2058380), matching the extras the other security.ui.neterror click
 * events carry. Content-free: the suggested host is never recorded.
 *
 * @param {Document} doc The error page document holding the suggestion.
 */
function recordDnsSuggestionClick(doc) {
  let errorCode = "";
  try {
    // Truncated to stay inside the telemetry string limit, as the other click
    // events do. DNS failures carry an empty code.
    errorCode = doc.getNetErrorInfo().errorCodeString.substring(0, 40);
  } catch (e) {
    // No net error info on this document.
  }
  Glean.securityUiNeterror.clickDnsSuggestionLink.record({
    value: errorCode,
    is_frame: doc.defaultView.parent != doc.defaultView,
  });
}

export class NetErrorChild extends RemotePageChild {
  actorCreated() {
    super.actorCreated();

    // If you add a new function, remember to add it to RemotePageAccessManager.sys.mjs
    // to allow content-privileged about:neterror or about:certerror to use it.
    const exportableFunctions = [
      "RPMGetAppBuildID",
      "RPMGetHostForDisplay",
      "RPMGetInnermostAsciiHost",
      "RPMRecordGleanEvent",
      "RPMCheckAlternateHostAvailable",
      "RPMGetHttpResponseHeader",
      "RPMIsTRROnlyFailure",
      "RPMIsFirefox",
      "RPMOpenPreferences",
      "RPMHasConnectivity",
      "RPMGetTRRSkipReason",
      "RPMGetTRRDomain",
      "RPMIsSiteSpecificTRRError",
      "RPMSetTRRDisabledLoadFlags",
      "RPMGetCurrentTRRMode",
      "RPMShowOSXLocalNetworkPermissionWarning",
      "RPMIsSSLKeyLoggingEnabled",
    ];
    this.exportFunctions(exportableFunctions);
  }

  getHandshakeCertificates(docShell) {
    let securityInfo =
      docShell.failedChannel && docShell.failedChannel.securityInfo;
    if (!securityInfo) {
      return [];
    }
    return securityInfo.handshakeCertificates.map(cert =>
      cert.getBase64DERString()
    );
  }

  handleEvent(aEvent) {
    // Documents have a null ownerDocument.
    let doc = aEvent.originalTarget.ownerDocument || aEvent.originalTarget;

    switch (aEvent.type) {
      case "click": {
        let elem = aEvent.originalTarget;
        if (elem.id == "viewCertificate") {
          // Call through the superclass to avoid the security check.
          this.sendAsyncMessage("Browser:CertExceptionError", {
            location: doc.location.href,
            elementId: elem.id,
            handshakeCertificates: this.getHandshakeCertificates(
              doc.defaultView.docShell
            ),
          });
        }
        break;
      }
    }
  }

  RPMGetHostForDisplay(document) {
    // Note: not document.documentURIObject, which will be the network error
    // page's URI - we want the URI of the page that failed to load.
    let uri = document.mozDocumentURIIfNotForErrorPages;
    return lazy.BrowserUtils.formatURIForDisplay(uri, { showWWW: true });
  }

  /**
   * Use this to get the ascii host for the load that showed an error.
   * Do NOT rely on `document.location.href` or similar as it will not work
   * reliably for nested URLs like view-source.
   *
   * @returns {string} ASCII (potentially punycode) version of the hostname.
   */
  RPMGetInnermostAsciiHost() {
    let uri = this.contentWindow.document.mozDocumentURIIfNotForErrorPages;
    if (uri instanceof Ci.nsINestedURI) {
      uri = uri.QueryInterface(Ci.nsINestedURI).innermostURI;
    }
    return uri.asciiHost;
  }

  RPMGetAppBuildID() {
    return Services.appinfo.appBuildID;
  }

  RPMRecordGleanEvent(category, name, extra) {
    Glean[category]?.[name]?.record(extra);
  }

  RPMCheckAlternateHostAvailable() {
    const host = this.contentWindow.location.host.trim();

    // Adapted from UrlbarUtils::looksLikeSingleWordHost
    // https://searchfox.org/mozilla-central/rev/a26af613a476fafe6c3eba05a81bef63dff3c9f1/browser/components/urlbar/UrlbarUtils.sys.mjs#893
    const REGEXP_SINGLE_WORD = /^[^\s@:/?#]+(:\d+)?$/;
    if (!REGEXP_SINGLE_WORD.test(host)) {
      return;
    }

    let info = Services.uriFixup.forceHttpFixup(
      this.contentWindow.location.href
    );

    if (!info.fixupCreatedAlternateURI && !info.fixupChangedProtocol) {
      return;
    }

    let { displayHost, displaySpec, pathQueryRef } = info.fixedURI;

    if (pathQueryRef.endsWith("/")) {
      pathQueryRef = pathQueryRef.slice(0, pathQueryRef.length - 1);
    }

    let weakDoc = Cu.getWeakReference(this.contentWindow.document);
    let onLookupCompleteListener = {
      onLookupComplete(request, record, status) {
        let doc = weakDoc.get();
        if (!doc || !Components.isSuccessCode(status)) {
          return;
        }

        let link = doc.createElement("a");
        link.href = displaySpec;
        link.setAttribute("data-l10n-name", "website");

        let span = doc.createElement("span");
        span.id = "dns-suggestion";
        span.appendChild(link);
        // The suggestion is injected after page setup, so neither renderer has
        // a delegated click recorder to pick up a data-telemetry-id, and it
        // needs its own listener (bug 2058380). It goes on the span, not the
        // link: L10nOverlays replaces a data-l10n-name child with a shallow
        // clone when the translation applies, which keeps the attributes but
        // drops any listener. The span is the overlay root and survives.
        span.addEventListener("click", () => recordDnsSuggestionClick(doc));
        doc.l10n.setAttributes(span, "neterror-dns-not-found-with-suggestion", {
          hostAndPath: displayHost + pathQueryRef,
        });

        const shortDesc = doc.getElementById("errorShortDesc");
        if (shortDesc) {
          shortDesc.textContent += " ";
          shortDesc.appendChild(span);
        } else {
          const intro =
            doc.querySelector("net-error-card")?.wrappedJSObject?.errorIntro;
          if (!intro) {
            return;
          }
          intro.after(span);
        }

        Glean.securityUiNeterror.alternateHostSuggested.add(1);
      },
    };

    try {
      Services.uriFixup.checkHost(
        info.fixedURI,
        onLookupCompleteListener,
        this.document.nodePrincipal.originAttributes
      );
    } catch (ex) {
      // Ignore errors.
    }
  }

  // Get the header from the http response of the failed channel. This function
  // is used in the 'about:neterror' page.
  RPMGetHttpResponseHeader(responseHeader) {
    let channel = this.contentWindow.docShell.failedChannel;
    if (!channel) {
      return "";
    }

    let httpChannel = channel.QueryInterface(Ci.nsIHttpChannel);
    if (!httpChannel) {
      return "";
    }

    try {
      return httpChannel.getResponseHeader(responseHeader);
    } catch (e) {}

    return "";
  }

  RPMIsTRROnlyFailure() {
    // We will only show this in Firefox because the options may direct users to settings only available on Firefox Desktop
    let channel = this.contentWindow?.docShell?.failedChannel?.QueryInterface(
      Ci.nsIHttpChannelInternal
    );
    if (!channel) {
      return false;
    }
    return channel.effectiveTRRMode == Ci.nsIRequest.TRR_ONLY_MODE;
  }

  RPMIsFirefox() {
    return lazy.AppInfo.isFirefox;
  }

  RPMHasConnectivity() {
    // Whether the browser has active network interfaces or not.
    return Services.io.connectivity;
  }

  _getTRRSkipReason() {
    let channel = this.contentWindow?.docShell?.failedChannel?.QueryInterface(
      Ci.nsIHttpChannelInternal
    );
    return channel?.trrSkipReason ?? Ci.nsITRRSkipReason.TRR_UNSET;
  }

  RPMGetTRRSkipReason() {
    let skipReason = this._getTRRSkipReason();
    return Services.dns.getTRRSkipReasonName(skipReason);
  }

  RPMGetTRRDomain() {
    return Services.dns.trrDomain;
  }

  RPMIsSiteSpecificTRRError() {
    let skipReason = this._getTRRSkipReason();
    switch (skipReason) {
      case Ci.nsITRRSkipReason.TRR_NXDOMAIN:
      case Ci.nsITRRSkipReason.TRR_RCODE_FAIL:
      case Ci.nsITRRSkipReason.TRR_NO_ANSWERS:
        return true;
    }
    return false;
  }

  RPMSetTRRDisabledLoadFlags() {
    this.contentWindow.docShell.browsingContext.defaultLoadFlags |=
      Ci.nsIRequest.LOAD_TRR_DISABLED_MODE;
  }

  RPMIsSSLKeyLoggingEnabled() {
    return Services.env.exists("SSLKEYLOGFILE");
  }

  RPMShowOSXLocalNetworkPermissionWarning() {
    if (!lazy.AppInfo.isMac) {
      return false;
    }

    // Ideally we'd only show this error for local network loads
    // but right now it's difficult to determine if the socket
    // was blocked by the OS or if the target port was closed. (bug 1919889)
    // For now we err on the side of displaying the warning message.
    let version = parseInt(Services.sysinfo.getProperty("version"));
    // We only show this error on Sequoia or later
    return version >= 24;
  }
}
