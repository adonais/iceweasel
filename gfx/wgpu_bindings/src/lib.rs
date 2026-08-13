/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use wgc::id;

pub mod client;
pub mod command;
pub mod error;
pub mod server;
pub mod telemetry;

use std::marker::PhantomData;
use std::{borrow::Cow, mem, slice};

use nsstring::nsACString;

type RawString = *const std::os::raw::c_char;

fn cow_label(raw: &RawString) -> Option<Cow<'_, str>> {
    if raw.is_null() {
        None
    } else {
        let cstr = unsafe { std::ffi::CStr::from_ptr(*raw) };
        cstr.to_str().ok().map(Cow::Borrowed)
    }
}

fn raw_string_to_string(raw: RawString) -> String {
    unsafe { std::ffi::CStr::from_ptr(raw) }
        .to_str()
        .unwrap()
        .to_string()
}

// Hides the repeated boilerplate of turning a `Option<&nsACString>` into a `Option<Cow<str>`.
pub fn wgpu_string(gecko_string: Option<&nsACString>) -> Option<Cow<'_, str>> {
    gecko_string.map(|s| s.to_utf8())
}

/// An equivalent of `&[T]` for ffi structures and function parameters.
#[repr(C)]
pub struct FfiSlice<'a, T> {
    // `data` may be null.
    pub data: *const T,
    pub length: usize,
    pub _marker: PhantomData<&'a T>,
}

impl<'a, T> FfiSlice<'a, T> {
    pub fn from_slice(slice: &'a [T]) -> FfiSlice<'a, T> {
        Self {
            data: slice.as_ptr(),
            length: slice.len(),
            _marker: PhantomData,
        }
    }

    pub unsafe fn as_slice(&self) -> &'a [T] {
        if self.data.is_null() {
            // It is invalid to construct a rust slice with a null pointer.
            return &[];
        }

        std::slice::from_raw_parts(self.data, self.length)
    }
}

impl<'a, T> Copy for FfiSlice<'a, T> {}
impl<'a, T> Clone for FfiSlice<'a, T> {
    fn clone(&self) -> Self {
        *self
    }
}

#[repr(C)]
pub struct ByteBuf {
    data: *mut u8,
    len: usize,
    capacity: usize,
}

impl ByteBuf {
    fn new() -> Self {
        Self {
            data: std::ptr::null_mut(),
            len: 0,
            capacity: 0,
        }
    }

    fn is_empty(&self) -> bool {
        self.len == 0
    }

    fn from_vec(mut vec: Vec<u8>) -> Self {
        if vec.is_empty() {
            ByteBuf::new()
        } else {
            let bb = ByteBuf {
                data: vec.as_mut_ptr(),
                len: vec.len(),
                capacity: vec.capacity(),
            };
            mem::forget(vec);
            bb
        }
    }

    unsafe fn as_slice(&self) -> &[u8] {
        slice::from_raw_parts(self.data, self.len)
    }
}

fn make_byte_buf<T: serde::Serialize>(data: &T) -> ByteBuf {
    let vec = bincode::serialize(data).unwrap();
    ByteBuf::from_vec(vec)
}

#[repr(C)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct AdapterInformation<S> {
    id: id::AdapterId,
    limits: wgt::Limits,
    features: wgt::FeaturesWebGPU,
    name: S,
    vendor: u32,
    device: u32,
    device_type: wgt::DeviceType,
    driver: S,
    driver_info: S,
    backend: wgt::Backend,
    support_use_shared_texture_in_swap_chain: bool,
    subgroup_min_size: u32,
    subgroup_max_size: u32,
}

#[repr(C)]
pub struct TextureViewDescriptor<'a> {
    label: Option<&'a nsACString>,
    format: Option<&'a wgt::TextureFormat>,
    dimension: Option<&'a wgt::TextureViewDimension>,
    aspect: wgt::TextureAspect,
    base_mip_level: u32,
    mip_level_count: Option<&'a u32>,
    base_array_layer: u32,
    array_layer_count: Option<&'a u32>,
    usage: wgt::TextureUsages,
}

// Declare an ID type for referring to external texture sources, and allow
// them to be managed by IdentityHub just like built-in wgpu resource types.
#[derive(Debug)]
pub enum ExternalTextureSource {}
impl id::Marker for ExternalTextureSource {
    const TYPE: &'static str = "ExternalTextureSource";
}
pub type ExternalTextureSourceId = id::Id<ExternalTextureSource>;

