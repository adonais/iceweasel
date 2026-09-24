/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Runs in a content process, driven by test_pb_notification_ipc.js.
add_task(async function test_relayed_to_child() {
  const exited = new Promise(resolve => {
    Services.obs.addObserver(function observer(subject, topic) {
      Services.obs.removeObserver(observer, "last-pb-context-exited");
      resolve(topic);
    }, "last-pb-context-exited");
  });

  do_send_remote_message("pb_notification_child_ready");

  Assert.equal(
    await exited,
    "last-pb-context-exited",
    "child process received the relayed notification"
  );
});
