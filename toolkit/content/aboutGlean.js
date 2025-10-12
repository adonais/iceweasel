/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Docs: https://devdocs.io/d3~3/
Services.scriptloader.loadSubScript(
  "chrome://global/content/third_party/d3/d3.js"
);
const d3 = this.d3;

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const METRIC_DATA = {};
let MAPPED_METRIC_DATA = [];
let FILTERED_METRIC_DATA = [];
let LIMITED_METRIC_DATA = [];
let LIMIT_OFFSET = 0;
let LIMIT_COUNT = 200;
let METRIC_DATA_INITIALIZED = false;
const INVALID_VALUE_REASONS = {
  LABELED_METRIC: 0,
  UNKNOWN_METRIC: 1,
};
const SIMPLE_TYPES = {
  Boolean: "Boolean",
  String: "String",
  StringList: "StringList",
  Text: "Text",
  Counter: "Counter",
};
const SELECTED_METRICS = [];
let DOCUMENT_BODY_SEL = undefined;

function updatePrefsAndDefines() {
  let upload = Services.prefs.getBoolPref(
    "datareporting.healthreport.uploadEnabled"
  );
  document.l10n.setAttributes(
    document.querySelector("[data-l10n-id='about-glean-data-upload']"),
    "about-glean-data-upload",
    {
      "data-upload-pref-value": upload,
    }
  );
  let port = Services.prefs.getIntPref("telemetry.fog.test.localhost_port");
  document.l10n.setAttributes(
    document.querySelector("[data-l10n-id='about-glean-local-port']"),
    "about-glean-local-port",
    {
      "local-port-pref-value": port,
    }
  );
  document.l10n.setAttributes(
    document.querySelector("[data-l10n-id='about-glean-glean-android']"),
    "about-glean-glean-android",
    { "glean-android-define-value": AppConstants.MOZ_GLEAN_ANDROID }
  );
  document.l10n.setAttributes(
    document.querySelector("[data-l10n-id='about-glean-moz-official']"),
    "about-glean-moz-official",
    { "moz-official-define-value": AppConstants.MOZILLA_OFFICIAL }
  );

  // Knowing what we know, and copying logic from viaduct_uploader.rs,
  // (which is documented in Preferences and Defines),
  // tell the fine user whether and why upload is disabled.
  let uploadMessageEl = document.getElementById("upload-status");
  let uploadL10nId = "about-glean-upload-enabled";
  if (!upload) {
    uploadL10nId = "about-glean-upload-disabled";
  } else if (port < 0 || (port == 0 && !AppConstants.MOZILLA_OFFICIAL)) {
    uploadL10nId = "about-glean-upload-fake-enabled";
    // This message has a link to the Glean Debug Ping Viewer in it.
    // We must add the anchor element now so that Fluent can match it.
    let a = document.createElement("a");
    a.href = "https://debug-ping-preview.firebaseapp.com/";
    a.setAttribute("data-l10n-name", "glean-debug-ping-viewer");
    uploadMessageEl.appendChild(a);
  } else if (port > 0) {
    uploadL10nId = "about-glean-upload-enabled-local";
  }
  document.l10n.setAttributes(uploadMessageEl, uploadL10nId);
}

function camelToKebab(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    let c = str.charAt(i);
    if (c == c.toUpperCase()) {
      out += "-";
      c = c.toLowerCase();
    }
    out += c;
  }
  return out;
}

// I'm consciously omitting "deletion-request" until someone can come up with
// a use-case for sending it via about:glean.
const GLEAN_BUILTIN_PINGS = ["metrics", "events", "baseline"];
const NO_PING = "(don't submit any ping)";
function refillPingNames() {
  let select = document.getElementById("ping-names");
  let pings = GLEAN_BUILTIN_PINGS.slice().concat(Object.keys(GleanPings));

  pings.forEach(ping => {
    let option = document.createElement("option");
    option.textContent = camelToKebab(ping);
    select.appendChild(option);
  });
  let option = document.createElement("option");
  document.l10n.setAttributes(option, "about-glean-no-ping-label");
  option.value = NO_PING;
  select.appendChild(option);
}

