/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_AutoProfilerStyleMarker_h
#define mozilla_AutoProfilerStyleMarker_h

#include "mozilla/Attributes.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/ServoTraversalStatistics.h"
#include "mozilla/TimeStamp.h"

namespace mozilla {

class MOZ_RAII AutoProfilerStyleMarker {
 public:
  explicit AutoProfilerStyleMarker(UniquePtr<ProfileChunkedBuffer> aCause,
                                   const Maybe<uint64_t>& aInnerWindowID)
      : mActive(profiler_thread_is_being_profiled_for_markers()),
        mCause(std::move(aCause)),
        mInnerWindowID(aInnerWindowID) {
    if (!mActive) {
      return;
    }
    mPreviousSingleton = ServoTraversalStatistics::sSingleton;
    ServoTraversalStatistics::sSingleton = &mStats;

    mStartTime = TimeStamp::Now();
  }

  ~AutoProfilerStyleMarker() {
    if (!mActive) {
      return;
    }

    ServoTraversalStatistics::sSingleton = mPreviousSingleton;
    profiler_add_marker("Styles", geckoprofiler::category::LAYOUT,
                        {MarkerTiming::IntervalUntilNowFrom(mStartTime),
                         MarkerStack::TakeBacktrace(std::move(mCause)),
                         MarkerInnerWindowId(mInnerWindowID)},
                        StyleMarker{}, mStats.mElementsTraversed,
                        mStats.mElementsStyled, mStats.mElementsMatched,
                        mStats.mStylesShared, mStats.mStylesReused);
  }

 private:
  struct StyleMarker : public BaseMarkerType<StyleMarker> {
    static constexpr const char* Name = "Styles";
    using MS = MarkerSchema;
    static constexpr MS::Location Locations[] = {
        MS::Location::MarkerChart,
        MS::Location::MarkerTable,
        MS::Location::TimelineOverview,
    };
    static constexpr MS::PayloadField PayloadFields[] = {
        {"elementsTraversed", MS::InputType::Uint32, "Elements traversed",
         MS::Format::Integer},
        {"elementsStyled", MS::InputType::Uint32, "Elements styled",
         MS::Format::Integer},
        {"elementsMatched", MS::InputType::Uint32, "Elements matched",
         MS::Format::Integer},
        {"stylesShared", MS::InputType::Uint32, "Styles shared",
         MS::Format::Integer},
        {"stylesReused", MS::InputType::Uint32, "Styles reused",
         MS::Format::Integer},
    };
    static constexpr bool IsStackBased = true;
  };

  bool mActive;
  TimeStamp mStartTime;
  UniquePtr<ProfileChunkedBuffer> mCause;
  Maybe<uint64_t> mInnerWindowID;
  ServoTraversalStatistics mStats;
  ServoTraversalStatistics* mPreviousSingleton = nullptr;
};

}  // namespace mozilla

#endif  // mozilla_AutoProfilerStyleMarker_h
