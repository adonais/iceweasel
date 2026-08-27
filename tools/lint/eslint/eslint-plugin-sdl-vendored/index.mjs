/**
 * @file A collection of rules that help enforce JavaScript coding
 * standard and avoid common errors in the Mozilla project.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export default {
  meta: { name: "sdl", version: "1.0" },
  rules: {
    "no-insecure-url": (await import("./vendor/no-insecure-url.js")).default,
  },
};
