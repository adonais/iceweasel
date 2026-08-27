/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests for YouTube extraction. When the sourceUrl is a YouTube watch page, the
 * extractor reads the video metadata from the page markup and the caption
 * transcript from the DOM, then emits a single labeled block that replaces the
 * generic page walk. Both the new (transcript-segment-view-model) and legacy
 * (ytd-transcript-segment-renderer) segment element generations are supported.
 */

const {
  isYouTubeWatchUrl,
  extractVideoMetadata,
  extractTranscriptSegments,
  formatYouTubeContent,
} = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/pageextractor/YouTubeExtraction.sys.mjs"
);

const YOUTUBE_URL = "https://www.youtube.com/watch?v=DUgPFNRmsCQ";

// The schema.org VideoObject (JSON-LD), the primary structured source, as
// YouTube exposes it. YouTube splits the fields across two objects, which is
// mirrored here to exercise the merge.
const VIDEO_METADATA = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": "Example video title",
      "uploadDate": "2020-01-15T06:05:55-08:00"
    }
  </script>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "description": "Video description text.",
      "duration": "PT10M35S",
      "author": "Example Channel",
      "genre": "Film & Animation",
      "interactionStatistic": [
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/WatchAction",
          "userInteractionCount": "12345"
        },
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/LikeAction",
          "userInteractionCount": "678"
        }
      ]
    }
  </script>
`;

// A watch page still carrying a stale VideoObject for a previously watched
// video (YouTube leaves these in the DOM across client-side navigations). The
// stale object precedes the current one and carries only name + uploadDate;
// both expose an embedUrl so the current video's id disambiguates them.
const STALE_VIDEO_METADATA = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": "Previously watched video",
      "uploadDate": "2015-03-03T00:00:00-00:00",
      "embedUrl": "https://www.youtube.com/embed/staleVideo0"
    }
  </script>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": "Example video title",
      "uploadDate": "2020-01-15T06:05:55-08:00",
      "description": "Video description text.",
      "duration": "PT10M35S",
      "author": "Example Channel",
      "genre": "Film & Animation",
      "embedUrl": "https://www.youtube.com/embed/DUgPFNRmsCQ",
      "interactionStatistic": [
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/WatchAction",
          "userInteractionCount": "12345"
        },
        {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/LikeAction",
          "userInteractionCount": "678"
        }
      ]
    }
  </script>
`;

const EXPECTED_METADATA_OBJECT = {
  title: "Example video title",
  channel: "Example Channel",
  uploadDate: "2020-01-15",
  duration: "10:35",
  views: "12345",
  likes: "678",
  genre: "Film & Animation",
  description: "Video description text.",
};

const EXPECTED_SEGMENTS = [
  { timestamp: "0:03", text: "All right, so we have a phone now." },
  { timestamp: "0:07", text: "What does the B stand for?" },
];

const NEW_GENERATION_SEGMENTS = `
  ${VIDEO_METADATA}
  <transcript-segment-view-model>
    <div class="ytwTranscriptSegmentViewModelTimestamp">0:03</div>
    <div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">3 seconds</div>
    <span role="text">All right, so we have a phone now.</span>
  </transcript-segment-view-model>
  <transcript-segment-view-model>
    <div class="ytwTranscriptSegmentViewModelTimestamp">0:07</div>
    <div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">7 seconds</div>
    <span role="text">What does the B stand for?</span>
  </transcript-segment-view-model>
`;

const LEGACY_GENERATION_SEGMENTS = `
  ${VIDEO_METADATA}
  <ytd-transcript-segment-renderer>
    <div class="segment-timestamp">0:03</div>
    <div class="segment-text">All right, so we have a phone now.</div>
  </ytd-transcript-segment-renderer>
  <ytd-transcript-segment-renderer>
    <div class="segment-timestamp">0:07</div>
    <div class="segment-text">What does the B stand for?</div>
  </ytd-transcript-segment-renderer>
`;

