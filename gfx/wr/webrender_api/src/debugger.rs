/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::DebugFlags;

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
pub struct UpdateProfileCountersMessage {
    pub updates: Vec<ProfileCounterUpdate>,
}

#[derive(Serialize, Deserialize)]
pub enum DebuggerMessage {
    SetDebugFlags(SetDebugFlagsMessage),
    InitProfileCounters(InitProfileCountersMessage),
    UpdateProfileCounters(UpdateProfileCountersMessage),
}
