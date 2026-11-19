/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseWorker } from "resource://gre/modules/workers/PromiseWorker.mjs";
import { RankShortcutsWorker } from "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs";

const ranker = new RankShortcutsWorker();

class RankShortcutsPromiseWorker extends PromiseWorker.AbstractWorker {
  dispatch(method, args = []) {
    return ranker[method](...args);
  }

  postMessage(msg, ...transfers) {
    return self.postMessage(msg, ...transfers);
  }

  close() {
    return self.close();
  }
}

const worker = new RankShortcutsPromiseWorker();

self.addEventListener("message", msg => worker.handleMessage(msg));
self.addEventListener("unhandledrejection", error => {
  throw /** @type {PromiseRejectionEvent} */ (error).reason;
});
