#include "asr_committer.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <string>
#include <utility>

namespace pk {

namespace {

// Parakeet's word start times come from the frame where the first token is
// emitted, often one or two 80 ms encoder frames after the sound actually
// starts, so cutting exactly at a word start can permanently drop the tail
// end of the previous window's onset. Back off by this much when no word
// commits, so the next window re-hears that onset with full context.
constexpr double kOnsetMargin = 0.3;

// Lowercase letters and digits only, for comparing a word heard twice.
std::string word_key(const std::string& w) {
    std::string k;
    for (unsigned char c : w)
        if (std::isalnum(c) || c >= 0x80) k += (char)std::tolower(c);
    return k;
}

}  // namespace

AsrCommitter::AsrCommitter(Transcriber t, double min_window_sec, double right_context_sec)
    : transcribe_(std::move(t)), min_window_sec_(min_window_sec), right_context_sec_(right_context_sec) {}

void AsrCommitter::push(const float* pcm, int n) {
    if (n > 0) audio_.insert(audio_.end(), pcm, pcm + n);
}

// Uncommitted samples up to `until` (all of them with is_last).
size_t AsrCommitter::span(double until, bool is_last) const {
    return is_last ? audio_.size()
                   : std::min(audio_.size(), (size_t)std::max(0.0, (until - commit_sec_) * 16000.0));
}

// Offline ASR on a short window loses words, so wait until enough
// uncommitted audio has built up (it bounds how often the text commits).
bool AsrCommitter::ready(double until, bool is_last) const {
    return is_last || span(until, is_last) >= (size_t)(min_window_sec_ * 16000.0);
}

std::vector<Word> AsrCommitter::commit(double until, bool is_last) {
    if (!ready(until, is_last)) return {};
    const size_t span = this->span(until, is_last);
    std::vector<Word> words;
    if (span > 0) words = transcribe_(std::vector<float>(audio_.begin(), audio_.begin() + span));
    // Commit only words that end right_context_sec before the cut: the ASR
    // needs right context, and a word at the edge may be cut in half.
    size_t keep = words.size();
    double next_commit = commit_sec_ + (double)span / 16000.0;
    if (!is_last) {
        const double limit = (double)span / 16000.0 - right_context_sec_;
        keep = 0;
        while (keep < words.size() && words[keep].end <= limit) ++keep;
        if (keep > 0) {
            // Resume right after the last committed word: audio the ASR
            // skipped this time is heard again with more context.
            next_commit = commit_sec_ + words[keep - 1].end;
        } else {
            // No committable word (silence, music, long non-speech). Release
            // the audio before the first word heard, or before the right
            // context when there is none, so the buffer and the cost of each
            // transcription stay bounded. Back off by the onset margin so the
            // first uncommitted word's onset is re-heard with full context
            // next time, not cut at its (possibly late) reported start.
            double first_start = limit;
            if (!words.empty()) first_start = std::min(first_start, (double)words.front().start);
            const double rel = std::max(0.0, first_start - kOnsetMargin);
            next_commit = commit_sec_ + rel;
        }
    }
    std::vector<Word> committed(words.begin(), words.begin() + keep);
    for (auto& w : committed) { w.start += (float)commit_sec_; w.end += (float)commit_sec_; }
    // ASR timestamps are only accurate to a frame or two, so the tail of the
    // previously committed word can be heard again at the new start.
    if (have_last_ && !committed.empty() &&
        word_key(committed.front().text) == word_key(last_.text) &&
        committed.front().start - last_.start < 0.5f)
        committed.erase(committed.begin());
    if (!committed.empty()) { last_ = committed.back(); have_last_ = true; }
    const size_t drop = std::min(audio_.size(),
                                 (size_t)std::llround((next_commit - commit_sec_) * 16000.0));
    audio_.erase(audio_.begin(), audio_.begin() + drop);
    commit_sec_ += (double)drop / 16000.0;
    return committed;
}

} // namespace pk
