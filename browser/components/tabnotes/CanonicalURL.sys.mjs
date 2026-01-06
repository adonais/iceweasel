/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Given a web page content document, finds candidates for an explicitly
 * declared canonical URL. Includes a fallback URL to use in case the content
 * did not declare a canonical URL.
 *
 * @param {Document} document
 * @returns {CanonicalURLSourceResults}
 */
export function findCandidates(document) {
  return {
    link: getLinkRelCanonical(document),
    opengraph: getOpenGraphUrl(document),
    jsonLd: getJSONLDUrl(document),
    fallback: getFallbackCanonicalUrl(document),
  };
}

/**
 * Given a set of canonical URL candidates from `CanonicalURL.findCandidates`,
 * returns the best value to use as the canonical URL.
 *
 * @param {CanonicalURLSourceResults} sources
 * @returns {string}
 */
export function pickCanonicalUrl(sources) {
  return (
    sources.link ?? sources.opengraph ?? sources.jsonLd ?? sources.fallback
  );
}

/**
 * TODO: resolve relative URLs
 * TODO: can be a different hostname or domain; does that need special handling?
 *
 * @see https://www.rfc-editor.org/rfc/rfc6596
 *
 * @param {Document} document
 * @returns {string|null}
 */
function getLinkRelCanonical(document) {
  return document.querySelector('link[rel="canonical"]')?.getAttribute("href");
}

/**
 * @see https://ogp.me/#url
 *
 * @param {Document} document
 * @returns {string|null}
 */
function getOpenGraphUrl(document) {
  return document
    .querySelector('meta[property="og:url"]')
    ?.getAttribute("content");
}

/**
 * Naïvely returns the first JSON-LD entity's URL, if found.
 * TODO: make sure it's a web page-like/content schema?
 *
 * @see https://schema.org/url
 *
 * @param {Document} document
 * @returns {string|null}
 */
function getJSONLDUrl(document) {
  return Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  )
    .map(script => {
      try {
        return JSON.parse(script.textContent);
      } catch {
        return null;
      }
    })
    .find(obj => obj?.url)?.url;
}

/**
 * @param {Document} document
 * @returns {string|null}
 */
function getFallbackCanonicalUrl(document) {
  const fallbackUrl = URL.parse(document.documentURI);
  if (fallbackUrl) {
    fallbackUrl.hash = "";
    return fallbackUrl.toString();
  }
  return null;
}
