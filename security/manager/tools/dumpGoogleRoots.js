/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// This file is a helper script that generates the list of certificates that
// make up the preloaded pinset for Google properties.
//
// How to run this file:
// 1. [obtain firefox source code]
// 2. [build/obtain firefox binaries]
// 3. run `[path to]/firefox -xpcshell dumpGoogleRoots.js'
// 4. [paste the output into the appropriate section in
//     security/manager/tools/PreloadedHPKPins.json]

Services.prefs.setBoolPref("network.process.enabled", false);
Services.prefs.setBoolPref("network.xhr.block_sync_system_requests", false);

function downloadRoots() {
  let req = new XMLHttpRequest();
  req.open("GET", "https://pki.google.com/roots.pem", false);
  try {
    req.send();
  } catch (e) {
    throw new Error("ERROR: problem downloading Google Root PEMs: " + e);
  }

  if (req.status != 200) {
    throw new Error(
      "ERROR: problem downloading Google Root PEMs. Status: " + req.status
    );
  }

  let pem = req.responseText;
  let roots = [];
  let currentPEM = "";
  let readingRoot = false;
  let certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  for (let line of pem.split(/[\r\n]/)) {
    if (line == "-----END CERTIFICATE-----") {
      if (currentPEM) {
        roots.push(certDB.constructX509FromBase64(currentPEM));
      }
      currentPEM = "";
      readingRoot = false;
      continue;
    }
    if (readingRoot) {
      currentPEM += line;
    }
    if (line == "-----BEGIN CERTIFICATE-----") {
      readingRoot = true;
    }
  }
  return roots;
}

function makeFormattedNickname(cert, knownNicknames) {
  if (cert.displayName in knownNicknames) {
    return `"${cert.displayName}"`;
  }
  // Otherwise, this isn't a built-in and we have to comment it out.
  return `// "${cert.displayName}"`;
}

async function gatherKnownNicknames() {
  let certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  let nicknames = {};
  for (let cert of await certDB.getCerts()) {
    nicknames[cert.displayName] = true;
  }
  return nicknames;
}

async function run() {
  let knownNicknames = await gatherKnownNicknames();
  let roots = downloadRoots();
  let rootNicknames = [];
  for (let root of roots) {
    rootNicknames.push(makeFormattedNickname(root, knownNicknames));
  }
  rootNicknames.sort(function (rootA, rootB) {
    let rootALowercase = rootA.toLowerCase().replace(/(^[^"]*")|"/g, "");
    let rootBLowercase = rootB.toLowerCase().replace(/(^[^"]*")|"/g, "");
    if (rootALowercase < rootBLowercase) {
      return -1;
    }
    if (rootALowercase > rootBLowercase) {
      return 1;
    }
    return 0;
  });
  dump("    {\n");
  dump('      "name": "google_root_pems",\n');
  dump('      "sha256_hashes": [\n');
  let first = true;
  for (let nickname of rootNicknames) {
    if (!first) {
      dump(",\n");
    }
    first = false;
    dump("        " + nickname);
  }
  dump("\n");
  dump("      ]\n");
  dump("    }\n");
}

let done = false;
let error;
run()
  .catch(e => {
    error = e;
  })
  .then(() => {
    done = true;
  });
Services.tm.spinEventLoopUntil(
  "dumpGoogleRoots.js: waiting for completion",
  () => done
);
if (error) {
  throw error;
}