#[repr(C)]
#[derive(Debug, Copy, Clone, serde::Serialize, serde::Deserialize)]
pub enum PredefinedColorSpace {
    Srgb,
    DisplayP3,
}

// Descriptor for creating an external texture as used by the client side.
// Contains the fields of dom::GPUExternalTextureDescriptor, but with the
// source encoded as an ID.
#[repr(C)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExternalTextureDescriptor<L> {
    label: L,
    source: Option<crate::ExternalTextureSourceId>,
    color_space: PredefinedColorSpace,
}

impl<L> ExternalTextureDescriptor<L> {
    #[must_use]
    pub fn map_label<K>(&self, fun: impl FnOnce(&L) -> K) -> ExternalTextureDescriptor<K> {
        ExternalTextureDescriptor {
            label: fun(&self.label),
            source: self.source,
            color_space: self.color_space,
        }
    }
}

// Descriptor for creating an external texture as used by the server side. This
// contains information that can only be provided from the server side via the
// `ExternalTextureSourceHost`. It will be combined with the
// `ExternalTextureDescriptor` provided by the client in order to create the
// descriptor that will be passed to wgpu.
#[repr(C)]
struct ExternalTextureDescriptorFromSource<'a> {
    planes: FfiSlice<'a, id::TextureViewId>,
    width: u32,
    height: u32,
    format: wgt::ExternalTextureFormat,
    yuv_conversion_matrix: [f32; 16],
    gamut_conversion_matrix: [f32; 9],
    src_transfer_function: wgt::ExternalTextureTransferFunction,
    dst_transfer_function: wgt::ExternalTextureTransferFunction,
    sample_transform: [f32; 6],
    load_transform: [f32; 6],
}

#[derive(serde::Serialize, serde::Deserialize)]
#[repr(transparent)]
pub struct SurfaceFormat(i8);
#[derive(serde::Serialize, serde::Deserialize)]
#[repr(transparent)]
pub struct RemoteTextureOwnerId(u64);
#[derive(serde::Serialize, serde::Deserialize)]
#[repr(transparent)]
pub struct RemoteTextureId(u64);
#[derive(serde::Serialize, serde::Deserialize)]
#[repr(transparent)]
pub struct RemoteTextureTxnType(u32);
#[derive(serde::Serialize, serde::Deserialize)]
#[repr(transparent)]
pub struct RemoteTextureTxnId(u64);

