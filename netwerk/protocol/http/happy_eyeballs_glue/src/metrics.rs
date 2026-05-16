/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Glean metrics for the Happy Eyeballs algorithm.

use firefox_on_glean::metrics::netwerk as glean;
use std::collections::HashMap;
use std::time::Instant;

struct DnsInfo {
    start: Instant,
    record_type: happy_eyeballs::DnsRecordType,
}

struct ConnInfo {
    index: u32,
}

enum Outcome {
    Succeeded(ConnInfo),
    Failed,
}

pub(crate) struct Metrics {
    start: Instant,
    first_attempt_dispatched: bool,
    dns_infos: HashMap<happy_eyeballs::Id, DnsInfo>,
    conn_infos: HashMap<happy_eyeballs::Id, ConnInfo>,
    attempt_count: u32,
    cancelled_count: u32,
    https_record_received: bool,
    outcome: Option<Outcome>,
}

impl Metrics {
    pub(crate) fn new() -> Self {
        Self {
            start: Instant::now(),
            first_attempt_dispatched: false,
            dns_infos: HashMap::new(),
            conn_infos: HashMap::new(),
            attempt_count: 0,
            cancelled_count: 0,
            https_record_received: false,
            outcome: None,
        }
    }

    pub(crate) fn dns_query_started(
        &mut self,
        id: happy_eyeballs::Id,
        record_type: happy_eyeballs::DnsRecordType,
    ) {
        self.dns_infos.insert(
            id,
            DnsInfo {
                start: Instant::now(),
                record_type,
            },
        );
    }

    pub(crate) fn dns_response(&mut self, id: happy_eyeballs::Id) {
        let Some(info) = self.dns_infos.remove(&id) else {
            return;
        };
        let elapsed_ms = info.start.elapsed().as_millis() as i64;
        let label = dns_record_type_label(info.record_type);
        glean::happy_eyeballs_dns_resolution_time
            .get(label)
            .accumulate_single_sample_signed(elapsed_ms);
    }

    pub(crate) fn dns_response_https(&mut self, id: happy_eyeballs::Id, has_records: bool) {
        self.https_record_received |= has_records;
        self.dns_response(id);
    }

    pub(crate) fn connection_attempt_started(&mut self, id: happy_eyeballs::Id) {
        self.attempt_count += 1;

        if !self.first_attempt_dispatched {
            self.first_attempt_dispatched = true;
            let elapsed_ms = self.start.elapsed().as_millis() as i64;
            glean::happy_eyeballs_time_to_first_attempt.accumulate_single_sample_signed(elapsed_ms);
        }

        self.conn_infos.insert(
            id,
            ConnInfo {
                index: self.attempt_count,
            },
        );
    }

    pub(crate) fn connection_cancelled(&mut self, id: happy_eyeballs::Id) {
        if self.conn_infos.remove(&id).is_some() {
            self.cancelled_count += 1;
        }
    }

    pub(crate) fn connection_succeeded(&mut self, id: happy_eyeballs::Id) {
        if let Some(info) = self.conn_infos.remove(&id) {
            self.outcome = Some(Outcome::Succeeded(info));
        }
    }

    pub(crate) fn failed(&mut self) {
        self.outcome = Some(Outcome::Failed);
    }
}

impl Drop for Metrics {
    fn drop(&mut self) {
        let Some(ref outcome) = self.outcome else {
            return;
        };

        let elapsed_ms = self.start.elapsed().as_millis() as i64;
        glean::happy_eyeballs_connection_establishment_time
            .accumulate_single_sample_signed(elapsed_ms);

        glean::happy_eyeballs_connection_attempt_count
            .accumulate_single_sample_signed(self.attempt_count.into());

        glean::happy_eyeballs_cancelled_attempt_count
            .accumulate_single_sample_signed(self.cancelled_count.into());

        if let Outcome::Succeeded(info) = outcome {
            glean::happy_eyeballs_winning_attempt_index
                .accumulate_single_sample_signed(info.index.into());
        }

        let https_label = if self.https_record_received {
            "available"
        } else {
            "unavailable"
        };
        glean::happy_eyeballs_https_record_available
            .get(https_label)
            .add(1);
    }
}

fn dns_record_type_label(rt: happy_eyeballs::DnsRecordType) -> &'static str {
    match rt {
        happy_eyeballs::DnsRecordType::A => "a",
        happy_eyeballs::DnsRecordType::Aaaa => "aaaa",
        happy_eyeballs::DnsRecordType::Https => "https",
    }
}
