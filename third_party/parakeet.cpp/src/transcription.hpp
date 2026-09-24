#pragma once
#include "decode_types.hpp"

#include <string>
#include <vector>

namespace pk {

// One decoded word with its time span (seconds) and aggregate confidence.
//
//   text  : the word string (SentencePiece pieces detokenized — `▁`->space,
//           leading space stripped, punctuation attached).
//   start : word start time in seconds (= first token frame * frame_sec).
//   end   : word end time in seconds (= last token end_offset * frame_sec; see
//           group_words for the per-head end_offset convention).
//   conf  : NeMo's 'min' aggregate of the word's per-token confidences.
struct Word {
    std::string text;
    float       start = 0.0f;
    float       end   = 0.0f;
    float       conf  = 0.0f;
};

// A full transcription result: the flat text, the per-word timestamps +
// confidence, and the raw per-token metadata the words were grouped from.
struct Transcription {
    std::string            text;
    std::vector<Word>      words;
    std::vector<TokenInfo> tokens;
};

// Group a per-token decode (TokenInfo sequence, in emission order) into words,
// matching NeMo's word-offset + confidence convention (timestamps=True,
// confidence aggregation='min').
//
// `pieces` is the tokenizer piece table (index by TokenInfo.id). A token whose
// piece begins with `▁` (U+2581) starts a new word; the leading-`▁` of the
// utterance starts the first word too. Consecutive non-`▁` pieces extend the
// current word. Word text = detokenize(the word's piece ids). A supported
// punctuation mark (extracted from `pieces` like NeMo
// extract_punctuation_from_vocab) attaches to the preceding word and has its
// own start/end refined to the previous token's end (NeMo _refine_timestamps).
//
// Per-token offsets (frames): start_offset = TokenInfo.frame; end_offset =
// TokenInfo.frame + TokenInfo.span. For TDT, span is the predicted duration
// (NeMo _compute_offsets_tdt: end = start + duration). For CTC, NeMo's
// end_offset is the NEXT token's start frame (cumulative run lengths); the
// caller therefore sets each CTC token's span to (next_frame - frame) so the
// `frame + span` rule reproduces NeMo exactly (the id-only ctc_greedy keeps
// span == 1; transcribe_with_timestamps does the run-length rewrite).
//
//   word.start = first_token.frame                      * frame_sec
//   word.end   = (last_token.frame + last_token.span)   * frame_sec
//   word.conf  = min over the word's token confidences
std::vector<Word> group_words(const std::vector<TokenInfo>& tokens,
                              const std::vector<std::string>& pieces,
                              float frame_sec);

} // namespace pk
