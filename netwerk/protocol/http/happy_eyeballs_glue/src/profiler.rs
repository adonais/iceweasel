/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Firefox Profiler integration for the Happy Eyeballs algorithm.

use gecko_profiler::schema::{Format, Location};
use gecko_profiler::{
    gecko_profiler_category, MarkerOptions, MarkerSchema, MarkerTiming, ProfilerMarker,
    ProfilerTime,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};

fn hex_string(id: u64) -> [u8; 16] {
    let mut buf = [0; 16];
    let hex_digits = b"0123456789abcdef";
    for i in 0..16 {
        buf[i] = hex_digits[(id >> (60 - i * 4)) as usize & 0xf];
    }
    buf
}

#[derive(Serialize, Deserialize, Debug)]
struct DnsMarker {
    flow: u64,
    origin: String,
    response: String,
}

impl ProfilerMarker for DnsMarker {
    fn marker_type_name() -> &'static str {
        "HappyEyeballsDns"
    }

    fn marker_type_display() -> MarkerSchema {
        let mut schema = MarkerSchema::new(&[Location::MarkerChart, Location::MarkerTable]);
        schema.set_chart_label("{marker.data.origin}");
        schema.set_tooltip_label("{marker.name} - {marker.data.origin}");
        schema.add_key_label_format("origin", "Origin", Format::SanitizedString);
        schema.add_key_label_format("response", "Response", Format::SanitizedString);
        schema.add_key_label_format("flow", "Flow", Format::Flow);
        schema
    }

    fn stream_json_marker_data(&self, json_writer: &mut gecko_profiler::JSONWriter) {
        json_writer.string_property("origin", &self.origin);
        json_writer.string_property("response", &self.response);
        json_writer.unique_string_property("flow", unsafe {
            std::str::from_utf8_unchecked(&hex_string(self.flow))
        });
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct ConnectionMarker {
    flow: u64,
    origin: String,
    succeeded: bool,
    protocol: String,
    has_ech: bool,
    address: String,
}

impl ProfilerMarker for ConnectionMarker {
    fn marker_type_name() -> &'static str {
        "HappyEyeballsConnection"
    }

    fn marker_type_display() -> MarkerSchema {
        let mut schema = MarkerSchema::new(&[Location::MarkerChart, Location::MarkerTable]);
        schema.set_chart_label("{marker.data.origin}");
        schema.set_tooltip_label(
            "{marker.name} - {marker.data.origin} ({marker.data.succeeded ? 'succeeded' : 'failed'})",
        );
        schema.add_key_label_format("origin", "Origin", Format::SanitizedString);
        schema.add_key_label_format("protocol", "Protocol", Format::String);
        schema.add_key_label_format("address", "Address", Format::SanitizedString);
        schema.add_key_label_format("has_ech", "ECH", Format::String);
        schema.add_key_label_format("succeeded", "Succeeded", Format::String);
        schema.add_key_label_format("flow", "Flow", Format::Flow);
        schema
    }

    fn stream_json_marker_data(&self, json_writer: &mut gecko_profiler::JSONWriter) {
        json_writer.string_property("origin", &self.origin);
        json_writer.string_property("protocol", &self.protocol);
        json_writer.string_property("address", &self.address);
        json_writer.bool_property("has_ech", self.has_ech);
        json_writer.bool_property("succeeded", self.succeeded);
        json_writer.unique_string_property("flow", unsafe {
            std::str::from_utf8_unchecked(&hex_string(self.flow))
        });
    }
}

struct ConnInfo {
    start: ProfilerTime,
    protocol: String,
    has_ech: bool,
    address: String,
}

pub(crate) struct Profiler {
    flow_id: u64,
    origin: String,
    dns_start_times: HashMap<happy_eyeballs::Id, ProfilerTime>,
    conn_infos: HashMap<happy_eyeballs::Id, ConnInfo>,
}

