#pragma once
#include "scene_stream.hpp"  // pk::SceneUpdate

#include <functional>
#include <string>
#include <vector>

namespace pk {

// True for a CED label the scene renderer treats as plain speech (already
// carried by the ASR/diarization transcript, so it is redundant on screen
// unless the caller asks to see it).
bool is_speech_label(const std::string& label);

// "[mm:ss.s - mm:ss.s]", tenths truncated (not rounded).
std::string format_span(double start, double end);

// Turns SceneUpdate pieces into printable transcript lines, time-ordered.
// Not thread-safe; one scene stream at a time.
//
// With diarization but no ASR (has_diar && !has_asr) there are no
// utterances, so the closed speaker segments are printed instead, as
// "[mm:ss.s - mm:ss.s]  Speaker N". With ASR they are not printed (the
// utterances already carry the speaker).
class SceneRenderer {
public:
    SceneRenderer(bool has_diar, bool show_speech, std::function<const char*(int)> label,
                  bool has_asr = true);

    // Queues the lines for one SceneUpdate's utterances, sounds and (without
    // ASR) speaker segments.
    void add(const SceneUpdate& u);

    // Returns (and removes) queued lines with start < safe_until, time-ordered.
    // SceneUpdate::safe_until does not cover speaker segments, so when they
    // are printed the bound is also capped at the earliest start a later
    // speaker segment can have (the start of the earliest still-open segment,
    // or the diarized time when none is open).
    std::vector<std::string> flush(double safe_until);
    // Returns (and removes) every remaining queued line, time-ordered.
    std::vector<std::string> flush_all();

private:
    struct Item {
        double start;
        std::string line;
    };

    bool has_diar_;
    bool show_speech_;
    bool speaker_lines_;          // has_diar && !has_asr
    double diarized_ = 0.0;       // lower bound on the diarized time seen so far
    double speaker_bound_ = 0.0;  // no later speaker segment starts before this
    std::function<const char*(int)> label_;
    std::vector<Item> pending_;
};

} // namespace pk
