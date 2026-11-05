#pragma once
#include "transcription.hpp"  // pk::Word

#include <functional>
#include <vector>

namespace pk {

// Offline transcription of one 16 kHz mono PCM window; word times are
// relative to the window start.
using Transcriber = std::function<std::vector<Word>(const std::vector<float>& pcm)>;

// Streaming text commit over an offline transcriber: buffers uncommitted PCM,
// transcribes it once enough has built up, and commits only the words that
// have right context. The rest is transcribed again with the next window.
// When a window holds no committable word, the audio before the first word
// heard (or before the right context) is released, so non-speech does not
// build up.
class AsrCommitter {
public:
    explicit AsrCommitter(Transcriber t, double min_window_sec = 4.0, double right_context_sec = 1.0);
    void push(const float* pcm, int n);
    // Words committed up to stream time `until` (absolute times). Empty when
    // fewer than min_window_sec of uncommitted audio is available (unless is_last).
    std::vector<Word> commit(double until, bool is_last);
    // True when commit(until, is_last) would transcribe (the window is long
    // enough, or is_last); false when it would return early.
    bool ready(double until, bool is_last) const;
    // Stream time of the first uncommitted sample.
    double commit_sec() const { return commit_sec_; }
    // Uncommitted samples held (starting at commit_sec()).
    size_t buffered_samples() const { return audio_.size(); }

private:
    size_t span(double until, bool is_last) const;

    Transcriber transcribe_;
    double min_window_sec_;
    double right_context_sec_;
    std::vector<float> audio_;   // uncommitted PCM, starting at commit_sec_
    double commit_sec_ = 0.0;    // stream time of audio_[0]
    Word last_;                  // last committed word (absolute times)
    bool have_last_ = false;
};

} // namespace pk
