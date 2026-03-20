/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::process::Command;

/// A simple trait to facilitate unit testing of functions that run commands.
pub(crate) trait CommandRunner {
    fn run(&self, cmd: &mut Command) -> Result<i32, Box<dyn std::error::Error>>;
}

pub(crate) struct RealRunner;

impl CommandRunner for RealRunner {
    fn run(&self, cmd: &mut Command) -> Result<i32, Box<dyn std::error::Error>> {
        Ok(cmd
            .spawn()?
            .wait()?
            .code()
            .ok_or("process had no exit code")?)
    }
}
