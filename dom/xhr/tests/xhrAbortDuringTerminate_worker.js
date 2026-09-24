/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

let xhr;

onmessage = function (event) {
  if (event.data == "SEND") {
    xhr = new XMLHttpRequest();
    xhr.open("GET", "slow.sjs", true);
    // OPENED + send flag is enough for abort() to run the request error steps.
    xhr.send();
    postMessage("SENT");
    return;
  }

  // The parent holds the main thread, so we park inside abort()'s dispatch.
  xhr.abort();
};
