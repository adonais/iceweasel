/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TargetGeckoServicesImpl.h"

#include "mozilla/Logging.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/sandboxing/TargetGeckoServices.h"
#include "nsString.h"

namespace mozilla {
static LazyLogModule sSandboxTargetLog("SandboxTarget");
}  // namespace mozilla

namespace geckoprofiler::markers {

struct SandboxSyscall : public mozilla::BaseMarkerType<SandboxSyscall> {
  static constexpr const char* Name = "sandboxsyscall";
  static constexpr bool StoreName = true;

  using MS = mozilla::MarkerSchema;
  static constexpr MS::PayloadField PayloadFields[] = {
      {"Result", MS::InputType::CString, "Result", MS::Format::String},
      {"Path", MS::InputType::String, "Path", MS::Format::SanitizedString},
  };
  static constexpr MS::Location Locations[] = {MS::Location::MarkerChart,
                                               MS::Location::MarkerTable};
  static constexpr const char* TableLabel =
      "{marker.name} {marker.data.Result} {marker.data.Path}";
};

}  // namespace geckoprofiler::markers

namespace mozilla::sandboxing {

static void MarkIntervalStart(std::string_view aName) {
  PROFILER_MARKER_UNTYPED(ProfilerString8View{aName}, SANDBOX,
                          MarkerOptions(MarkerTiming::IntervalStart()));
}

static void MarkIntervalEnd(std::string_view aName) {
  PROFILER_MARKER_UNTYPED(
      ProfilerString8View{aName}, SANDBOX,
      MarkerOptions(MarkerTiming::IntervalEnd(), MarkerStack::Capture()));
}

static void MarkSyscallBrokeringIntervalEnd(std::string_view aName,
                                            std::wstring_view aContext,
                                            bool aBrokered) {
  const std::string_view result = aBrokered ? "Allowed" : "Blocked";

  const ProfilerString8View name{aName};
  ProfilerString16View path{reinterpret_cast<const char16_t*>(aContext.data()),
                            aContext.size()};
  PROFILER_MARKER(
      name, SANDBOX,
      MarkerOptions(MarkerTiming::IntervalEnd(), MarkerStack::Capture()),
      SandboxSyscall, ProfilerString8View{result}, path);

  LogLevel level = aBrokered ? LogLevel::Info : LogLevel::Warning;
  if (!MOZ_LOG_TEST(sSandboxTargetLog, level)) {
    return;
  }

  const NS_ConvertUTF16toUTF8 ctx(
      reinterpret_cast<const char16_t*>(aContext.data()),
      static_cast<uint32_t>(aContext.size()));
  MOZ_LOG(sSandboxTargetLog, level,
          ("Process Sandbox: %s %.*s%s%s", result.data(),
           static_cast<int>(aName.size()), aName.data(),
           aContext.empty() ? "" : " for: ", ctx.get()));
}

void InitTargetGeckoServices(SetTargetGeckoServicesCb aSetServicesCb) {
  if (!aSetServicesCb) {
    return;
  }

  TargetGeckoServices services;
  services.markIntervalStart = MarkIntervalStart;
  services.markIntervalEnd = MarkIntervalEnd;
  services.markSyscallBrokeringIntervalEnd = MarkSyscallBrokeringIntervalEnd;
  aSetServicesCb(services);
}

}  // namespace mozilla::sandboxing
