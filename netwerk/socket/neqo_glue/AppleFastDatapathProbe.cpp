/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AppleFastDatapathProbe.h"

#include <dlfcn.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/types.h>

#include "mozilla/ErrorNames.h"
#include "mozilla/Logging.h"
#include "mozilla/StaticPrefs_network.h"
#include "mozilla/UniquePtrExtensions.h"
#include "mozilla/glean/NetwerkMetrics.h"
#include "mozilla/net/neqo_glue_ffi_generated.h"
#include "nsThreadUtils.h"
#include "nsXULAppAPI.h"

namespace mozilla::net {

namespace {

LazyLogModule gAppleFastDatapathLog("AppleFastDatapath");

using ProbeResult = glean::network::AppleFastDatapathProbeLabel;

ProbeResult ProbeAppleFastDatapath() {
  // Fast-fail if the private symbols are not present.
  if (!dlsym(RTLD_DEFAULT, "sendmsg_x") || !dlsym(RTLD_DEFAULT, "recvmsg_x")) {
    return ProbeResult::eSymbolsMissing;
  }

  // Create two UDP sockets bound to localhost, mirroring neqo's usage of
  // unconnected sockets where the destination is specified per-datagram.
  auto makeSocket = []() -> UniqueFileHandle {
    UniqueFileHandle fd(socket(AF_INET, SOCK_DGRAM, 0));
    if (!fd) {
      return nullptr;
    }
    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(fd.get(), reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
      return nullptr;
    }
    return fd;
  };

  UniqueFileHandle sendFd = makeSocket();
  UniqueFileHandle recvFd = makeSocket();
  if (!sendFd || !recvFd) {
    return ProbeResult::eSocketFailed;
  }
  return neqo_glue_probe_apple_fast_path(sendFd.get(), recvFd.get())
             ? ProbeResult::eAvailable
             : ProbeResult::eProbeFailed;
}

void HandleProbeResult(ProbeResult aResult) {
  glean::network::apple_fast_datapath_probe.EnumGet(aResult).Add();
  glean::network::apple_fast_datapath_used.Set(aResult ==
                                               ProbeResult::eAvailable);
  if (aResult == ProbeResult::eAvailable) {
    neqo_glue_enable_apple_fast_path();
  }
}

}  // namespace

void StartAppleFastDatapathProbe() {
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(NS_IsMainThread());

  static bool sStarted = false;
  if (sStarted) {
    return;
  }
  sStarted = true;
  if (!StaticPrefs::network_http_http3_apple_fast_datapath()) {
    HandleProbeResult(ProbeResult::ePrefDisabled);
    return;
  }

  nsresult rv = NS_DispatchBackgroundTask(
      NS_NewRunnableFunction("net::AppleFastDatapathProbe", []() {
        ProbeResult result = ProbeAppleFastDatapath();
        MOZ_LOG(gAppleFastDatapathLog, LogLevel::Debug,
                ("Apple fast datapath probe: result=%u", unsigned(result)));
        HandleProbeResult(result);
      }));
  if (NS_FAILED(rv)) {
    MOZ_LOG(gAppleFastDatapathLog, LogLevel::Warning,
            ("Apple fast datapath probe dispatch failed: %s",
             GetStaticErrorName(rv)));
  }
}

}  // namespace mozilla::net
