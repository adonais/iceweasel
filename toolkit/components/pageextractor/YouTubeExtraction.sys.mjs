/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * Extracts a YouTube watch page into a compact, labeled block.
 *
 * YouTube renders the transcript into an engagement panel only after the user
 * opens it, so this module opens that panel (by activating the "Show
 * transcript" control), reads the rendered segments, then closes the panel
 * again. Reading the rendered DOM avoids having to intercept and decode
 * YouTube's `get_transcript`/`get_panel` network payloads.
 *
 * Two transcript segment element generations currently coexist and are both
 * supported:
 *  - New:    `transcript-segment-view-model`
 *  - Legacy: `ytd-transcript-segment-renderer`
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  enabled: {
    pref: "browser.pageextractor.youtube.enabled",
    default: false,
  },
});

/**
 * @typedef {object} TranscriptSegment
 * @property {string} timestamp - Human-readable timestamp, e.g. "0:03".
 * @property {string} text - The caption text for the segment.
 */

/**
 * @typedef {object} VideoMetadata
 * @property {string} title - The video title.
 * @property {string} channel - The uploading channel's name.
 * @property {string} uploadDate - The publish date (YYYY-MM-DD).
 * @property {string} duration - The runtime, e.g. "10:35".
 * @property {string} views - The view count.
 * @property {string} likes - The like count.
 * @property {string} genre - The video category, e.g. "Film & Animation".
 * @property {string} description - The video description.
 */

// Desktop YouTube only: the mobile and music layouts render neither the
// description transcript control nor the engagement panel this module reads.
const WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com"]);

// Views and likes are schema.org InteractionCounters keyed by interaction type;
// there is no single flat field for either.
const WATCH_ACTION = "WatchAction";
const LIKE_ACTION = "LikeAction";

const ISO_DURATION_REGEX = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

const NEW_SEGMENT_SELECTOR = "transcript-segment-view-model";
const LEGACY_SEGMENT_SELECTOR = "ytd-transcript-segment-renderer";
const SEGMENT_SELECTOR = `${NEW_SEGMENT_SELECTOR}, ${LEGACY_SEGMENT_SELECTOR}`;

// The transcript renders inside an engagement panel. Segment reading and the
// close-on-cleanup both anchor on the segment's nearest engagement panel: it is
// a single panel (so the transcript, which YouTube mirrors into more than one
// panel, isn't extracted multiple times) and it is the panel our click
// expanded (so closing it restores the page). Modern layouts render the
// transcript into a combined "In this video" panel that carries no
// transcript-specific target-id, so anchoring on target-id alone would miss it.
const ENGAGEMENT_PANEL_SELECTOR = "ytd-engagement-panel-section-list-renderer";

// The transcript-scoped variant is used where there is no segment to anchor on
// yet: scoping the wait's observer, and the slow-load cleanup, where we must
// not toggle a panel we cannot attribute to our own click.
const TRANSCRIPT_PANEL_SELECTOR = `${ENGAGEMENT_PANEL_SELECTOR}[target-id*="transcript" i]`;

// Structural (locale-independent) selector for the transcript button that
// lives in the video description, with English aria-label selectors as a
// fallback for layouts that expose the control elsewhere. Non-English locales
// therefore rely on the structural selector.
const TRANSCRIPT_BUTTON_SELECTORS = [
  "ytd-video-description-transcript-section-renderer button",
  'button[aria-label="Show transcript"]',
  'button[aria-label="Transcript"]',
];

// Close control in the transcript panel header. The structural id button comes
// first, with localized aria-label selectors as a fallback.
const TRANSCRIPT_CLOSE_SELECTORS = [
  "#visibility-button button",
  'button[aria-label="Close transcript"]',
  'button[aria-label="Close"]',
];

const OPEN_PANEL_TIMEOUT_MS = 3000;

/**
 * Returns true if the URL is a YouTube video watch page.
 *
 * @param {URL | null} url
 * @returns {boolean}
 */
