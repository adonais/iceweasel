/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var CrashReports = {
  pendingDir: null,
  reportsDir: null,
  submittedDir: null,
  getReports: function CrashReports_getReports() {
    let reports = {};
    let ignored = [];

    try {
      // Ignore any non http/https urls
      if (!/^https?:/i.test(Services.prefs.getCharPref("breakpad.reportURL"))) {
        return [];
      }
    } catch (e) {}

    if (this.submittedDir.exists() && this.submittedDir.isDirectory()) {
      let entries = this.submittedDir.directoryEntries;
      while (entries.hasMoreElements()) {
        let file = entries.nextFile;
        let leaf = file.leafName;
        if (leaf.startsWith("bp-") && leaf.endsWith(".txt")) {
          let entry = {
            id: leaf.slice(0, -4),
            date: file.lastModifiedTime,
            pending: false,
            ignored: false,
          };
          reports[entry.id] = entry;
        }
      }
    }

    if (this.pendingDir.exists() && this.pendingDir.isDirectory()) {
      let uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let entries = this.pendingDir.directoryEntries;
      while (entries.hasMoreElements()) {
        let file = entries.nextFile;
        let leaf = file.leafName;
        let id = leaf.slice(0, 36);
        let extension = leaf.slice(36);
        if (!uuidRegex.test(id)) {
          continue;
        }
        if (extension === ".dmp") {
          let entry = {
            id,
            date: file.lastModifiedTime,
            pending: true,
            ignored: false,
          };
          reports[id] = entry;
        } else if (extension === ".dmp.ignore") {
          ignored.push(id);
        }
      }
    }

    for (let id of ignored) {
      let report = reports[id];
      if (report) {
        report.ignored = true;
      }
    }

    // Sort reports descending by date
    return Object.values(reports).sort((a, b) => b.date - a.date);
  },
};

function CrashReports_pendingDir() {
  let pendingDir = Services.dirsvc.get("UAppData", Ci.nsIFile);
  pendingDir.append("Crash Reports");
  pendingDir.append("pending");
  return pendingDir;
}

function CrashReports_reportsDir() {
  let reportsDir = Services.dirsvc.get("UAppData", Ci.nsIFile);
  reportsDir.append("Crash Reports");
  return reportsDir;
}

function CrashReports_submittedDir() {
  let submittedDir = Services.dirsvc.get("UAppData", Ci.nsIFile);
  submittedDir.append("Crash Reports");
  submittedDir.append("submitted");
  return submittedDir;
}

CrashReports.pendingDir = CrashReports_pendingDir();
CrashReports.reportsDir = CrashReports_reportsDir();
CrashReports.submittedDir = CrashReports_submittedDir();
