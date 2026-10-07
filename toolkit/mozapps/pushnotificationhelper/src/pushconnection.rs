/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::widestring;

use serde_json::Value;
use std::ffi::{c_void, CString, NulError};
use std::num::TryFromIntError;
use std::ptr;
use std::string::FromUtf8Error;
use thiserror::Error;
use url::{ParseError, Url};
use windows_sys::Win32::{Foundation::*, Networking::WinHttp::*};

fn check_win_api() -> u32 {
    unsafe { GetLastError() }
}

// TODO: drop once windows-sys names its own import libraries (Bug 2071329).
#[link(name = "winhttp")]
unsafe extern "system" {}

#[derive(Error, Debug)]
pub enum Error {
    #[error("WinHttpWebSocketCompleteUpgrade failed: {0}")]
    CompleteUpgrade(u32),
    #[error("Invalid number")]
    IntParseError(#[from] TryFromIntError),
    #[error("Invalid scheme. Not wss:// or ws://")]
    InvalidScheme,
    #[error("Invalid URL")]
    InvalidURL(#[from] ParseError),
    #[error("WinHttpConnect failed: {0}")]
    NoConnection(u32),
    #[error("No hostname")]
    NoHostName,
    #[error("WinHttpOpenRequest failed: {0}")]
    NoRequest(u32),
    #[error("WinHttpOpen failed: {0}")]
    NoSession(u32),
    #[error("No Websocket")]
    NoWebSocket,
    #[error("Unexpected null error")]
    NulError(#[from] NulError),
    #[error("WinHttpReceiveResponse failed: {0}")]
    ReceiveResponse(u32),
    #[error("WinHttpSendRequest failed: {0}")]
    SendRequest(u32),
    #[error("WinHttpSetOption failed: {0}")]
    SetOption(u32),
    #[error("Invalid UTF8")]
    Utf8Error(#[from] FromUtf8Error),
    #[error("WinHttpWebSocketReceive failed with error code {0}")]
    WebSocketReceive(u32),
    #[error("WinHttpWebSocketSend failed with error code {0}")]
    WebSocketSend(u32),
}

pub enum Event {
    Closed,
    Notification,
    Other(String),
    Uaid(String),
}

pub struct PushConnection {
    websocket: *mut c_void,
    connection: *mut c_void,
    session: *mut c_void,
}

impl PushConnection {
    pub fn new() -> PushConnection {
        PushConnection {
            websocket: ptr::null_mut(),
            connection: ptr::null_mut(),
            session: ptr::null_mut(),
        }
    }

    pub fn connect(&mut self, url_str: &str) -> Result<(), Error> {
        // Close the connection if one already existed to avoid leaking
        self.close();

        let url = Url::parse(url_str)?;
        if url.scheme() != "ws" && url.scheme() != "wss" {
            return Err(Error::InvalidScheme);
        }

        let user_agent = widestring::WideString::new("Firefox background notification");

        self.session = unsafe {
            WinHttpOpen(
                user_agent.pcwstr(),
                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                ptr::null(),
                ptr::null(),
                0,
            )
        };

        if self.session == ptr::null_mut() {
            return Err(Error::NoSession(check_win_api()));
        }

        let Some(host) = url.host_str() else {
            return Err(Error::NoHostName);
        };

        let hostname = widestring::WideString::new(host);
        let secure = url.scheme() == "wss";
        // ws and wss are a known default.
        let port = url.port_or_known_default().unwrap_or(if secure {
            INTERNET_DEFAULT_HTTPS_PORT
        } else {
            INTERNET_DEFAULT_HTTP_PORT
        });

        self.connection = unsafe { WinHttpConnect(self.session, hostname.pcwstr(), port, 0) };

        if self.connection == ptr::null_mut() {
            return Err(Error::NoConnection(check_win_api()));
        }

        let verb = widestring::WideString::new("GET");
        let path = widestring::WideString::new(&url[url::Position::BeforePath..]);
        let flags = if secure { WINHTTP_FLAG_SECURE } else { 0 };
        let request = unsafe {
            WinHttpOpenRequest(
                self.connection,
                verb.pcwstr(),
                path.pcwstr(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                flags,
            )
        };

        if request == ptr::null_mut() {
            return Err(Error::NoRequest(check_win_api()));
        }

        if 0 == unsafe {
            WinHttpSetOption(
                request,
                WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET,
                ptr::null(),
                0,
            )
        } {
            return Err(Error::SetOption(check_win_api()));
        }

        if 0 == unsafe { WinHttpSendRequest(request, ptr::null(), 0, ptr::null(), 0, 0, 0) } {
            return Err(Error::SendRequest(check_win_api()));
        }

        if 0 == unsafe { WinHttpReceiveResponse(request, ptr::null_mut()) } {
            return Err(Error::ReceiveResponse(check_win_api()));
        }

        self.websocket = unsafe { WinHttpWebSocketCompleteUpgrade(request, 0) };

        if self.websocket == ptr::null_mut() {
            return Err(Error::CompleteUpgrade(check_win_api()));
        }

        unsafe { WinHttpCloseHandle(request) };

        Ok(())
    }

    pub fn send(&self, message: &str) -> Result<bool, Error> {
        if self.websocket == ptr::null_mut() {
            return Err(Error::NoWebSocket);
        }

        let message_c = CString::new(message)?;
        let result = unsafe {
            WinHttpWebSocketSend(
                self.websocket,
                WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
                message_c.as_ptr() as *const c_void,
                message.len().try_into()?,
            )
        };

        if result != NO_ERROR {
            return Err(Error::WebSocketSend(result));
        }
        return Ok(result == NO_ERROR);
    }

    pub fn send_hello(&self, uaid: &str) -> Result<bool, Error> {
        let hello_msg = format!("{{\"messageType\":\"hello\",\"broadcasts\":{{}},\"use_webpush\":true,\"uaid\":\"{uaid}\"}}");

        return self.send(hello_msg.as_str());
    }

    /*
    pub fn send_keep_alive(&self) -> Result<bool, Error> {
        return self.send("{}");
    }
    */

    fn parse_message(message: &str) -> Event {
        let parsed_message = serde_json::from_str(message).unwrap_or_else(|_| Value::Null);

        let message_type = match &parsed_message["messageType"] {
            Value::String(mtype) => mtype,
            _ => {
                return Event::Other(message.to_owned());
            }
        };

        return match message_type.as_str() {
            "notification" => Event::Notification,
            "hello" => {
                let Some(uaid) = parsed_message["uaid"].as_str() else {
                    return Event::Other(message.to_owned());
                };
                Event::Uaid(uaid.to_owned())
            }
            _ => Event::Other(message.to_owned()),
        };
    }

    pub fn wait_for_message(&self) -> Result<Event, Error> {
        if self.websocket == ptr::null_mut() {
            return Err(Error::NoWebSocket);
        }

        let mut bytes_read: u32 = 0;
        let buffer_size: u32 = 8192;
        let mut buffer_type: WINHTTP_WEB_SOCKET_BUFFER_TYPE = WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE;

        let mut message_buffer: Vec<u8> = vec![];
        let mut buffer: Vec<u8> = vec![0; buffer_size as usize];
        loop {
            let result = unsafe {
                WinHttpWebSocketReceive(
                    self.websocket,
                    buffer.as_mut_ptr() as *mut c_void,
                    buffer_size,
                    &mut bytes_read as *mut u32,
                    &mut buffer_type as *mut WINHTTP_WEB_SOCKET_BUFFER_TYPE,
                )
            };

            if result != NO_ERROR {
                return Err(Error::WebSocketReceive(result));
            }

            if buffer_type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE {
                return Ok(Event::Closed);
            }

            message_buffer.extend(&buffer[..bytes_read as usize]);

            if buffer_type != WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE
                && buffer_type != WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE
            {
                continue;
            }

            let message = String::from_utf8(message_buffer)?;
            println!("Message: {message}");
            return Ok(Self::parse_message(&message));
        }
    }

    pub fn close(&mut self) {
        if self.websocket != ptr::null_mut() {
            unsafe {
                WinHttpWebSocketClose(
                    self.websocket,
                    WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS as u16,
                    ptr::null(),
                    0,
                );
                WinHttpCloseHandle(self.websocket);
            }
            self.websocket = ptr::null_mut();
        }

        if self.connection != ptr::null_mut() {
            unsafe {
                WinHttpCloseHandle(self.connection);
                self.connection = ptr::null_mut();
            }
        }

        if self.session != ptr::null_mut() {
            unsafe {
                WinHttpCloseHandle(self.session);
                self.session = ptr::null_mut();
            }
        }
    }
}

impl Drop for PushConnection {
    fn drop(&mut self) {
        self.close();
    }
}