// If there's been a previous tag, use it.
// If not, be _slightly_ clever and derive a default one from the profile dir.
function fillDebugTag() {
  const DEBUG_TAG_PREF = "telemetry.fog.aboutGlean.debugTag";
  let debugTag;
  if (Services.prefs.prefHasUserValue(DEBUG_TAG_PREF)) {
    debugTag = Services.prefs.getStringPref(DEBUG_TAG_PREF);
  } else {
    const debugTagPrefix = "about-glean-";
    const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    let charSum = Array.from(profileDir).reduce(
      (prev, cur) => prev + cur.charCodeAt(0),
      0
    );

    debugTag = debugTagPrefix + (charSum % 1000);
  }

  let tagInput = document.getElementById("tag-pings");
  tagInput.value = debugTag;
  const updateDebugTagValues = () => {
    document.l10n.setAttributes(
      document.querySelector(
        "[data-l10n-id='about-glean-label-for-controls-submit']"
      ),
      "about-glean-label-for-controls-submit",
      { "debug-tag": tagInput.value }
    );
    const GDPV_ROOT = "https://debug-ping-preview.firebaseapp.com/pings/";
    let gdpvLink = document.querySelector(
      "[data-l10n-name='gdpv-tagged-pings-link']"
    );
    gdpvLink.href = GDPV_ROOT + tagInput.value;
  };
  tagInput.addEventListener("change", () => {
    Services.prefs.setStringPref(DEBUG_TAG_PREF, tagInput.value);
    updateDebugTagValues();
  });
  updateDebugTagValues();
}

function showTab(button) {
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

  if (category == "metrics-table") {
    // Init base level metric data
    initializeMetricData();

    const table = document.getElementById("metrics-table-instance");
    table.removeAttribute("hidden");

    // Map the metric data into a better defined type structure
    MAPPED_METRIC_DATA = Object.entries(METRIC_DATA).flatMap(
      ([category, metrics]) =>
        Object.entries(metrics).map(([name, metric]) => ({
          category,
          name,
          fullName: `${category}.${name}`,
          ...metric,
        }))
    );
    updateFilteredMetricData();
    updateTable();
  }
}

function onLoad() {
  let menu = document.getElementById("categories");
  menu.addEventListener("click", function click(e) {
    if (e.target && e.target.parentNode == menu) {
      showTab(e.target);
    }
  });
  menu.addEventListener("keydown", function keypress(e) {
    if (
      e.target &&
      e.target.parentNode == menu &&
      (e.key == " " || e.key == "Enter")
    ) {
      showTab(e.target);
    }
  });
  showTab(document.getElementById("category-about-glean"));

  updatePrefsAndDefines();
  refillPingNames();
  fillDebugTag();
  document.getElementById("controls-submit").addEventListener("click", () => {
    let tag = document.getElementById("tag-pings").value;
    let log = document.getElementById("log-pings").checked;
    let ping = document.getElementById("ping-names").value;
    let feedbackToast = document.getElementById("feedback");

    Services.fog.setLogPings(log);
    Services.fog.setTagPings(tag);

    if (ping != NO_PING) {
      Services.fog.sendPing(ping);
      feedbackToast.setAttribute(
        "data-l10n-id",
        "about-glean-feedback-settings-and-ping"
      );
    } else {
      feedbackToast.setAttribute(
        "data-l10n-id",
        "about-glean-feedback-settings-only"
      );
    }

    feedbackToast.style.visibility = "visible";
    setTimeout(() => {
      feedbackToast.style.visibility = "hidden";
    }, 3000);
  });

  // If about:glean redesign is enabled, add the navigation category for it.
  let redesignEnabled = Services.prefs.getBoolPref(
    "about.glean.redesign.enabled"
  );
  if (redesignEnabled) {
    const categories = document.getElementById("categories");
    const div = document.createElement("div");
    div.id = "category-metrics-table";
    div.className = "category";
    div.setAttribute("role", "menuitem");
    div.setAttribute("tabindex", 0);
    const span = document.createElement("span");
    span.className = "category-name";
    span.setAttribute("data-l10n-id", "about-glean-category-metrics-table");
    div.appendChild(span);
    categories.appendChild(div);
  }

  DOCUMENT_BODY_SEL = d3.select(document.body);

  /**
   * Handle metric filter input.
   *
   * This uses a timeout to debounce the events down to 200ms.
   * Instead of updating the DOM every time the input changes, it'll only update when the input hasn't changed in the last 200ms since it last changed.
   */
  let inputTimeout = undefined;
  document.getElementById("filter-metrics").addEventListener("input", e => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
      updateFilteredMetricData(e.target.value ?? "");
    }, 200);
  });

  // Handle loading all metric data
  document.getElementById("load-all").addEventListener("click", () => {
    MAPPED_METRIC_DATA.forEach(datum => {
      updateDatum(datum, false);
    });
    updateTable();
  });
}

