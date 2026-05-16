/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use bytemuck::Pod;
use std::marker::PhantomData;
use crate::util::Recycler;

/// Typed handle into the scratch buffer. Carries the stored type
/// at compile time so that reads are guaranteed to match writes.
#[derive(Debug)]
#[cfg_attr(feature = "capture", derive(serde::Serialize))]
#[cfg_attr(feature = "replay", derive(serde::Deserialize))]
pub struct ScratchHandle<T> {
    offset: u32,
    _marker: PhantomData<T>,
}

impl<T> Copy for ScratchHandle<T> {}
impl<T> Clone for ScratchHandle<T> {
    fn clone(&self) -> Self { *self }
}

impl<T> ScratchHandle<T> {
    pub const INVALID: Self = ScratchHandle { offset: u32::MAX, _marker: PhantomData };

    /// Byte offset of the end of the stored value. Useful for
    /// computing where trailing data starts.
    pub fn end_offset(&self) -> u32 {
        self.offset + std::mem::size_of::<T>() as u32
    }
}

/// Byte-level bump arena for per-frame primitive data.
///
/// Cleared every frame. Data is allocated contiguously during the
/// prepare pass and read back during batching via typed handles.
/// All stored types must implement `bytemuck::Pod`.
#[cfg_attr(feature = "capture", derive(serde::Serialize))]
#[cfg_attr(feature = "replay", derive(serde::Deserialize))]
pub struct ScratchBuffer {
    data: Vec<u8>,
}

impl ScratchBuffer {
    pub fn new() -> Self {
        ScratchBuffer {
            data: Vec::new(),
        }
    }

    pub fn clear(&mut self) {
        self.data.clear();
    }

    pub fn recycle(&mut self, recycler: &mut Recycler) {
        recycler.recycle_vec(&mut self.data);
    }

    fn align_to<T>(&mut self) {
        let align = std::mem::align_of::<T>();
        let offset = (self.data.len() + align - 1) & !(align - 1);
        self.data.resize(offset, 0);
    }

    /// Allocate a single value, return a typed handle.
    pub fn push<T: Pod>(&mut self, val: T) -> ScratchHandle<T> {
        self.align_to::<T>();
        let offset = self.data.len();
        self.data.extend_from_slice(bytemuck::bytes_of(&val));
        ScratchHandle { offset: offset as u32, _marker: PhantomData }
    }

    /// Allocate a slice immediately after the last allocation.
    /// Returns the count for later retrieval.
    pub fn push_slice<T: Pod>(&mut self, vals: &[T]) -> u32 {
        self.align_to::<T>();
        self.data.extend_from_slice(bytemuck::cast_slice(vals));
        vals.len() as u32
    }

    /// Allocate zeroed space for `count` items of type T
    /// immediately after the last allocation.
    pub fn push_zeroed<T: Pod>(&mut self, count: u32) {
        self.align_to::<T>();
        let byte_len = count as usize * std::mem::size_of::<T>();
        self.data.resize(self.data.len() + byte_len, 0);
    }

    /// Read back a single value by its typed handle.
    pub fn read<T: Pod>(&self, handle: ScratchHandle<T>) -> &T {
        let start = handle.offset as usize;
        bytemuck::from_bytes(&self.data[start..start + std::mem::size_of::<T>()])
    }

    /// Read back a mutable reference by its typed handle.
    pub fn read_mut<T: Pod>(&mut self, handle: ScratchHandle<T>) -> &mut T {
        let start = handle.offset as usize;
        let end = start + std::mem::size_of::<T>();
        bytemuck::from_bytes_mut(&mut self.data[start..end])
    }

    /// Read a slice of `count` items at a raw byte offset.
    /// Used by header types to read their trailing arrays.
    pub fn read_slice_at<T: Pod>(&self, byte_offset: u32, count: u32) -> &[T] {
        let start = byte_offset as usize;
        let byte_len = count as usize * std::mem::size_of::<T>();
        bytemuck::cast_slice(&self.data[start..start + byte_len])
    }

    /// Read a mutable slice at a raw byte offset.
    pub fn read_slice_at_mut<T: Pod>(&mut self, byte_offset: u32, count: u32) -> &mut [T] {
        let start = byte_offset as usize;
        let byte_len = count as usize * std::mem::size_of::<T>();
        bytemuck::cast_slice_mut(&mut self.data[start..start + byte_len])
    }
}
