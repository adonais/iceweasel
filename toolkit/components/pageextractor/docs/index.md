(pageextractor-index)=

# Page Extractor

Page Extractor reads the useful content from a web page and hands it to other
Firefox features as text, links, optional canvas images, and page metadata. AI
features such as Smart Window use it to access the page the user is viewing.

Web pages mix their main content with navigation, layout markup, frames, PDF
viewers, and canvases. Page Extractor handles these cases in one place. It
reads the rendered DOM, runs Reader Mode to remove boilerplate, extracts PDF
text, and applies limited site-specific handling.

The code lives in `toolkit/components/pageextractor`. File bugs under
[Core :: Machine Learning: On Device](https://bugzilla.mozilla.org/enter_bug.cgi?product=Core&component=Machine%20Learning%3A%20On%20Device).
The meta bug is [bug 1990609](https://bugzilla.mozilla.org/show_bug.cgi?id=1990609).

## How extraction fits together

You can extract the current tab or load a URL in a hidden browser. The parent
actor coordinates the request and the child actor reads content from the page.
Site-specific extraction can run alongside the general DOM path.

```{mermaid}
flowchart TD
    feature(["Firefox feature"])
    tab["Use the open tab"]
    hidden["Load a URL in a<br/>hidden browser"]
    parent["Choose extraction path"]
    pdf["Read PDF text"]
    child["Select page or<br/>Reader Mode content"]
    dom["Read DOM content<br/>Text, links and canvases"]
    site["Site-specific extraction<br/>Optional, in parallel"]
    assemble["Assemble text, links<br/>and canvas snapshots"]
    result(["ExtractionResult"])

    feature -->|Open tab| tab
    feature -->|URL| hidden
    tab --> parent
    hidden --> parent
    parent -->|PDF| pdf
    parent -->|Web page| child
    child --> dom
    child -.-> site
    dom --> assemble
    site -.-> assemble
    pdf --> result
    assemble --> result
```

Page Extractor is a `JSWindowActor` pair. The parent actor is the entry point
for callers and handles privileged work, including hidden browsers and PDF
extraction. The child actor waits for page readiness, chooses an extraction
strategy, and reads the page.

The extractor picks a strategy from the document and the request. PDFs use the
PDF viewer's text. Reader Mode simplifies suitable articles. Other pages use the
live DOM. A few sites get extra handling where a general DOM walk produces poor
output. Keep your caller independent of the chosen strategy, and handle an empty
or unavailable result.

## Extract from an existing tab

In privileged Firefox code, get the actor from the tab's current window global
and call `getText`:

```javascript
const browser = gBrowser.selectedBrowser;
const actor = browser.browsingContext.currentWindowGlobal.getActor("PageExtractor");
const result = await actor.getText({
  sufficientLength: 4000,
  removeBoilerplate: true,
  sourceUrl: browser.currentURI.spec,
});
```

`getText` waits until the page is ready enough for extraction. It does not wait
for every network request or later dynamic update. It can return `null`, a
result with empty text, or reject if loading or extraction fails. A navigation
can replace the page while your request is pending, so handle all of these
outcomes.

The type definitions in the component list the options and result fields.
Options can request Reader Mode cleanup, viewport-only extraction, simple text,
early stopping, or canvas capture.

(pageextractor-hidden)=

## Extract in a hidden browser

`PageExtractorParent.getHeadlessExtractor` loads an HTTP or HTTPS URL in a
browser element the user does not see, then passes its actor to your callback.
The page runs JavaScript and makes network requests as usual. "Headless" here
means this hidden browser and has nothing to do with launching Firefox with
`--headless`.

```javascript
import { PageExtractorParent } from "resource://gre/actors/PageExtractorParent.sys.mjs";

const sourceUrl = "https://example.com/article";
const text = await PageExtractorParent.getHeadlessExtractor({
  urlString: sourceUrl,
  anonymousFetch: true,
  callback: async (actor, traceId) => {
    const result = await actor.getText(
      { sufficientLength: 4000, removeBoilerplate: true, sourceUrl },
      traceId
    );
    return result?.text ?? "";
  },
});
```

Do all work with the actor inside the callback and await it there. The helper
removes the hidden browser when the callback settles. Pass the callback's
`traceId` to `getText` so profiles and telemetry show loading and extraction as
one flow.

Hidden loads time out and restrict unexpected cross-host navigation. A site may
return a CAPTCHA, a challenge page, or different content from what a visible,
signed-in tab sees. Treat a successful extraction as untrusted text from the
host, and check separately that it holds the content you wanted.

### Anonymous mode

By default, hidden loads use the user's cookie jar. Setting `anonymousFetch`
suppresses cookies and HTTP authorization on requests and adds history, cache,
tracking-protection, and browser sandbox controls. It does not create an
isolated profile, hide the visit from the site, or block every form of page
storage. Anonymous loads require HTTPS except for loopback and local addresses.

You decide whether a URL is appropriate to fetch and apply any feature-specific
permission checks yourself.

## Privacy and security

Page Extractor has no PII detection, redaction, or masking. Extraction from a
tab can include logged-in content, account details, private messages, and text
the user cannot see on the page. Treat page content, links, and metadata as
untrusted input, and review where your feature stores or sends the result.

## Debugging

Set `browser.ml.logLevel` to `Debug` in `about:config` and open the Browser
Console. To investigate timing and failures across processes, capture a Firefox
profile and read the Page Extractor markers described in
[Observability](pageextractor-observability).

## Documentation

```{toctree}
:maxdepth: 1

observability
contributing
```

## See also

- [Firefox AI Runtime](/toolkit/components/ml/index.md), Firefox's inference
  platform.
- GeckoView exposes Page Extractor to Android through its own module in
  `mobile/shared`.