// YouTube renders the same transcript into more than one engagement panel.
// Reading must be scoped to a single panel so the transcript is not duplicated.
const DUPLICATE_PANEL_SEGMENTS = `
  ${VIDEO_METADATA}
  <ytd-engagement-panel-section-list-renderer target-id="PAmodern_transcript_view">
    <transcript-segment-view-model>
      <div class="ytwTranscriptSegmentViewModelTimestamp">0:03</div>
      <span role="text">All right, so we have a phone now.</span>
    </transcript-segment-view-model>
    <transcript-segment-view-model>
      <div class="ytwTranscriptSegmentViewModelTimestamp">0:07</div>
      <span role="text">What does the B stand for?</span>
    </transcript-segment-view-model>
  </ytd-engagement-panel-section-list-renderer>
  <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">
    <transcript-segment-view-model>
      <div class="ytwTranscriptSegmentViewModelTimestamp">0:03</div>
      <span role="text">All right, so we have a phone now.</span>
    </transcript-segment-view-model>
    <transcript-segment-view-model>
      <div class="ytwTranscriptSegmentViewModelTimestamp">0:07</div>
      <span role="text">What does the B stand for?</span>
    </transcript-segment-view-model>
  </ytd-engagement-panel-section-list-renderer>
`;

const EXPECTED_METADATA_BLOCK = [
  "Title: Example video title",
  "Channel: Example Channel",
  "Published: 2020-01-15",
  "Duration: 10:35",
  "Views: 12345",
  "Likes: 678",
  "Category: Film & Animation",
  "",
  "Description:",
  "Video description text.",
].join("\n");

const EXPECTED_TRANSCRIPT_BLOCK = [
  "Transcript:",
  "",
  "[0:03] All right, so we have a phone now.",
  "[0:07] What does the B stand for?",
].join("\n");

const EXPECTED_CONTENT = `${EXPECTED_METADATA_BLOCK}\n\n${EXPECTED_TRANSCRIPT_BLOCK}`;

// YouTube extraction is off by default; enable it for the extraction tests.
add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.enabled", true]],
  });
});

/**
 * The URL detection should only match youtube.com watch pages with a video id.
 */
add_task(function test_is_youtube_watch_url() {
  const watchUrls = [
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://www.youtube.com/watch?v=abc123&t=42s",
  ];
  for (const url of watchUrls) {
    ok(isYouTubeWatchUrl(URL.parse(url)), `${url} should be a watch page`);
  }

  // Only the desktop site renders the transcript control and engagement panel
  // this extraction reads.
  const nonWatchUrls = [
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/feed/subscriptions",
    "https://www.youtube.com/results?search_query=abc",
    "https://www.notyoutube.com/watch?v=abc123",
    "https://example.com/watch?v=abc123",
    "",
    null,
    undefined,
  ];
  for (const url of nonWatchUrls) {
    ok(!isYouTubeWatchUrl(URL.parse(url)), `${url} should not be a watch page`);
  }
});

/**
 * Metadata should be read from the schema.org VideoObject (JSON-LD), merging
 * the fields YouTube splits across multiple objects.
 */
add_task(function test_extract_video_metadata() {
  const doc = new DOMParser().parseFromString(
    `<body>${VIDEO_METADATA}</body>`,
    "text/html"
  );
  Assert.deepEqual(
    extractVideoMetadata(doc),
    EXPECTED_METADATA_OBJECT,
    "All fields should be read and merged from the JSON-LD video objects"
  );
});

/**
 * A stale VideoObject for a previously watched video (left in the DOM after a
 * client-side navigation) that precedes the current one must not supply any
 * fields when the current video id is known. With no id, all objects are read.
 */
add_task(function test_extract_video_metadata_ignores_stale_object() {
  const doc = new DOMParser().parseFromString(
    `<body>${STALE_VIDEO_METADATA}</body>`,
    "text/html"
  );
  Assert.deepEqual(
    extractVideoMetadata(doc, "DUgPFNRmsCQ"),
    EXPECTED_METADATA_OBJECT,
    "All fields should come from the current video's object, not the stale one"
  );
  is(
    extractVideoMetadata(doc).title,
    "Previously watched video",
    "With no current id, objects are read in document order (fallback)"
  );
});

/**
 * The JSON-LD VideoObject is the only metadata source. A page that only mirrors
 * the same values in OpenGraph and microdata yields no metadata at all, so the
 * generic walk is what surfaces them.
 */
add_task(function test_extract_video_metadata_requires_json_ld() {
  const doc = new DOMParser().parseFromString(
    `<html><head><title>Some video - YouTube</title></head><body>
      <meta property="og:title" content="OpenGraph title" />
      <meta property="og:description" content="OpenGraph description." />
      <span itemprop="author">
        <link itemprop="name" content="OpenGraph Channel" />
      </span>
      <meta itemprop="datePublished" content="2019-05-20T00:00:00-00:00" />
      <div itemprop="interactionStatistic">
        <meta
          itemprop="interactionType"
          content="https://schema.org/WatchAction"
        />
        <meta itemprop="userInteractionCount" content="999" />
      </div>
    </body></html>`,
    "text/html"
  );
  Assert.deepEqual(
    extractVideoMetadata(doc),
    {
      title: "",
      channel: "",
      uploadDate: "",
      duration: "",
      views: "",
      likes: "",
      genre: "",
      description: "",
    },
    "Without JSON-LD no metadata should be inferred from OpenGraph/microdata"
  );
});

