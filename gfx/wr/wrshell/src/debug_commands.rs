/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::command::{Command, CommandList, CommandDescriptor, ParamDescriptor};
use crate::command::{CommandContext, CommandOutput};
use crate::gui::format_shader_diagnostic;
use webrender_api::DebugFlags;
use webrender_api::debugger::{DebuggerTextureContent, RenderDocReply, SceneDebugNode, SceneDebugTree};
use webrender_api::debugger::{SetShaderSourceRequest, ShaderListReply, ShaderReloadReply};
use webrender_api::debugger::ShaderSourceReply;

// Implementation of a basic set of debug commands to demonstrate functionality

// Register the debug commands in this source file
pub fn register(cmd_list: &mut CommandList) {
    cmd_list.register_command(Box::new(PingCommand));
    cmd_list.register_command(Box::new(GenerateFrameCommand));
    cmd_list.register_command(Box::new(CaptureRenderDocCommand));
    cmd_list.register_command(Box::new(ToggleProfilerCommand));
    cmd_list.register_command(Box::new(GetSpatialTreeCommand));
    cmd_list.register_command(Box::new(GetSceneCommand));
    cmd_list.register_command(Box::new(GetCompositeConfigCommand));
    cmd_list.register_command(Box::new(GetCompositeViewCommand));
    cmd_list.register_command(Box::new(GetTexturesCommand { kind: None }));
    cmd_list.register_command(Box::new(GetTexturesCommand { kind: Some("atlas") }));
    cmd_list.register_command(Box::new(GetTexturesCommand { kind: Some("standalone") }));
    cmd_list.register_command(Box::new(GetTexturesCommand { kind: Some("render-target") }));
    cmd_list.register_command(Box::new(GetTexturesCommand { kind: Some("tile") }));
    cmd_list.register_command(Box::new(GetShadersCommand));
    cmd_list.register_command(Box::new(GetShaderSourceCommand));
    cmd_list.register_command(Box::new(SetShaderSourceCommand));
    cmd_list.register_command(Box::new(ResetShaderSourceCommand));
}

struct PingCommand;
struct GenerateFrameCommand;
struct CaptureRenderDocCommand;
struct ToggleProfilerCommand;
struct GetSpatialTreeCommand;
struct GetSceneCommand;
struct GetCompositeConfigCommand;
struct GetCompositeViewCommand;
struct GetTexturesCommand { kind: Option<&'static str> }
struct GetShadersCommand;
struct GetShaderSourceCommand;
struct SetShaderSourceCommand;
struct ResetShaderSourceCommand;

impl Command for PingCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "ping",
            help: "Test connection to specified host",
            ..Default::default()
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
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "generate-frame",
            help: "Generate and render one frame",
            alias: Some("f"),
            ..Default::default()
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

impl Command for CaptureRenderDocCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "renderdoc-capture",
            help: "Capture the next frame with RenderDoc and open it in qrenderdoc",
            alias: Some("rd"),
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get("renderdoc-capture") {
            Ok(Some(body)) => match serde_json::from_str::<RenderDocReply>(&body) {
                Ok(RenderDocReply::Path(path)) => match crate::renderdoc::open_capture(&path) {
                    Ok(bin) => CommandOutput::Log(
                        format!("Captured {path} (opening in {})", bin.display())
                    ),
                    Err(err) => CommandOutput::Log(
                        format!("Captured {path} (not opened: {err})")
                    ),
                },
                Ok(RenderDocReply::Error(err)) => CommandOutput::Err(err),
                Err(err) => CommandOutput::Err(format!("malformed reply from WR: {err}")),
            },
            Ok(None) => CommandOutput::Err("empty response from WR".into()),
            Err(err) => CommandOutput::Err(err),
        }
    }
}

impl Command for ToggleProfilerCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "toggle-profiler",
            help: "Toggle the on-screen profiler overlay",
            alias: Some("p"),
            ..Default::default()
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
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-spatial-tree",
            help: "Print the current spatial tree to console",
            ..Default::default()
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

