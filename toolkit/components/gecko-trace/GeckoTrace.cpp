/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "GeckoTrace.h"

#include "mozilla/Logging.h"
#include "nsXULAppAPI.h"

#include <memory>
#include <utility>

#include "opentelemetry/context/runtime_context.h"
#include "opentelemetry/sdk/common/global_log_handler.h"
#include "opentelemetry/sdk/trace/tracer_provider_factory.h"
#include "opentelemetry/trace/provider.h"

#include "SemanticConventions.h"
#include "SpanEvent.h"

namespace otel = opentelemetry;
namespace otel_sdk_log = opentelemetry::sdk::common::internal_log;

namespace mozilla::gecko_trace {

namespace {

static otel_sdk_log::LogLevel ToOTelLevel(mozilla::LogLevel aMozLevel) {
  using OTelLevel = otel_sdk_log::LogLevel;
  using MozLevel = mozilla::LogLevel;

  switch (aMozLevel) {
    case MozLevel::Error:
      return OTelLevel::Error;
    case MozLevel::Warning:
      return OTelLevel::Warning;
    case MozLevel::Info:
      return OTelLevel::Info;
    case MozLevel::Debug:
      // OpenTelemetry does not differentiate between debug and verbose
      [[fallthrough]];
    case MozLevel::Verbose:
      return OTelLevel::Debug;
    case MozLevel::Disabled:
      [[fallthrough]];
    default:
      return OTelLevel::None;
  }
}

static mozilla::LogLevel ToMozLevel(otel_sdk_log::LogLevel aOTelLevel) {
  using OTelLevel = otel_sdk_log::LogLevel;
  using MozLevel = mozilla::LogLevel;

  switch (aOTelLevel) {
    case OTelLevel::Error:
      return MozLevel::Error;
    case OTelLevel::Warning:
      return MozLevel::Warning;
    case OTelLevel::Info:
      return MozLevel::Info;
    case OTelLevel::Debug:
      return MozLevel::Debug;
    default:
      return MozLevel::Disabled;
  }
}

class OTelScopeAdapter final : public Scope {
 public:
  explicit OTelScopeAdapter(std::unique_ptr<otel::context::Token> token)
      : mToken(std::move(token)) {}

 private:
  std::unique_ptr<otel::context::Token> mToken;
};

class OTelSpanAdapter final : public Span {
 public:
  explicit OTelSpanAdapter(std::shared_ptr<otel::trace::Span> span)
      : mSpan(std::move(span)) {}

  void AddEvent(const SpanEvent& aEvent) override {
    // Helper class to adapt SpanEvent attributes to OpenTelemetry format
    class KeyValueAdapter : public otel::common::KeyValueIterable {
     public:
      explicit KeyValueAdapter(const SpanEvent& aEvent) : mEvent(aEvent) {}

      bool ForEachKeyValue(otel::nostd::function_ref<
                           bool(string_view, otel::common::AttributeValue)>
                               callback) const noexcept override {
        return mEvent.ForEachKeyValue(
            [&](string_view aName, const AttributeValue& aAttr) {
              return aAttr.match(
                  [&](bool aBool) { return callback(aName, aBool); },
                  [&](int64_t aInt) { return callback(aName, aInt); },
                  [&](string_view aStr) { return callback(aName, aStr); });
            });
      }

      size_t size() const noexcept override { return mEvent.Size(); }

     private:
      const SpanEvent& mEvent;
    };

    KeyValueAdapter adapter(aEvent);
    mSpan->AddEvent(aEvent.GetEventName(), adapter);
  }

  std::shared_ptr<Scope> Enter() override {
    auto token = otel::context::RuntimeContext::Attach(
        otel::context::RuntimeContext::GetCurrent().SetValue(
            otel::trace::kSpanKey, mSpan));
    return std::make_shared<OTelScopeAdapter>(std::move(token));
  }

 private:
  std::shared_ptr<otel::trace::Span> mSpan;
};

class OTelTracerAdapter final : public Tracer {
 public:
  explicit OTelTracerAdapter(std::shared_ptr<otel::trace::Tracer> tracer)
      : mTracer(std::move(tracer)) {}

  std::shared_ptr<Span> StartSpan(string_view aName) override {
    return std::make_shared<OTelSpanAdapter>(mTracer->StartSpan(aName));
  }

 private:
  std::shared_ptr<otel::trace::Tracer> mTracer;
};

// Log handler that forwards OpenTelemetry logs to Mozilla logging system
class OTelToMozLogHandler final : public otel_sdk_log::LogHandler {
 public:
  void Handle(otel_sdk_log::LogLevel aLevel, const char* aFile, int aLine,
              const char* aMsg,
              const otel::sdk::common::AttributeMap&) noexcept override {
    static LazyLogModule sOTelLog("opentelemetry");
    MOZ_LOG(sOTelLog, ToMozLevel(aLevel), ("%s", aMsg));
  }
};

}  // namespace

void SpanEvent::Emit() { Tracer::GetCurrentSpan()->AddEvent(*this); }

std::shared_ptr<gecko_trace::Span> Tracer::GetCurrentSpan() {
  auto active = otel::context::RuntimeContext::GetValue(otel::trace::kSpanKey);

  if (std::holds_alternative<std::shared_ptr<otel::trace::Span>>(active)) {
    return std::make_shared<OTelSpanAdapter>(
        std::get<std::shared_ptr<otel::trace::Span>>(active));
  }

  // Use thread_local to ensure each thread gets its own instance, avoiding
  // atomic reference counting and contention on the global control block.
  //
  // https://github.com/open-telemetry/opentelemetry-cpp/pull/3037#issuecomment-2380002451
  static thread_local auto sDefaultOTelSpan = std::make_shared<OTelSpanAdapter>(
      std::make_shared<otel::trace::DefaultSpan>(
          otel::trace::SpanContext::GetInvalid()));

  return sDefaultOTelSpan;
}

std::shared_ptr<Tracer> TracerProvider::GetTracer(string_view aComponentName) {
  auto otelTracer =
      otel::trace::Provider::GetTracerProvider()->GetTracer(aComponentName);
  return std::make_shared<OTelTracerAdapter>(otelTracer);
}

void SetOpenTelemetryInternalLogLevel(mozilla::LogLevel aLogLevel) {
  otel_sdk_log::GlobalLogHandler::SetLogLevel(ToOTelLevel(aLogLevel));
}

void Init() {
  // Set up log forwarding from OpenTelemetry to Mozilla logging
  otel_sdk_log::GlobalLogHandler::SetLogHandler(
      std::make_shared<OTelToMozLogHandler>());

  // Create resource with Firefox process information
  auto resource = otel::sdk::resource::Resource::Create({
      {semantic_conventions::kProcessType, XRE_GetProcessTypeString()},
      {semantic_conventions::kProcessID, XRE_GetChildID()},
  });

  // Create tracer provider with empty processor list (for now)
  std::vector<std::unique_ptr<otel::sdk::trace::SpanProcessor>> processors{};
  auto provider = otel::sdk::trace::TracerProviderFactory::Create(
      std::move(processors), resource);

  // Set as the global tracer provider
  otel::trace::Provider::SetTracerProvider(std::move(provider));
}

}  // namespace mozilla::gecko_trace
