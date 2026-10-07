/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef BaseProfilerMarkerTypes_h
#define BaseProfilerMarkerTypes_h

// This header contains common marker type definitions.
//
// It #include's "mozilla/BaseProfilerMarkers.h", see that file for how to
// define other marker types, and how to add markers to the profiler buffers.
//
// If you don't need to use these common types, #include
// "mozilla/BaseProfilerMarkers.h" instead.
//
// Types in this files can be defined without relying on xpcom.
// Others are defined in "ProfilerMarkerTypes.h".

// !!!                       /!\ WORK IN PROGRESS /!\                       !!!
// This file contains draft marker definitions, but most are not used yet.
// Further work is needed to complete these definitions, and use them to convert
// existing PROFILER_ADD_MARKER calls. See meta bug 1661394.

#include "mozilla/BaseProfilerMarkers.h"

namespace mozilla::baseprofiler::markers {

struct MediaSampleMarker : public BaseMarkerType<MediaSampleMarker> {
  static constexpr const char* Name = "MediaSample";
  // Callers pass a distinct name to each marker, keep it in ETW events.
  static constexpr bool ETWStoreName = true;
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"sampleStartTimeUs", MS::InputType::Int64, "Sample start time",
       MS::Format::Microseconds},
      {"sampleEndTimeUs", MS::InputType::Int64, "Sample end time",
       MS::Format::Microseconds},
      {"queueLength", MS::InputType::Int64, "Queue length",
       MS::Format::Integer},
  };
};

struct VideoFallingBehindMarker
    : public BaseMarkerType<VideoFallingBehindMarker> {
  static constexpr const char* Name = "VideoFallingBehind";
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"videoFrameStartTimeUs", MS::InputType::Int64, "Video frame start time",
       MS::Format::Microseconds},
      {"mediaCurrentTimeUs", MS::InputType::Int64, "Media current time",
       MS::Format::Microseconds},
  };
};

struct ContentBuildMarker : public BaseMarkerType<ContentBuildMarker> {
  static constexpr const char* Name = "CONTENT_FULL_PAINT_TIME";
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
};

struct MediaEngineMarker : public BaseMarkerType<MediaEngineMarker> {
  static constexpr const char* Name = "MediaEngine";
  // Callers pass a distinct name to each marker, keep it in ETW events.
  static constexpr bool ETWStoreName = true;
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"id", MS::InputType::Uint64, "Id", MS::Format::String},
  };
};

struct MediaEngineTextMarker : public BaseMarkerType<MediaEngineTextMarker> {
  static constexpr const char* Name = "MediaEngineText";
  // Callers pass a distinct name to each marker, keep it in ETW events.
  static constexpr bool ETWStoreName = true;
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"id", MS::InputType::Uint64, "Id", MS::Format::String},
      {"text", MS::InputType::CString, "Details"},
  };
};

struct VideoSinkRenderMarker : public BaseMarkerType<VideoSinkRenderMarker> {
  static constexpr const char* Name = "VideoSinkRender";
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"clockTimeUs", MS::InputType::Int64, "Clock time",
       MS::Format::Microseconds},
  };
};

}  // namespace mozilla::baseprofiler::markers

#endif  // BaseProfilerMarkerTypes_h
