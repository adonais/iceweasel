#include "sas_merge.hpp"

#include <algorithm>
#include <cmath>

namespace pk {

std::vector<SpeakerWord> merge_asr_diarization(
    const std::vector<Word>& words,
    const std::vector<SpeakerSegment>& segs,
    float max_snap_sec)
{
    std::vector<SpeakerWord> result;
    result.reserve(words.size());

    // Sort segments by start time so we can advance a cursor.
    // (They typically arrive already sorted, but don't assume it.)
    std::vector<SpeakerSegment> sorted_segs = segs;
    std::sort(sorted_segs.begin(), sorted_segs.end(),
              [](const SpeakerSegment& a, const SpeakerSegment& b) {
                  if (a.start != b.start) return a.start < b.start;
                  return a.speaker < b.speaker;
              });

    for (const auto& w : words) {
        // Find the dominant speaker: the one with the largest overlap
        // between [w.start, w.end] and [seg.start, seg.end].
        int best_speaker = -1;
        float best_overlap = 0.0f;

        for (const auto& seg : sorted_segs) {
            if (seg.end <= w.start) continue;       // segment ends before word
            if (seg.start >= w.end) break;           // segment starts after word

            float overlap = std::min(w.end, seg.end) - std::max(w.start, seg.start);
            if (overlap > best_overlap) {
                best_overlap = overlap;
                best_speaker = seg.speaker;
            }
        }

        if (best_speaker < 0) {
            // No overlap: snap to the nearest segment within max_snap_sec.
            float best_dist = max_snap_sec;
            for (const auto& seg : sorted_segs) {
                const float dist = seg.end <= w.start ? w.start - seg.end : seg.start - w.end;
                if (dist <= best_dist) {
                    best_dist = dist;
                    best_speaker = seg.speaker;
                }
            }
        }

        SpeakerWord sw;
        sw.speaker = best_speaker;
        sw.text    = w.text;
        sw.start   = w.start;
        sw.end     = w.end;
        sw.conf    = w.conf;
        result.push_back(sw);
    }

    return result;
}

std::vector<SpeakerUtterance> group_speaker_words(
    const std::vector<SpeakerWord>& swords,
    float max_gap_sec)
{
    std::vector<SpeakerUtterance> result;
    if (swords.empty()) return result;

    SpeakerUtterance cur;
    cur.speaker = swords[0].speaker;
    cur.text    = swords[0].text;
    cur.start   = swords[0].start;
    cur.end     = swords[0].end;
    cur.conf    = swords[0].conf;

    for (size_t i = 1; i < swords.size(); ++i) {
        const auto& w = swords[i];
        float gap = w.start - cur.end;

        if (w.speaker == cur.speaker && gap <= max_gap_sec) {
            // Extend current utterance
            cur.text += " " + w.text;
            cur.end = w.end;
            cur.conf = std::min(cur.conf, w.conf);
        } else {
            // Flush and start new utterance
            result.push_back(cur);
            cur.speaker = w.speaker;
            cur.text    = w.text;
            cur.start   = w.start;
            cur.end     = w.end;
            cur.conf    = w.conf;
        }
    }
    result.push_back(cur);

    return result;
}

} // namespace pk
