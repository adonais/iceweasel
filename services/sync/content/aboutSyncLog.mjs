/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
const { DownloadUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/DownloadUtils.sys.mjs"
);

const LOG_DIR = PathUtils.join(PathUtils.profileDir, "weave", "logs");
const FILENAME_RE = /^(success|error)-sync-(\d+)\.txt$/;
const ERROR_LINE_RE = /\b(ERROR|FATAL|Exception|Traceback)\b/;
const WARN_LINE_RE = /\bWARN(ING)?\b/;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

// All discovered logs, and the subset currently shown.
let allLogs = [];
let visibleLogs = [];
let filterGeneration = 0;
const contentsCache = new Map();
const searchContentsCache = new Map();

const els = {};

function $(id) {
  return document.getElementById(id);
}

async function readContents(log) {
  if (!contentsCache.has(log.path)) {
    contentsCache.set(log.path, IOUtils.readUTF8(log.path));
  }
  return contentsCache.get(log.path);
}

function readSearchContents(log) {
  if (!searchContentsCache.has(log.path)) {
    searchContentsCache.set(
      log.path,
      readContents(log).then(text => text.toLowerCase())
    );
  }
  return searchContentsCache.get(log.path);
}

async function loadLogs() {
  contentsCache.clear();
  searchContentsCache.clear();
  let children;
  try {
    children = await IOUtils.getChildren(LOG_DIR);
  } catch (ex) {
    children = [];
  }

  const logs = [];
  for (const path of children) {
    const leafName = PathUtils.filename(path);
    const match = FILENAME_RE.exec(leafName);
    if (!match) {
      continue;
    }
    let info;
    try {
      info = await IOUtils.stat(path);
    } catch (ex) {
      continue;
    }
    const timestamp = Number(match[2]);
    logs.push({
      name: leafName,
      path,
      type: match[1],
      timestamp,
      date: new Date(timestamp),
      size: info.size,
    });
  }
  logs.sort((a, b) => b.timestamp - a.timestamp);
  allLogs = logs;
  await applyFilters();
}

function dateThreshold(value) {
  if (value === "all") {
    return null;
  }
  if (value === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return Date.now() - Number(value) * 24 * 60 * 60 * 1000;
}

async function applyFilters() {
  // Searching waits for file reads, so ignore results from older searches.
  const generation = ++filterGeneration;
  const type = els.filterType.value;
  const threshold = dateThreshold(els.filterDate.value);
  const query = els.search.value.trim().toLowerCase();

  let logs = allLogs;

  if (type !== "all") {
    logs = logs.filter(log => log.type === type);
  }
  if (threshold !== null) {
    logs = logs.filter(log => log.timestamp >= threshold);
  }
  if (query) {
    const matched = [];
    for (const log of logs) {
      if (log.name.toLowerCase().includes(query)) {
        matched.push(log);
        continue;
      }
      try {
        if ((await readSearchContents(log)).includes(query)) {
          matched.push(log);
        }
      } catch (ex) {
        // An unreadable log cannot match after its filename did not.
      }
    }
    logs = matched;
  }

  // A newer filter run started while we were awaiting reads; let it win.
  if (generation !== filterGeneration) {
    return;
  }

  visibleLogs = logs;
  render();
}

function renderContents(pre, text) {
  pre.textContent = "";
  const fragment = document.createDocumentFragment();
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  for (const line of lines) {
    const span = document.createElement("span");
    span.className = "log-line";
    if (ERROR_LINE_RE.test(line)) {
      span.classList.add("error");
    } else if (WARN_LINE_RE.test(line)) {
      span.classList.add("warn");
    }
    span.textContent = line + "\n";
    fragment.appendChild(span);
  }
  pre.appendChild(fragment);
}

async function loadRowContents(details, log) {
  const pre = details.querySelector(".log-contents");
  if (pre.dataset.loaded) {
    return;
  }
  pre.dataset.loaded = "true";
  try {
    renderContents(pre, await readContents(log));
  } catch (ex) {
    document.l10n.setAttributes(pre, "about-sync-log-view-error");
  }
}

function openRaw(log) {
  const uri = PathUtils.toFileURI(log.path);
  const browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
  if (browserWindow) {
    browserWindow.openTrustedLinkIn(uri, "tab");
  } else {
    window.open(uri);
  }
}

function render() {
  els.list.textContent = "";
  const fragment = document.createDocumentFragment();

  for (const log of visibleLogs) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    const details = row.querySelector(".log-row-details");
    const badge = row.querySelector(".log-badge");
    const date = row.querySelector(".log-date");
    const size = row.querySelector(".log-size");

    badge.classList.add(log.type);
    document.l10n.setAttributes(
      badge,
      log.type === "error"
        ? "about-sync-log-badge-error"
        : "about-sync-log-badge-success"
    );
    date.textContent = dateFormatter.format(log.date);
    const [sizeValue, sizeUnit] = DownloadUtils.convertByteUnits(log.size);
    document.l10n.setAttributes(size, "about-sync-log-row-size", {
      value: sizeValue,
      unit: sizeUnit,
    });

    details.addEventListener("toggle", () => {
      if (details.open) {
        loadRowContents(details, log);
      }
    });
    row.querySelector(".log-open-raw").addEventListener("click", event => {
      // The button lives inside <summary>; stop it from toggling the row.
      event.preventDefault();
      event.stopPropagation();
      openRaw(log);
    });
    fragment.appendChild(row);
  }
  els.list.appendChild(fragment);

  els.empty.hidden = !!visibleLogs.length;
  if (!els.empty.hidden) {
    document.l10n.setAttributes(
      els.empty,
      allLogs.length ? "about-sync-log-empty-filtered" : "about-sync-log-empty"
    );
  }
  document.l10n.setAttributes(els.count, "about-sync-log-count", {
    count: visibleLogs.length,
  });
}

