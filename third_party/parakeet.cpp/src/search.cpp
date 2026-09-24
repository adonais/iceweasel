#include "search.hpp"
#include <cmath>

namespace pk {

namespace {
// NeMo's rescaled `max_prob` confidence (confidence method 'max_prob', alpha==1.0):
//     conf = (N * p_max - 1) / (N - 1)
// where p_max is the softmax probability of the argmax class (== exp of the max
// LOG-prob over the slice) and N is the number of classes in that slice
// (num_tokens = vocab_size + 1, blank included). See
// asr_confidence_utils.get_confidence_measure_bank()["max_prob"] (the t==1.0
// branch) and ConfidenceMethodMixin._init_confidence_method (num_tokens = blank+1).
float max_prob_conf(float max_logprob, int num_classes) {
    const float p_max = std::exp(max_logprob);
    const float N = (float)num_classes;
    return (N * p_max - 1.0f) / (N - 1.0f);
}
} // namespace

std::vector<int32_t> ctc_greedy(const std::vector<float>& logits,
                                int T, int vocab_plus_1, int blank_id,
                                std::vector<TokenInfo>* tokens) {
    std::vector<int32_t> out;
    if (tokens) tokens->clear();
    if (T <= 0 || vocab_plus_1 <= 0) return out;

    out.reserve(T);
    // Mirror NeMo's AbstractCTCDecoding.decode_hypothesis fold_consecutive loop:
    //   previous = blank_id
    //   emit p iff (p != previous or previous == blank_id) and p != blank_id
    //   previous = p   (updated every frame, including blank frames)
    //
    // Per-frame argmax + per-frame max_prob confidence (CTC logits are
    // log-softmax, so p_max = exp(max log-prob)). For TokenInfo we additionally
    // reproduce NeMo's per-token timestamp + confidence:
    //   * frame  = the collapsed token's `start_offset`. NeMo computes
    //              start_offset[0] = max(0, peak[0] - 1) and
    //              start_offset[i] = peak[i-1] for i>=1, where peak[i] is the
    //              argmax frame at which token i is emitted (the first frame of
    //              its consecutive run). I.e. the run-START frame: token i's
    //              start_offset is the PREVIOUS token's emit frame.
    //   * conf   = MIN over token i's consecutive argmax run of the per-frame
    //              max_prob confidence (aggregation='min', exclude_blank=True).
    //   * span   = 1.
    const int N = vocab_plus_1;  // num classes in the CTC softmax (vocab + blank).

    int32_t previous = blank_id;
    int  prev_peak = 0;          // emit frame (peak) of the previously emitted token.
    bool have_prev = false;      // any token emitted yet?
    float cur_run_min = 1.0f;    // running min per-frame conf over the current run.

    for (int t = 0; t < T; ++t) {
        const float* row = logits.data() + (size_t)t * vocab_plus_1;
        // argmax over the vocab axis (ties resolve to the lowest index, as in
        // PyTorch/NumPy argmax — matches NeMo's torch.argmax / prediction.max).
        int32_t p = 0;
        float best_val = row[0];
        for (int v = 1; v < vocab_plus_1; ++v) {
            if (row[v] > best_val) { best_val = row[v]; p = v; }
        }

        const bool emit = (p != previous || previous == blank_id) && p != blank_id;
        if (emit) {
            out.push_back(p);
            if (tokens) {
                // Close out the PREVIOUS token's accumulated run-min conf before
                // starting the new token's run.
                if (!tokens->empty()) tokens->back().conf = cur_run_min;
                // start_offset: token 0 -> max(0, peak0 - 1); else previous peak.
                const int32_t frame = have_prev ? (int32_t)prev_peak
                                                 : (int32_t)(t > 0 ? t - 1 : 0);
                tokens->push_back(TokenInfo{ p, frame, /*conf placeholder*/0.0f, 1 });
                cur_run_min = max_prob_conf(best_val, N);  // first frame of new run.
                prev_peak = t;
                have_prev = true;
            }
        } else if (p == previous && p != blank_id) {
            // Continuation of the current token's consecutive argmax run.
            if (tokens) {
                const float c = max_prob_conf(best_val, N);
                if (c < cur_run_min) cur_run_min = c;
            }
        }
        previous = p;
    }
    // Finalize the last token's run-min.
    if (tokens && !tokens->empty()) tokens->back().conf = cur_run_min;
    return out;
}

} // namespace pk
