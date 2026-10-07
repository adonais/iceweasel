/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::{ColorF, DebugFlags, PictureRect, DeviceRect, LayoutRect, RenderCommandInfo};
use crate::image::ImageFormat;

// Shared type definitions between the WR crate and the debugger

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Eq, Hash, PartialEq)]
pub struct ProfileCounterId(pub usize);

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProfileCounterDescriptor {
    pub id: ProfileCounterId,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProfileCounterUpdate {
    pub id: ProfileCounterId,
    pub value: f64,
}

#[derive(Serialize, Deserialize)]
pub struct SetDebugFlagsMessage {
    pub flags: DebugFlags,
}

#[derive(Serialize, Deserialize)]
pub struct InitProfileCountersMessage {
    pub counters: Vec<ProfileCounterDescriptor>,
}

#[derive(Serialize, Deserialize)]
pub struct FrameLogMessage {
    pub profile_counters: Option<Vec<ProfileCounterUpdate>>,
    pub render_commands: Option<Vec<RenderCommandInfo>>,
}

#[derive(Serialize, Deserialize)]
pub enum DebuggerMessage {
    SetDebugFlags(SetDebugFlagsMessage),
    InitProfileCounters(InitProfileCountersMessage),
    UpdateFrameLog(FrameLogMessage),
    /// Shader build failures from the frame just rendered.
    ///
    /// A source pushed via `POST /shader-source` only rebuilds the variants
    /// that had already been compiled. One that had not fails when it is first
    /// used instead, which can be many frames later, so those failures are
    /// streamed rather than reported in the reply to the push.
    ShaderCompileErrors(Vec<ShaderDiagnostic>),
}

/// Reply to a `/renderdoc-capture` request: the path of the written `.rdc` file
/// on success, or an error message. Serialized as the JSON response body so the
/// client can tell success from failure without inspecting the string itself.
#[derive(Serialize, Deserialize)]
pub enum RenderDocReply {
    Path(String),
    Error(String),
}

#[derive(Serialize, Deserialize)]
pub struct CompositorDebugTile {
    pub local_rect: PictureRect,
    pub device_rect: DeviceRect,
    pub clip_rect: DeviceRect,
    pub z_id: i32,
}

#[derive(Serialize, Deserialize)]
pub struct CompositorDebugInfo {
    pub enabled_z_layers: u64,
    pub tiles: Vec<CompositorDebugTile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DebuggerTextureContent {
    pub name: String,
    pub category: crate::TextureCacheCategory,
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
    pub data: Vec<u8>,
}

/// One node of the built scene's picture tree, as reported by the `scene`
/// debug query. A node is either a primitive instance (leaf, or a picture
/// primitive whose children are the primitives of the picture it references)
/// or a root picture that no primitive instance references.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDebugNode {
    /// Index of the primitive instance in the built scene. `None` for root
    /// pictures (tile cache slices and snapshot pictures).
    pub prim_index: Option<u32>,
    /// Index of the referenced picture, for picture primitives and roots.
    pub picture_index: Option<u32>,
    /// Name of the primitive kind (`Rectangle`, `TextRun`, `Picture`, ...).
    pub kind: String,
    /// Kind-specific summary (composite mode, image key, glyph count, ...).
    pub detail: String,
    /// Color of the primitive, for kinds that have one (rectangles, box
    /// shadows, text runs).
    pub color: Option<ColorF>,
    pub spatial_node_index: u32,
    /// Authored local rect of the primitive. Zero for pictures, whose rect is
    /// only known during frame building.
    pub local_rect: LayoutRect,
    /// Approximate footprint of `local_rect` in device space at the time of
    /// the query, ignoring surface scale factors.
    pub device_rect: Option<DeviceRect>,
    /// Outcome of the last visibility pass for this primitive (`Visible`,
    /// `Culled`, `PassThrough`, or `NotDrawn` when it produced no draw).
    pub draw_state: String,
    pub children: Vec<SceneDebugNode>,
}

/// Result of the `scene` debug query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDebugTree {
    /// Incremented every time a new built scene is swapped into the document.
    /// Primitive indices are only meaningful for the generation they were
    /// reported with.
    pub scene_generation: u64,
    pub prim_count: u32,
    pub roots: Vec<SceneDebugNode>,
}