#[derive(serde::Serialize, serde::Deserialize)]
#[repr(C)]
#[derive(Copy, Clone, Debug)]
#[cfg(target_os = "windows")]
pub struct FfiLUID {
    low_part: core::ffi::c_ulong,
    high_part: core::ffi::c_long,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub enum QueueWriteDataSource {
    DataBuffer(usize),
    Shmem(usize),
}

const MAX_SWAPCHAIN_BUFFER_COUNT: usize = 10;

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) enum Message<'a> {
    RequestAdapter {
        adapter_id: id::AdapterId,
        power_preference: wgt::PowerPreference,
        force_fallback_adapter: bool,
    },
    RequestDevice {
        adapter_id: id::AdapterId,
        device_id: id::DeviceId,
        queue_id: id::QueueId,
        desc: wgc::device::DeviceDescriptor<'a>,
    },
    Device(id::DeviceId, DeviceAction<'a>),
    Texture(id::DeviceId, id::TextureId, TextureAction<'a>),
    RenderBundleEncoder(
        id::DeviceId,
        id::RenderBundleEncoderId,
        RenderBundleEncoderCommand<'a>,
    ),
    CommandEncoder(
        id::DeviceId,
        id::CommandEncoderId,
        CommandEncoderCommand<'a>,
    ),
    RenderPassEncoder(
        id::DeviceId,
        id::RenderPassEncoderId,
        RenderPassEncoderCommand,
    ),
    ComputePassEncoder(
        id::DeviceId,
        id::ComputePassEncoderId,
        ComputePassEncoderCommand,
    ),
    QueueWrite {
        device_id: id::DeviceId,
        queue_id: id::QueueId,
        data_source: QueueWriteDataSource,
        action: QueueWriteAction,
    },
    BufferMap {
        device_id: id::DeviceId,
        buffer_id: id::BufferId,
        mode: u32,
        offset: u64,
        size: u64,
    },
    BufferUnmap(id::DeviceId, id::BufferId, bool),
    QueueSubmit(
        id::DeviceId,
        id::QueueId,
        Cow<'a, [id::CommandBufferId]>,
        Cow<'a, [id::TextureId]>,
        Cow<'a, [crate::ExternalTextureSourceId]>,
    ),
    QueueOnSubmittedWorkDone {
        device_id: id::DeviceId,
        queue_id: id::QueueId,
    },
    CreateSwapChain {
        device_id: id::DeviceId,
        queue_id: id::QueueId,
        width: i32,
        height: i32,
        format: SurfaceFormat,
        texture_format: wgt::TextureFormat,
        usage: wgt::TextureUsages,
        view_formats: Vec<wgt::TextureFormat>,
        buffer_ids: [id::BufferId; MAX_SWAPCHAIN_BUFFER_COUNT],
        remote_texture_owner_id: RemoteTextureOwnerId,
        use_shared_texture_in_swap_chain: bool,
    },
    SwapChainPresent {
        texture_id: id::TextureId,
        command_encoder_id: id::CommandEncoderId,
        command_buffer_id: id::CommandBufferId,
        remote_texture_id: RemoteTextureId,
        remote_texture_owner_id: RemoteTextureOwnerId,
    },
    SwapChainDrop {
        remote_texture_owner_id: RemoteTextureOwnerId,
        txn_type: RemoteTextureTxnType,
        txn_id: RemoteTextureTxnId,
    },

    DestroyBuffer(id::BufferId),
    DestroyTexture(id::TextureId),
    DestroyExternalTexture(id::ExternalTextureId),
    DestroyExternalTextureSource(crate::ExternalTextureSourceId),
    DestroyDevice(id::DeviceId),

    DropAdapter(id::AdapterId),
    DropDevice(id::DeviceId),
    DropQueue(id::QueueId),
    DropBuffer(id::BufferId),
    DropCommandEncoder(id::CommandEncoderId),
    DropRenderPassEncoder(id::RenderPassEncoderId),
    DropComputePassEncoder(id::ComputePassEncoderId),
    DropRenderBundleEncoder(id::RenderBundleEncoderId),
    DropCommandBuffer(id::CommandBufferId),
    DropRenderBundle(id::RenderBundleId),
    DropBindGroupLayout(id::BindGroupLayoutId),
    DropPipelineLayout(id::PipelineLayoutId),
    DropBindGroup(id::BindGroupId),
    DropShaderModule(id::ShaderModuleId),
    DropComputePipeline(id::ComputePipelineId),
    DropRenderPipeline(id::RenderPipelineId),
    DropTexture(id::TextureId),
    DropTextureView(id::TextureViewId),
    DropExternalTexture(id::ExternalTextureId),
    DropExternalTextureSource(crate::ExternalTextureSourceId),
    DropSampler(id::SamplerId),
    DropQuerySet(id::QuerySetId),
}

#[derive(serde::Serialize, serde::Deserialize)]
enum DeviceAction<'a> {
    CreateBuffer {
        buffer_id: id::BufferId,
        desc: wgc::resource::BufferDescriptor<'a>,
        shmem_handle_index: usize,
    },
    CreateTexture(
        id::TextureId,
        wgc::resource::TextureDescriptor<'a>,
        Option<SwapChainId>,
    ),
    CreateExternalTexture(
        id::ExternalTextureId,
        crate::ExternalTextureDescriptor<wgc::Label<'a>>,
    ),
    CreateSampler(id::SamplerId, wgc::resource::SamplerDescriptor<'a>),
    CreateBindGroupLayout(
        id::BindGroupLayoutId,
        wgc::binding_model::BindGroupLayoutDescriptor<'a>,
    ),
    CreateBindGroupLayoutError(id::BindGroupLayoutId, wgc::Label<'a>),
    RenderPipelineGetBindGroupLayout(id::RenderPipelineId, u32, id::BindGroupLayoutId),
    ComputePipelineGetBindGroupLayout(id::ComputePipelineId, u32, id::BindGroupLayoutId),
    CreatePipelineLayout(
        id::PipelineLayoutId,
        wgc::binding_model::PipelineLayoutDescriptor<'a>,
    ),
    CreateBindGroup(id::BindGroupId, wgc::binding_model::BindGroupDescriptor<'a>),
    CreateShaderModule(id::ShaderModuleId, wgc::Label<'a>, Cow<'a, str>),
    CreateComputePipeline(
        id::ComputePipelineId,
        wgc::pipeline::ComputePipelineDescriptor<'a>,
        bool,
    ),
    CreateRenderPipeline(
        id::RenderPipelineId,
        wgc::pipeline::RenderPipelineDescriptor<'a>,
        bool,
    ),
    CreateRenderBundleEncoder(
        id::RenderBundleEncoderId,
        wgc::command::RenderBundleEncoderDescriptor<'a>,
    ),
    CreateQuerySet(id::QuerySetId, wgc::resource::QuerySetDescriptor<'a>),
    CreateCommandEncoder(
        id::CommandEncoderId,
        wgt::CommandEncoderDescriptor<wgc::Label<'a>>,
    ),
    Error {
        message: String,
        r#type: wgt::error::ErrorType,
    },
    PushErrorScope(u8 /* dom::GPUErrorFilter */),
    PopErrorScope,
}

#[derive(serde::Serialize, serde::Deserialize)]
enum QueueWriteAction {
    Buffer {
        dst: id::BufferId,
        offset: wgt::BufferAddress,
    },
    Texture {
        dst: wgt::TexelCopyTextureInfo<id::TextureId>,
        layout: wgt::TexelCopyBufferLayout,
        size: wgt::Extent3d,
    },
}

#[derive(serde::Serialize, serde::Deserialize)]
enum TextureAction<'a> {
    CreateView(id::TextureViewId, wgc::resource::TextureViewDescriptor<'a>),
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PipelineError {
    is_validation_error: bool,
    error: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ShaderModuleCompilationMessage {
    pub line_number: u64,
    pub line_pos: u64,
    pub utf16_offset: u64,
    pub utf16_length: u64,
    pub message: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub enum BufferMapResult<'a> {
    Success {
        is_writable: bool,
        offset: u64,
        size: u64,
    },
    Error(Cow<'a, str>),
}

#[derive(serde::Serialize, serde::Deserialize)]
enum ServerMessage<'a> {
    RequestAdapterResponse(id::AdapterId, Option<AdapterInformation<Cow<'a, str>>>),
    RequestDeviceResponse(id::DeviceId, id::QueueId, Option<String>),
    PopErrorScopeResponse(
        id::DeviceId,
        u8, /* PopErrorScopeResultType */
        Cow<'a, str>,
    ),
    CreateRenderPipelineResponse {
        pipeline_id: id::RenderPipelineId,
        error: Option<PipelineError>,
    },
    CreateComputePipelineResponse {
        pipeline_id: id::ComputePipelineId,
        error: Option<PipelineError>,
    },
    CreateShaderModuleResponse(id::ShaderModuleId, Vec<ShaderModuleCompilationMessage>),
    BufferMapResponse(id::BufferId, BufferMapResult<'a>),
    QueueOnSubmittedWorkDoneResponse(id::QueueId),

    /// This message tells the client when we are done with swapchain readback buffers.
    /// Freeing a swapchain buffer too early may result in an ID resolution panic or
    /// an error submitting swapchain-related commands to the GPU.
    FreeSwapChainBufferIds([id::BufferId; MAX_SWAPCHAIN_BUFFER_COUNT]),
}

#[repr(C)]
pub struct TexelCopyBufferLayout<'a> {
    pub offset: wgt::BufferAddress,
    pub bytes_per_row: Option<&'a u32>,
    pub rows_per_image: Option<&'a u32>,
}

impl<'a> TexelCopyBufferLayout<'a> {
    fn into_wgt(&self) -> wgt::TexelCopyBufferLayout {
        wgt::TexelCopyBufferLayout {
            offset: self.offset,
            bytes_per_row: self.bytes_per_row.map(|bpr| *bpr),
            rows_per_image: self.rows_per_image.map(|rpi| *rpi),
        }
    }
}

#[repr(C)]
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct SwapChainId(pub u64);

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPURenderBundleEncoder`](https://www.w3.org/TR/webgpu/#gpurenderbundleencoder).
enum RenderBundleEncoderCommand<'a> {
    BindingCommand(BindingCommand),
    RenderCommand(RenderCommand),
    DebugCommand(DebugCommand),
    Finish {
        desc: wgc::command::RenderBundleDescriptor<'a>, // optional, defaults to {}
        render_bundle_id: id::RenderBundleId,
    },
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPUCommandEncoder`](https://www.w3.org/TR/webgpu/#gpucommandencoder).
enum CommandEncoderCommand<'a> {
    BeginRenderPass {
        desc: wgc::command::RenderPassDescriptor<'a>,
        render_pass_encoder_id: id::RenderPassEncoderId,
    },
    BeginComputePass {
        desc: wgc::command::ComputePassDescriptor<'a>, // optional, defaults to {}
        compute_pass_encoder_id: id::ComputePassEncoderId,
    },
    CopyBufferToBuffer {
        source: id::BufferId,
        source_offset: u64,
        destination: id::BufferId,
        destination_offset: u64,
        size: Option<u64>,
    },
    CopyBufferToTexture {
        source: wgt::TexelCopyBufferInfo<id::BufferId>,
        destination: wgt::TexelCopyTextureInfo<id::TextureId>,
        copy_size: wgt::Extent3d,
    },
    CopyTextureToBuffer {
        source: wgt::TexelCopyTextureInfo<id::TextureId>,
        destination: wgt::TexelCopyBufferInfo<id::BufferId>,
        copy_size: wgt::Extent3d,
    },
    CopyTextureToTexture {
        source: wgt::TexelCopyTextureInfo<id::TextureId>,
        destination: wgt::TexelCopyTextureInfo<id::TextureId>,
        copy_size: wgt::Extent3d,
    },
    ClearBuffer {
        buffer: id::BufferId,
        offset: u64, // optional, defaults to 0
        size: Option<u64>,
    },
    ResolveQuerySet {
        query_set: id::QuerySetId,
        first_query: u32,
        query_count: u32,
        destination: id::BufferId,
        destination_offset: u64,
    },
    DebugCommand(DebugCommand),
    Finish {
        desc: wgt::CommandBufferDescriptor<wgc::Label<'a>>,
        command_buffer_id: id::CommandBufferId,
    },
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPURenderPassEncoder`](https://www.w3.org/TR/webgpu/#gpurenderpassencoder).
enum RenderPassEncoderCommand {
    SetViewport {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        min_depth: f32,
        max_depth: f32,
    },
    SetScissorRect {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    SetBlendConstant(wgt::Color),
    SetStencilReference(u32),
    BeginOcclusionQuery(u32),
    EndOcclusionQuery,
    ExecuteBundles(Vec<id::RenderBundleId>),
    BindingCommand(BindingCommand),
    RenderCommand(RenderCommand),
    DebugCommand(DebugCommand),
    End,
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPUComputePassEncoder`](https://www.w3.org/TR/webgpu/#gpucomputepassencoder).
enum ComputePassEncoderCommand {
    BindingCommand(BindingCommand),
    SetPipeline(id::ComputePipelineId),
    DispatchWorkgroups {
        workgroup_count_x: u32,
        workgroup_count_y: u32, // optional, defaults to 1
        workgroup_count_z: u32, // optional, defaults to 1
    },
    DispatchWorkgroupsIndirect {
        indirect_buffer: id::BufferId,
        indirect_offset: u64,
    },
    DebugCommand(DebugCommand),
    End,
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPUDebugCommandsMixin`](https://www.w3.org/TR/webgpu/#gpudebugcommandsmixin).
enum DebugCommand {
    PushDebugGroup(String),
    PopDebugGroup,
    InsertDebugMarker(String),
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPUBindingCommandsMixin`](https://www.w3.org/TR/webgpu/#gpubindingcommandsmixin).
enum BindingCommand {
    SetBindGroup {
        index: u32,
        bind_group: Option<id::BindGroupId>,
        dynamic_offsets: Vec<u32>, // optional, defaults to []
    },
    SetImmediates {
        range_offset: u32,
        data: Vec<u8>,
    },
}

#[derive(serde::Serialize, serde::Deserialize)]
/// Corresponds to [`GPURenderCommandsMixin`](https://www.w3.org/TR/webgpu/#gpurendercommandsmixin).
enum RenderCommand {
    SetPipeline(id::RenderPipelineId),
    SetIndexBuffer {
        buffer: id::BufferId,
        index_format: wgt::IndexFormat,
        offset: u64, // optional, defaults to 0
        size: Option<u64>,
    },
    SetVertexBuffer {
        slot: u32,
        buffer: Option<id::BufferId>,
        offset: u64, // optional, defaults to 0
        size: Option<u64>,
    },
    Draw {
        vertex_count: u32,
        instance_count: u32, // optional, defaults to 1
        first_vertex: u32,   // optional, defaults to 0
        first_instance: u32, // optional, defaults to 0
    },
    DrawIndexed {
        index_count: u32,
        instance_count: u32, // optional, defaults to 1
        first_index: u32,    // optional, defaults to 0
        base_vertex: i32,    // optional, defaults to 0
        first_instance: u32, // optional, defaults to 0
    },
    DrawIndirect {
        indirect_buffer: id::BufferId,
        indirect_offset: u64,
    },
    DrawIndexedIndirect {
        indirect_buffer: id::BufferId,
        indirect_offset: u64,
    },
}
