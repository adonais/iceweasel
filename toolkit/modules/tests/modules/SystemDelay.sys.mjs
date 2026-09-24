/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

let lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

/**
 * systemDelay: stop execution for a given number of seconds.
 * nsITimers stop when the browser sleeps. This delay uses
 * the system's `sleep` command-line utility to sleep for
 * the specified number of seconds
 *
 * @param {number} delaySeconds Number of seconds to delay
 */
export async function systemDelay(delaySeconds) {
  // Relies on there being a 'python3' executable in the PATH
  const path = await lazy.Subprocess.pathSearch("python3");
  if (!path) {
    throw new Error("python3 not found in path");
  }
  const script = `
import time
time.sleep(${delaySeconds})
`;
  const proc = await lazy.Subprocess.call({
    command: path,
    arguments: ["-c", script],
  });
  const { exitCode } = await proc.wait();
  if (exitCode !== 0) {
    throw new Error(`sleep exit code: ${exitCode}`);
  }
}
