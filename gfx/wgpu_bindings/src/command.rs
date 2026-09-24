/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::{
    client::Client, id, raw_string_to_string, ComputePassEncoderCommand, FfiSlice, Message,
    RawString, RenderPassEncoderCommand,
};
use wgpu_core_remote_types::{
    encoders::{BindingCommand, DebugCommand, RenderCommand},
    ffi::FfiOption,
};
use wgt::{BufferAddress, Color, DynamicOffset, IndexFormat};

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_viewport(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    min_depth: f32,
    max_depth: f32,
) {
    let command = RenderPassEncoderCommand::SetViewport {
        x,
        y,
        width,
        height,
        min_depth,
        max_depth,
    };
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_scissor_rect(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) {
    let command = RenderPassEncoderCommand::SetScissorRect {
        x,
        y,
        width,
        height,
    };
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_blend_constant(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    color: &Color,
) {
    let command = RenderPassEncoderCommand::SetBlendConstant(*color);
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_stencil_reference(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    value: u32,
) {
    let command = RenderPassEncoderCommand::SetStencilReference(value);
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_begin_occlusion_query(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    query_index: u32,
) {
    let command = RenderPassEncoderCommand::BeginOcclusionQuery(query_index);
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_end_occlusion_query(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
) {
    let command = RenderPassEncoderCommand::EndOcclusionQuery;
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub unsafe extern "C" fn wgpu_client_render_pass_encoder_execute_bundles(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    render_bundles: FfiSlice<'_, id::RenderBundleId>,
) {
    let command = RenderPassEncoderCommand::ExecuteBundles(render_bundles.as_slice().to_vec());
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub unsafe extern "C" fn wgpu_client_render_pass_encoder_set_bind_group(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    index: u32,
    bind_group: Option<id::BindGroupId>,
    dynamic_offsets: FfiSlice<'_, DynamicOffset>,
) {
    let command = RenderPassEncoderCommand::BindingCommand(BindingCommand::SetBindGroup {
        index,
        bind_group,
        dynamic_offsets: dynamic_offsets.as_slice().to_vec(),
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_pipeline(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    pipeline_id: id::RenderPipelineId,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::SetPipeline(pipeline_id));
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_index_buffer(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    buffer: id::BufferId,
    index_format: IndexFormat,
    offset: BufferAddress,
    size: FfiOption<BufferAddress>,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::SetIndexBuffer {
        buffer,
        index_format,
        offset,
        size: size.to_std(),
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_set_vertex_buffer(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    slot: u32,
    buffer: Option<id::BufferId>,
    offset: BufferAddress,
    size: FfiOption<BufferAddress>,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::SetVertexBuffer {
        slot,
        buffer,
        offset,
        size: size.to_std(),
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_draw(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    vertex_count: u32,
    instance_count: u32,
    first_vertex: u32,
    first_instance: u32,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::Draw {
        vertex_count,
        instance_count,
        first_vertex,
        first_instance,
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_draw_indexed(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    index_count: u32,
    instance_count: u32,
    first_index: u32,
    base_vertex: i32,
    first_instance: u32,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::DrawIndexed {
        index_count,
        instance_count,
        first_index,
        base_vertex,
        first_instance,
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_draw_indirect(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    indirect_buffer: id::BufferId,
    indirect_offset: BufferAddress,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::DrawIndirect {
        indirect_buffer,
        indirect_offset,
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_draw_indexed_indirect(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    indirect_buffer: id::BufferId,
    indirect_offset: BufferAddress,
) {
    let command = RenderPassEncoderCommand::RenderCommand(RenderCommand::DrawIndexedIndirect {
        indirect_buffer,
        indirect_offset,
    });
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

/// # Safety
///
/// This function is unsafe as there is no guarantee that the given `label`
/// is a valid null-terminated string.
#[no_mangle]
pub unsafe extern "C" fn wgpu_client_render_pass_encoder_push_debug_group(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    label: RawString,
) {
    let command = RenderPassEncoderCommand::DebugCommand(DebugCommand::PushDebugGroup(
        raw_string_to_string(label),
    ));
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_render_pass_encoder_pop_debug_group(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
) {
    let command = RenderPassEncoderCommand::DebugCommand(DebugCommand::PopDebugGroup);
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

/// # Safety
///
/// This function is unsafe as there is no guarantee that the given `label`
/// is a valid null-terminated string.
#[no_mangle]
pub unsafe extern "C" fn wgpu_client_render_pass_encoder_insert_debug_marker(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
    label: RawString,
) {
    let command = RenderPassEncoderCommand::DebugCommand(DebugCommand::InsertDebugMarker(
        raw_string_to_string(label),
    ));
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub unsafe extern "C" fn wgpu_client_render_pass_encoder_end(
    client: &Client,
    encoder_id: id::RenderPassEncoderId,
) {
    let command = RenderPassEncoderCommand::End;
    let message = Message::RenderPassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub unsafe extern "C" fn wgpu_client_compute_pass_encoder_set_bind_group(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    index: u32,
    bind_group: Option<id::BindGroupId>,
    dynamic_offsets: FfiSlice<'_, DynamicOffset>,
) {
    let command = ComputePassEncoderCommand::BindingCommand(BindingCommand::SetBindGroup {
        index,
        bind_group,
        dynamic_offsets: dynamic_offsets.as_slice().to_vec(),
    });
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_compute_pass_encoder_set_pipeline(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    pipeline_id: id::ComputePipelineId,
) {
    let command = ComputePassEncoderCommand::SetPipeline(pipeline_id);
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_compute_pass_encoder_dispatch_workgroups(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    workgroup_count_x: u32,
    workgroup_count_y: u32,
    workgroup_count_z: u32,
) {
    let command = ComputePassEncoderCommand::DispatchWorkgroups {
        workgroup_count_x,
        workgroup_count_y,
        workgroup_count_z,
    };
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_compute_pass_encoder_dispatch_workgroups_indirect(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    indirect_buffer: id::BufferId,
    indirect_offset: BufferAddress,
) {
    let command = ComputePassEncoderCommand::DispatchWorkgroupsIndirect {
        indirect_buffer,
        indirect_offset,
    };
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

/// # Safety
///
/// This function is unsafe as there is no guarantee that the given `label`
/// is a valid null-terminated string.
#[no_mangle]
pub unsafe extern "C" fn wgpu_client_compute_pass_encoder_push_debug_group(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    label: RawString,
) {
    let command = ComputePassEncoderCommand::DebugCommand(DebugCommand::PushDebugGroup(
        raw_string_to_string(label),
    ));
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub extern "C" fn wgpu_client_compute_pass_encoder_pop_debug_group(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
) {
    let command = ComputePassEncoderCommand::DebugCommand(DebugCommand::PopDebugGroup);
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

/// # Safety
///
/// This function is unsafe as there is no guarantee that the given `label`
/// is a valid null-terminated string.
#[no_mangle]
pub unsafe extern "C" fn wgpu_client_compute_pass_encoder_insert_debug_marker(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
    label: RawString,
) {
    let command = ComputePassEncoderCommand::DebugCommand(DebugCommand::InsertDebugMarker(
        raw_string_to_string(label),
    ));
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}

#[no_mangle]
pub unsafe extern "C" fn wgpu_client_compute_pass_encoder_end(
    client: &Client,
    encoder_id: id::ComputePassEncoderId,
) {
    let command = ComputePassEncoderCommand::End;
    let message = Message::ComputePassEncoder(encoder_id, command);
    client.queue_message(&message);
}
