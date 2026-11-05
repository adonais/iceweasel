#include "scene_stream.hpp"

#include "ced_tagger.hpp"  // pk::CedTagger
#include "model.hpp"       // pk::Model
#include "transcription_json.hpp"

#include <algorithm>
#include <stdexcept>
#include "moz-overrides.h"

namespace pk {

SceneStream::SceneStream(const SceneParts& p) {
    if (!p.asr && !p.diar && !p.tagger)
        throw std::invalid_argument("scene stream needs at least one model");
    if (p.diar) diar_ = std::make_unique<DiarPcmStream>(*p.diar, p.diar_latency);
    if (p.asr) {
        const Model* m = p.asr;
        asr_ = std::make_unique<AsrCommitter>(
            [m](const std::vector<float>& x) { return m->transcribe_with_timestamps(x, 16000).words; });
    }
    if (p.tagger)
        sound_ = std::make_unique<SoundStream>(p.tagger->scorer(), p.tagger->n_classes(), p.sound);
}

SceneStream::~SceneStream() = default;

SceneUpdate SceneStream::feed(const float* pcm, int n, bool is_last) {
    SceneUpdate u;
    std::vector<StreamingSpeakerSegment> closed;
    long long advanced = 0;
    // Until the ASR transcribes, a failure is charged to diarization (as the
    // SAS C-API always did), including the ASR audio push.
    part_ = diar_ ? ScenePart::Diarization : ScenePart::Asr;
    if (diar_) {
        advanced = diar_->feed(pcm, n, is_last, closed);
        for (const auto& c : closed) {
            segs_.push_back({c.speaker, c.start, c.end});
            u.speakers.push_back({c.speaker, c.start, c.end});
        }
    }
    if (asr_) {
        asr_->push(pcm, n);
        // With diarization, ASR follows how far diarization has got, and only
        // when it advanced (the SAS behavior). Without it, the audio received.
        // A commit that the min window skips changes nothing, not even the
        // segment pruning below (the SAS behavior).
        const bool tick = !diar_ || advanced > 0 || is_last;
        const double until = diar_ ? diar_->diarized_until() : t_ + (n > 0 ? n : 0) / 16000.0;
        if (tick && asr_->ready(until, is_last)) {
            part_ = ScenePart::Asr;
            auto committed = asr_->commit(until, is_last);
            // Speaker segments known so far: closed ones plus those still open.
            std::vector<SpeakerSegment> segs = segs_;
            if (diar_)
                for (const auto& o : diar_->open_segments()) segs.push_back({o.speaker, o.start, o.end});
            u.words = merge_asr_diarization(committed, segs);
            u.utterances = group_speaker_words(u.words);
            // Segments that ended before the commit point can no longer match a word.
            const double commit_sec = asr_->commit_sec();
            segs_.erase(std::remove_if(segs_.begin(), segs_.end(),
                                       [&](const SpeakerSegment& g) { return g.end < commit_sec; }),
                        segs_.end());
        }
    }
    if (sound_) {
        part_ = ScenePart::Sound;
        u.sounds = sound_->feed(pcm, n, is_last);
        u.active_sounds = sound_->open_segments();
    }
    t_ += (n > 0 ? n : 0) / 16000.0;
    if (is_last) finished_ = true;
    u.t = t_;
    if (diar_) {
        part_ = ScenePart::Diarization;
        u.active_speakers = diar_->open_segments();
    }
    if (finished_) {
        u.safe_until = t_;
    } else if (sound_ && asr_) {
        u.safe_until = std::min(asr_->commit_sec(), sound_->safe_until());
    } else if (sound_) {
        u.safe_until = sound_->safe_until();
    } else if (asr_) {
        u.safe_until = asr_->commit_sec();
    } else {
        u.safe_until = t_;
    }
    part_ = ScenePart::None;
    return u;
}

std::vector<SoundWindow> SceneStream::drain_windows() {
    return sound_ ? sound_->drain_windows() : std::vector<SoundWindow>{};
}

namespace {

void append_speaker_segment(std::string& out, const SpeakerSegment& s) {
    out += "{\"speaker\":"; append_json_int(out, s.speaker);
    out += ",\"start\":";   append_json_float(out, "%.3f", s.start);
    out += ",\"end\":";     append_json_float(out, "%.3f", s.end);
    out += "}";
}

void append_active_speaker(std::string& out, const StreamingSpeakerSegment& s) {
    out += "{\"speaker\":"; append_json_int(out, s.speaker);
    out += ",\"start\":";   append_json_float(out, "%.3f", s.start);
    out += "}";
}

std::string utterances_to_json(const std::vector<SpeakerUtterance>& utts) {
    std::string out = "[";
    for (size_t i = 0; i < utts.size(); ++i) {
        if (i) out += ",";
        out += "{\"speaker\":"; append_json_int(out, utts[i].speaker);
        out += ",\"text\":";    append_json_string(out, utts[i].text);
        out += ",\"start\":";   append_json_float(out, "%.3f", utts[i].start);
        out += ",\"end\":";     append_json_float(out, "%.3f", utts[i].end);
        out += ",\"conf\":";    append_json_float(out, "%.4f", utts[i].conf);
        out += "}";
    }
    return out + "]";
}

std::string words_to_json(const std::vector<SpeakerWord>& words) {
    std::string out = "[";
    for (size_t i = 0; i < words.size(); ++i) {
        if (i) out += ",";
        out += "{\"text\":";    append_json_string(out, words[i].text);
        out += ",\"start\":";   append_json_float(out, "%.3f", words[i].start);
        out += ",\"end\":";     append_json_float(out, "%.3f", words[i].end);
        out += ",\"conf\":";    append_json_float(out, "%.4f", words[i].conf);
        out += ",\"speaker\":"; append_json_int(out, words[i].speaker);
        out += "}";
    }
    return out + "]";
}

std::string speakers_to_json(const std::vector<SpeakerSegment>& segs) {
    std::string out = "[";
    for (size_t i = 0; i < segs.size(); ++i) {
        if (i) out += ",";
        append_speaker_segment(out, segs[i]);
    }
    return out + "]";
}

}  // namespace

std::string scene_update_to_json(const SceneUpdate& u, const std::function<const char*(int)>& label) {
    std::string out = "{\"t\":";
    append_json_float(out, "%.3f", (float)u.t);
    out += ",\"utterances\":" + utterances_to_json(u.utterances);
    out += ",\"words\":" + words_to_json(u.words);
    out += ",\"speakers\":" + speakers_to_json(u.speakers);
    out += ",\"sounds\":" + sound_segments_to_json(u.sounds, label);
    out += ",\"active\":{\"speakers\":[";
    for (size_t i = 0; i < u.active_speakers.size(); ++i) {
        if (i) out += ",";
        append_active_speaker(out, u.active_speakers[i]);
    }
    out += "],\"sounds\":" + sound_segments_to_json(u.active_sounds, label);
    out += "}}";
    return out;
}

} // namespace pk
