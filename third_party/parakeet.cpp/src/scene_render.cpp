#include "scene_render.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace pk {

namespace {

// CED labels the renderer treats as "just speech": already carried by the
// ASR/diarization transcript, so redundant on screen unless asked for.
bool speech_label_set(const std::string& label) {
    static const char* kSpeech[] = {
        "Speech",
        "Male speech, man speaking",
        "Female speech, woman speaking",
        "Child speech, kid speaking",
        "Conversation",
        "Narration, monologue",
        "Speech synthesizer",
    };
    for (const char* s : kSpeech)
        if (label == s) return true;
    return false;
}

}  // namespace

bool is_speech_label(const std::string& label) { return speech_label_set(label); }

std::string format_span(double start, double end) {
    auto mmss = [](double x) {
        // Tenths truncated, not rounded. Callers pass timestamps that
        // started life as float32 (SoundSegment/SpeakerUtterance), so the
        // double here can sit a few ULPs under the intended value (10.9f
        // widens to ~10.899999...). Round to hundredths first to absorb
        // that noise, keeping genuine truncation (10.04 -> 10.0) intact.
        if (!std::isfinite(x)) x = 0.0;  // NaN/inf: never let the cast below hit UB.
        double hundredths = std::round(x * 100.0) / 100.0;
        long long total_tenths = (long long)std::floor(hundredths * 10.0 + 1e-9);
        if (total_tenths < 0) total_tenths = 0;
        long long minutes = total_tenths / 600;
        long long rem = total_tenths % 600;
        long long seconds = rem / 10;
        long long tenth = rem % 10;
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%02lld:%02lld.%lld", minutes, seconds, tenth);
        return std::string(buf);
    };
    return "[" + mmss(start) + " - " + mmss(end) + "]";
}

SceneRenderer::SceneRenderer(bool has_diar, bool show_speech, std::function<const char*(int)> label,
                             bool has_asr)
    : has_diar_(has_diar),
      show_speech_(show_speech),
      speaker_lines_(has_diar && !has_asr),
      label_(std::move(label)) {}

void SceneRenderer::add(const SceneUpdate& u) {
    if (speaker_lines_) {
        for (const SpeakerSegment& g : u.speakers) {
            pending_.push_back({(double)g.start,
                                format_span(g.start, g.end) + "  Speaker " + std::to_string(g.speaker)});
            diarized_ = std::max(diarized_, (double)g.end);
        }
        // A closed segment ends at or before the diarized time, and an open
        // one reports it as its end. A segment that opens later starts at or
        // after it; one that is open now keeps its start.
        for (const StreamingSpeakerSegment& o : u.active_speakers)
            diarized_ = std::max(diarized_, (double)o.end);
        speaker_bound_ = diarized_;
        for (const StreamingSpeakerSegment& o : u.active_speakers)
            speaker_bound_ = std::min(speaker_bound_, (double)o.start);
    }
    for (const SpeakerUtterance& utt : u.utterances) {
        std::string line = format_span(utt.start, utt.end) + "  ";
        if (has_diar_) {
            if (utt.speaker >= 0)
                line += "Speaker " + std::to_string(utt.speaker) + ": ";
            else
                line += "Speaker ?: ";
        }
        line += utt.text;
        pending_.push_back({(double)utt.start, std::move(line)});
    }
    for (const SoundSegment& s : u.sounds) {
        const char* raw = label_ ? label_(s.cls) : nullptr;
        std::string label_str = raw ? raw : "";
        if (!show_speech_ && is_speech_label(label_str)) continue;
        char peak[16];
        std::snprintf(peak, sizeof(peak), "%.2f", (double)s.peak);
        std::string line = format_span(s.start, s.end) + "  (" + label_str + " " + peak + ")";
        pending_.push_back({(double)s.start, std::move(line)});
    }
}

std::vector<std::string> SceneRenderer::flush(double safe_until) {
    if (speaker_lines_) safe_until = std::min(safe_until, speaker_bound_);
    std::stable_sort(pending_.begin(), pending_.end(),
                      [](const Item& a, const Item& b) { return a.start < b.start; });
    std::vector<std::string> out;
    std::vector<Item> remain;
    remain.reserve(pending_.size());
    for (Item& it : pending_) {
        if (it.start < safe_until)
            out.push_back(std::move(it.line));
        else
            remain.push_back(std::move(it));
    }
    pending_ = std::move(remain);
    return out;
}

std::vector<std::string> SceneRenderer::flush_all() {
    std::stable_sort(pending_.begin(), pending_.end(),
                      [](const Item& a, const Item& b) { return a.start < b.start; });
    std::vector<std::string> out;
    out.reserve(pending_.size());
    for (Item& it : pending_) out.push_back(std::move(it.line));
    pending_.clear();
    return out;
}

} // namespace pk