/**
 * The JSON-LD reader should accept the shapes schema.org allows: `@type` and
 * `author` as arrays or objects, `interactionType` as an object, VideoObjects
 * nested under `@graph`, and an hour-long duration.
 */
add_task(function test_extract_video_metadata_json_ld_shapes() {
  const doc = new DOMParser().parseFromString(
    `<body>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": ["VideoObject", "Clip"],
              "name": "Shapes video",
              "author": [{ "@type": "Person", "name": "Graph Channel" }],
              "duration": "PT1H2M3S",
              "uploadDate": "2021-07-04T12:00:00Z",
              "genre": "Education",
              "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": { "@type": "https://schema.org/WatchAction" },
                "userInteractionCount": 4321
              }
            }
          ]
        }
      </script>
    </body>`,
    "text/html"
  );
  Assert.deepEqual(
    extractVideoMetadata(doc),
    {
      title: "Shapes video",
      channel: "Graph Channel",
      uploadDate: "2021-07-04",
      duration: "1:02:03",
      views: "4321",
      likes: "",
      genre: "Education",
      description: "",
    },
    "Array/object JSON-LD shapes should all be handled"
  );
});

/**
 * The pure segment parsing + formatting should work on an inert document.
 */
add_task(function test_extract_and_format_segments() {
  const emptyMetadata = {
    title: "",
    channel: "",
    uploadDate: "",
    duration: "",
    views: "",
    likes: "",
    genre: "",
    description: "",
  };

  const doc = new DOMParser().parseFromString(
    `<body>${NEW_GENERATION_SEGMENTS}</body>`,
    "text/html"
  );
  const segments = extractTranscriptSegments(doc);
  Assert.deepEqual(
    segments,
    EXPECTED_SEGMENTS,
    "Both new-generation segments should be parsed"
  );

  is(
    formatYouTubeContent(emptyMetadata, segments),
    EXPECTED_TRANSCRIPT_BLOCK,
    "A transcript with no metadata should be a single labeled section"
  );

  is(
    formatYouTubeContent(EXPECTED_METADATA_OBJECT, segments),
    EXPECTED_CONTENT,
    "Metadata and transcript should be joined into labeled sections"
  );

  const legacyDoc = new DOMParser().parseFromString(
    `<body>${LEGACY_GENERATION_SEGMENTS}</body>`,
    "text/html"
  );
  Assert.deepEqual(
    extractTranscriptSegments(legacyDoc),
    EXPECTED_SEGMENTS,
    "Legacy-generation segments should be parsed"
  );
});

/**
 * Empty fields and an absent transcript should be omitted from the block.
 */
add_task(function test_format_omits_missing_fields() {
  is(
    formatYouTubeContent(
      {
        title: "Only a title",
        channel: "",
        uploadDate: "",
        duration: "",
        views: "",
        likes: "",
        genre: "",
        description: "",
      },
      []
    ),
    "Title: Only a title",
    "A block with only a title should have no other lines or sections"
  );
});

/**
 * The full structured block should be produced end-to-end from a watch page
 * carrying new-generation transcript segments.
 */
add_task(async function test_structured_content_new_generation() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`${NEW_GENERATION_SEGMENTS}`;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_CONTENT,
    "Metadata sections should precede the transcript"
  );

  await cleanup();
});

/**
 * The transcript must not be duplicated when several transcript panels contain
 * the same segments.
 */
add_task(async function test_transcript_not_duplicated_across_panels() {
  const doc = new DOMParser().parseFromString(
    `<body>${DUPLICATE_PANEL_SEGMENTS}</body>`,
    "text/html"
  );
  Assert.deepEqual(
    extractTranscriptSegments(doc),
    EXPECTED_SEGMENTS,
    "Only the first transcript panel's segments should be read"
  );

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`${DUPLICATE_PANEL_SEGMENTS}`;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_CONTENT,
    "Transcript should appear once even with multiple transcript panels"
  );

  await cleanup();
});