export function isYouTubeWatchUrl(url) {
  if (!url) {
    return false;
  }
  return (
    WATCH_HOSTS.has(url.hostname) &&
    url.pathname === "/watch" &&
    url.searchParams.has("v")
  );
}

/**
 * The single guard for YouTube extraction. Both the structured extraction in
 * PageExtractorChild and the YouTube strategy in DOMExtractor must agree: if
 * only the strategy applied, a transcript the user opened themselves would be
 * filtered out of the generic walk with nothing replacing it.
 *
 * @param {URL | null} url
 * @returns {boolean}
 */
export function shouldExtractYouTube(url) {
  return lazy.enabled && isYouTubeWatchUrl(url);
}

/**
 * @typedef {object} YouTubeContent
 * @property {string} text - The extracted text, empty when there is nothing.
 * @property {boolean} replacesContent - True when `text` is the metadata +
 *   transcript block and should replace the generic walk; false when `text` is
 *   the metadata block alone and should be prepended to it.
 */

/**
 * Extracts the watch page for a language model. Best-effort.
 *
 * With a transcript, `text` is the metadata + transcript block that replaces the
 * generic walk. Without one, `text` is the metadata block (header + description)
 * to prepend to the retained generic walk, whose own metadata is noisy and whose
 * description is always truncated. `text` is capped at `sufficientLength` so a
 * long transcript can't emit far more than the other extractors. Rejections
 * propagate for the caller to log and treat as empty, never blocking extraction.
 *
 * @param {Document} document - The live watch-page document.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - How long to wait for segments to render.
 * @param {number} [options.sufficientLength] - Cap on the emitted text length.
 * @param {string} [options.currentVideoId] - The id from the watch URL's `v`
 *   param, used to ignore stale VideoObjects for other videos.
 * @returns {Promise<YouTubeContent>}
 */
export async function getYouTubeContent(
  document,
  {
    timeoutMs = OPEN_PANEL_TIMEOUT_MS,
    sufficientLength,
    currentVideoId = "",
  } = {}
) {
  const window = document?.defaultView;
  if (!document || !window) {
    return { text: "", replacesContent: false };
  }

  const metadata = extractVideoMetadata(document, currentVideoId);
  const transcript = await extractTranscript(document, window, timeoutMs);

  // An empty transcript yields the metadata block alone: formatYouTubeContent
  // omits the transcript section, and returns "" when there is no metadata.
  return {
    text: truncate(
      formatYouTubeContent(metadata, transcript),
      sufficientLength
    ),
    replacesContent: !!transcript.length,
  };
}

/**
 * Caps text at `sufficientLength`. A missing limit leaves the text unchanged.
 *
 * @param {string} text
 * @param {number} [sufficientLength]
 * @returns {string}
 */
function truncate(text, sufficientLength) {
  if (sufficientLength !== undefined && text.length > sufficientLength) {
    return text.slice(0, sufficientLength);
  }
  return text;
}

/**
 * Reads the video's metadata from the page's schema.org VideoObject (JSON-LD).
 * Fields the page does not expose there are left empty rather than guessed at
 * from OpenGraph or microdata, which mirror the same values less reliably.
 *
 * @param {Document} document
 * @param {string} [currentVideoId] - The id from the watch URL's `v` param.
 *   Used to ignore stale VideoObjects YouTube leaves in the DOM for other
 *   videos across client-side navigations. When absent, all objects are read.
 * @returns {VideoMetadata}
 */
export function extractVideoMetadata(document, currentVideoId = "") {
  const videoObjects = currentVideoObjects(
    readVideoObjects(document),
    currentVideoId
  );

  return {
    title: videoObjectString(videoObjects, "name"),
    channel: readVideoAuthor(videoObjects),
    uploadDate: formatDate(videoObjectString(videoObjects, "uploadDate")),
    duration: formatDuration(videoObjectString(videoObjects, "duration")),
    views: interactionCount(videoObjects, WATCH_ACTION),
    likes: interactionCount(videoObjects, LIKE_ACTION),
    genre: videoObjectString(videoObjects, "genre"),
    description: videoObjectString(videoObjects, "description"),
  };
}

