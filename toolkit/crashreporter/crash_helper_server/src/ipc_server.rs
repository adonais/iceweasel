/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use anyhow::Result;
use crash_helper_common::{
    messages::Header, AncillaryData, IPCConnector, IPCConnectorKey, IPCEvent, IPCListener, IPCQueue,
};
use std::{collections::HashMap, rc::Rc};

use crate::crash_generation::{CrashGenerator, MessageResult};

#[derive(PartialEq)]
pub enum IPCServerState {
    Running,
    ClientDisconnected,
}

#[derive(PartialEq)]
enum IPCEndpoint {
    Parent, // A connection to the parent process

    Child, // A connection to the child process
    #[allow(dead_code)]
    External, // A connection to an external process
}

struct IPCConnection {
    connector: Rc<IPCConnector>,
    endpoint: IPCEndpoint,
}

pub(crate) struct IPCServer {
    /// Platform-specific mechanism to wait for events. This will contain
    /// references to the connectors so needs to be the first element in
    /// the structure so that it's dropped first.
    queue: IPCQueue,
    connections: HashMap<IPCConnectorKey, IPCConnection>,
}

impl IPCServer {
    pub(crate) fn new(listener: IPCListener, connector: IPCConnector) -> Result<IPCServer> {
        let connector = Rc::new(connector);
        let mut queue = IPCQueue::new(listener)?;
        queue.add_connector(&connector)?;

        let mut connections = HashMap::with_capacity(10);
        connections.insert(
            connector.key(),
            IPCConnection {
                connector,
                endpoint: IPCEndpoint::Parent,
            },
        );

        Ok(IPCServer { queue, connections })
    }

    pub(crate) fn run(&mut self, generator: &mut CrashGenerator) -> Result<IPCServerState> {
        let events = self.queue.wait_for_events()?;

        for event in events.into_iter() {
            match event {
                IPCEvent::Connect(connector) => {
                    self.connections.insert(
                        connector.key(),
                        IPCConnection {
                            connector,
                            endpoint: IPCEndpoint::External,
                        },
                    );
                }
                IPCEvent::Message(key, header, payload, ancillary_data) => {
                    if let Err(error) =
                        self.handle_message(key, &header, payload, ancillary_data, generator)
                    {
                        log::error!(
                            "Error {error} when handling a message of kind {:?}",
                            header.kind
                        );
                    }
                }
                IPCEvent::Disconnect(key) => {
                    let connection = self
                        .connections
                        .remove(&key)
                        .expect("Disconnection event but no corresponding connection");

                    if connection.endpoint == IPCEndpoint::Parent {
                        // The main process disconnected, leave
                        return Ok(IPCServerState::ClientDisconnected);
                    }
                }
            }
        }

        Ok(IPCServerState::Running)
    }

    fn handle_message(
        &mut self,
        key: IPCConnectorKey,
        header: &Header,
        data: Vec<u8>,
        ancillary_data: Option<AncillaryData>,
        generator: &mut CrashGenerator,
    ) -> Result<()> {
        let connection = self
            .connections
            .get(&key)
            .expect("Event received on non-existing connection");
        let connector = &connection.connector;

        match connection.endpoint {
            IPCEndpoint::Parent => {
                let res =
                    generator.parent_message(connector, header.kind, &data, ancillary_data)?;
                if let MessageResult::Connection(connector) = res {
                    let connector = Rc::new(connector);
                    self.queue.add_connector(&connector)?;
                    self.connections.insert(
                        connector.key(),
                        IPCConnection {
                            connector,
                            endpoint: IPCEndpoint::Child,
                        },
                    );
                }
            }
            IPCEndpoint::Child => {
                generator.child_message(header.kind, &data, ancillary_data)?;
            }
            IPCEndpoint::External => {
                generator.external_message(connector, header.kind, &data, ancillary_data)?;
            }
        };

        Ok(())
    }
}
