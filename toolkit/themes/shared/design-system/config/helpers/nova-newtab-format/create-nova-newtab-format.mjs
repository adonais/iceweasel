/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getNewtabTokenCSS } from "./get-newtab-token-css.mjs";
import { newtabFileHeader } from "./newtab-file-header.mjs";
import { postProcessNovaNewtab } from "./post-process-nova-newtab.mjs";

export const createNovaNewtabFormat =
  () =>
  ({ dictionary }) => {
    let content = newtabFileHeader();
    content += getNewtabTokenCSS({ dictionary });

    return postProcessNovaNewtab(`${content}\n`);
  };
