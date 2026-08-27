/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Sponsored-tile variant of the top-sites hover card. A placeholder today: it
 * renders nothing, but its presence in the content registry routes sponsored
 * tiles here (ad-wins precedence) so notifications never appear on an ad tile.
 * A real sponsored hover card can grow in here without touching the shell.
 *
 * @returns {null}
 */
function CardAd() {
  return null;
}

export { CardAd };
