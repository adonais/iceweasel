/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Storybook-only source for the "Mozilla Headline" heading font used by
 * aitab-base.css. Not packaged in Firefox.
 *
 * In Firefox, AITabParent downloads MozillaHeadline-SemiBold.ttf from the
 * ai-window-aitab Remote Settings collection and aitab-page installs the bytes
 * with FontFace. Storybook has no parent actor, and the Remote Settings CDN
 * sends no CORS headers, so stories load the same family, weight and width
 * from Google Fonts instead. If the Remote Settings file is replaced, update
 * FONT_URL to match.
 */
const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Mozilla+Headline:wdth,wght@87.5,600&display=swap";

/**
 * Story decorator that adds the heading font stylesheet to the preview
 * document once. @font-face rules apply inside shadow roots from there.
 *
 * @param {Function} story
 */
export function withHeadingFont(story) {
  if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.append(link);
  }
  return story();
}
