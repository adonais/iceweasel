/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, ExtensionCommon, Services */

this.aboutConfigPrefs = class extends ExtensionAPI {
  getAPI(context) {
    const extensionIDBase = context.extension.id.split("@")[0];
    const extensionPrefNameBase = `extensions.${extensionIDBase}.`;

    return {
      aboutConfigPrefs: {
        async setPref(name, value) {
          const fullName = `${extensionPrefNameBase}${name}`;
          switch (typeof value) {
            case "boolean":
              Services.prefs.setBoolPref(fullName, value);
              break;
            case "number":
              Services.prefs.setIntPref(fullName, value);
              break;
            case "string":
              Services.prefs.setStringPref(fullName, value);
              break;
          }
        },
      },
    };
  }
};
