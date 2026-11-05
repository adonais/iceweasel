#pragma once
#include "diarization.hpp"            // pk::DiarizationModel
#include "diarization_streaming.hpp"  // pk::StreamingDiarization, pk::DiarLatency

#include <memory>
#include <vector>

namespace pk {

class StreamingMel;

// PCM -> incremental mel -> StreamingDiarization. The diarizer runs every
// chunk whose look-ahead has arrived (and, with is_last, the rest).
class DiarPcmStream {
public:
    DiarPcmStream(const DiarizationModel& m, DiarLatency latency);
    ~DiarPcmStream();
    DiarPcmStream(const DiarPcmStream&) = delete;
    DiarPcmStream& operator=(const DiarPcmStream&) = delete;

    // Returns mel frames diarized by this call; appends closed segments.
    long long feed(const float* pcm, int n, bool is_last, std::vector<StreamingSpeakerSegment>& closed);
    double diarized_until() const;   // seconds
    std::vector<StreamingSpeakerSegment> open_segments() const;
    bool finished() const { return finished_; }
    StreamingDiarization& sd() { return *sd_; }
    const StreamingDiarization& sd() const { return *sd_; }
    int chunk_samples() const;

private:
    int hop_length_;
    std::unique_ptr<StreamingDiarization> sd_;
    std::unique_ptr<StreamingMel> mel_;
    long long samples_in_ = 0;     // PCM samples fed so far
    bool finished_ = false;
};

} // namespace pk
