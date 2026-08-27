/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const FileUtils = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
).FileUtils;
const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
);
const gDashboard = Cc["@mozilla.org/network/dashboard;1"].getService(
  Ci.nsIDashboard
);
const gDirServ = Cc["@mozilla.org/file/directory_service;1"].getService(
  Ci.nsIDirectoryServiceProvider
);
const gNetLinkSvc =
  Cc["@mozilla.org/network/network-link-service;1"] &&
  Cc["@mozilla.org/network/network-link-service;1"].getService(
    Ci.nsINetworkLinkService
  );
const gCertDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
  Ci.nsIX509CertDB
);
const gSSLTokensHasher = Cc["@mozilla.org/security/hash;1"].createInstance(
  Ci.nsICryptoHash
);

const gRequestNetworkingData = {
  http: gDashboard.requestHttpConnections,
  sockets: gDashboard.requestSockets,
  dns: gDashboard.requestDNSInfo,
  websockets: gDashboard.requestWebsocketConnections,
  altsvc: gDashboard.requestAltSvcCache,
  ssltokens: gDashboard.requestSSLTokensCache,
  dnslookuptool: () => {},
  networkid: displayNetworkID,
};
const gDashboardCallbacks = {
  http: displayHttp,
  sockets: displaySockets,
  dns: displayDns,
  websockets: displayWebsockets,
  altsvc: displayAltSvc,
  ssltokens: displaySSLTokensCache,
};

const REFRESH_INTERVAL_MS = 3000;

const gIsPrivateBrowsing = PrivateBrowsingUtils.isWindowPrivate(window);

function isPrivateBrowsingEntry(originAttributesSuffix) {
  return !!ChromeUtils.CreateOriginAttributesFromOriginSuffix(
    originAttributesSuffix
  ).privateBrowsingId;
}

function col(element) {
  let col = document.createElement("td");
  let content = document.createTextNode(element);
  col.appendChild(content);
  return col;
}

