/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type GetTextOptions = Partial<{
  // The length of extracted text that is sufficient for the purpose.
  // When set, extraction will stop when the text meets or exceeds this length.
  // When unset, the lenghth of the extracted text is unbounded.
  sufficientLength: number;
  // Remove menus and other boilerplate.
  removeBoilerplate: boolean;
  // Just include the viewport content.
  justViewport: boolean;
}>;
