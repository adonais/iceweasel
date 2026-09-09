/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function run_test() {
  do_get_profile();
  // Run in a child (content) process so that HttpChannelChild applies the
  // content-encoding converter and nsHTTPCompressConv::MaybeRetarget decompresses
  // off the main thread, exercising the off-main-thread listener AddRef path.
  run_test_in_child("../unit/test_compressConv_offmainthread_js_listener.js");
}