impl Command for GetSceneCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-scene",
            help: "Print the picture / primitive tree of the current built scene",
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        fn write_node(node: &SceneDebugNode, depth: usize, out: &mut String) {
            for _ in 0..depth {
                out.push_str("  ");
            }
            match node.prim_index {
                Some(index) => out.push_str(&format!("[{}] ", index)),
                None => {}
            }
            out.push_str(&node.kind);
            if !node.detail.is_empty() {
                out.push_str(&format!(" {}", node.detail));
            }
            if let Some(color) = node.color {
                out.push_str(&format!(
                    " rgba({:.3}, {:.3}, {:.3}, {:.3})",
                    color.r, color.g, color.b, color.a,
                ));
            }
            if !node.draw_state.is_empty() {
                out.push_str(&format!(" ({})", node.draw_state));
            }
            out.push_str(&format!(
                " spatial_node={} rect={:?}\n",
                node.spatial_node_index,
                node.local_rect,
            ));
            for child in &node.children {
                write_node(child, depth + 1, out);
            }
        }

        match ctx.net.get_with_query(
            "query",
            &[("type", "scene")],
        ) {
            Ok(Some(body)) => match serde_json::from_str::<SceneDebugTree>(&body) {
                Ok(tree) => {
                    let mut content = format!(
                        "Scene generation {}, {} primitives\n",
                        tree.scene_generation,
                        tree.prim_count,
                    );
                    for root in &tree.roots {
                        write_node(root, 0, &mut content);
                    }
                    CommandOutput::TextDocument {
                        title: "Scene".to_string(),
                        content,
                    }
                }
                Err(err) => CommandOutput::Err(format!("malformed reply from WR: {err}")),
            },
            Ok(None) => CommandOutput::Err("empty response from WR".into()),
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for GetCompositeConfigCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-composite-cfg",
            help: "Print the current compositing config to the console",
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get_with_query(
            "query",
            &[("type", "composite-config")],
        ) {
            Ok(output) => {
                CommandOutput::TextDocument {
                    title: "Composite Config".into(),
                    content: output.expect("empty response"),
                }
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for GetCompositeViewCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-composite-view",
            help: "Print the current compositing config to the console",
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get_with_query(
            "query",
            &[("type", "composite-view")],
        ) {
            Ok(output) => {
                CommandOutput::SerdeDocument {
                    kind: "composite-view".into(),
                    content: output.expect("empty response"),
                }
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

impl Command for GetTexturesCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: match self.kind {
                Some("atlas") => "get-atlas-textures",
                Some("standalone") => "get-standalone-textures",
                Some("render-target") => "get-target-textures",
                Some("tile") => "get-tile-textures",
                _ => "get-textures",
            },
            help: "Fetch all gpu textures",
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        let kind = match self.kind {
            Some("atlas") => "atlas-textures",
            Some("standalone") => "standalone-textures",
            Some("render-target") => "target-textures",
            Some("tile") => "tile-textures",
            _ => "textures",
        };
        match ctx.net.get_with_query(
            "query",
            &[("type", kind)],
        ) {
            Ok(output) => {
                let mut textures: Vec<DebuggerTextureContent> = serde_json::from_str(
                    output.unwrap().as_str()
                ).unwrap();
                textures.sort_by(|a, b| a.name.cmp(&b.name));
                CommandOutput::Textures(textures)
            }
            Err(err) => {
                CommandOutput::Err(err)
            }
        }
    }
}

/// Send a source for `name`, or drop its override when `source` is `None`, and
/// report what WR made of it.
fn push_shader_source(
    ctx: &mut CommandContext,
    name: &str,
    source: Option<String>,
) -> CommandOutput {
    let request = SetShaderSourceRequest {
        name: name.to_string(),
        source,
    };

    match ctx.net.post_with_content("shader-source", &request) {
        Ok(Some(body)) => match serde_json::from_str::<ShaderReloadReply>(&body) {
            Ok(ShaderReloadReply::Ok { recompiled: 0 }) => {
                CommandOutput::Log(
                    "Override installed; no linked variant used this source yet".to_string()
                )
            }
            Ok(ShaderReloadReply::Ok { recompiled }) => {
                CommandOutput::Log(format!("Recompiled {} variant(s)", recompiled))
            }
            Ok(ShaderReloadReply::Errors(diagnostics)) => {
                let mut content = format!(
                    "{} diagnostic(s); the instance kept its previous shaders\n",
                    diagnostics.len(),
                );
                for diagnostic in &diagnostics {
                    content.push_str(&format_shader_diagnostic(diagnostic));
                    content.push('\n');
                }
                CommandOutput::Err(content)
            }
            Ok(ShaderReloadReply::Unsupported(msg)) | Ok(ShaderReloadReply::Error(msg)) => {
                CommandOutput::Err(msg)
            }
            Err(err) => CommandOutput::Err(format!("malformed reply from WR: {err}")),
        },
        Ok(None) => CommandOutput::Err("empty response from WR".into()),
        Err(err) => CommandOutput::Err(err),
    }
}

impl Command for GetShadersCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-shaders",
            help: "List the shader sources and the variants built from them",
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        match ctx.net.get_with_query("query", &[("type", "shaders")]) {
            Ok(Some(body)) => match serde_json::from_str::<ShaderListReply>(&body) {
                Ok(list) => {
                    let mut content = String::new();
                    if !list.supported {
                        content.push_str(
                            "This instance cannot recompile shaders at runtime (SWGL)\n\n",
                        );
                    }

                    content.push_str(&format!("{} files:\n", list.files.len()));
                    for file in &list.files {
                        content.push_str(&format!(
                            "  {}{}\n",
                            file.name,
                            if file.overridden { " [override]" } else { "" },
                        ));
                    }

                    content.push_str(&format!("\n{} variants:\n", list.variants.len()));
                    for variant in &list.variants {
                        content.push_str(&format!(
                            "  {} [{}] {}\n",
                            variant.base_filename,
                            variant.features.join(","),
                            if variant.compiled { "compiled" } else { "not built" },
                        ));
                    }

                    CommandOutput::TextDocument {
                        title: "Shaders".to_string(),
                        content,
                    }
                }
                Err(err) => CommandOutput::Err(format!("malformed reply from WR: {err}")),
            },
            Ok(None) => CommandOutput::Err("empty response from WR".into()),
            Err(err) => CommandOutput::Err(err),
        }
    }
}

impl Command for GetShaderSourceCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "get-shader-source",
            help: "Print the GLSL source of a shader, e.g. get-shader-source ps_quad_textured",
            params: &[
                ParamDescriptor { name: "name", is_required: true },
                ParamDescriptor { name: "features", is_required: false },
            ],
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        let Some(name) = ctx.arg_opt("name").map(str::to_string) else {
            return CommandOutput::Err("usage: get-shader-source <name> [features]".into());
        };
        // With features, WR returns the preprocessed source of that variant
        // rather than the raw file.
        let features = ctx.arg_opt("features").map(str::to_string);

        let mut params: Vec<(&str, &str)> = vec![("name", name.as_str())];
        if let Some(features) = &features {
            params.push(("features", features.as_str()));
        }

        match ctx.net.get_with_query("shader-source", &params) {
            Ok(Some(body)) => match serde_json::from_str::<ShaderSourceReply>(&body) {
                Ok(ShaderSourceReply::Source { name, source, is_override }) => {
                    CommandOutput::TextDocument {
                        title: format!(
                            "{}.glsl{}",
                            name,
                            if is_override { " (overridden)" } else { "" },
                        ),
                        content: source,
                    }
                }
                Ok(ShaderSourceReply::Expanded { variant, vertex, fragment }) => {
                    CommandOutput::TextDocument {
                        title: format!("Expanded {}", variant),
                        content: format!(
                            "// ==== {} vertex shader ====\n{}\n\
                             // ==== {} fragment shader ====\n{}",
                            variant, vertex, variant, fragment,
                        ),
                    }
                }
                Ok(ShaderSourceReply::Error(err)) => CommandOutput::Err(err),
                Err(err) => CommandOutput::Err(format!("malformed reply from WR: {err}")),
            },
            Ok(None) => CommandOutput::Err("empty response from WR".into()),
            Err(err) => CommandOutput::Err(err),
        }
    }
}

