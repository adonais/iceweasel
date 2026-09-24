/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const ReportBrokenSiteHelpers = {
  filterReportData(
    data,
    {
      sendTabSpecificInfo = true,
      sendBlockedUrls = false,
      sendNoData = false, // only needed for tests
      nullify = false, // only needed for tests
    } = {}
  ) {
    if (!sendBlockedUrls || sendNoData) {
      if (nullify) {
        data.antitracking.blockedOrigins.value = null;
        data.antitracking.btpPurgeHistory.value = null;
      } else {
        delete data.antitracking.blockedOrigins;
        delete data.antitracking.btpPurgeHistory;
      }
    }
    if (!sendTabSpecificInfo || sendNoData) {
      for (const [categoryName, categoryItems] of Object.entries(data)) {
        if (categoryItems.isTabSpecific || sendNoData) {
          if (nullify) {
            for (let name of Object.keys(categoryItems)) {
              if (Object.hasOwn(data[categoryName][name], "value")) {
                data[categoryName][name].value = null;
              }
            }
          } else {
            delete data[categoryName];
          }
          continue;
        }
        for (let [name, { isTabSpecific }] of Object.entries(categoryItems)) {
          if (isTabSpecific || sendNoData) {
            if (nullify) {
              if (Object.hasOwn(data[categoryName][name], "value")) {
                data[categoryName][name].value = null;
              }
            } else {
              delete data[categoryName][name];
            }
          }
        }
      }
    }
  },
};
