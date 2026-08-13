/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* eslint-env mozilla/process-script */

Services.cpmm.addMessageListener("Test:SetSSLKeyLogFile", ({ data }) => {
  Services.env.set("SSLKEYLOGFILE", data.value);
});