add_task(async function test_structured_content_legacy_generation() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } =
    await html`${LEGACY_GENERATION_SEGMENTS}`;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_CONTENT,
    "Legacy-generation segments should produce the same block"
  );

  await cleanup();
});

/**
 * When segments are not yet rendered, getText should activate the transcript
 * control and wait for the segments to appear.
 */
add_task(async function test_transcript_panel_opened_on_click() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
    <div id="panel"></div>
    <script>
      document
        .querySelector('button[aria-label="Show transcript"]')
        .addEventListener("click", () =>
          setTimeout(() => {
            const seg = document.createElement("transcript-segment-view-model");
            seg.innerHTML =
              '<div class="ytwTranscriptSegmentViewModelTimestamp">0:05</div>' +
              '<span role="text">Injected after click.</span>';
            document.getElementById("panel").appendChild(seg);
          }, 50)
        );
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    `${EXPECTED_METADATA_BLOCK}\n\nTranscript:\n\n[0:05] Injected after click.`,
    "Metadata should precede a transcript loaded after opening the panel"
  );

  await cleanup();
});

add_task(async function test_structural_transcript_button_preferred() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.timeoutMs", 200]],
  });

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Transcript" hidden></button>
    <ytd-video-description-transcript-section-renderer>
      <button>Show transcript</button>
    </ytd-video-description-transcript-section-renderer>
    <div id="panel"></div>
    <script>
      document
        .querySelector(
          "ytd-video-description-transcript-section-renderer button"
        )
        .addEventListener("click", () => {
          const segment = document.createElement(
            "transcript-segment-view-model"
          );
          segment.innerHTML =
            '<div class="ytwTranscriptSegmentViewModelTimestamp">0:05</div>' +
            '<span role="text">Loaded from the structural control.</span>';
          document.getElementById("panel").appendChild(segment);
        });
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    `${EXPECTED_METADATA_BLOCK}\n\nTranscript:\n\n[0:05] Loaded from the structural control.`,
    "The structural transcript control should take priority over an earlier fallback"
  );

  await cleanup();
  await SpecialPowers.popPrefEnv();
});

/**
 * When extraction opens the transcript panel, it should close it again once the
 * segments have been read so the page is restored to its prior state.
 */
add_task(async function test_transcript_panel_closed_after_extraction() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { tab, getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
    <ytd-engagement-panel-section-list-renderer
      target-id="engagement-panel-searchable-transcript"
    >
      <button aria-label="Close transcript"></button>
      <div id="segments"></div>
    </ytd-engagement-panel-section-list-renderer>
    <script>
      const panel = document.querySelector(
        "ytd-engagement-panel-section-list-renderer"
      );
      document
        .querySelector('button[aria-label="Show transcript"]')
        .addEventListener("click", () =>
          setTimeout(() => {
            const seg = document.createElement("transcript-segment-view-model");
            seg.innerHTML =
              '<div class="ytwTranscriptSegmentViewModelTimestamp">0:05</div>' +
              '<span role="text">Injected after click.</span>';
            document.getElementById("segments").appendChild(seg);
          }, 50)
        );
      document
        .querySelector('button[aria-label="Close transcript"]')
        .addEventListener("click", () =>
          panel.setAttribute("data-closed", "true")
        );
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    `${EXPECTED_METADATA_BLOCK}\n\nTranscript:\n\n[0:05] Injected after click.`,
    "The opened transcript should still be included in the result"
  );

  const closed = await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
    content.document
      .querySelector("ytd-engagement-panel-section-list-renderer")
      .hasAttribute("data-closed")
  );
  ok(closed, "The transcript panel should be closed after extraction");

  await cleanup();
});

/**
 * Modern layouts render the transcript into a combined "In this video"
 * engagement panel that carries no transcript-specific target-id. The panel we
 * open must still be closed by anchoring on the segment's nearest engagement
 * panel rather than a target-id match.
 */
