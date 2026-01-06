/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[cfg(any(target_os = "android", target_os = "linux"))]
use crate::platform::linux::{set_socket_cloexec, set_socket_default_flags};
#[cfg(target_os = "macos")]
use crate::platform::macos::{set_socket_cloexec, set_socket_default_flags};
use crate::{
    ignore_eintr, platform::PlatformError, IntoRawAncillaryData, ProcessHandle, IO_TIMEOUT,
};

use nix::{
    cmsg_space,
    errno::Errno,
    poll::{poll, PollFd, PollFlags, PollTimeout},
    sys::socket::{recvmsg, sendmsg, ControlMessage, ControlMessageOwned, MsgFlags},
};
use std::{
    ffi::{CStr, CString},
    io::{IoSlice, IoSliceMut},
    os::fd::{AsFd, AsRawFd, FromRawFd, IntoRawFd, OwnedFd, RawFd},
    str::FromStr,
};

use crate::{
    errors::IPCError,
    messages::{self, Message},
};

pub type RawAncillaryData = RawFd;
pub type AncillaryData = OwnedFd;

impl IntoRawAncillaryData for AncillaryData {
    fn into_raw(self) -> RawAncillaryData {
        self.into_raw_fd()
    }
}

// This must match `kInvalidHandle` in `mfbt/UniquePtrExt.h`
pub const INVALID_ANCILLARY_DATA: RawAncillaryData = -1;

pub type IPCConnectorKey = RawFd;

pub struct IPCConnector {
    socket: OwnedFd,
}

impl IPCConnector {
    /// Create a new connector from an already connected socket. The
    /// `FD_CLOEXEC` flag will be set on the underlying socket and thus it
    /// will not be possible to inerhit this connector in a child process.
    pub(crate) fn from_fd(socket: OwnedFd) -> Result<IPCConnector, IPCError> {
        let connector = IPCConnector::from_fd_inheritable(socket)?;
        set_socket_cloexec(connector.socket.as_fd()).map_err(IPCError::CreationFailure)?;
        Ok(connector)
    }

    /// Create a new connector from an already connected socket. The
    /// `FD_CLOEXEC` flag will not be set on the underlying socket and thus it
    /// will be possible to inherit this connector in a child process.
    pub(crate) fn from_fd_inheritable(socket: OwnedFd) -> Result<IPCConnector, IPCError> {
        set_socket_default_flags(socket.as_fd()).map_err(IPCError::CreationFailure)?;
        Ok(IPCConnector { socket })
    }

    pub fn from_ancillary(socket: AncillaryData) -> Result<IPCConnector, IPCError> {
        IPCConnector::from_fd(socket)
    }

    /// Create a connector from a raw file descriptor.
    ///
    /// # Safety
    ///
    /// The `ancillary_data` argument must be an open file descriptor
    /// representing a connected Unix socket.
    pub unsafe fn from_raw_ancillary(
        ancillary_data: RawAncillaryData,
    ) -> Result<IPCConnector, IPCError> {
        IPCConnector::from_fd(OwnedFd::from_raw_fd(ancillary_data))
    }

    pub fn set_process(&mut self, _process: ProcessHandle) {}

    /// Serialize this connector into a string that can be passed on the
    /// command-line to a child process. This only works for newly
    /// created connectors because they are explicitly created as inheritable.
    pub fn serialize(&self) -> CString {
        CString::new(self.as_raw().to_string()).unwrap()
    }

    /// Deserialize a connector from an argument passed on the command-line.
    pub fn deserialize(string: &CStr) -> Result<IPCConnector, IPCError> {
        let string = string.to_str().map_err(|_e| IPCError::ParseError)?;
        let fd = RawFd::from_str(string).map_err(|_e| IPCError::ParseError)?;
        // SAFETY: This is a file descriptor we passed in ourselves.
        let socket = unsafe { OwnedFd::from_raw_fd(fd) };
        Ok(IPCConnector { socket })
    }

    pub fn into_ancillary(self) -> AncillaryData {
        self.socket
    }

    pub fn into_raw_ancillary(self) -> RawAncillaryData {
        self.socket.into_raw()
    }

    pub(crate) fn as_raw(&self) -> RawFd {
        self.socket.as_raw_fd()
    }

    pub fn key(&self) -> IPCConnectorKey {
        self.socket.as_raw_fd()
    }

    fn poll(&self, flags: PollFlags) -> Result<(), PlatformError> {
        let timeout = PollTimeout::from(IO_TIMEOUT);
        let res = ignore_eintr!(poll(
            &mut [PollFd::new(self.socket.as_fd(), flags)],
            timeout
        ));
        match res {
            Err(e) => Err(PlatformError::PollFailure(e)),
            Ok(_res @ 0) => Err(PlatformError::PollFailure(Errno::EAGAIN)),
            Ok(_) => Ok(()),
        }
    }