impl Profiler {
    pub(crate) fn new(flow_id: u64, origin: String) -> Self {
        Self {
            flow_id,
            origin,
            dns_start_times: HashMap::new(),
            conn_infos: HashMap::new(),
        }
    }

    pub(crate) fn set_flow_id(&mut self, flow_id: u64) {
        self.flow_id = flow_id;
    }

    pub(crate) fn dns_query_started(&mut self, id: happy_eyeballs::Id) {
        if !gecko_profiler::is_active() {
            return;
        }
        self.dns_start_times.insert(id, ProfilerTime::now());
    }

    pub(crate) fn dns_response_a(&mut self, id: happy_eyeballs::Id, addrs: &[Ipv4Addr]) {
        let Some(start) = self.dns_start_times.remove(&id) else {
            return;
        };
        let response: Vec<_> = addrs.iter().map(|a| a.to_string()).collect();
        gecko_profiler::add_marker(
            "Happy Eyeballs: DNS A",
            gecko_profiler_category!(Network),
            MarkerOptions {
                timing: MarkerTiming::interval_until_now_from(start),
                ..Default::default()
            },
            DnsMarker {
                flow: self.flow_id,
                origin: self.origin.clone(),
                response: response.join(", "),
            },
        );
    }

    pub(crate) fn dns_response_aaaa(&mut self, id: happy_eyeballs::Id, addrs: &[Ipv6Addr]) {
        let Some(start) = self.dns_start_times.remove(&id) else {
            return;
        };
        let response: Vec<_> = addrs.iter().map(|a| a.to_string()).collect();
        gecko_profiler::add_marker(
            "Happy Eyeballs: DNS AAAA",
            gecko_profiler_category!(Network),
            MarkerOptions {
                timing: MarkerTiming::interval_until_now_from(start),
                ..Default::default()
            },
            DnsMarker {
                flow: self.flow_id,
                origin: self.origin.clone(),
                response: response.join(", "),
            },
        );
    }

    pub(crate) fn dns_response_https(
        &mut self,
        id: happy_eyeballs::Id,
        infos: &[happy_eyeballs::ServiceInfo],
    ) {
        let Some(start) = self.dns_start_times.remove(&id) else {
            return;
        };
        let response: Vec<_> = infos
            .iter()
            .map(|si| format!("priority={} target={:?}", si.priority, si.target_name,))
            .collect();
        gecko_profiler::add_marker(
            "Happy Eyeballs: DNS HTTPS",
            gecko_profiler_category!(Network),
            MarkerOptions {
                timing: MarkerTiming::interval_until_now_from(start),
                ..Default::default()
            },
            DnsMarker {
                flow: self.flow_id,
                origin: self.origin.clone(),
                response: response.join("; "),
            },
        );
    }

    pub(crate) fn connection_attempt_started(
        &mut self,
        id: happy_eyeballs::Id,
        endpoint: &happy_eyeballs::Endpoint,
    ) {
        if !gecko_profiler::is_active() {
            return;
        }
        self.conn_infos.insert(
            id,
            ConnInfo {
                start: ProfilerTime::now(),
                protocol: format!("{:?}", endpoint.http_version),
                has_ech: endpoint.ech_config.is_some(),
                address: endpoint.address.to_string(),
            },
        );
    }

    pub(crate) fn connection_result(&mut self, id: happy_eyeballs::Id, succeeded: bool) {
        let Some(info) = self.conn_infos.remove(&id) else {
            return;
        };
        gecko_profiler::add_marker(
            "Happy Eyeballs: Connection",
            gecko_profiler_category!(Network),
            MarkerOptions {
                timing: MarkerTiming::interval_until_now_from(info.start),
                ..Default::default()
            },
            ConnectionMarker {
                flow: self.flow_id,
                origin: self.origin.clone(),
                succeeded,
                protocol: info.protocol,
                has_ech: info.has_ech,
                address: info.address,
            },
        );
    }
}
