/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { COMPONENT_TOKEN_PATHS } from "../general/token-paths.mjs";

const fileToComponentTypeMap = new Map();
export const isComponentToken = ({ filePath }) => {
  if (!fileToComponentTypeMap.has(filePath)) {
    let componentInfo = COMPONENT_TOKEN_PATHS.find(info =>
      filePath.startsWith(info.dir)
    );
    if (componentInfo) {
      fileToComponentTypeMap.set(filePath, {
        component: true,
        global: !!componentInfo.isGlobal,
      });
    } else {
      fileToComponentTypeMap.set(filePath, {
        component: false,
        global: true,
      });
    }
  }
  let info = fileToComponentTypeMap.get(filePath);
  return info.component && !info.global;
};
