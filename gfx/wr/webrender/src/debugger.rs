/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
 
use crate::{DebugCommand, RenderApi};
use crate::profiler::Profiler;
use std::collections::HashMap;
use api::crossbeam_channel;
use api::DebugFlags;
use api::debugger::{DebuggerMessage, SetDebugFlagsMessage, ProfileCounterDescriptor};
use api::debugger::{UpdateProfileCountersMessage, InitProfileCountersMessage, ProfileCounterId};
use std::thread;
use tiny_http::{Server, Response, ReadWrite, Method};
use base64::prelude::*;
use api::channel::Sender;
use sha1::{Sha1, Digest};

/// Implements the WR remote debugger interface, that the `wrshell` application
/// can connect to when the cargo feature `debugger` is enabled. There are two
/// communication channels available. First, a simple HTTP server that listens
/// for commands and can act on those and/or return query results about WR
/// internal state. Second, a client can optionally connect to the /debugger-socket
/// endpoint for real time updates. This will be upgraded to a websocket connection
/// allowing the WR instance to stream information to client(s) as appropriate. To
/// ensure that we take on minimal dependencies in to Gecko, we use the tiny_http
/// library, and manually perform the websocket connection upgrade below. 

/// Details about the type of debug query being requested
#[derive(Clone)]
pub enum DebugQueryKind {
    /// Query the current spatial tree
    SpatialTree {

    },
}

/// Details about the debug query being requested
#[derive(Clone)]
pub struct DebugQuery {
    /// Kind of debug query (filters etc)
    pub kind: DebugQueryKind,
    /// Where result should be sent
    pub result: Sender<String>,
}

/// A remote debugging client. These are stored with a stream that can publish
/// realtime events to (such as debug flag changes, profile counter updates etc).
pub struct DebuggerClient {
    stream: Box<dyn ReadWrite + Send>,
}

impl DebuggerClient {
    /// Send a debugger message to this client
    fn send_msg(
        &mut self,
        msg: DebuggerMessage,
    ) -> bool {
        let data = serde_json::to_string(&msg).expect("bug");
        let data = construct_server_ws_frame(&data);

        if let Ok(..) = self.stream.write(&data) {
            if let Ok(..) = self.stream.flush() {
                return true;
            }
        }

        false
    }
}

/// The main debugger interface that exists in a WR instance
pub struct Debugger {
    /// List of currently connected debug clients
    clients: Vec<DebuggerClient>,
}

impl Debugger {
    pub fn new() -> Self {
        Debugger {
            clients: Vec::new(),
        }
    }

    /// Add a newly connected client
    pub fn add_client(
        &mut self,
        mut client: DebuggerClient,
        debug_flags: DebugFlags,
        profiler: &Profiler,
    ) {
        // Send initial state to client
        let msg = SetDebugFlagsMessage {
            flags: debug_flags,
        };
        if client.send_msg(DebuggerMessage::SetDebugFlags(msg)) {
            let mut counters = Vec::new();
            for (id, counter) in profiler.counters().iter().enumerate() {
                counters.push(ProfileCounterDescriptor {
                    id: ProfileCounterId(id),
                    name: counter.name.into(),
                });
            }
            let msg = InitProfileCountersMessage {
                counters
            };
            if client.send_msg(DebuggerMessage::InitProfileCounters(msg)) {
                // Successful initial connection, add to list for per-frame updates
                self.clients.push(client);
            }
        }
    }

    /// Per-frame update. Stream any important updates to connected debug clients.
    /// On error, the client is dropped from the active connections.
    pub fn update(
        &mut self,
        debug_flags: DebugFlags,
        profiler: &Profiler,
    ) {
        let mut clients_to_keep = Vec::new();

        for mut client in self.clients.drain(..) {
            let msg = SetDebugFlagsMessage {
                flags: debug_flags,
            };
            if client.send_msg(DebuggerMessage::SetDebugFlags(msg)) {
                let updates = profiler.collect_updates_for_debugger();

                let counters = UpdateProfileCountersMessage {
                    updates,
                };
                if client.send_msg(DebuggerMessage::UpdateProfileCounters(counters)) {
                    clients_to_keep.push(client);
                }
            }
        }   

        self.clients = clients_to_keep;
    }
}