add_task(async function test_untagged_panel_closed_after_extraction() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { tab, getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
    <ytd-engagement-panel-section-list-renderer>
      <button aria-label="Close transcript"></button>
      <div id="segments"></div>
    </ytd-engagement-panel-section-list-renderer>
    <script>
      const panel = document.querySelector(
        "ytd-engagement-panel-section-list-renderer"
      );
      document
        .querySelector('button[aria-label="Show transcript"]')
        .addEventListener("click", () =>
          setTimeout(() => {
            const seg = document.createElement("transcript-segment-view-model");
            seg.innerHTML =
              '<div class="ytwTranscriptSegmentViewModelTimestamp">0:05</div>' +
              '<span role="text">Injected after click.</span>';
            document.getElementById("segments").appendChild(seg);
          }, 50)
        );
      document
        .querySelector('button[aria-label="Close transcript"]')
        .addEventListener("click", () =>
          panel.setAttribute("data-closed", "true")
        );
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    `${EXPECTED_METADATA_BLOCK}\n\nTranscript:\n\n[0:05] Injected after click.`,
    "A transcript in an untagged engagement panel should still be extracted"
  );

  const closed = await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
    content.document
      .querySelector("ytd-engagement-panel-section-list-renderer")
      .hasAttribute("data-closed")
  );
  ok(
    closed,
    "An untagged transcript panel opened by extraction should be closed"
  );

  await cleanup();
});

/**
 * A transcript the user already had open should be left open: extraction reads
 * the segments but must not close a panel it did not open.
 */
add_task(async function test_already_open_transcript_left_open() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { tab, getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <ytd-engagement-panel-section-list-renderer
      target-id="engagement-panel-searchable-transcript"
    >
      <button aria-label="Close transcript"></button>
      <transcript-segment-view-model>
        <div class="ytwTranscriptSegmentViewModelTimestamp">0:03</div>
        <span role="text">All right, so we have a phone now.</span>
      </transcript-segment-view-model>
      <transcript-segment-view-model>
        <div class="ytwTranscriptSegmentViewModelTimestamp">0:07</div>
        <span role="text">What does the B stand for?</span>
      </transcript-segment-view-model>
    </ytd-engagement-panel-section-list-renderer>
    <script>
      document
        .querySelector('button[aria-label="Close transcript"]')
        .addEventListener("click", () =>
          document
            .querySelector("ytd-engagement-panel-section-list-renderer")
            .setAttribute("data-closed", "true")
        );
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_CONTENT,
    "An already-open transcript should still be extracted"
  );

  const closed = await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
    content.document
      .querySelector("ytd-engagement-panel-section-list-renderer")
      .hasAttribute("data-closed")
  );
  ok(!closed, "A transcript the user already had open should be left open");

  await cleanup();
});

/**
 * If the transcript control is present but the segments never render (a slow or
 * failed transcript load, or YouTube changing its segment markup), extraction
 * must not hang or throw: it waits up to the timeout, then falls back to the
 * generic walk with the metadata block prepended (here the generic walk finds
 * nothing else, so only the metadata block remains).
 */
add_task(async function test_transcript_panel_never_loads() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.timeoutMs", 200]],
  });

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_METADATA_BLOCK,
    "A transcript that never renders yields the metadata block"
  );

  await cleanup();
  await SpecialPowers.popPrefEnv();
});

/**
 * A panel this extraction opened must be closed again even when the segments
 * never render (a slow or failed transcript load), so the page is restored.
 */
add_task(async function test_panel_closed_when_segments_never_render() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.timeoutMs", 200]],
  });

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { tab, getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
    <ytd-engagement-panel-section-list-renderer
      target-id="engagement-panel-searchable-transcript"
    >
      <button aria-label="Close transcript"></button>
      <div id="segments"></div>
    </ytd-engagement-panel-section-list-renderer>
    <script>
      const panel = document.querySelector(
        "ytd-engagement-panel-section-list-renderer"
      );
      // Opening the panel never renders any segment.
      document
        .querySelector('button[aria-label="Show transcript"]')
        .addEventListener("click", () => panel.setAttribute("data-opened", ""));
      document
        .querySelector('button[aria-label="Close transcript"]')
        .addEventListener("click", () => panel.setAttribute("data-closed", ""));
    </script>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    EXPECTED_METADATA_BLOCK,
    "The metadata block is still returned when no transcript renders"
  );

  const [opened, closed] = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => {
      const panel = content.document.querySelector(
        "ytd-engagement-panel-section-list-renderer"
      );
      return [
        panel.hasAttribute("data-opened"),
        panel.hasAttribute("data-closed"),
      ];
    }
  );
  ok(opened, "The panel should have been opened by extraction");
  ok(closed, "A panel we opened must be closed even when no segment renders");

  await cleanup();
  await SpecialPowers.popPrefEnv();
});

/**
 * On the slow-load path we must not toggle a panel we cannot attribute to our
 * own click: when several transcript panels exist and none rendered a segment,
 * none should be closed.
 */
