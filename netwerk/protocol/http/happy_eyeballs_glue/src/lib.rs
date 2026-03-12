/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! FFI glue layer between happy-eyeballs Rust crate and Firefox's C++ networking stack.

mod profiler;

use nserror::{nsresult, NS_ERROR_INVALID_ARG, NS_ERROR_UNEXPECTED, NS_OK};
use nsstring::{nsACString, nsCString};
use std::net::{Ipv4Addr, Ipv6Addr};
use std::ptr;
use std::time::Instant;
use thin_vec::ThinVec;
use xpcom::{AtomicRefcnt, RefCounted};

#[cfg(not(windows))]
use libc::{AF_INET, AF_INET6};
#[cfg(windows)]
use winapi::shared::ws2def::{AF_INET, AF_INET6};

#[repr(C)]
pub enum IpPreference {
    DualStackPreferV6 = 0,
    DualStackPreferV4 = 1,
}

impl From<IpPreference> for happy_eyeballs::IpPreference {
    fn from(v: IpPreference) -> Self {
        match v {
            IpPreference::DualStackPreferV6 => Self::DualStackPreferV6,
            IpPreference::DualStackPreferV4 => Self::DualStackPreferV4,
        }
    }
}

#[no_mangle]
pub extern "C" fn create(
    result: &mut *const HappyEyeballs,
    origin: *const nsACString,
    port: u16,
    alt_svc: *const ThinVec<AltSvc>,
    ip_preference: IpPreference,
) -> nsresult {
    *result = ptr::null_mut();

    let Some(origin) = (unsafe { origin.as_ref() }) else {
        debug_assert!(false, "unexpected null origin pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(alt_svc) = (unsafe { alt_svc.as_ref() }) else {
        debug_assert!(false, "unexpected null alt_svc pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let origin_str = origin.to_utf8().to_string();

    let alt_svc_vec: Vec<_> = alt_svc
        .iter()
        .map(|a| happy_eyeballs::AltSvc {
            host: None,
            port: None,
            protocol: a.protocol.into(),
        })
        .collect();

    let network_config = happy_eyeballs::NetworkConfig {
        alt_svc: alt_svc_vec,
        ip: ip_preference.into(),
        ..Default::default()
    };

    let raw_ptr = match happy_eyeballs::HappyEyeballs::new_with_network_config(
        origin_str.as_str(),
        port,
        network_config,
    ) {
        Ok(he) => {
            let mut boxed = Box::new(HappyEyeballs {
                refcnt: unsafe { AtomicRefcnt::new() },
                inner: he,
                profiler: profiler::Profiler::new(0, origin_str),
            });
            boxed
                .profiler
                .set_flow_id(std::ptr::from_ref(&boxed.refcnt) as u64);
            Box::into_raw(boxed)
        }
        Err(_) => return NS_ERROR_UNEXPECTED,
    };

    unsafe { addref(raw_ptr as *const _) };
    *result = raw_ptr;
    NS_OK
}

#[no_mangle]
pub extern "C" fn process_dns_response_a(
    he: *mut HappyEyeballs,
    id: u64,
    addrs: *const ThinVec<NetAddr>,
) -> nsresult {
    let Some(he) = (unsafe { he.as_mut() }) else {
        debug_assert!(false, "unexpected null he pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(addrs) = (unsafe { addrs.as_ref() }) else {
        debug_assert!(false, "unexpected null addrs pointer");
        return NS_ERROR_INVALID_ARG;
    };

    he.process_dns_response_a(id, addrs)
}

#[no_mangle]
pub extern "C" fn process_dns_response_aaaa(
    he: *mut HappyEyeballs,
    id: u64,
    addrs: *const ThinVec<NetAddr>,
) -> nsresult {
    let Some(he) = (unsafe { he.as_mut() }) else {
        debug_assert!(false, "unexpected null he pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(addrs) = (unsafe { addrs.as_ref() }) else {
        debug_assert!(false, "unexpected null addrs pointer");
        return NS_ERROR_INVALID_ARG;
    };

    he.process_dns_response_aaaa(id, addrs)
}

#[no_mangle]
pub extern "C" fn process_dns_response_https(
    he: *mut HappyEyeballs,
    id: u64,
    service_infos: *const ThinVec<ServiceInfo>,
) -> nsresult {
    let Some(he) = (unsafe { he.as_mut() }) else {
        debug_assert!(false, "unexpected null he pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(service_infos) = (unsafe { service_infos.as_ref() }) else {
        debug_assert!(false, "unexpected null service_infos pointer");
        return NS_ERROR_INVALID_ARG;
    };

    he.process_dns_response_https(id, service_infos)
}

#[no_mangle]
pub extern "C" fn process_connection_result(
    he: *mut HappyEyeballs,
    id: u64,
    status: nsresult,
) -> nsresult {
    let Some(he) = (unsafe { he.as_mut() }) else {
        debug_assert!(false, "unexpected null he pointer");
        return NS_ERROR_INVALID_ARG;
    };

    he.process_connection_result(id, status)
}

#[no_mangle]
pub extern "C" fn process_output(
    he: *mut HappyEyeballs,
    ret_event: *mut Output,
    ech_config: *mut ThinVec<u8>,
) -> nsresult {
    let Some(he) = (unsafe { he.as_mut() }) else {
        debug_assert!(false, "unexpected null he pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(ret_event) = (unsafe { ret_event.as_mut() }) else {
        debug_assert!(false, "unexpected null ret_event pointer");
        return NS_ERROR_INVALID_ARG;
    };

    let Some(ech_config) = (unsafe { ech_config.as_mut() }) else {
        debug_assert!(false, "unexpected null ech_config pointer");
        return NS_ERROR_INVALID_ARG;
    };

    he.process_output(ret_event, ech_config)
}

#[repr(C)]
pub struct HappyEyeballs {
    refcnt: AtomicRefcnt,
    inner: happy_eyeballs::HappyEyeballs,
    profiler: profiler::Profiler,
}

impl HappyEyeballs {
    fn process_dns_response_a(&mut self, id: u64, net_addrs: &ThinVec<NetAddr>) -> nsresult {
        let id: happy_eyeballs::Id = id.into();
        let mut addrs = Vec::with_capacity(net_addrs.len());
        for na in net_addrs.iter() {
            let family =
                i32::from(unsafe { moz_netaddr_get_family((na as *const NetAddr).cast()) });
            if family != AF_INET {
                debug_assert!(false, "got {} instead of AF_INET in A record", family);
                return NS_ERROR_UNEXPECTED;
            }
            let ip_be = unsafe { moz_netaddr_get_network_order_ip((na as *const NetAddr).cast()) };
            let ipv4 = Ipv4Addr::from(u32::from_be(ip_be));
            addrs.push(ipv4);
        }

        self.profiler.dns_response_a(id, &addrs);

        let result = happy_eyeballs::DnsResult::A(Ok(addrs));
        let input = happy_eyeballs::Input::DnsResult { id, result };
        self.inner.process_input(input, Instant::now());

        NS_OK
    }

    fn process_dns_response_aaaa(&mut self, id: u64, net_addrs: &ThinVec<NetAddr>) -> nsresult {
        let id: happy_eyeballs::Id = id.into();
        let mut addrs = Vec::with_capacity(net_addrs.len());
        for na in net_addrs.iter() {
            let family =
                i32::from(unsafe { moz_netaddr_get_family((na as *const NetAddr).cast()) });
            if family != AF_INET6 {
                debug_assert!(false, "got {} instead of AF_INET6 in AAAA record", family);
                return NS_ERROR_UNEXPECTED;
            }
            let p = unsafe { moz_netaddr_get_ipv6((na as *const NetAddr).cast()) };
            let octs: [u8; 16] = unsafe { std::slice::from_raw_parts(p, 16).try_into().unwrap() };
            let ipv6 = Ipv6Addr::from(octs);
            addrs.push(ipv6);
        }

        self.profiler.dns_response_aaaa(id, &addrs);

        let result = happy_eyeballs::DnsResult::Aaaa(Ok(addrs));
        let input = happy_eyeballs::Input::DnsResult { id, result };
        self.inner.process_input(input, Instant::now());

        NS_OK
    }

    fn process_dns_response_https(
        &mut self,
        id: u64,
        service_infos: &ThinVec<ServiceInfo>,
    ) -> nsresult {
        let id: happy_eyeballs::Id = id.into();
        let mut infos = Vec::new();

        for svc_info in service_infos {
            let target_str = svc_info.target_name.to_utf8();
            let target = if target_str.is_empty() {
                todo!()
            } else {
                happy_eyeballs::TargetName::from(target_str.as_ref())
            };

            let mut alpn_set = std::collections::HashSet::new();
            for protocol in &svc_info.alpn_protocols {
                alpn_set.insert((*protocol).into());
            }

            let ech = if svc_info.ech_config.is_empty() {
                None
            } else {
                Some(svc_info.ech_config.to_vec())
            };

            let mut ipv4_vec = Vec::new();
            for na in &svc_info.ipv4_hints {
                let family =
                    i32::from(unsafe { moz_netaddr_get_family((na as *const NetAddr).cast()) });
                debug_assert_eq!(family, AF_INET, "Expected IPv4 address in IPv4 hints");
                if family != AF_INET {
                    return NS_ERROR_UNEXPECTED;
                }
                let ip_be =
                    unsafe { moz_netaddr_get_network_order_ip((na as *const NetAddr).cast()) };
                let ipv4 = Ipv4Addr::from(u32::from_be(ip_be));
                ipv4_vec.push(ipv4);
            }

            let mut ipv6_vec = Vec::new();
            for na in &svc_info.ipv6_hints {
                let family =
                    i32::from(unsafe { moz_netaddr_get_family((na as *const NetAddr).cast()) });
                debug_assert_eq!(family, AF_INET6, "Expected IPv6 address in IPv6 hints");
                if family != AF_INET6 {
                    return NS_ERROR_UNEXPECTED;
                }
                let p = unsafe { moz_netaddr_get_ipv6((na as *const NetAddr).cast()) };
                let octs: [u8; 16] =
                    unsafe { std::slice::from_raw_parts(p, 16).try_into().unwrap() };
                let ipv6 = Ipv6Addr::from(octs);
                ipv6_vec.push(ipv6);
            }

            let port = if svc_info.port == 0 {
                None
            } else {
                Some(svc_info.port)
            };

            infos.push(happy_eyeballs::ServiceInfo {
                priority: svc_info.priority,
                target_name: target,
                alpn_protocols: alpn_set,
                ech_config: ech,
                ipv4_hints: ipv4_vec,
                ipv6_hints: ipv6_vec,
                port,
            });
        }

        self.profiler.dns_response_https(id, &infos);

        let result = happy_eyeballs::DnsResult::Https(Ok(infos));
        let input = happy_eyeballs::Input::DnsResult { id, result };
        self.inner.process_input(input, Instant::now());

        NS_OK
    }

    fn process_connection_result(&mut self, id: u64, status: nsresult) -> nsresult {
        let id: happy_eyeballs::Id = id.into();
        self.profiler.connection_result(id, status == NS_OK);

        let result = if status == NS_OK {
            Ok(())
        } else {
            Err(format!("connection failed: 0x{:08x}", status.0))
        };

        let input = happy_eyeballs::Input::ConnectionResult { id, result };
        self.inner.process_input(input, Instant::now());

        NS_OK
    }

    fn process_output(&mut self, ret_event: &mut Output, ech_config: &mut ThinVec<u8>) -> nsresult {
        let out = self.inner.process_output(std::time::Instant::now());
        ech_config.clear();
        match out {
            Some(happy_eyeballs::Output::SendDnsQuery {
                id,
                hostname: _hostname,
                record_type,
            }) => {
                self.profiler.dns_query_started(id);
                *ret_event = Output::SendDnsQuery {
                    id: id.into(),
                    record_type: record_type.into(),
                };
            }
            Some(happy_eyeballs::Output::Timer { duration, .. }) => {
                let duration_ms = match duration.as_millis() {
                    0 => 1,
                    ms => ms.try_into().unwrap_or_else(|_| {
                        debug_assert!(false, "duration > u64::MAX");
                        u64::MAX
                    }),
                };
                *ret_event = Output::Timer { duration_ms };
            }
            Some(happy_eyeballs::Output::AttemptConnection { id, endpoint }) => {
                self.profiler.connection_attempt_started(id, &endpoint);
                if let Some(ref ech) = endpoint.ech_config {
                    ech_config.extend_from_slice(ech);
                }
                *ret_event = Output::AttemptConnection {
                    id: id.into(),
                    protocol: endpoint.protocol.into(),
                    addr: endpoint.address.ip().into(),
                    port: endpoint.address.port(),
                };
            }
            Some(happy_eyeballs::Output::CancelConnection { id }) => {
                *ret_event = Output::CancelConnection { id: id.into() };
            }
            Some(happy_eyeballs::Output::Succeeded) => {
                *ret_event = Output::Succeeded;
            }
            Some(happy_eyeballs::Output::Failed) => {
                *ret_event = Output::Failed;
            }
            None => {
                *ret_event = Output::None;
            }
        }

        NS_OK
    }
}

// TODO: Expose ip and port.
#[repr(C)]
pub struct AltSvc {
    pub protocol: HttpVersion,
}

#[repr(C)]
pub enum DnsRecordType {
    Https = 0,
    Aaaa = 1,
    A = 2,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub enum HttpVersion {
    H3 = 0,
    H2 = 1,
    H1 = 2,
}

#[repr(C)]
pub enum ConnectionAttemptHttpVersions {
    H3 = 0,
    H2OrH1 = 1,
    H2 = 2,
    H1 = 3,
}

impl From<HttpVersion> for happy_eyeballs::HttpVersion {
    fn from(v: HttpVersion) -> Self {
        match v {
            HttpVersion::H3 => Self::H3,
            HttpVersion::H2 => Self::H2,
            HttpVersion::H1 => Self::H1,
        }
    }
}

impl From<happy_eyeballs::HttpVersion> for HttpVersion {
    fn from(v: happy_eyeballs::HttpVersion) -> Self {
        match v {
            happy_eyeballs::HttpVersion::H3 => Self::H3,
            happy_eyeballs::HttpVersion::H2 => Self::H2,
            happy_eyeballs::HttpVersion::H1 => Self::H1,
        }
    }
}

impl From<happy_eyeballs::DnsRecordType> for DnsRecordType {
    fn from(v: happy_eyeballs::DnsRecordType) -> Self {
        match v {
            happy_eyeballs::DnsRecordType::Https => Self::Https,
            happy_eyeballs::DnsRecordType::Aaaa => Self::Aaaa,
            happy_eyeballs::DnsRecordType::A => Self::A,
        }
    }
}

impl From<happy_eyeballs::ConnectionAttemptHttpVersions> for ConnectionAttemptHttpVersions {
    fn from(v: happy_eyeballs::ConnectionAttemptHttpVersions) -> Self {
        match v {
            happy_eyeballs::ConnectionAttemptHttpVersions::H3 => Self::H3,
            happy_eyeballs::ConnectionAttemptHttpVersions::H2OrH1 => Self::H2OrH1,
            happy_eyeballs::ConnectionAttemptHttpVersions::H2 => Self::H2,
            happy_eyeballs::ConnectionAttemptHttpVersions::H1 => Self::H1,
        }
    }
}

impl From<ConnectionAttemptHttpVersions> for happy_eyeballs::ConnectionAttemptHttpVersions {
    fn from(v: ConnectionAttemptHttpVersions) -> Self {
        match v {
            ConnectionAttemptHttpVersions::H3 => Self::H3,
            ConnectionAttemptHttpVersions::H2OrH1 => Self::H2OrH1,
            ConnectionAttemptHttpVersions::H2 => Self::H2,
            ConnectionAttemptHttpVersions::H1 => Self::H1,
        }
    }
}

impl From<happy_eyeballs::HttpVersion> for ConnectionAttemptHttpVersions {
    fn from(v: happy_eyeballs::HttpVersion) -> Self {
        match v {
            happy_eyeballs::HttpVersion::H3 => Self::H3,
            happy_eyeballs::HttpVersion::H2 => Self::H2,
            happy_eyeballs::HttpVersion::H1 => Self::H1,
        }
    }
}

#[repr(C)]
pub struct ServiceInfo {
    pub priority: u16,
    pub port: u16,
    pub target_name: nsCString,
    pub alpn_protocols: ThinVec<HttpVersion>,
    pub ech_config: ThinVec<u8>,
    pub ipv4_hints: ThinVec<NetAddr>,
    pub ipv6_hints: ThinVec<NetAddr>,
}

#[repr(C)]
pub enum IpAddr {
    V4([u8; 4]),
    V6([u8; 16]),
}

impl From<std::net::IpAddr> for IpAddr {
    fn from(ip: std::net::IpAddr) -> Self {
        match ip {
            std::net::IpAddr::V4(ipv4) => IpAddr::V4(ipv4.octets()),
            std::net::IpAddr::V6(ipv6) => IpAddr::V6(ipv6.octets()),
        }
    }
}

#[repr(C)]
pub enum Output {
    SendDnsQuery {
        id: u64,
        record_type: DnsRecordType,
    },
    Timer {
        duration_ms: u64,
    },
    AttemptConnection {
        id: u64,
        protocol: ConnectionAttemptHttpVersions,
        addr: IpAddr,
        port: u16,
    },
    CancelConnection {
        id: u64,
    },
    Succeeded,
    Failed,
    None,
}

#[no_mangle]
pub unsafe extern "C" fn release(happy_eyeballs: *const HappyEyeballs) {
    let Some(happy_eyeballs) = (unsafe { happy_eyeballs.as_ref() }) else {
        debug_assert!(false, "unexpected null happy_eyeballs pointer");
        return;
    };

    let rc = happy_eyeballs.refcnt.dec();
    if rc == 0 {
        drop(Box::from_raw(ptr::from_ref(happy_eyeballs).cast_mut()));
    }
}

#[no_mangle]
pub unsafe extern "C" fn addref(happy_eyeballs: *const HappyEyeballs) {
    let Some(happy_eyeballs) = (unsafe { happy_eyeballs.as_ref() }) else {
        debug_assert!(false, "unexpected null happy_eyeballs pointer");
        return;
    };

    happy_eyeballs.refcnt.inc();
}

// xpcom::RefPtr support
unsafe impl RefCounted for HappyEyeballs {
    unsafe fn addref(&self) {
        addref(self);
    }
    unsafe fn release(&self) {
        release(self);
    }
}

// Opaque interface to mozilla::net::NetAddr defined in DNS.h
#[repr(C)]
pub union NetAddr {
    _private: [u8; 0],
}

extern "C" {
    fn moz_netaddr_get_family(arg: *const NetAddr) -> u16;
    fn moz_netaddr_get_network_order_ip(arg: *const NetAddr) -> u32;
    fn moz_netaddr_get_ipv6(arg: *const NetAddr) -> *const u8;
}
