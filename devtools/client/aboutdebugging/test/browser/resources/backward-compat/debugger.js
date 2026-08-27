/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The console test checks that this message shows up in the remote toolbox.
// eslint-disable-next-line no-console
console.log("script loaded");

function clickMe() {
  const a = 1; // BREAKPOINT
  const b = 2;
  return a + b;
}

document.getElementById("click-me").addEventListener("click", clickMe);