/// How the highlighted primitive is shown on screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneDebugHighlightMode {
    /// Draw an opaque pink quad in place of the primitive, honoring its clips,
    /// transform and position in the z-order.
    Replace,
    /// Outline the primitive's device rect in pink on top of the composited
    /// frame, so that it is visible even when occluded while its content stays
    /// visible.
    Overlay,
}

/// Debug-only modifications applied to a built scene at frame building time.
/// Sent by the debugger client via `POST /scene-override`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDebugOverride {
    /// Generation of the scene these indices refer to. The override is
    /// rejected if it does not match the document's current scene.
    pub scene_generation: u64,
    /// Primitive instance to highlight, if any.
    pub highlighted: Option<u32>,
    pub highlight_mode: SceneDebugHighlightMode,
    /// Primitive instances (and, for pictures, their whole subtree) that are
    /// skipped during frame building.
    pub disabled: Vec<u32>,
}

impl Default for SceneDebugOverride {
    fn default() -> Self {
        SceneDebugOverride {
            scene_generation: 0,
            highlighted: None,
            highlight_mode: SceneDebugHighlightMode::Replace,
            disabled: Vec::new(),
        }
    }
}

/// One `.glsl` file built into the connected instance, as reported by the
/// `shaders` debug query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderFileInfo {
    /// File stem, as `#include` directives spell it (`ps_quad_textured`).
    pub name: String,
    /// Whether a source override is currently installed for this file.
    pub overridden: bool,
}

/// One shader variant the connected instance may use: a base `.glsl` file plus
/// the set of features it is compiled with.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderVariantInfo {
    pub base_filename: String,
    /// Sorted feature list, each becoming a `WR_FEATURE_*` define.
    pub features: Vec<String>,
    /// Whether this variant has a linked program. Only those are rebuilt when
    /// a source is pushed; the rest pick the new source up when they are first
    /// used. An instance that precaches shaders asynchronously reports every
    /// variant as not linked until it is actually drawn with.
    pub compiled: bool,
}

/// Result of the `shaders` debug query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderListReply {
    /// False when the instance cannot recompile shaders at runtime, which is
    /// the case for SWGL.
    pub supported: bool,
    pub files: Vec<ShaderFileInfo>,
    pub variants: Vec<ShaderVariantInfo>,
}

/// Reply to a `shader-source` debug query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShaderSourceReply {
    /// The contents of one `.glsl` file: the override if one is installed,
    /// otherwise the source the instance was built with.
    Source {
        name: String,
        source: String,
        is_override: bool,
    },
    /// The preprocessed source handed to the driver for one variant. Driver
    /// logs that no known pattern matched report line numbers in this text.
    Expanded {
        variant: String,
        vertex: String,
        fragment: String,
    },
    Error(String),
}

/// Which step of building a program reported a diagnostic. Compilation logs
/// usually carry a location, link logs usually do not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ShaderStage {
    Compile,
    Link,
}

/// One line of a driver log, with the location it refers to resolved back to
/// the `.glsl` file it was written in.
///
/// `file` and `line` are `None` when the line carried no location, in which
/// case `message` is the driver's line verbatim.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderDiagnostic {
    /// Full name of the variant that failed (`ps_quad_textured_ANTIALIASING`).
    pub variant: String,
    pub stage: ShaderStage,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub message: String,
}

/// Replace the source of one `.glsl` file, or drop the override.
///
/// Sent by the debugger client via `POST /shader-source`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetShaderSourceRequest {
    /// File stem to override, which may be a shared include rather than a
    /// top-level shader.
    pub name: String,
    /// The new source, or `None` to restore the source built into the binary.
    pub source: Option<String>,
}

/// Reply to a `POST /shader-source` request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShaderReloadReply {
    /// Every affected variant compiled and linked, and has been swapped in.
    Ok { recompiled: usize },
    /// At least one variant failed. Nothing was swapped and the override was
    /// rolled back, so the instance still renders with the previous shaders.
    Errors(Vec<ShaderDiagnostic>),
    /// The instance cannot recompile shaders at runtime.
    Unsupported(String),
    /// The request itself was rejected, e.g. an unknown shader name.
    Error(String),
}