/**
 * Initializes the base level metric data.
 *
 * Should only be able to be called once.
 */
function initializeMetricData() {
  if (METRIC_DATA_INITIALIZED) {
    return;
  }
  for (let [category, metrics] of Object.entries(Glean)) {
    for (let [metricName, metric] of Object.entries(metrics)) {
      // Trim "Glean" from the constructor names (e.g. "GleanBoolean" -> "Boolean").
      let constructorName = metric.constructor.name.replace("Glean", "");
      // For labeled metrics, get their submetrics' constructor names and append it
      if (constructorName == "Labeled") {
        constructorName += metric.__other__.constructor.name.replace(
          "Glean",
          ""
        );
      }
      if (!METRIC_DATA[category]) {
        METRIC_DATA[category] = {};
      }
      METRIC_DATA[category][metricName] = {
        type: constructorName,
        value: undefined,
        metric,
      };
    }
  }
  METRIC_DATA_INITIALIZED = true;
}

function updateButtonsSelection(selection) {
  selection.attr("data-l10n-id", d =>
    d.watching ? "about-glean-button-unwatch" : "about-glean-button-watch"
  );
}

function updateValueSelection(selection) {
  // Set the `data-l10n-id` attribute to the appropriate warning if the value is invalid, otherwise
  // unset it by returning `null`.
  selection
    .attr("data-l10n-id", d => {
      switch (d.invalidValue) {
        case INVALID_VALUE_REASONS.LABELED_METRIC:
          return "about-glean-labeled-metric-warning";
        case INVALID_VALUE_REASONS.UNKNOWN_METRIC:
          return "about-glean-unknown-metric-type-warning";
        default:
          return null;
      }
    })
    .each(function (datum) {
      if (datum.loaded) {
        let codeSelection = d3.select(this).select("pre>code");
        if (codeSelection.empty()) {
          codeSelection = d3.select(this).append("pre").append("code");
        }
        switch (datum.type) {
          default:
            codeSelection.text(prettyPrint(datum.value));
        }
      }
    });
}

/**
 * Updates a datum object with its value from `testGetValue`.
 *
 * @param {*} datum the datum object to update
 * @param {*} update update the table after updating the datum (defaults to `true`)
 */
function updateDatum(datum, update = true) {
  if (typeof datum.metric.testGetValue == "function") {
    try {
      datum.value = datum.metric.testGetValue();
      datum.error = undefined;
    } catch (e) {
      datum.error = e;
    }
    datum.loaded = true;
    datum.invalidValue = undefined;
  } else if (datum.type.includes("Labeled")) {
    datum.invalidValue = INVALID_VALUE_REASONS.LABELED_METRIC;
  } else {
    datum.invalidValue = INVALID_VALUE_REASONS.UNKNOWN_METRIC;
  }
  if (update) {
    updateValueSelection(
      DOCUMENT_BODY_SEL.select(
        `tr[data-d3-row="${datum.fullName}"]>td[data-d3-cell=value]`
      )
    );
  }
}