function displayHttp(data) {
  let cont = document.getElementById("http_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "http_content");

  for (let i = 0; i < data.connections.length; i++) {
    if (
      !gIsPrivateBrowsing &&
      isPrivateBrowsingEntry(data.connections[i].originAttributesSuffix)
    ) {
      continue;
    }
    let row = document.createElement("tr");
    row.appendChild(col(data.connections[i].host));
    row.appendChild(col(data.connections[i].port));
    row.appendChild(col(data.connections[i].httpVersion));
    row.appendChild(col(data.connections[i].ssl));
    row.appendChild(col(data.connections[i].active.length));
    row.appendChild(col(data.connections[i].idle.length));
    row.appendChild(col(data.connections[i].originAttributesSuffix));
    new_cont.appendChild(row);
  }

  parent.replaceChild(new_cont, cont);
}

function displaySockets(data) {
  let cont = document.getElementById("sockets_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "sockets_content");

  for (let i = 0; i < data.sockets.length; i++) {
    if (
      !gIsPrivateBrowsing &&
      isPrivateBrowsingEntry(data.sockets[i].originAttributesSuffix)
    ) {
      continue;
    }
    let row = document.createElement("tr");
    row.appendChild(col(data.sockets[i].host));
    row.appendChild(col(data.sockets[i].port));
    row.appendChild(col(data.sockets[i].type));
    row.appendChild(col(data.sockets[i].active));
    row.appendChild(col(data.sockets[i].sent));
    row.appendChild(col(data.sockets[i].received));
    row.appendChild(col(data.sockets[i].originAttributesSuffix));
    new_cont.appendChild(row);
  }

  parent.replaceChild(new_cont, cont);
}

function displayDns(data) {
  let suffixContent = document.getElementById("dns_suffix_content");
  let suffixParent = suffixContent.parentNode;
  let suffixes = [];
  try {
    suffixes = gNetLinkSvc.dnsSuffixList; // May throw
  } catch (e) {}
  let suffix_tbody = document.createElement("tbody");
  suffix_tbody.id = "dns_suffix_content";
  for (let suffix of suffixes) {
    let row = document.createElement("tr");
    row.appendChild(col(suffix));
    suffix_tbody.appendChild(row);
  }
  suffixParent.replaceChild(suffix_tbody, suffixContent);

  let trr_url_tbody = document.createElement("tbody");
  trr_url_tbody.id = "dns_trr_url";
  let trr_url = document.createElement("tr");
  trr_url.appendChild(col(Services.dns.currentTrrURI));
  trr_url.appendChild(col(Services.dns.currentTrrMode));
  trr_url_tbody.appendChild(trr_url);
  let prevURL = document.getElementById("dns_trr_url");
  prevURL.parentNode.replaceChild(trr_url_tbody, prevURL);

  let cont = document.getElementById("dns_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "dns_content");

  for (let i = 0; i < data.entries.length; i++) {
    // TODO: Will be supported in bug 1889387.
    if (data.entries[i].type != Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT) {
      continue;
    }
    if (
      !gIsPrivateBrowsing &&
      isPrivateBrowsingEntry(data.entries[i].originAttributesSuffix)
    ) {
      continue;
    }

    let row = document.createElement("tr");
    row.appendChild(col(data.entries[i].hostname));
    row.appendChild(col(data.entries[i].family));
    row.appendChild(col(data.entries[i].trr));
    let column = document.createElement("td");

    for (let j = 0; j < data.entries[i].hostaddr.length; j++) {
      column.appendChild(document.createTextNode(data.entries[i].hostaddr[j]));
      column.appendChild(document.createElement("br"));
    }

    row.appendChild(column);
    row.appendChild(col(data.entries[i].expiration));
    row.appendChild(col(data.entries[i].originAttributesSuffix));
    row.appendChild(col(data.entries[i].flags));
    new_cont.appendChild(row);
  }

  parent.replaceChild(new_cont, cont);
}

function displayWebsockets(data) {
  let cont = document.getElementById("websockets_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "websockets_content");

  for (let i = 0; i < data.websockets.length; i++) {
    let row = document.createElement("tr");
    row.appendChild(col(data.websockets[i].hostport));
    row.appendChild(col(data.websockets[i].encrypted));
    row.appendChild(col(data.websockets[i].msgsent));
    row.appendChild(col(data.websockets[i].msgreceived));
    row.appendChild(col(data.websockets[i].sentsize));
    row.appendChild(col(data.websockets[i].receivedsize));
    new_cont.appendChild(row);
  }

  parent.replaceChild(new_cont, cont);
}

function formatTTL(seconds) {
  if (seconds <= 0) {
    return "expired";
  }
  let parts = [];
  let d = Math.floor(seconds / 86400);
  if (d) {
    parts.push(`${d}d`);
  }
  let h = Math.floor((seconds % 86400) / 3600);
  if (h) {
    parts.push(`${h}h`);
  }
  let m = Math.floor((seconds % 3600) / 60);
  if (m) {
    parts.push(`${m}m`);
  }
  let s = seconds % 60;
  if (s || !parts.length) {
    parts.push(`${s}s`);
  }
  return parts.join(" ");
}

function displayAltSvc(data) {
  let cont = document.getElementById("altsvc_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "altsvc_content");

  for (let i = 0; i < data.entries.length; i++) {
    let entry = data.entries[i];
    if (
      !gIsPrivateBrowsing &&
      isPrivateBrowsingEntry(entry.originAttributesSuffix)
    ) {
      continue;
    }
    let row = document.createElement("tr");
    let scheme = entry.https ? "https" : "http";
    row.appendChild(col(`${scheme}://${entry.originHost}:${entry.originPort}`));
    row.appendChild(col(`${entry.alternateHost}:${entry.alternatePort}`));
    row.appendChild(col(entry.alpn));
    row.appendChild(col(entry.validated));
    row.appendChild(col(formatTTL(entry.ttl)));
    row.appendChild(col(entry.originAttributesSuffix));
    new_cont.appendChild(row);
  }

  parent.replaceChild(new_cont, cont);
}

function splitSSLTokensCacheKey(key) {
  let caretIndex = key.indexOf("^");
  return caretIndex < 0
    ? { host: key, isolationKey: "" }
    : { host: key.slice(0, caretIndex), isolationKey: key.slice(caretIndex) };
}

// Cheap non-cryptographic fingerprint, used so grouping/caching doesn't need
// to stringify entire (potentially multi-KB) DER byte arrays.
function sslTokensBytesFingerprint(bytes) {
  if (!bytes || !bytes.length) {
    return "";
  }
  gSSLTokensHasher.init(Ci.nsICryptoHash.SHA256);
  gSSLTokensHasher.update(bytes, bytes.length);
  return gSSLTokensHasher.finish(/* aASCII */ true);
}

// Multiple tickets are often issued for the same host in one handshake and
// carry identical metadata apart from the token itself; group them so the
// table shows one row per distinct (host, cert) combination.
function sslTokensGroupKey(entry) {
  return JSON.stringify([
    entry.key,
    entry.evStatus,
    entry.certificateTransparencyStatus,
    entry.overridableErrorCategory,
    entry.builtInRoot,
    sslTokensBytesFingerprint(entry.serverCertDER),
    entry.succeededCertChainDER?.map(sslTokensBytesFingerprint),
    entry.handshakeCertDER?.map(sslTokensBytesFingerprint),
  ]);
}

function sslTokensCompressionSavedPercent(
  compressedLength,
  decompressedLength
) {
  return decompressedLength
    ? Math.round(100 * (1 - compressedLength / decompressedLength))
    : null;
}

// Sums the length fields used throughout the SSL tokens UI, e.g. across a
// group's tokens or across the whole cache.
function sumSSLTokensLengths(entries) {
  let totalToken = 0;
  let totalCompressed = 0;
  let totalDecompressed = 0;
  for (let entry of entries) {
    totalToken += entry.tokenLength;
    totalCompressed += entry.compressedLength;
    totalDecompressed += entry.decompressedLength;
  }
  return { totalToken, totalCompressed, totalDecompressed };
}

// expirationTime is a PRTime (microseconds since the Unix epoch).
function sslTokensExpiryDate(expirationTime) {
  return new Date(expirationTime / 1000);
}

function isDateExpired(date) {
  return date.getTime() <= Date.now();
}

// Builds a "N% saved" element with full byte-count details in a tooltip, or
// null if there's nothing to show (decompressedLength is falsy).
function buildSSLTokensCompressionDetails(
  tagName,
  tokenLength,
  decompressedLength,
  compressedLength
) {
  let saved = sslTokensCompressionSavedPercent(
    compressedLength,
    decompressedLength
  );
  if (saved === null) {
    return null;
  }
  let el = document.createElement(tagName);
  el.textContent = `${saved}%`;
  el.setAttribute("data-l10n-attrs", "title");
  document.l10n.setAttributes(
    el,
    "about-networking-ssl-tokens-compression-details",
    { tokenLength, decompressedLength, compressedLength }
  );
  return el;
}

function groupSSLTokensCacheEntries(entries) {
  let groups = new Map();
  for (let entry of entries) {
    let groupKey = sslTokensGroupKey(entry);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(entry);
  }
  return [...groups.entries()];
}

function addSSLTokensFlagItem(ul, labelL10nId, value) {
  let li = document.createElement("li");
  let label = document.createElement("span");
  document.l10n.setAttributes(label, labelL10nId);
  li.appendChild(label);
  li.appendChild(document.createTextNode(`: ${value}`));
  ul.appendChild(li);
}

// <details> elements are rebuilt from scratch on every refresh, which would
// otherwise reset any collapsible the user had opened; restore prior state
// by key (cache key + which collapsible) instead.
function restoreSSLTokensDetailsState(details, key, kind, openKeys) {
  details.dataset.tokenKey = key;
  details.dataset.kind = kind;
  if (openKeys.has(`${key}|${kind}`)) {
    details.open = true;
  }
}

// certDB.constructX509 takes ownership of neither its input nor output;
// failures (e.g. malformed DER) are reported as an empty subject/commonName.
// Keyed by a fingerprint of the DER bytes rather than the cache key, since
// the same cert is commonly reused across many entries/refreshes.
const gSSLTokensCertInfoCache = new Map();

// Full DN strings (e.g. "CN=example.com,O=Example Inc,C=US") are noisy, so
// callers show commonName and leave subject for a tooltip.
function sslTokensCertInfo(certDER) {
  let fingerprint = sslTokensBytesFingerprint(certDER);
  if (gSSLTokensCertInfoCache.has(fingerprint)) {
    return gSSLTokensCertInfoCache.get(fingerprint);
  }
  let info;
  try {
    let cert = gCertDB.constructX509(certDER);
    info = { subject: cert.subjectName, commonName: cert.commonName };
  } catch (e) {
    info = { subject: "", commonName: "" };
  }
  gSSLTokensCertInfoCache.set(fingerprint, info);
  return info;
}

// Parsing every cert in a chain is only useful once the user actually looks
// at it, so defer it until the collapsible is expanded (or immediately, if
// it's being restored already-open across a refresh).
function addSSLTokensCertList(
  parent,
  chainDER,
  labelL10nId,
  key,
  kind,
  openKeys
) {
  if (!chainDER || !chainDER.length) {
    return;
  }
  let details = document.createElement("details");
  restoreSSLTokensDetailsState(details, key, kind, openKeys);
  let summary = document.createElement("summary");
  document.l10n.setAttributes(summary, labelL10nId, { count: chainDER.length });
  details.appendChild(summary);
  let ul = document.createElement("ul");
  details.appendChild(ul);

  let populated = false;
  let populate = () => {
    if (populated) {
      return;
    }
    populated = true;
    for (let certDER of chainDER) {
      let li = document.createElement("li");
      let { subject, commonName } = sslTokensCertInfo(certDER);
      li.textContent = commonName || subject;
      li.title = subject;
      ul.appendChild(li);
    }
  };
  if (details.open) {
    populate();
  } else {
    details.addEventListener("toggle", () => {
      if (details.open) {
        populate();
      }
    });
  }

  parent.appendChild(details);
}

function addSSLTokensIcon(td, iconSrc, labelL10nId) {
  let icon = document.createElement("img");
  icon.className = "ssltokens-icon";
  icon.src = iconSrc;
  icon.setAttribute("data-l10n-attrs", "alt, title");
  document.l10n.setAttributes(icon, labelL10nId);
  td.appendChild(icon);
}

function addSSLTokensRestoredIcon(td, entry) {
  addSSLTokensIcon(
    td,
    entry.restored
      ? "chrome://global/skin/icons/arrow-counterclockwise-16.svg"
      : "chrome://global/skin/icons/plus.svg",
    entry.restored
      ? "about-networking-ssl-tokens-restored"
      : "about-networking-ssl-tokens-new"
  );
}

function addSSLTokensExpiredIcon(td) {
  addSSLTokensIcon(
    td,
    "chrome://global/skin/icons/warning-fill-12.svg",
    "about-networking-ssl-tokens-expired"
  );
}

function buildSSLTokensStatusCell(entry, expired) {
  let td = document.createElement("td");
  addSSLTokensRestoredIcon(td, entry);
  if (expired) {
    addSSLTokensExpiredIcon(td);
  }
  return td;
}

function buildSSLTokensHostCell(host) {
  let td = document.createElement("td");
  td.className = "ssltokens-key";
  td.textContent = host;
  return td;
}

// The isolation key is a leading "^" (see OriginAttributes::CreateSuffix)
// followed by a "&"-joined, URL-encoded key=value list; partitionKey is by
// far the most common attribute, so drop its redundant label.
function formatSSLTokensIsolationKey(isolationKey) {
  if (!isolationKey) {
    return "";
  }
  let params = new URLSearchParams(isolationKey.slice(1));
  let parts = [];
  for (let [key, value] of params) {
    parts.push(key == "partitionKey" ? value : `${key}=${value}`);
  }
  return parts.join(" ");
}

function buildSSLTokensIsolationKeyCell(isolationKey) {
  let td = document.createElement("td");
  td.className = "ssltokens-key";
  td.textContent = formatSSLTokensIsolationKey(isolationKey);
  td.title = isolationKey;
  return td;
}

function buildSSLTokensExpiresCell(expires) {
  let td = document.createElement("td");
  td.textContent = expires.toLocaleString();
  return td;
}

function buildSSLTokensTokensCell(group, key, openKeys) {
  let td = document.createElement("td");

  let { totalToken, totalCompressed, totalDecompressed } =
    sumSSLTokensLengths(group);

  let details = document.createElement("details");
  restoreSSLTokensDetailsState(details, key, "tokens", openKeys);
  let summary = document.createElement("summary");
  document.l10n.setAttributes(
    summary,
    "about-networking-ssl-tokens-token-list",
    {
      count: group.length,
    }
  );
  if (group.length > 1) {
    summary.className = "ssltokens-token-count-multiple";
  }
  details.appendChild(summary);

  let ul = document.createElement("ul");
  for (let entry of group) {
    let li = document.createElement("li");
    addSSLTokensRestoredIcon(li, entry);
    if (isDateExpired(sslTokensExpiryDate(entry.expirationTime))) {
      addSSLTokensExpiredIcon(li);
    }
    li.appendChild(document.createTextNode(` #${entry.tokenId}`));
    let savedEl = buildSSLTokensCompressionDetails(
      "span",
      entry.tokenLength,
      entry.decompressedLength,
      entry.compressedLength
    );
    if (savedEl) {
      li.appendChild(document.createTextNode(" — "));
      li.appendChild(savedEl);
    }
    ul.appendChild(li);
  }
  details.appendChild(ul);
  td.appendChild(details);

  let groupSavedEl = buildSSLTokensCompressionDetails(
    "div",
    totalToken,
    totalDecompressed,
    totalCompressed
  );
  if (groupSavedEl) {
    td.appendChild(groupSavedEl);
  }

  return td;
}

function buildSSLTokensCertificateCell(entry, groupKey, openKeys) {
  let td = document.createElement("td");

  if (entry.serverCertDER && entry.serverCertDER.length) {
    let { subject: fullSubject, commonName } = sslTokensCertInfo(
      entry.serverCertDER
    );
    let subject = document.createElement("div");
    subject.textContent = commonName || fullSubject;
    subject.title = fullSubject;
    td.appendChild(subject);
  }

  let flagsDetails = document.createElement("details");
  restoreSSLTokensDetailsState(flagsDetails, groupKey, "flags", openKeys);
  let flagsSummary = document.createElement("summary");
  document.l10n.setAttributes(flagsSummary, "about-networking-flags");
  flagsDetails.appendChild(flagsSummary);
  let flagsList = document.createElement("ul");
  let flagItems = [
    ["about-networking-ssl-tokens-ev-status", entry.evStatus],
    [
      "about-networking-ssl-tokens-ct-status",
      entry.certificateTransparencyStatus,
    ],
    [
      "about-networking-ssl-tokens-overridable-error",
      entry.overridableErrorCategory,
    ],
    [
      "about-networking-ssl-tokens-built-in-root",
      entry.builtInRoot < 0 ? "unknown" : !!entry.builtInRoot,
    ],
  ];
  for (let [labelL10nId, value] of flagItems) {
    addSSLTokensFlagItem(flagsList, labelL10nId, value);
  }
  flagsDetails.appendChild(flagsList);
  td.appendChild(flagsDetails);

  addSSLTokensCertList(
    td,
    entry.succeededCertChainDER,
    "about-networking-ssl-tokens-cert-chain",
    groupKey,
    "chain",
    openKeys
  );
  addSSLTokensCertList(
    td,
    entry.handshakeCertDER,
    "about-networking-ssl-tokens-handshake-certs",
    groupKey,
    "handshake",
    openKeys
  );

  return td;
}

function buildSSLTokensSummary(data) {
  let container = document.createElement("div");
  container.id = "ssltokens_summary";
  container.className = "ssltokens-summary";

  let { totalCompressed, totalDecompressed } = sumSSLTokensLengths(
    data.entries
  );

  let countSpan = document.createElement("span");
  document.l10n.setAttributes(
    countSpan,
    "about-networking-ssl-tokens-summary-count",
    { count: data.entries.length }
  );
  container.appendChild(countSpan);

  let totalExpired = data.entries.filter(entry =>
    isDateExpired(sslTokensExpiryDate(entry.expirationTime))
  ).length;
  if (totalExpired) {
    let expiredSpan = document.createElement("span");
    document.l10n.setAttributes(
      expiredSpan,
      "about-networking-ssl-tokens-summary-expired",
      { count: totalExpired }
    );
    container.appendChild(expiredSpan);
  }

  let saved = sslTokensCompressionSavedPercent(
    totalCompressed,
    totalDecompressed
  );
  if (saved !== null) {
    let compressionSpan = document.createElement("span");
    document.l10n.setAttributes(
      compressionSpan,
      "about-networking-ssl-tokens-summary-compression",
      {
        decompressedLength: totalDecompressed,
        compressedLength: totalCompressed,
        saved,
      }
    );
    container.appendChild(compressionSpan);
  }

  // network.ssl_tokens_cache_capacity is in kilobytes.
  let capacityBytes =
    Services.prefs.getIntPref("network.ssl_tokens_cache_capacity") * 1024;
  let percent = capacityBytes
    ? Math.round((100 * totalCompressed) / capacityBytes)
    : 0;

  let capacitySpan = document.createElement("span");
  document.l10n.setAttributes(
    capacitySpan,
    "about-networking-ssl-tokens-summary-capacity",
    {
      used: Math.round(totalCompressed / 1024),
      capacity: Math.round(capacityBytes / 1024),
      percent,
    }
  );
  container.appendChild(capacitySpan);

  let progress = document.createElement("progress");
  progress.max = capacityBytes;
  progress.value = totalCompressed;
  container.appendChild(progress);

  return container;
}

function displaySSLTokensCache(data) {
  let summary = document.getElementById("ssltokens_summary");
  summary.parentNode.replaceChild(buildSSLTokensSummary(data), summary);

  let cont = document.getElementById("ssltokens_content");
  let openKeys = new Set();
  for (let details of cont.querySelectorAll("details[open]")) {
    openKeys.add(`${details.dataset.tokenKey}|${details.dataset.kind}`);
  }

  let new_cont = document.createElement("tbody");
  new_cont.id = "ssltokens_content";

  for (let [groupKey, group] of groupSSLTokensCacheEntries(data.entries)) {
    // Represent the group by its longest-lived (latest-expiring) token.
    let entry = group.reduce((a, b) =>
      b.expirationTime > a.expirationTime ? b : a
    );
    let { host, isolationKey } = splitSSLTokensCacheKey(entry.key);
    // Match the other about:networking tabs: don't show private-browsing
    // entries as rows unless this page is itself a private window. The
    // summary above still counts them (buildSSLTokensSummary receives the
    // full, unfiltered data.entries).
    if (!gIsPrivateBrowsing && isPrivateBrowsingEntry(isolationKey)) {
      continue;
    }
    let expires = sslTokensExpiryDate(entry.expirationTime);
    let expired = isDateExpired(expires);

    let row = document.createElement("tr");
    row.appendChild(buildSSLTokensStatusCell(entry, expired));
    row.appendChild(buildSSLTokensHostCell(host));
    row.appendChild(buildSSLTokensIsolationKeyCell(isolationKey));
    row.appendChild(buildSSLTokensTokensCell(group, groupKey, openKeys));
    row.appendChild(buildSSLTokensExpiresCell(expires));
    row.appendChild(buildSSLTokensCertificateCell(entry, groupKey, openKeys));
    new_cont.appendChild(row);
  }

  cont.parentNode.replaceChild(new_cont, cont);
}

function displayNetworkID() {
  try {
    let linkIsUp = gNetLinkSvc.isLinkUp;
    let linkStatusKnown = gNetLinkSvc.linkStatusKnown;
    let networkID = gNetLinkSvc.networkID;

    document.getElementById("networkid_isUp").innerText = linkIsUp;
    document.getElementById("networkid_statusKnown").innerText =
      linkStatusKnown;
    document.getElementById("networkid_id").innerText = networkID;
  } catch (e) {
    document.getElementById("networkid_isUp").innerText = "<unknown>";
    document.getElementById("networkid_statusKnown").innerText = "<unknown>";
    document.getElementById("networkid_id").innerText = "<unknown>";
  }
}

function requestAllNetworkingData() {
  for (let id in gRequestNetworkingData) {
    requestNetworkingDataForTab(id);
  }
}

function requestNetworkingDataForTab(id) {
  gRequestNetworkingData[id](gDashboardCallbacks[id]);
}

let gInited = false;
function init() {
  if (gInited) {
    return;
  }
  gInited = true;

  requestAllNetworkingData();

  let autoRefresh = document.getElementById("autorefcheck");
  if (autoRefresh.checked) {
    setAutoRefreshInterval(autoRefresh);
  }

  autoRefresh.addEventListener("click", function () {
    let refrButton = document.getElementById("refreshButton");
    if (this.checked) {
      setAutoRefreshInterval(this);
      refrButton.disabled = "disabled";
    } else {
      clearInterval(this.interval);
      refrButton.disabled = null;
    }
  });

  let refr = document.getElementById("refreshButton");
  refr.addEventListener("click", requestAllNetworkingData);
  if (document.getElementById("autorefcheck").checked) {
    refr.disabled = "disabled";
  }

  // Event delegation on #categories element
  let menu = document.getElementById("categories");
  menu.addEventListener("click", function click(e) {
    if (e.target && e.target.parentNode == menu) {
      show(e.target);
    }
  });

  let clearHTTPCache = document.getElementById("clearHTTPCache");
  clearHTTPCache.addEventListener("click", async function () {
    Services.cache2.clear();
  });

  let dnsLookupButton = document.getElementById("dnsLookupButton");
  dnsLookupButton.addEventListener("click", function () {
    doLookup();
  });

  let hostInput = document.getElementById("host");
  hostInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      doLookup();
    }
  });

  let clearDNSCache = document.getElementById("clearDNSCache");
  clearDNSCache.addEventListener("click", function () {
    Services.dns.clearCache(true);
  });

  if (location.hash) {
    let sectionButton = document.getElementById(
      "category-" + location.hash.substring(1)
    );
    if (sectionButton) {
      sectionButton.click();
    }
  }
}

function show(button) {
  let current_tab = document.querySelector(".active");
  let category = button.getAttribute("id").substring("category-".length);
  let content = document.getElementById(category);
  if (current_tab == content) {
    return;
  }
  current_tab.classList.remove("active");
  current_tab.hidden = true;
  content.classList.add("active");
  content.hidden = false;

  let current_button = document.querySelector("[selected=true]");
  current_button.removeAttribute("selected");
  button.setAttribute("selected", "true");

  let autoRefresh = document.getElementById("autorefcheck");
  if (autoRefresh.checked) {
    clearInterval(autoRefresh.interval);
    setAutoRefreshInterval(autoRefresh);
  }

  let title = document.getElementById("sectionTitle");
  title.textContent = button.children[0].textContent;
  location.hash = category;
}

function setAutoRefreshInterval(checkBox) {
  let active_tab = document.querySelector(".active");
  checkBox.interval = setInterval(function () {
    requestNetworkingDataForTab(active_tab.id);
  }, REFRESH_INTERVAL_MS);
}

// We use the pageshow event instead of onload. This is needed because sometimes
// the page is loaded via session-restore/bfcache. In such cases we need to call
// init() to keep the page behaviour consistent with the ticked checkboxes.
// Mostly the issue is with the autorefresh checkbox.
window.addEventListener("pageshow", function () {
  init();
});

function doLookup() {
  let host = document.getElementById("host").value;
  if (host) {
    try {
      gDashboard.requestDNSLookup(host, displayDNSLookup);
    } catch (e) {}
    try {
      gDashboard.requestDNSHTTPSRRLookup(host, displayHTTPSRRLookup);
    } catch (e) {}
  }
}

function displayDNSLookup(data) {
  let cont = document.getElementById("dnslookuptool_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "dnslookuptool_content");

  if (data.answer) {
    for (let address of data.address) {
      let row = document.createElement("tr");
      row.appendChild(col(address));
      new_cont.appendChild(row);
    }
  } else {
    new_cont.appendChild(col(data.error));
  }

  parent.replaceChild(new_cont, cont);
}

function displayHTTPSRRLookup(data) {
  let cont = document.getElementById("https_rr_content");
  let parent = cont.parentNode;
  let new_cont = document.createElement("tbody");
  new_cont.setAttribute("id", "https_rr_content");

  if (data.answer) {
    for (let record of data.records) {
      let row = document.createElement("tr");
      let alpn = record.alpn ? `alpn="${record.alpn.alpn}" ` : "";
      let noDefaultAlpn = record.noDefaultAlpn ? "noDefaultAlpn " : "";
      let port = record.port ? `port="${record.port.port}" ` : "";
      let echConfig = record.echConfig
        ? `echConfig="${record.echConfig.echConfig}" `
        : "";
      let ODoHConfig = record.ODoHConfig
        ? `odoh="${record.ODoHConfig.ODoHConfig}" `
        : "";
      let ipv4hint = "";
      let ipv6hint = "";
      if (record.ipv4Hint) {
        let ipv4Str = "";
        for (let addr of record.ipv4Hint.address) {
          ipv4Str += `${addr}, `;
        }
        // Remove ", " at the end.
        ipv4Str = ipv4Str.slice(0, -2);
        ipv4hint = `ipv4hint="${ipv4Str}" `;
      }
      if (record.ipv6Hint) {
        let ipv6Str = "";
        for (let addr of record.ipv6Hint.address) {
          ipv6Str += `${addr}, `;
        }
        // Remove ", " at the end.
        ipv6Str = ipv6Str.slice(0, -2);
        ipv6hint = `ipv6hint="${ipv6Str}" `;
      }

      let str = `${record.priority} ${record.targetName} `;
      str += `(${alpn}${noDefaultAlpn}${port}`;
      str += `${ipv4hint}${echConfig}${ipv6hint}`;
      str += `${ODoHConfig})`;
      row.appendChild(col(str));
      new_cont.appendChild(row);
    }
  } else {
    new_cont.appendChild(col(data.error));
  }

  parent.replaceChild(new_cont, cont);
}
