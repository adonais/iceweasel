#pragma once
#include "decode_types.hpp"
#include <cstdint>
#include <vector>

namespace pk {

// CTC greedy decode (collapse repeats, then drop blank) — the standard CTC
// decoding rule, matching NeMo's GreedyCTCInfer.
//
//   logits: row-major [T, vocab_plus_1] (logits[t*vocab_plus_1 + v]).
//   For each frame t: id_t = argmax_v logits[t, v].
//   Collapse consecutive-duplicate ids, THEN remove every id == blank_id.
//
// For the hybrid CTC head, blank_id == vocab_size and vocab_plus_1 ==
// vocab_size + 1, so blank is the last column.
//
// Returns the surviving (non-blank, de-duplicated) token ids.
//
// If `tokens` is non-null it is filled (one entry per returned id, in order)
// with per-token metadata matching NeMo's timestamps=True + 'max_prob'
// confidence (see TokenInfo): frame = the collapsed token's run-START frame
// (NeMo `start_offset`), conf = min over the token's consecutive argmax run of
// the per-frame max_prob confidence, span = 1. The id-only path (tokens ==
// nullptr) is unchanged.
std::vector<int32_t> ctc_greedy(const std::vector<float>& logits,
                                int T, int vocab_plus_1, int blank_id,
                                std::vector<TokenInfo>* tokens = nullptr);

} // namespace pk