/**
 * Prettifies a JSON value to make it render more nicely in the table.
 *
 * @param {*} jsonValue the JSON value to prettify
 * @returns a string containing the prettified JSON value in a pre+code
 */
function prettyPrint(jsonValue) {
  // from devtools/client/jsonview/json-viewer.mjs
  const pretty = JSON.stringify(
    jsonValue,
    (key, value) => {
      if (value?.type === Symbol("JSON_NUMBER")) {
        return JSON.rawJSON(value.source);
      }

      // By default, -0 will be stringified as `0`, so we need to handle it
      if (Object.is(value, -0)) {
        return JSON.rawJSON("-0");
      }

      return value;
    },
    "  "
  );
  return pretty;
}

/**
 * Updates the `about:glean` metrics table body based on the data points in FILTERED_METRIC_DATA.
 */
function updateTable() {
  LIMITED_METRIC_DATA = FILTERED_METRIC_DATA.toSorted((a, b) =>
    d3.ascending(a.fullName, b.fullName)
  ).filter((_, i) => i >= LIMIT_OFFSET && i < LIMIT_COUNT + LIMIT_OFFSET);

  // Let's talk about d3.js
  // `d3.select` is a rough equivalent to `document.querySelector`, but the resulting object(s) are things d3 knows how to manipulate.
  const tbody = DOCUMENT_BODY_SEL.select("#metrics-table-body");
  // Select all the `tr` elements within the previously selected `tbody` element.
  const rows = tbody
    .selectAll("tr")
    // Set the data for the `tr` elements to be the FILTERED_METRIC_DATA, keyed off the data element's full name
    .data(LIMITED_METRIC_DATA, d => d.fullName);

  // `.enter()` means this section determines how we handle new data elements in the array.
  // We class them and insert the appropriate data cells
  let newRows = rows
    .enter()
    .append("tr")
    .attr("data-d3-row", d => d.fullName)
    .classed({ "metric-row": true });

  const actions = newRows
    .append("td")
    .attr("data-d3-cell", "actions")
    .append("div");
  // Set the HTML content for the `category` and `name` cells, and store the name cells in-scope so we can
  // append our buttons to them.
  newRows
    .append("td")
    .attr("data-d3-cell", "category")
    .append("pre")
    .text(d => d.category);
  newRows
    .append("td")
    .attr("data-d3-cell", "name")
    .append("pre")
    .text(d => d.name);
  // Handle displaying the metric type.
  newRows
    .append("td")
    .attr("data-d3-cell", "type")
    .text(d => d.type);
  newRows.append("td").attr("data-d3-cell", "value");

  actions
    .append("button")
    .attr("data-l10n-id", "about-glean-button-load-value")
    .on("click", datum => updateDatum(datum));
  actions
    .append("button")
    .attr("data-l10n-id", "about-glean-button-dictionary-link")
    .classed({ primary: true })
    // On click, rewrite the metric category+name to snake-case, so we can link to the Glean dictionary.
    // TODO: add canonical_name field to metrics https://bugzilla.mozilla.org/show_bug.cgi?id=1983630
    .on("click", datum => {
      const upperRegExp = /[A-Z]/;
      const app = "firefox_desktop";
      let category = datum.category;
      let index = category.search(upperRegExp);
      while (index != -1) {
        category = category.replace(
          upperRegExp,
          "_" + category[index].toLowerCase()
        );
        index = category.search(upperRegExp);
      }

      let name = datum.name;
      index = name.search(upperRegExp);
      while (index != -1) {
        name = name.replace(upperRegExp, "_" + name[index].toLowerCase());
        index = name.search(upperRegExp);
      }
      window
        .open(
          `https://dictionary.telemetry.mozilla.org/apps/${app}/metrics/${category}_${name}`,
          "_blank"
        )
        .focus();
    });

  // Since `.enter` has been called on `rows` and we've handled new data points, everything
  // that touches `rows` from here on out will affect ALL elements, old and new.

  updateButtonsSelection(
    rows.selectAll("td[data-d3-cell=actions] button[data-d3-button=watch]")
  );
  // Handle the metric's value.
  updateValueSelection(rows.selectAll("td[data-d3-cell=value]"));

  // Sort the `tr` elements by full metric category+name.
  rows.sort((a, b) => d3.ascending(a.fullName, b.fullName));

  // Handle exiting data points by removing their elements.
  rows.exit().remove();

  // Manually trigger translation on the table, as DOM updates after the first application of the `data-l10n-id` will not translate.
  document.l10n.translateFragment(
    document.querySelector("#metrics-table-body")
  );
}