add_task(async function test_ambiguous_panels_not_closed_on_timeout() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.timeoutMs", 200]],
  });

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { tab, getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <button aria-label="Show transcript">Show transcript</button>
    <ytd-engagement-panel-section-list-renderer
      target-id="PAmodern_transcript_view"
    >
      <button aria-label="Close transcript"></button>
    </ytd-engagement-panel-section-list-renderer>
    <ytd-engagement-panel-section-list-renderer
      target-id="engagement-panel-searchable-transcript"
    >
      <button aria-label="Close transcript"></button>
    </ytd-engagement-panel-section-list-renderer>
    <script>
      for (const button of document.querySelectorAll(
        'button[aria-label="Close transcript"]'
      )) {
        button.addEventListener("click", () =>
          button
            .closest("ytd-engagement-panel-section-list-renderer")
            .setAttribute("data-closed", "")
        );
      }
    </script>
  `;
  const actor = getPageExtractor();

  await actor.getText({ sourceUrl: YOUTUBE_URL });

  const anyClosed = await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
    [
      ...content.document.querySelectorAll(
        "ytd-engagement-panel-section-list-renderer"
      ),
    ].some(p => p.hasAttribute("data-closed"))
  );
  ok(!anyClosed, "No panel should be closed when the open one is ambiguous");

  await cleanup();
  await SpecialPowers.popPrefEnv();
});

/**
 * A non-YouTube sourceUrl should not trigger structured extraction, and the
 * segment text should flow through the generic extraction unchanged.
 */
add_task(async function test_no_structured_content_for_non_youtube() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`${NEW_GENERATION_SEGMENTS}`;
  const actor = getPageExtractor();

  const result = await actor.getText({
    sourceUrl: "https://example.com/article",
  });

  ok(
    !result.text.includes("Title:") && !result.text.includes("Transcript:"),
    "No structured block should be added for non-YouTube pages"
  );
  ok(
    result.text.includes("All right, so we have a phone now."),
    "Segment text is still extracted generically without the YouTube strategy"
  );

  await cleanup();
});

/**
 * A YouTube watch page with no metadata or transcript should fall back to the
 * generic page content.
 */
add_task(async function test_youtube_without_content() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`
    <p>A video with captions disabled.</p>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    "A video with captions disabled.",
    "Without extractable content, the generic page content is returned"
  );

  await cleanup();
});

/**
 * With no transcript, the generic walk is kept so page content (e.g. comments)
 * survives, and the metadata block (header fields + description) is prepended.
 */
add_task(async function test_no_transcript_prepends_metadata_block() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`
    ${VIDEO_METADATA}
    <p>A viewer comment on the video.</p>
  `;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  is(
    result.text,
    `${EXPECTED_METADATA_BLOCK}\n\nA viewer comment on the video.`,
    "The metadata block should be prepended to the retained generic content"
  );

  await cleanup();
});

/**
 * The YouTube block is capped at sufficientLength so a long transcript can't
 * emit far more text than the other extractors.
 */
add_task(async function test_content_truncated_to_sufficient_length() {
  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`${NEW_GENERATION_SEGMENTS}`;
  const actor = getPageExtractor();

  const sufficientLength = 50;
  const result = await actor.getText({
    sourceUrl: YOUTUBE_URL,
    sufficientLength,
  });

  is(
    result.text,
    EXPECTED_CONTENT.slice(0, sufficientLength),
    "The structured block should be truncated to sufficientLength"
  );

  await cleanup();
});

/**
 * The feature can be disabled via preference.
 */
add_task(async function test_disabled_by_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.pageextractor.youtube.enabled", false]],
  });

  const { html } = await MLTestUtils.serveHTMLInTab({ browser: gBrowser });
  const { getPageExtractor, cleanup } = await html`${NEW_GENERATION_SEGMENTS}`;
  const actor = getPageExtractor();

  const result = await actor.getText({ sourceUrl: YOUTUBE_URL });

  ok(
    !result.text.includes("Title:") && !result.text.includes("Transcript:"),
    "No structured block should be produced when the pref is disabled"
  );

  // The YouTube strategy's filter selector must be gated on the pref too,
  // otherwise a transcript the user opened themselves would be dropped from the
  // generic walk without anything replacing it.
  for (const { text } of EXPECTED_SEGMENTS) {
    ok(
      result.text.includes(text),
      `Raw segment text "${text}" should survive the generic walk`
    );
  }

  await cleanup();
  await SpecialPowers.popPrefEnv();
});