function processZipQueue(zipWriter) {
  return new Promise(resolve => {
    zipWriter.processQueue(
      {
        onStartRequest() {},
        onStopRequest(_request, statusCode) {
          resolve(statusCode);
        },
      },
      null
    );
  });
}

async function downloadZip() {
  // Snapshot now: the set can change (refresh/filter) while the dialog is open.
  const logs = visibleLogs.slice();
  if (!logs.length) {
    return;
  }

  const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  const title = await document.l10n.formatValue("about-sync-log-title");
  fp.init(window.browsingContext, title, Ci.nsIFilePicker.modeSave);
  fp.defaultString = "sync-logs.zip";
  fp.appendFilter("ZIP", "*.zip");

  const result = await new Promise(resolve => fp.open(resolve));
  if (result === Ci.nsIFilePicker.returnCancel) {
    return;
  }

  const zipWriter = Cc["@mozilla.org/zipwriter;1"].createInstance(
    Ci.nsIZipWriter
  );
  zipWriter.open(
    fp.file,
    FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE
  );
  try {
    for (const log of logs) {
      try {
        zipWriter.addEntryFile(
          log.name,
          Ci.nsIZipWriter.COMPRESSION_DEFAULT,
          new FileUtils.File(log.path),
          true
        );
        if (!Components.isSuccessCode(await processZipQueue(zipWriter))) {
          throw new Error("Could not add log to archive");
        }
      } catch (ex) {
        console.warn(`Skipping ${log.name} in zip export`, ex);
      }
    }
  } finally {
    zipWriter.close();
  }
}

async function clearLogs() {
  // Snapshot now: the set can change while the confirmation prompt is open.
  const logs = visibleLogs.slice();
  if (!logs.length) {
    return;
  }

  const [title, message, accept] = await document.l10n.formatValues([
    { id: "about-sync-log-clear-confirm-title" },
    {
      id: "about-sync-log-clear-confirm-message",
      args: { count: logs.length },
    },
    { id: "about-sync-log-clear-confirm-accept" },
  ]);

  const flags =
    Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
    Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;
  const pressed = Services.prompt.confirmEx(
    window,
    title,
    message,
    flags,
    accept,
    null,
    null,
    null,
    {}
  );
  if (pressed !== 0) {
    return;
  }

  for (const log of logs) {
    try {
      await IOUtils.remove(log.path);
    } catch (ex) {
      // Ignore files that are already gone.
    }
  }
  await loadLogs();
}

async function init() {
  await Promise.all(
    ["moz-radio-group", "moz-select", "moz-input-search"].map(tagName =>
      customElements.whenDefined(tagName)
    )
  );

  els.filterType = $("filter-type");
  els.filterDate = $("filter-date");
  els.search = $("filter-search");
  els.list = $("log-list");
  els.empty = $("empty-state");
  els.count = $("log-count");
  els.rowTemplate = $("log-row-template");

  els.filterType.value = "all";
  els.filterType.addEventListener("change", applyFilters);
  els.filterDate.addEventListener("change", applyFilters);
  els.search.addEventListener("input", () => filterGeneration++);
  els.search.addEventListener("MozInputSearch:search", applyFilters);
  $("refresh-button").addEventListener("click", loadLogs);
  $("download-button").addEventListener("click", downloadZip);
  $("clear-button").addEventListener("click", clearLogs);

  loadLogs();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
