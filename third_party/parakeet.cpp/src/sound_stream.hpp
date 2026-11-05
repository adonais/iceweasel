#pragma once
#include "ced_tagger.hpp"  // SoundScorer

#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace pk {

struct SoundOpts {
    float window_sec = 3.0f;        // audio scored per window (CED clip length)
    float hop_sec = 1.0f;           // a window ends every hop
    float on_threshold = 0.4f;      // a class opens at score >= on
    float off_threshold = 0.3f;     // and closes at score < off
    float min_duration_sec = 0.3f;  // shorter segments are dropped
    int   top_k = 5;                // per-window scores kept for drain_windows
};

// "" when valid, otherwise a message naming the bad field.
std::string validate_sound_opts(const SoundOpts& o, int n_classes);

// A closed (or, from open_segments, still running) sound event.
struct SoundSegment {
    int   cls;                      // class index
    float start, end;               // seconds from stream start
    float peak;                     // highest score while open
};

// One scored window: its span and the top-k (class, score), score-descending.
struct SoundWindow {
    float start, end;
    std::vector<std::pair<int, float>> top;
};

// Sliding-window sound-event detection over live 16 kHz PCM. See
// docs/sound.md for the timing rules. Not thread-safe.
class SoundStream {
public:
    // Throws std::invalid_argument when validate_sound_opts fails.
    SoundStream(SoundScorer scorer, int n_classes, const SoundOpts& o);

    // Append PCM and score every window whose end has arrived. Returns the
    // segments that closed in this call. `is_last` scores the tail and closes
    // everything. Throws std::runtime_error when the scorer fails.
    std::vector<SoundSegment> feed(const float* pcm, int n, bool is_last);

    // Classes open right now, with end = time().
    std::vector<SoundSegment> open_segments() const;

    // Windows scored since the previous drain. The queue grows by one entry
    // per hop until drained: drain regularly, or set top_k = 0 to keep no
    // scores.
    std::vector<SoundWindow> drain_windows();

    double time() const { return (double)samples_in_ / kRate; }
    // No segment returned by a later feed() call can start before this
    // time. While the stream is still open this is a lower bound over: any
    // class already open (its start won't move), the last window actually
    // scored (scored_end_), and the earliest a still-unscored is_last tail
    // window could open a brand-new class (its newest hop, which starts at
    // max(0, samples_in_ - hop_n_): a tail window can be shorter than a
    // full window but is never shorter than one hop). Once finished(), it
    // equals time() exactly.
    double safe_until() const;
    bool finished() const { return finished_; }

private:
    static constexpr int kRate = 16000;
    void score_window(long long win_start, long long win_end, std::vector<SoundSegment>& closed);
    void close(int cls, float end, std::vector<SoundSegment>& closed);

    SoundScorer scorer_;
    int n_classes_;
    SoundOpts o_;
    long long hop_n_, win_n_;
    std::vector<float> buf_;        // PCM from sample buf_start_
    long long buf_start_ = 0;
    long long samples_in_ = 0;
    long long next_end_;            // sample index where the next window ends
    long long scored_end_ = 0;      // end of the last scored window
    std::vector<char> open_;        // per class
    std::vector<float> open_start_, open_peak_;
    std::vector<SoundWindow> windows_;   // scored windows not yet drained (empty with top_k = 0)
    std::vector<float> probs_;
    bool finished_ = false;
};

// JSON arrays for the C-API. `label(i)` may return nullptr (emitted as "").
//   segments: [{"index":..,"label":..,"start":..,"end":..,"peak":..}]
//   windows:  [{"start":..,"end":..,"tags":[{"index":..,"label":..,"score":..}]}]
std::string sound_segments_to_json(const std::vector<SoundSegment>& s,
                                   const std::function<const char*(int)>& label);
std::string sound_windows_to_json(const std::vector<SoundWindow>& w,
                                  const std::function<const char*(int)>& label);

} // namespace pk