/**
 * Parses the page's JSON-LD scripts and returns every schema.org VideoObject
 * they contain. YouTube splits the fields across more than one object, so all
 * are returned and read field-by-field.
 *
 * @param {Document} document
 * @returns {any[]}
 */
function readVideoObjects(document) {
  const objects = [];
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  for (let i = 0; i < scripts.length; i++) {
    let data;
    try {
      data = JSON.parse(scripts[i].textContent ?? "");
    } catch {
      continue;
    }
    collectVideoObjects(data, objects);
  }
  return objects;
}

/**
 * @param {any} data
 * @param {any[]} out
 */
function collectVideoObjects(data, out) {
  if (Array.isArray(data)) {
    for (const item of data) {
      collectVideoObjects(item, out);
    }
    return;
  }
  if (!data || typeof data !== "object") {
    return;
  }
  // `@type` may be a string or an array of strings (both schema.org-legal).
  const types = [].concat(data["@type"] ?? []);
  if (
    types.some(type => typeof type === "string" && type.endsWith("VideoObject"))
  ) {
    out.push(data);
  }
  collectVideoObjects(data["@graph"], out);
}

/**
 * Narrows the collected VideoObjects to those describing the current video.
 * YouTube leaves stale VideoObjects for previously watched videos in the DOM
 * across client-side navigations, and a stale one can precede the current
 * video's object in document order, so the field-by-field readers would pull
 * `name`/`uploadDate` from it. Objects carrying an id that differs from
 * `currentVideoId` are dropped; objects that match or expose no id are kept, so
 * fields YouTube splits across the current video's objects still merge and a
 * layout that omits the id never regresses to empty metadata.
 *
 * @param {any[]} objects
 * @param {string} currentVideoId
 * @returns {any[]}
 */
function currentVideoObjects(objects, currentVideoId) {
  if (!currentVideoId) {
    return objects;
  }
  const matching = objects.filter(object => {
    const id = videoObjectId(object);
    return !id || id === currentVideoId;
  });
  return matching.length ? matching : objects;
}

/**
 * Extracts the video id a VideoObject refers to, reading whichever id-bearing
 * URL the object carries. Returns an empty string when none is present or
 * parseable.
 *
 * @param {any} object
 * @returns {string}
 */
function videoObjectId(object) {
  const candidates = [
    object.embedUrl,
    object["@id"],
    object.url,
    object.contentUrl,
  ].concat(object.thumbnailUrl ?? []);
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const id = videoIdFromUrl(candidate);
    if (id) {
      return id;
    }
  }
  return "";
}

/**
 * Reads the video id out of a YouTube URL: the `v` query param, an `/embed/ID`
 * or `/vi/ID/` path segment, or a `youtu.be/ID` shortlink.
 *
 * @param {string} raw
 * @returns {string}
 */
function videoIdFromUrl(raw) {
  const url = URL.parse(raw);
  if (!url) {
    return "";
  }
  const queryId = url.searchParams.get("v");
  if (queryId) {
    return queryId;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "youtu.be") {
    return segments[0] ?? "";
  }
  const embedIndex = segments.indexOf("embed");
  if (embedIndex !== -1) {
    return segments[embedIndex + 1] ?? "";
  }
  const viIndex = segments.indexOf("vi");
  if (viIndex !== -1) {
    return segments[viIndex + 1] ?? "";
  }
  return "";
}

/**
 * Returns the first non-empty string value for `key` across the video objects.
 *
 * @param {any[]} objects
 * @param {string} key
 * @returns {string}
 */
