/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::net;
use crate::command;

// Command line interface for the WR debugger

struct Context {
    net: net::HttpConnection,
    cmd_list: command::CommandList,
}

impl repl_ng::Prompt for Context {
    fn prompt(&self) -> String {
        "> ".to_string()
    }

    fn complete(&self, _command: &str, _args: &[&str], _incomplete: &str) -> Vec<String> {
        // TODO: Add auto completion of command params
        vec![]
    }
}

pub struct Cli {
    repl: repl_ng::Repl<Context, repl_ng::Error>,
}

impl Cli {
    pub fn new(
        host: &str,
        cmd_list: command::CommandList,
    ) -> Self {
        let mut cmds = Vec::new();
        for cmd in cmd_list.cmds() {
            let desc = cmd.descriptor();

            let mut repl_cmd = repl_ng::Command::new(
                desc.name,
                |_args, ctx: &mut Context| {
                    let cmd = ctx.cmd_list.get_mut(desc.name).unwrap();
                    let mut ctx = command::CommandContext {
                        net: &mut ctx.net,
                    };
                    let result = cmd.run(&mut ctx);
                    match result {
                        command::CommandOutput::Log(msg) => {
                            Ok(Some(msg))
                        }
                        command::CommandOutput::Err(msg) => {
                            Ok(Some(msg))
                        }
                        command::CommandOutput::TextDocument { content, .. } => {
                            Ok(Some(content))
                        }
                    }
                },
            ).with_help(desc.help);

            if let Some(alias) = desc.alias {
                repl_cmd = repl_cmd.with_alias(alias);
            }

            cmds.push(repl_cmd);
        }

        let ctx = Context {
            net: net::HttpConnection::new(host),
            cmd_list,
        };

        let mut repl = repl_ng::Repl::new(ctx)
            .with_name("WebRender Debug Shell [Ctrl-D to quit, help for help]")
            .with_version("v0.1.0")
            .use_completion(true);

        for cmd in cmds {
            repl = repl.add_command(cmd);
        }

        Cli {
            repl,
        }
    }

    pub fn run(mut self) {
        self.repl.run().ok();
    }
}
