/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Command line helper shipped alongside Firefox for working with Windows push
//! notifications. This is currently plumbing only and can be invoked from a console,
//! but implements no commands yet.

use std::process::ExitCode;

fn print_usage() {
    println!("🦀 🦊");
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);

    match args.next().as_deref() {
        None => {
            print_usage();
            ExitCode::SUCCESS
        }
        _ => ExitCode::FAILURE,
    }
}