function videoObjectString(objects, key) {
  for (const object of objects) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

/**
 * Reads the channel name, which schema.org models as a plain string, a
 * Person/Organization carrying a `name`, or an array of either.
 *
 * @param {any[]} objects
 * @returns {string}
 */
function readVideoAuthor(objects) {
  for (const object of objects) {
    const name = authorName(object.author);
    if (name) {
      return name;
    }
  }
  return "";
}

/**
 * @param {any} author
 * @returns {string}
 */
function authorName(author) {
  if (typeof author === "string") {
    return author.trim();
  }
  if (Array.isArray(author)) {
    for (const entry of author) {
      const name = authorName(entry);
      if (name) {
        return name;
      }
    }
    return "";
  }
  if (author && typeof author.name === "string") {
    return author.name.trim();
  }
  return "";
}

/**
 * Reads the count from the schema.org InteractionCounter of the given action
 * type (views are a WatchAction, likes a LikeAction).
 *
 * @param {any[]} objects
 * @param {string} action
 * @returns {string}
 */
function interactionCount(objects, action) {
  for (const object of objects) {
    const stats = object.interactionStatistic;
    if (!stats) {
      continue;
    }
    const list = Array.isArray(stats) ? stats : [stats];
    for (const stat of list) {
      const type = stat?.interactionType;
      const name = typeof type === "string" ? type : type?.["@type"];
      if (interactionTypeName(name) === action) {
        const count = stat.userInteractionCount;
        if (count != null && String(count).trim()) {
          return String(count).trim();
        }
      }
    }
  }
  return "";
}

/**
 * Reduces a schema.org interaction type to its final token so it can be matched
 * exactly, e.g. "https://schema.org/WatchAction" -> "WatchAction". Matching the
 * whole token avoids "LikeAction" also matching a "DislikeAction" counter.
 *
 * @param {unknown} type
 * @returns {string}
 */
function interactionTypeName(type) {
  if (typeof type !== "string") {
    return "";
  }
  const slash = type.lastIndexOf("/");
  return slash === -1 ? type : type.slice(slash + 1);
}

/**
 * Formats an ISO 8601 duration (e.g. "PT10M35S") as "h:mm:ss" or "m:ss".
 * Returns an empty string when the input is absent or unparseable.
 *
 * @param {string} iso
 * @returns {string}
 */
function formatDuration(iso) {
  const match = ISO_DURATION_REGEX.exec(iso);
  if (!match) {
    return "";
  }
  const total =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  if (!total) {
    return "";
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const paddedMinutes = hours ? String(minutes).padStart(2, "0") : `${minutes}`;
  const prefix = hours ? `${hours}:` : "";
  return `${prefix}${paddedMinutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Reduces an ISO 8601 timestamp to its calendar date.
 *
 * @param {string} raw
 * @returns {string}
 */
function formatDate(raw) {
  const match = ISO_DATE_REGEX.exec(raw);
  return match ? match[0] : raw;
}

/**
 * Reads the transcript, opening the panel if needed. A panel the user already
 * had open is read and left alone; a panel this function opens is always closed
 * again afterwards, including when no segment ever renders. Returns an empty
 * array when there is no transcript.
 *
 * @param {Document} document
 * @param {Window} window
 * @param {number} timeoutMs
 * @returns {Promise<TranscriptSegment[]>}
 */
async function extractTranscript(document, window, timeoutMs) {
  const openSegment = findTranscriptSegment(document);
  if (openSegment) {
    const root = openSegment.closest(ENGAGEMENT_PANEL_SELECTOR) ?? document;
    return extractTranscriptSegmentsFromRoot(root);
  }

  const button = findTranscriptButton(document);
  if (!button) {
    return [];
  }
  button.click();

  const segment =
    findTranscriptSegment(document) ??
    (await waitForTranscriptSegment(document, window, timeoutMs));

  // Resolve the panel we opened so we can close it. With a segment we anchor on
  // its nearest engagement panel; without one (slow/failed load) fall back to
  // the transcript panel only when it is unambiguous, so we never toggle a panel
  // we did not open.
  const panel = segment
    ? segment.closest(ENGAGEMENT_PANEL_SELECTOR)
    : soleTranscriptPanel(document);

  const segments = segment
    ? extractTranscriptSegmentsFromRoot(panel ?? document)
    : [];

  // We opened this panel; close it to restore the page. Done after reading so
  // it can never discard segments (e.g. if the close control has moved).
  if (panel) {
    closeTranscriptPanel(panel);
  }

  return segments;
}

/**
 * Returns the transcript panel only when there is exactly one, so the wait is
 * never scoped to, and the slow-load cleanup never toggles, a panel this
 * extraction did not open.
 *
 * @param {Document} document
 * @returns {Element | null}
 */
function soleTranscriptPanel(document) {
  const panels = document.querySelectorAll(TRANSCRIPT_PANEL_SELECTOR);
  return panels.length === 1 ? panels[0] : null;
}

/**
 * Reads the transcript segments currently present in the DOM. Prefers the new
 * `transcript-segment-view-model` generation, falling back to the legacy
 * `ytd-transcript-segment-renderer`. Exported for tests; the extraction path
 * uses extractTranscriptSegmentsFromRoot directly.
 *
 * @param {Document} document
 * @returns {TranscriptSegment[]}
 */
export function extractTranscriptSegments(document) {
  const firstSegment = document.querySelector(SEGMENT_SELECTOR);
  if (!firstSegment) {
    return [];
  }

  const root = firstSegment.closest(ENGAGEMENT_PANEL_SELECTOR) ?? document;
  return extractTranscriptSegmentsFromRoot(root);
}

/**
 * @param {Document | Element} root
 * @returns {TranscriptSegment[]}
 */
function extractTranscriptSegmentsFromRoot(root) {
  const segments = [];

  const newSegments = root.querySelectorAll(NEW_SEGMENT_SELECTOR);
  if (newSegments.length) {
    for (let i = 0; i < newSegments.length; i++) {
      const segment = readNewSegment(newSegments[i]);
      if (segment.text) {
        segments.push(segment);
      }
    }
    return segments;
  }

  const legacySegments = root.querySelectorAll(LEGACY_SEGMENT_SELECTOR);
  for (let i = 0; i < legacySegments.length; i++) {
    const segment = readLegacySegment(legacySegments[i]);
    if (segment.text) {
      segments.push(segment);
    }
  }
  return segments;
}

/**
 * Formats the extracted metadata and transcript into a labeled, blank-line
 * separated block. Sections are ordered so the most identifying information
 * survives when a consumer truncates the result to fit its context window.
 * Empty fields and an absent transcript are omitted.
 *
 * @param {VideoMetadata} metadata
 * @param {TranscriptSegment[]} transcript
 * @returns {string}
 */
export function formatYouTubeContent(metadata, transcript) {
  const sections = [];

  const header = [];
  if (metadata.title) {
    header.push(`Title: ${metadata.title}`);
  }
  if (metadata.channel) {
    header.push(`Channel: ${metadata.channel}`);
  }
  if (metadata.uploadDate) {
    header.push(`Published: ${metadata.uploadDate}`);
  }
  if (metadata.duration) {
    header.push(`Duration: ${metadata.duration}`);
  }
  if (metadata.views) {
    header.push(`Views: ${metadata.views}`);
  }
  if (metadata.likes) {
    header.push(`Likes: ${metadata.likes}`);
  }
  if (metadata.genre) {
    header.push(`Category: ${metadata.genre}`);
  }
  if (header.length) {
    sections.push(header.join("\n"));
  }

  if (metadata.description) {
    sections.push(`Description:\n${metadata.description}`);
  }

  if (transcript.length) {
    sections.push(`Transcript:\n\n${formatSegments(transcript)}`);
  }

  return sections.join("\n\n");
}

/**
 * Formats transcript segments as newline-separated `[timestamp] text` lines.
 *
 * @param {TranscriptSegment[]} segments
 * @returns {string}
 */
function formatSegments(segments) {
  const count = segments.length;
  const lines = new Array(count);
  for (let i = 0; i < count; i++) {
    const segment = segments[i];
    const timestamp = segment.timestamp;
    lines[i] = timestamp ? `[${timestamp}] ${segment.text}` : segment.text;
  }
  return lines.join("\n");
}

/**
 * @param {Element} segment
 * @returns {TranscriptSegment}
 */
function readNewSegment(segment) {
  const timestamp =
    segment
      .querySelector(".ytwTranscriptSegmentViewModelTimestamp")
      ?.textContent?.trim() ?? "";
  // The caption text is the only role="text" node; the visible timestamp and
  // its accessibility label are plain <div>s.
  const text =
    segment.querySelector('span[role="text"]')?.textContent?.trim() ?? "";
  return { timestamp, text };
}

/**
 * @param {Element} segment
 * @returns {TranscriptSegment}
 */
function readLegacySegment(segment) {
  const timestamp =
    segment.querySelector(".segment-timestamp")?.textContent?.trim() ?? "";
  const text =
    segment.querySelector(".segment-text")?.textContent?.trim() ?? "";
  return { timestamp, text };
}

/**
 * @param {Document} document
 * @returns {Element | null}
 */
function findTranscriptSegment(document) {
  return document.querySelector(SEGMENT_SELECTOR);
}

/**
 * @param {MutationRecord[]} mutations
 * @returns {Element | null}
 */
function findAddedTranscriptSegment(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const element = /** @type {Element} */ (node);
      if (element.matches(SEGMENT_SELECTOR)) {
        return element;
      }

      const segment = element.querySelector(SEGMENT_SELECTOR);
      if (segment) {
        return segment;
      }
    }
  }
  return null;
}

/**
 * @param {Document} document
 * @returns {HTMLElement | null}
 */
function findTranscriptButton(document) {
  for (const selector of TRANSCRIPT_BUTTON_SELECTORS) {
    const button = document.querySelector(selector);
    if (button) {
      return /** @type {HTMLElement} */ (button);
    }
  }
  return null;
}

/**
 * Closes the transcript panel, restoring the page to the state it was in
 * before extraction opened it. A no-op when the panel exposes no close control.
 *
 * @param {Element} panel
 */
function closeTranscriptPanel(panel) {
  for (const selector of TRANSCRIPT_CLOSE_SELECTORS) {
    const closeButton = /** @type {HTMLElement | null} */ (
      panel.querySelector(selector)
    );
    if (closeButton) {
      closeButton.click();
      return;
    }
  }
}

/**
 * Waits for the transcript to render. Observation is scoped to the transcript
 * panel when it can be identified, so YouTube's constant page-wide mutations
 * don't have to be walked; the document is only observed when the panel is
 * absent or ambiguous (e.g. a combined, untagged panel, or one YouTube inserts
 * lazily along with its segments).
 *
 * @param {Document} document
 * @param {Window} window
 * @param {number} timeoutMs
 * @returns {Promise<Element | null>}
 */
function waitForTranscriptSegment(document, window, timeoutMs) {
  const root = soleTranscriptPanel(document) ?? document;
  return new Promise(resolve => {
    let timeout;
    // Resolve on a rendered segment, on timeout, or if the page goes away
    // mid-wait; the last avoids leaving the promise (and its observer/timer)
    // pending when the document is torn down before either fires.
    const finish = result => {
      observer.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener("pagehide", onPageHide);
      resolve(result);
    };
    const onPageHide = () => finish(null);
    const observer = new window.MutationObserver(mutations => {
      const segment = findAddedTranscriptSegment(mutations);
      if (segment) {
        finish(segment);
      }
    });

    observer.observe(root, { childList: true, subtree: true });
    timeout = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("pagehide", onPageHide, { once: true });
  });
}
