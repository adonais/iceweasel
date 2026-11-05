/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { logTest, logTask } = require("./utils/profiling");

async function startProfiler(context, commands) {
  try {
    context.log.info("Custom profiler start!");
    if (context.options.browser === "firefox") {
      await commands.profiler.start();
    } else if (context.options.browser === "chrome") {
      await commands.trace.start();
    }
  } catch (err) {
    context.log.error(
      `Failed to start the custom profiler: ${err.stack || err}`
    );
  }
}

async function stopProfiler(context, commands) {
  const results = commands.measure.result;
  if (!results?.length || !results[results.length - 1].url) {
    context.log.warn(
      "Skipping custom profiler stop because measure.stop produced no result"
    );
    return;
  }

  // Browsertime derives the profile's output directory from
  // result[0].browserScripts.pageinfo.url (getBrowsertimeResultsPath in
  // utils/profiling.js), so swap the just-measured result into result[0]
  // for the duration of the stop to file each profile under its own page.
  const savedResult = results[0];
  results[0] = results[results.length - 1];
  try {
    context.log.info("Custom profiler stop!");
    if (context.options.browser === "firefox") {
      await commands.profiler.stop();
    } else if (context.options.browser === "chrome") {
      await commands.trace.stop();
    }
  } catch (err) {
    context.log.error(
      `Failed to stop the custom profiler: ${err.stack || err}`
    );
  } finally {
    results[0] = savedResult;
  }
}

async function get_command_function(cmd, commands) {
  /*
  Converts a string such as `measure.start` into the actual
  function that is found in the `commands` module.

  XXX: Find a way to share this function between
  perftest_record.js and browsertime_interactive.js
  */
  if (cmd == "") {
    throw new Error("A blank command was given.");
  } else if (cmd.endsWith(".")) {
    throw new Error(
      "An extra `.` was found at the end of this command: " + cmd
    );
  }

  // `func` will hold the actual method that needs to be called,
  // and the `parent_mod` is the context required to run the `func`
  // method. Without that context, `this` becomes undefined in the browsertime
  // classes.
  let func = null;
  let parent_mod = null;
  for (let func_part of cmd.split(".")) {
    if (func_part == "") {
      throw new Error(
        "An empty function part was found in the command: " + cmd
      );
    }

    if (func === null) {
      parent_mod = commands;
      func = commands[func_part];
    } else if (func !== undefined) {
      parent_mod = func;
      func = func[func_part];
    } else {
      break;
    }
  }

  if (func == undefined) {
    throw new Error(
      "The given command could not be found as a function: " + cmd
    );
  }

  return [func, parent_mod];
}

module.exports = logTest(
  "interactive browsertime test",
  async function (context, commands) {
    context.log.info("Starting an interactive browsertime test");
    let page_cycles = context.options.browsertime.page_cycles;
    let post_startup_delay = context.options.browsertime.post_startup_delay;
    let input_cmds = context.options.browsertime.commands;
    const customProfilingEnabled =
      context.options.browsertime.expose_profiler === "true" &&
      ((context.options.browser === "firefox" &&
        context.options.firefox?.geckoProfilerRecordingType === "custom") ||
        (context.options.browser === "chrome" &&
          context.options.chrome?.timelineRecordingType === "custom"));

    context.log.info(
      "Waiting for %d ms (post_startup_delay)",
      post_startup_delay
    );
    await commands.wait.byTime(post_startup_delay);

    // unpack commands from python
    let cmds = input_cmds.split(";;;");

    let measuredCount = commands.measure.result?.length || 0;

    for (let count = 0; count < page_cycles; count++) {
      await logTask(context, "cycle " + count, async function () {
        context.log.info("Navigating to about:blank w/nav, count: " + count);
        await commands.navigate("about:blank");

        let pages_visited = [];
        for (let cmdstr of cmds) {
          let [cmd, ...args] = cmdstr.split(":::");

          if (cmd == "measure.start") {
            if (args[0] != "") {
              pages_visited.push(args[0]);
            }
          }

          let [func, parent_mod] = await get_command_function(cmd, commands);

          // Start the profiler before measure.start so that a navigation it
          // performs (the measure.start(url) form) is captured too.
          if (customProfilingEnabled && cmd === "measure.start") {
            await startProfiler(context, commands);
          }

          try {
            await func.call(parent_mod, ...args);
          } catch (e) {
            context.log.info(
              `Exception found while running \`commands.${cmd}(${args})\`: `
            );
            context.log.info(e.stack);
          }

          if (customProfilingEnabled && cmd === "measure.stop") {
            if ((commands.measure.result?.length || 0) > measuredCount) {
              measuredCount = commands.measure.result.length;
              await stopProfiler(context, commands);
            } else {
              context.log.warn(
                "Skipping custom profiler stop because measure.stop failed"
              );
            }
          }
        }

        // Log the number of pages visited for results parsing
        context.log.info("[] metrics: pages_visited: " + pages_visited);
      });
    }

    context.log.info("Browsertime pageload ended.");
    return true;
  }
);
