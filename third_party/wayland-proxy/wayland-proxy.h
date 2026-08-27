/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _wayland_proxy_h_
#define _wayland_proxy_h_

#include <poll.h>
#include <time.h>
#include <vector>
#include <fcntl.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <string>

class ProxiedConnection;

typedef void (*ThreadCallback)();
typedef void (*CompositorUnavailableHandler)();
// Called from the proxy thread when the compositor closes a connection without
// a Wayland protocol error while the compositor process is still alive.
// aFailureTime is the clock() value when the connection failure was first
// detected, for correlating with silently-ignored WlLogHandler messages.
typedef void (*CompositorSilentDisconnectHandler)(clock_t aFailureTime);

#define WAYLAND_PROXY_ENABLED                       (1 << 0)
#define WAYLAND_PROXY_DISABLED                      (1 << 1)
#define WAYLAND_PROXY_RUN_FAILED                    (1 << 2)
#define WAYLAND_PROXY_TERMINATED                    (1 << 3)
#define WAYLAND_PROXY_CONNECTION_ADDED              (1 << 4)
#define WAYLAND_PROXY_CONNECTION_REMOVED            (1 << 5)
#define WAYLAND_PROXY_APP_TERMINATED                (1 << 6)
#define WAYLAND_PROXY_APP_CONNECTION_FAILED         (1 << 7)
#define WAYLAND_PROXY_COMPOSITOR_ATTACHED           (1 << 8)
#define WAYLAND_PROXY_COMPOSITOR_CONNECTION_FAILED  (1 << 9)
#define WAYLAND_PROXY_COMPOSITOR_SOCKET_FAILED      (1 << 10)

class WaylandProxy {
 public:
  static std::unique_ptr<WaylandProxy> Create();

  // Launch an application with Wayland proxy set
  bool RunChildApplication(char* argv[]);

  // Run proxy as part of already running application
  // and set Wayland proxy display for it.
  bool RunThread();

  // Set original Wayland display env variable and clear
  // proxy display file.
  void RestoreWaylandDisplay();

  static void SetVerbose(bool aVerbose);
  static void SetThreadStartCallback(ThreadCallback aCallback);
  static void SetThreadStopCallback(ThreadCallback aCallback);
  static void SetCompositorUnavailableHandler(
      CompositorUnavailableHandler aHandler);
  static void CompositorUnavailable();
  static void SetCompositorSilentDisconnectHandler(
      CompositorSilentDisconnectHandler aHandler);
  static void CompositorSilentDisconnect(clock_t aFailureTime);
  static bool IsCompositorGone() { return sCompositorGone; }
  static void AddState(unsigned aState);
  static const char* GetState();

  // Keep the text of the compositor's wl_display.error messages, so the crash
  // handler can report the real reason.
  //
  // Needed because libwayland throws the error text away when the error refers
  // to a server-allocated object we have already destroyed (the "unknown
  // object" case). See bug 2039706.
  //
  // Must be called before Create(): the scanner tracks Wayland message
  // boundaries from the first byte the proxy forwards, so turning capture on
  // later starts it in the middle of a message, and the protocol has no marker
  // to resync on.
  static void SetCaptureProtocolErrors(bool aEnable);
  static bool CaptureProtocolErrors() { return sCaptureProtocolErrors; }
  // Record the latest wl_display.error message and print it to stderr. Called
  // on the proxy thread.
  static void SetLastProtocolError(const char* aMessage);
  // Return the latest captured wl_display.error message, or an empty string if
  // none was captured. The result is strdup'd and owned by the caller. Called
  // on the main thread from the crash handler.
  static const char* GetLastProtocolError();

  ~WaylandProxy();

 private:
  bool Init();
  void Run();

  void SetWaylandProxyDisplay();
  static void* RunProxyThread(WaylandProxy* aProxy);
  bool CheckWaylandDisplay(const char* aWaylandDisplay);

  bool SetupWaylandDisplays();
  bool StartProxyServer();
  bool IsChildAppTerminated();

  bool PollConnections();
  bool ProcessConnections();

  void Info(const char* aFormat, ...);
  void Warning(const char* aOperation);
  void Error(const char* aOperation);
  void ErrorPlain(const char* aFormat, ...);

  void CheckCompositor();

 private:
  // List of all Compositor <-> Application connections
  std::vector<std::unique_ptr<ProxiedConnection>> mConnections;
  int mProxyServerSocket = -1;
  pid_t mApplicationPID = 0;
  std::atomic<bool> mThreadRunning = false;
  pthread_t mThread;

  // sockaddr_un has hardcoded max len of sun_path
  static constexpr int sMaxDisplayNameLen = 108;
  // Name of Wayland display provided by compositor
  char mWaylandDisplay[sMaxDisplayNameLen];
  // Name of Wayland display provided by us
  char mWaylandProxy[sMaxDisplayNameLen];

  static ThreadCallback sThreadStartCallback;
  static ThreadCallback sThreadStopCallback;
  static CompositorUnavailableHandler sCompositorUnavailableHandler;
  static CompositorSilentDisconnectHandler sCompositorSilentDisconnectHandler;
  // Set when the compositor display socket has disappeared (compositor crashed
  // or session ended). Once set, draining application sockets is the only
  // thing WaylandProxy does, keeping them open so GTK never sees a broken pipe
  // while graceful shutdown proceeds on the main thread.
  static std::atomic<bool> sCompositorGone;
  static std::atomic<unsigned> sProxyStateFlags;

  static bool sCaptureProtocolErrors;
  static std::mutex sLastProtocolErrorMutex;
  static std::string sLastProtocolError;
};

#endif  // _wayland_proxy_h_
