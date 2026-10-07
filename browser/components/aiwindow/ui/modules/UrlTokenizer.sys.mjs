/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Tokenizes URLs to send to an LLM
 */
export class UrlTokenizer {
  /**
   * A mapping of a URL to its unique URL token. URL tokens are used as shortened
   * versions of URLs to help the model deal with very long URLs. Very long URLs are
   * problematic since they are hard for a model to repeat back without making mistakes
   * or hallucinating details about the URL. There is also additional cost for every
   * additional token in the context. Long URLs can also contain prompt injections since
   * they can be of an arbitrary size. URL Tokens help solve all of these issues.
   *
   * URL tokens are only generated while a message is "in flight" to and from the language
   * model. When tool calls are handled, messages rendered, and messages stored they are
   * all done with the URL tokens expanded into full URLs.
   *
   * There are no guarantees that a URL in this list isn't just hallucinated by the model.
   * Any URL the language model invents can be present in this list. The only guarantee
   * is that a token maps to some kind of arbitrary URL.
   *
   * Example mapping:
   * https://github.com/mozilla/ -> GITHUB_COM_MOZILLA_1
   *
   * @type {Map<string, string>}
   */
  urlToToken;

  /**
   * The reverse mapping for a token back to its original URL.
   *
   * e.g. GITHUB_COM_MOZILLA_1 -> https://github.com/mozilla/
   *
   * @type {Map<string, string>}
   */
  tokenToUrl;

  /**
   * A mapping of the base URL token to how many counts there are for it. It's
   * used to generate the final number on URL tokens.
   *
   * e.g.
   *
   * https://github.com/mozilla/                  -> GITHUB_COM_MOZILLA_1
   * https://github.com/mozilla#not-part-of-token -> GITHUB_COM_MOZILLA_2
   *
   * @type {Map<string, number>}
   */
  #baseTokenCounts = new Map();

  constructor() {
    this.urlToToken = new Map();
    this.tokenToUrl = new Map();
  }

  /**
   * Converts a URL into a token. It first computes a base token from
   * the hostname and path parts, then appends a monotonically increasing number on the
   * end to make it unique.
   *
   * URL token analysis:
   * https://docs.google.com/document/d/1kwf2PH1APyUR4wrvv6lJIhA12bkQoNVV5KFwAPtWubw/edit?tab=t.0#heading=h.yhx5pggnwgne
   *
   * @param {string} url - The full URL to register
   *
   * @returns {string} The short token for the URL (e.g. "GITHUB_COM_1")
   */
  encodeToken(url) {
    const seenToken = this.urlToToken.get(url);
    if (seenToken) {
      return seenToken;
    }

    let baseToken = "";

    // Attempt to convert the URL into a base token.
    const parsedUrl = URL.parse(url);
    if (parsedUrl) {
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        // Go ahead and handle URL tokens for more complicated URLs that
        // aren't probably supported in the chat interface, but would be useful
        // to disambiguate from the HTTP(s) varieties.
        baseToken +=
          // e.g. "ftp:" -> "FTP"
          parsedUrl.protocol.toUpperCase().replace(":", "");
      }

      // Convert the hostname into a token.
      const hostToken = parsedUrl.hostname
        .replace(/^www\./, "")
        .toUpperCase()
        .replace(/[.\-]/g, "_")
        .substring(0, 100);

      if (hostToken) {
        baseToken = baseToken ? `${baseToken}_${hostToken}` : hostToken;
      }

      // Add on the parts of the URL to the token.
      for (let part of parsedUrl.pathname.split("/")) {
        if (!part) {
          continue;
        }
        const partToken = part.toUpperCase().replace(/[^A-Z0-9]/g, "_");

        const nextToken = `${baseToken}_${partToken}`;
        if (nextToken.length > 100) {
          break;
        }
        baseToken = nextToken;
      }
    } else {
      baseToken = "INVALID_URL";
    }

    let count = this.#baseTokenCounts.get(baseToken) ?? 0;
    count += 1;
    this.#baseTokenCounts.set(baseToken, count);

    const tokenFinal = `${baseToken}_${count}`;

    this.urlToToken.set(url, tokenFinal);
    this.tokenToUrl.set(tokenFinal, url);

    return tokenFinal;
  }
}

/**
 * Expands URL tokens (e.g. §url_token: GITHUB_COM_1§) in text using the provided
 * mapping. Any token not found in the mapping is left unchanged.
 *
 * @param {string} text
 * @param {Map<string, string>} tokenToUrl - A tokenizer's `tokenToUrl` map.
 * @returns {string}
 */
export function expandUrlTokens(text, tokenToUrl) {
  return text.replace(/§url_token:\s*([A-Z0-9_]+_\d+)§/g, (match, token) => {
    return tokenToUrl.get(token) ?? match;
  });
}

/**
 * Strips URL tokens that remain after expansion.
 * Any remaining tokens at this point were hallucinated by the model.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripUnresolvedUrlTokens(text) {
  return text.replace(/§url_token:\s*[A-Z0-9_]+_\d+§/g, "");
}