/**
 * Updates the FILTERED_METRIC_DATA value based on the provided `searchString`.
 *
 * @param {*} searchString the string by which the metric data will be filtered
 */
function updateFilteredMetricData(searchString) {
  if (!searchString) {
    FILTERED_METRIC_DATA = MAPPED_METRIC_DATA;
  } else {
    const simpleTypeValueSearch = datum => {
      if (!Object.values(SIMPLE_TYPES).includes(datum.type)) {
        return false;
      }
      switch (datum.type) {
        case SIMPLE_TYPES.Boolean:
          if (searchString == "true") {
            return datum.value === true;
          } else if (searchString == "false") {
            return datum.value === false;
          }
          return false;
        default:
          return false;
      }
    };
    FILTERED_METRIC_DATA = MAPPED_METRIC_DATA.filter(
      datum =>
        datum.category.includes(searchString) ||
        datum.name.includes(searchString) ||
        datum.type.includes(searchString) ||
        simpleTypeValueSearch(datum)
    );
  }

  if (FILTERED_METRIC_DATA.length > LIMIT_COUNT + LIMIT_OFFSET) {
    const table = document.getElementById("metrics-table-instance");
    let scrollTimeout,
      scrollTimeoutIsCleared = true;
    table.addEventListener("scroll", el => {
      if (scrollTimeoutIsCleared) {
        scrollTimeout = setTimeout(
          ({ target }) => {
            clearTimeout(scrollTimeout);
            scrollTimeoutIsCleared = true;
            let changes = false;
            if (target.scrollTop < 1500) {
              if (LIMIT_COUNT >= 500 && LIMIT_OFFSET > 0) {
                LIMIT_OFFSET = LIMIT_OFFSET - 100 < 0 ? 0 : LIMIT_OFFSET - 100;
                changes = true;
              }
            } else if (target.scrollHeight - target.scrollTop < 1500) {
              if (LIMIT_COUNT >= 500) {
                if (
                  LIMIT_OFFSET + LIMIT_COUNT + 100 >
                  FILTERED_METRIC_DATA.length
                ) {
                  LIMIT_OFFSET = FILTERED_METRIC_DATA.length - LIMIT_COUNT;
                } else if (
                  LIMIT_OFFSET + LIMIT_COUNT <
                  FILTERED_METRIC_DATA.length - 100
                ) {
                  LIMIT_OFFSET += 100;
                }
              } else {
                LIMIT_COUNT += 100;
              }
              changes = true;
            }
            if (changes) {
              updateTable();
            }
          },
          10,
          el
        );
        scrollTimeoutIsCleared = false;
      }
    });
  } else {
    LIMIT_COUNT = 200;
    LIMIT_OFFSET = 0;
  }

  updateTable();
}

window.addEventListener("load", onLoad);