/// Start the debugger thread that listens for requests from clients.
pub fn start(api: RenderApi) {
    let address = "localhost:3583";
    let base_url = url::Url::parse(&format!("http://{}", address)).expect("bad url");

    println!("Start debug server on {}", base_url);

    thread::spawn(move || {
        let server = Server::http(address).unwrap();

        for mut request in server.incoming_requests() {
            let url = base_url.join(request.url()).expect("bad url");
            let args: HashMap<String, String> = url.query_pairs().into_owned().collect();

            match url.path() {
                "/ping" => {
                    // Client can check if server is online and accepting connections
                    request.respond(Response::from_string("pong")).ok();
                }
                "/debug-flags" => {
                    // Get or set the current debug flags 
                    match request.method() {
                        Method::Get => {
                            let debug_flags = api.get_debug_flags();
                            let result = serde_json::to_string(&debug_flags).unwrap();
                            request.respond(Response::from_string(result)).ok();
                        }
                        Method::Post => {
                            let mut content = String::new();
                            request.as_reader().read_to_string(&mut content).unwrap();

                            let flags = serde_json::from_str(&content).expect("bug");
                            api.send_debug_cmd(
                                DebugCommand::SetFlags(flags)
                            );
                            request.respond(Response::from_string(format!("flags = {:?}", flags))).ok();
                        }
                        _ => {
                            request.respond(Response::empty(403)).ok();
                        }
                    }
                }
                "/generate-frame" => {
                    // Force generate a frame-build and composite
                    api.send_debug_cmd(
                        DebugCommand::GenerateFrame
                    );
                    request.respond(Response::empty(200)).ok();
                }
                "/query" => {
                    // Query internal state about WR.
                    match args.get("type").map(|s| s.as_str()) {
                        Some("spatial-tree") => {
                            let (tx, rx) = crossbeam_channel::unbounded();
                            let query = DebugQuery {
                                result: tx,
                                kind: DebugQueryKind::SpatialTree {

                                },
                            };
                            api.send_debug_cmd(
                                DebugCommand::Query(query)
                            );
                            let result = rx.recv().expect("no response");
                            request.respond(Response::from_string(result)).ok();
                        }
                        _ => {
                            request.respond(Response::from_string("Unknown query")).ok();
                        }
                    }
                }
                "/debugger-socket" => {
                    // Connect to a realtime stream of events from WR. This is handled
                    // by upgrading the HTTP request to a websocket.

                    match request
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv(&"Upgrade")) {
                        Some(h) if h.value == "websocket" => {}
                        _ => {
                            request.respond(Response::empty(404)).ok();
                            return;
                        }
                    }

                    let key = match request
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv(&"Sec-WebSocket-Key"))
                        .map(|h| &h.value)
                    {
                        Some(k) => k,
                        None => {
                            request.respond(Response::empty(400)).ok();
                            return;
                        }
                    };

                    // 101 Switching Protocols response
                    let response = tiny_http::Response::new_empty(tiny_http::StatusCode(101))
                        .with_header("Upgrade: websocket".parse::<tiny_http::Header>().unwrap())
                        .with_header("Connection: Upgrade".parse::<tiny_http::Header>().unwrap())
                        .with_header(
                            format!("Sec-WebSocket-Accept: {}", convert_ws_key(key.as_str()))
                                .parse::<tiny_http::Header>()
                                .unwrap(),
                        );
                    let stream = request.upgrade("websocket", response);

                    // Send the upgraded connection to WR so it can start streaming
                    api.send_debug_cmd(
                        DebugCommand::AddDebugClient(DebuggerClient {
                            stream,
                        })
                    );
                }
                _ => {
                    request.respond(Response::empty(404)).ok();
                }
            }
        }
    });
}

/// See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-WebSocket-Key
/// See https://datatracker.ietf.org/doc/html/rfc6455#section-11.3.1
fn convert_ws_key(input: &str) -> String {
    let mut input = input.to_string().into_bytes();
    let mut bytes = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        .to_string()
        .into_bytes();
    input.append(&mut bytes);

    let sha1 = Sha1::digest(&input);
    BASE64_STANDARD.encode(sha1)
}

/// Convert a string to a websocket text frame
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#exchanging_data_frames
pub fn construct_server_ws_frame(payload: &str) -> Vec<u8> {
    let payload_bytes = payload.as_bytes();
    let payload_len = payload_bytes.len();
    let mut frame = Vec::new();

    frame.push(0x81);

    if payload_len <= 125 {
        frame.push(payload_len as u8);
    } else if payload_len <= 65535 {
        frame.push(126 as u8);
        frame.extend_from_slice(&(payload_len as u16).to_be_bytes());
    } else {
        frame.push(127 as u8);
        frame.extend_from_slice(&(payload_len as u64).to_be_bytes());
    }

    frame.extend_from_slice(payload_bytes);

    frame
}
