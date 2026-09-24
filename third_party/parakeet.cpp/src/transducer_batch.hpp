#pragma once
#include "prediction.hpp"
#include "joint.hpp"
#include "decode_types.hpp"
#include <vector>
#include <cstdint>
namespace pk {
// Batched greedy decode for N utterances. encs[n]: row-major [T[n], enc_hidden].
// durations empty -> RNNT (advance-by-1); non-empty -> TDT (advance-by-duration).
// Outputs per item: ids[n], and (if toks != nullptr) TokenInfo[n]. Produces
// output bit-identical to per-item rnnt_greedy / tdt_greedy.
void transducer_greedy_batch(
    const PredictionNet& pred, const Joint& joint,
    const std::vector<std::vector<float>>& encs,
    const std::vector<int>& T,             // [N] per-item frame counts
    int enc_hidden,
    const std::vector<int32_t>& durations, // empty=RNNT
    int blank_id, int max_symbols,
    std::vector<std::vector<int32_t>>& ids,            // OUT [N][.]
    std::vector<std::vector<TokenInfo>>* toks);         // OUT [N][.] or nullptr
} // namespace pk
