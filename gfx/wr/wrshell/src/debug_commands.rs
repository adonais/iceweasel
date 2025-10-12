/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::command::{Command, CommandList, CommandDescriptor};
use crate::command::{CommandContext, CommandOutput};
use webrender_api::DebugFlags;

// Implementation of a basic set of debug commands to demonstrate functionality

// Register the debug commands in this source file
pub fn register(cmd_list: &mut CommandList) {
    cmd_list.register_command(Box::new(PingCommand));
    cmd_list.register_command(Box::new(GenerateFrameCommand));
    cmd_list.register_command(Box::new(ToggleProfilerCommand));
    cmd_list.register_command(Box::new(GetSpatialTreeCommand));
}

struct PingCommand;
struct GenerateFrameCommand;
struct ToggleProfilerCommand;
struct GetSpatialTreeCommand;

impl Command for PingCommand {
    fn descriptor(&self) -> &'static CommandDescriptor {
        &CommandDescriptor {
            name: "ping",
            help: "Test connection to specified host",
            alias: None,
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get("ping") {
            Ok(output) => {
                CommandOutput::Log(output.expect("empty response"))
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for GenerateFrameCommand {
    fn descriptor(&self) -> &'static CommandDescriptor {
        &CommandDescriptor {
            name: "generate-frame",
            help: "Generate and render one frame",
            alias: Some("f"),
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.post("generate-frame") {
            Ok(..) => {
                CommandOutput::Log("ok".to_string())
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for ToggleProfilerCommand {
    fn descriptor(&self) -> &'static CommandDescriptor {
        &CommandDescriptor {
            name: "toggle-profiler",
            help: "Toggle the on-screen profiler overlay",
            alias: Some("p"),
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get("debug-flags") {
            Ok(flags_string) => {
                let mut flags: DebugFlags = serde_json::from_str(flags_string.as_ref().unwrap()).unwrap();
                flags ^= DebugFlags::PROFILER_DBG;

                match ctx.net.post_with_content("debug-flags", &flags) {
                    Ok(output) => {
                        CommandOutput::Log(output.expect("empty response"))
                    }
                    Err(err) => {
                        CommandOutput::Err(err)
                    }
                }
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for GetSpatialTreeCommand {
    fn descriptor(&self) -> &'static CommandDescriptor {
        &CommandDescriptor {
            name: "get-spatial-tree",
            help: "Print the current spatial tree to console",
            alias: None,
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get_with_query(
            "query",
            &[("type", "spatial-tree")],
        ) {
            Ok(output) => {
                CommandOutput::TextDocument {
                    title: "Spatial Tree".to_string(),
                    content: output.expect("empty response"),
                }
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}
