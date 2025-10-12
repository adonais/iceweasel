/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::net;

// Types for defining debug commands (and queries) that can be run in CLI or GUI mode

pub struct CommandContext<'a> {
    pub net: &'a mut net::HttpConnection,
}

pub enum CommandOutput {
    Log(String),
    Err(String),
    TextDocument {
        title: String,
        content: String,
    },
}

pub struct CommandDescriptor {
    pub name: &'static str,
    pub alias: Option<&'static str>,
    pub help: &'static str,
}

pub trait Command {
    fn descriptor(&self) -> &'static CommandDescriptor;
    fn run(&mut self, ctx: &mut CommandContext) -> CommandOutput;
}

pub struct CommandList {
    commands: Vec<Box<dyn Command>>,
}

impl CommandList {
    pub fn new() -> Self {
        CommandList {
            commands: Vec::new(),
        }
    }

    pub fn register_command(
        &mut self,
        cmd: Box<dyn Command>,
    ) {
        self.commands.push(cmd);
    }

    pub fn cmds(&self) -> &[Box<dyn Command>] {
        &self.commands
    }

    pub fn get_mut<'a>(&mut self, name: &'a str) -> Option<&mut Box<dyn Command>> {
        self.commands
            .iter_mut()
            .find(|cmd| {
                let desc = cmd.descriptor();
                desc.name == name || desc.alias == Some(name)
            })
    }
}
