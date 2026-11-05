#include "diar_pcm_stream.hpp"

#include "mel.hpp"  // pk::StreamingMel

#include <algorithm>

namespace pk {

DiarPcmStream::DiarPcmStream(const DiarizationModel& m, DiarLatency latency)
    : hop_length_((int)m.config().hop_length) {
    const ModelLoader& ml = m.loader();
    sd_  = std::make_unique<StreamingDiarization>(ml, diar_stream_config(latency, ml.config()));
    mel_ = std::make_unique<StreamingMel>(ml);
}

DiarPcmStream::~DiarPcmStream() = default;

long long DiarPcmStream::feed(const float* pcm, int n, bool is_last,
                              std::vector<StreamingSpeakerSegment>& closed) {
    const int n_mels = sd_->n_mels();
    const long long done_before = sd_->frames_done();
    std::vector<float> mel;
    int nf = 0;
    if (n > 0) {
        mel = mel_->feed(pcm, n, nf);
        samples_in_ += n;
    }
    if (is_last) {
        int nt = 0;
        std::vector<float> tail = mel_->finalize(nt);
        // Join the two feat-major blocks, then keep floor(S / hop) frames in
        // total like NeMo (the centered STFT emits one more).
        const long long valid = samples_in_ / (long long)hop_length_;
        const int keep = (int)std::max(0LL, std::min<long long>(nf + nt, valid - sd_->frames_in()));
        std::vector<float> joined((size_t)n_mels * keep);
        for (int m = 0; m < n_mels; ++m)
            for (int t = 0; t < keep; ++t)
                joined[(size_t)m * keep + t] = t < nf ? mel[(size_t)m * nf + t]
                                                      : tail[(size_t)m * nt + (t - nf)];
        mel.swap(joined);
        nf = keep;
        finished_ = true;
    }
    auto segs = sd_->feed_mel(mel, n_mels, nf, is_last);
    closed.insert(closed.end(), segs.begin(), segs.end());
    return sd_->frames_done() - done_before;
}

double DiarPcmStream::diarized_until() const {
    const double hop_sec = (double)hop_length_ / 16000.0;
    return sd_->frames_done() * hop_sec;
}

std::vector<StreamingSpeakerSegment> DiarPcmStream::open_segments() const {
    return sd_->open_segments();
}

int DiarPcmStream::chunk_samples() const {
    return sd_->latency_mel_frames() * hop_length_;
}

} // namespace pk
