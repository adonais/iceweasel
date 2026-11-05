#include "sound_stream.hpp"

#include "transcription_json.hpp"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <numeric>
#include <stdexcept>
#include "moz-overrides.h"

namespace pk {

namespace {
constexpr float kMinScoredSec = 0.16f;  // one CED patch (16 mel frames)
constexpr float kMaxWindowSec = 10.0f;  // stay within one CED chunk (10.12 s)
constexpr float kMinHopSec = 0.2f;
}

std::string validate_sound_opts(const SoundOpts& o, int n_classes) {
    if (!(o.hop_sec >= kMinHopSec)) return "hop_sec must be >= 0.2";
    if (!(o.window_sec >= o.hop_sec)) return "window_sec must be >= hop_sec";
    if (!(o.window_sec <= kMaxWindowSec)) return "window_sec must be <= 10";
    if (!(o.off_threshold >= 0.0f && o.off_threshold <= o.on_threshold && o.on_threshold <= 1.0f))
        return "thresholds must satisfy 0 <= off_threshold <= on_threshold <= 1";
    if (!(o.min_duration_sec >= 0.0f)) return "min_duration_sec must be >= 0";
    if (o.top_k < 0 || o.top_k > n_classes) return "top_k must be in [0, number of classes]";
    return "";
}

SoundStream::SoundStream(SoundScorer scorer, int n_classes, const SoundOpts& o)
    : scorer_(std::move(scorer)), n_classes_(n_classes), o_(o) {
    const std::string err = validate_sound_opts(o, n_classes);
    if (!err.empty()) abort_with_suppression();
    hop_n_ = std::llround(o.hop_sec * kRate);
    win_n_ = std::llround(o.window_sec * kRate);
    next_end_ = hop_n_;
    open_.assign(n_classes, 0);
    open_start_.assign(n_classes, 0.0f);
    open_peak_.assign(n_classes, 0.0f);
}

void SoundStream::close(int c, float end, std::vector<SoundSegment>& closed) {
    open_[c] = 0;
    end = std::max(end, open_start_[c]);
    if (end - open_start_[c] >= o_.min_duration_sec)
        closed.push_back({c, open_start_[c], end, open_peak_[c]});
}

void SoundStream::score_window(long long ws, long long we, std::vector<SoundSegment>& closed) {
    if (ws < buf_start_)
        throw std::logic_error("sound_stream: window start precedes the buffered range");
    assert(ws >= buf_start_);
    const float* p = buf_.data() + (ws - buf_start_);
    if (!scorer_(p, (int)(we - ws), probs_) || (int)probs_.size() != n_classes_)
        throw std::runtime_error("sound scorer failed");
    const float newest_hop_start = (float)std::max(ws, we - hop_n_) / kRate;
    const float oldest_hop_end = (float)std::min(ws + hop_n_, we) / kRate;
    for (int c = 0; c < n_classes_; ++c) {
        const float s = probs_[c];
        if (!open_[c]) {
            if (s >= o_.on_threshold) {
                open_[c] = 1;
                open_start_[c] = newest_hop_start;
                open_peak_[c] = s;
            }
        } else if (s < o_.off_threshold) {
            close(c, oldest_hop_end, closed);
        } else {
            open_peak_[c] = std::max(open_peak_[c], s);
        }
    }
    if (o_.top_k > 0) {
        std::vector<int> idx(n_classes_);
        std::iota(idx.begin(), idx.end(), 0);
        std::partial_sort(idx.begin(), idx.begin() + o_.top_k, idx.end(),
                          [&](int a, int b) { return probs_[a] > probs_[b]; });
        SoundWindow w{(float)ws / kRate, (float)we / kRate, {}};
        for (int i = 0; i < o_.top_k; ++i) w.top.push_back({idx[i], probs_[idx[i]]});
        windows_.push_back(std::move(w));
    }
    scored_end_ = we;
}

std::vector<SoundSegment> SoundStream::feed(const float* pcm, int n, bool is_last) {
    std::vector<SoundSegment> closed;
    if (finished_) return closed;
    if (n > 0 && pcm) {
        buf_.insert(buf_.end(), pcm, pcm + n);
        samples_in_ += n;
    }
    while (samples_in_ >= next_end_) {
        score_window(std::max(0LL, next_end_ - win_n_), next_end_, closed);
        next_end_ += hop_n_;
    }
    if (is_last) {
        const long long tail = samples_in_ - scored_end_;
        if (tail >= (long long)std::llround(kMinScoredSec * kRate))
            score_window(std::max(0LL, samples_in_ - win_n_), samples_in_, closed);
        for (int c = 0; c < n_classes_; ++c)
            if (open_[c]) close(c, (float)time(), closed);
        finished_ = true;
    }
    // Keep only what the next window needs. Trimming to `next_end_ - win_n_`
    // alone looks ahead to a hop that has not arrived yet, which over-trims
    // whenever the stream ends between two hops: the is_last tail window
    // above starts at `samples_in_ - win_n_`, earlier than that, and would
    // read before the buffer start. Clamp the lookahead to what has
    // actually streamed.
    const long long keep_from = std::max(0LL, std::min(next_end_, samples_in_) - win_n_);
    if (keep_from > buf_start_) {
        const long long drop = std::min<long long>(keep_from - buf_start_, (long long)buf_.size());
        buf_.erase(buf_.begin(), buf_.begin() + drop);
        buf_start_ += drop;
    }
    return closed;
}

std::vector<SoundSegment> SoundStream::open_segments() const {
    std::vector<SoundSegment> out;
    for (int c = 0; c < n_classes_; ++c)
        if (open_[c]) out.push_back({c, open_start_[c], (float)time(), open_peak_[c]});
    return out;
}

std::vector<SoundWindow> SoundStream::drain_windows() {
    std::vector<SoundWindow> out;
    out.swap(windows_);
    return out;
}

double SoundStream::safe_until() const {
    if (finished_) return time();
    // Two ways a not-yet-returned segment could still start earlier than
    // expected: a regular window scored after scored_end_ (its newest hop
    // begins at scored_end_), or an is_last tail window scored on the next
    // feed() call, whose newest hop begins at max(0, samples_in_ - hop_n_)
    // (a tail window is shorter than win_n_ but never shorter than hop_n_).
    // An already-open class keeps its (earlier) start regardless.
    const long long tail_hop_start = std::max(0LL, samples_in_ - hop_n_);
    double t = (double)std::min(scored_end_, tail_hop_start) / kRate;
    for (int c = 0; c < n_classes_; ++c)
        if (open_[c]) t = std::min(t, (double)open_start_[c]);
    return t;
}

std::string sound_segments_to_json(const std::vector<SoundSegment>& s,
                                   const std::function<const char*(int)>& label) {
    std::string out = "[";
    for (size_t i = 0; i < s.size(); ++i) {
        if (i) out += ",";
        const char* l = label(s[i].cls);
        out += "{\"index\":"; append_json_int(out, s[i].cls);
        out += ",\"label\":"; append_json_string(out, l ? l : "");
        out += ",\"start\":"; append_json_float(out, "%.3f", s[i].start);
        out += ",\"end\":";   append_json_float(out, "%.3f", s[i].end);
        out += ",\"peak\":";  append_json_float(out, "%.4f", s[i].peak);
        out += "}";
    }
    return out + "]";
}

std::string sound_windows_to_json(const std::vector<SoundWindow>& w,
                                  const std::function<const char*(int)>& label) {
    std::string out = "[";
    for (size_t i = 0; i < w.size(); ++i) {
        if (i) out += ",";
        out += "{\"start\":"; append_json_float(out, "%.3f", w[i].start);
        out += ",\"end\":";   append_json_float(out, "%.3f", w[i].end);
        out += ",\"tags\":[";
        for (size_t j = 0; j < w[i].top.size(); ++j) {
            if (j) out += ",";
            const char* l = label(w[i].top[j].first);
            out += "{\"index\":"; append_json_int(out, w[i].top[j].first);
            out += ",\"label\":"; append_json_string(out, l ? l : "");
            out += ",\"score\":"; append_json_float(out, "%.4f", w[i].top[j].second);
            out += "}";
        }
        out += "]}";
    }
    return out + "]";
}

} // namespace pk