    pub fn send_message<T>(&self, message: T) -> Result<(), IPCError>
    where
        T: Message,
    {
        self.send(&message.header(), None)
            .map_err(IPCError::TransmissionFailure)?;
        let (payload, ancillary_data) = message.into_payload();
        self.send(&payload, ancillary_data)
            .map_err(IPCError::TransmissionFailure)
    }

    pub fn recv_reply<T>(&self) -> Result<T, IPCError>
    where
        T: Message,
    {
        // HACK: Workaround for a macOS-specific bug
        #[cfg(target_os = "macos")]
        self.poll(PollFlags::POLLIN)
            .map_err(IPCError::ReceptionFailure)?;

        let header = self.recv_header()?;

        if header.kind != T::kind() {
            return Err(IPCError::UnexpectedMessage(header.kind));
        }

        let (data, _) = self.recv(header.size)?;
        T::decode(&data, None).map_err(IPCError::from)
    }

    fn send_nonblock(&self, buff: &[u8], fd: &Option<AncillaryData>) -> Result<(), PlatformError> {
        let iov = [IoSlice::new(buff)];
        let scm_fds: Vec<i32> = fd.iter().map(|fd| fd.as_raw_fd()).collect();
        let scm = ControlMessage::ScmRights(&scm_fds);

        let res = ignore_eintr!(sendmsg::<()>(
            self.as_raw(),
            &iov,
            &[scm],
            MsgFlags::empty(),
            None
        ));

        match res {
            Ok(bytes_sent) => {
                if bytes_sent == buff.len() {
                    Ok(())
                } else {
                    Err(PlatformError::SendTooShort {
                        expected: buff.len(),
                        sent: bytes_sent,
                    })
                }
            }
            Err(code) => Err(PlatformError::SendFailure(code)),
        }
    }

    fn send(&self, buff: &[u8], fd: Option<AncillaryData>) -> Result<(), PlatformError> {
        let res = self.send_nonblock(buff, &fd);
        match res {
            Err(PlatformError::SendFailure(Errno::EAGAIN)) => {
                // If the socket was not ready to send data wait for it to
                // become unblocked then retry sending just once.
                self.poll(PollFlags::POLLOUT)?;
                self.send_nonblock(buff, &fd)
            }
            _ => res,
        }
    }

    pub(crate) fn recv_header(&self) -> Result<messages::Header, IPCError> {
        let (header, _) = self.recv(messages::HEADER_SIZE)?;
        messages::Header::decode(&header).map_err(IPCError::BadMessage)
    }

    fn recv_nonblock(
        &self,
        expected_size: usize,
    ) -> Result<(Vec<u8>, Option<AncillaryData>), PlatformError> {
        let mut buff: Vec<u8> = vec![0; expected_size];
        let mut cmsg_buffer = cmsg_space!(RawFd);
        let mut iov = [IoSliceMut::new(&mut buff)];

        let res = ignore_eintr!(recvmsg::<()>(
            self.as_raw(),
            &mut iov,
            Some(&mut cmsg_buffer),
            MsgFlags::empty(),
        ));

        // I know this looks weird, but bear with me. On macOS 10.15 every
        // other recvmsg() call returns ENOMEM for no apparent reason. But then
        // if works *fine* if you call it again with the same parameters. This
        // makes no sense but OK, I stopped trying to understand macOS a long
        // time ago. on macOS 15+ this isn't needed but since I can't test it
        // everywhere and it doesn't hurt anyway, every version gets the same
        // workaround.
        let res = match res {
            #[cfg(target_os = "macos")]
            Err(_code @ Errno::ENOMEM) => ignore_eintr!(recvmsg::<()>(
                self.as_raw(),
                &mut iov,
                Some(&mut cmsg_buffer),
                MsgFlags::empty(),
            ))?,
            Err(e) => return Err(PlatformError::ReceiveFailure(e)),
            Ok(val) => val,
        };

        let fd = if let Some(cmsg) = res.cmsgs()?.next() {
            if let ControlMessageOwned::ScmRights(fds) = cmsg {
                fds.first().map(|&fd| unsafe { OwnedFd::from_raw_fd(fd) })
            } else {
                return Err(PlatformError::ReceiveMissingCredentials);
            }
        } else {
            None
        };

        if res.bytes != expected_size {
            return Err(PlatformError::ReceiveTooShort {
                expected: expected_size,
                received: res.bytes,
            });
        }

        Ok((buff, fd))
    }

    pub fn recv(&self, expected_size: usize) -> Result<(Vec<u8>, Option<AncillaryData>), IPCError> {
        let res = self.recv_nonblock(expected_size);
        match res {
            Err(PlatformError::ReceiveFailure(Errno::EAGAIN)) => {
                // If the socket was not ready to receive data wait for it to
                // become unblocked then retry receiving just once.
                self.poll(PollFlags::POLLIN)
                    .map_err(IPCError::ReceptionFailure)?;
                self.recv_nonblock(expected_size)
            }
            _ => res,
        }
        .map_err(IPCError::ReceptionFailure)
    }
}
