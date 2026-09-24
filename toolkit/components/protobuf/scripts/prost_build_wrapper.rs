/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command()]
struct Args {
    protos: Vec<PathBuf>,
    #[arg(short = 'I')]
    includes: Vec<PathBuf>,
    #[arg(long = "rust_out")]
    rust_out: PathBuf,
}

fn main() -> Result<()> {
    let args = Args::parse();

    prost_build::Config::default()
        .out_dir(&args.rust_out)
        .compile_protos(&args.protos, &args.includes)?;

    Ok(())
}