impl Command for SetShaderSourceCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "set-shader-source",
            help: "Send a local file as the source of a shader and recompile, \
                   e.g. set-shader-source ps_quad_textured /tmp/edited.glsl",
            params: &[
                ParamDescriptor { name: "name", is_required: true },
                ParamDescriptor { name: "path", is_required: true },
            ],
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        let (Some(name), Some(path)) = (
            ctx.arg_opt("name").map(str::to_string),
            ctx.arg_opt("path").map(str::to_string),
        ) else {
            return CommandOutput::Err("usage: set-shader-source <name> <path>".into());
        };

        let source = match std::fs::read_to_string(&path) {
            Ok(source) => source,
            Err(err) => {
                return CommandOutput::Err(format!("cannot read {path}: {err}"));
            }
        };

        push_shader_source(ctx, &name, Some(source))
    }
}

impl Command for ResetShaderSourceCommand {
    fn descriptor(&self) -> CommandDescriptor {
        CommandDescriptor {
            name: "reset-shader-source",
            help: "Drop a shader's override and restore the built-in source",
            params: &[ParamDescriptor { name: "name", is_required: true }],
            ..Default::default()
        }
    }

    fn run(
        &mut self,
        ctx: &mut CommandContext,
    ) -> CommandOutput {
        let Some(name) = ctx.arg_opt("name").map(str::to_string) else {
            return CommandOutput::Err("usage: reset-shader-source <name>".into());
        };

        push_shader_source(ctx, &name, None)
    }
}
