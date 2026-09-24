#include "tdt.hpp"
#include "decode_common.hpp"
#include <cassert>
#include <cmath>

namespace pk {

std::vector<int32_t> tdt_greedy(const PredictionNet& pred, const Joint& joint,
                                const std::vector<float>& enc, int T, int enc_hidden,
                                const std::vector<int32_t>& durations,
                                int blank_id, int max_symbols,
                                std::vector<TokenInfo>* tokens) {
    assert((int)enc.size() == (size_t)T * enc_hidden);
    assert(!durations.empty());

    const int V_plus       = joint.V_plus();
    const int num_dur      = (int)durations.size();
    const int token_count  = V_plus - num_dur;   // vocab + 1 (incl. blank) = 1025
    assert(token_count == joint.vocab_size() + 1);
    assert(num_dur == joint.num_durations());

    std::vector<int32_t> hyp;
    if (tokens) tokens->clear();

    // Committed (non-blank) decoding state and last emitted token.
    PredState committed = pred.zero_state();
    int32_t last_token = -1;      // -1 sentinel: nothing emitted yet -> SOS.
    bool emitted_any = false;

    // Precompute the encoder projection over ALL frames ONCE (one matmul on the
    // persistent backend), reused for every step. The per-step joint below is a
    // tight churn-free graph on the same backend. The old code rebuilt the full
    // joint per (t,u) step (a fresh graph per step — the bulk of the
    // per-utterance graph dispatches).
    std::vector<float> enc_proj;   // row-major [T, joint_hidden]
    joint.precompute_enc_proj(enc, T, enc_hidden, enc_proj);
    const int H = joint.joint_hidden();

    // Scratch reused across inner steps.
    std::vector<float> g;
    PredState out_state;
    std::vector<float> logits;

    // Prediction-net output cache: `g`/`out_state` depend only on the committed
    // (last_token, lstm_state), which change exclusively on an emit (k != blank).
    // Steps that don't emit reuse the cached forward pass instead of recomputing
    // the LSTM. See the RNN-T loop for the full rationale.
    bool g_valid = false;

    int t = 0;
    while (t < T) {
        int symbols_added = 0;
        bool need_loop = true;
        int skip = 0;

        while (need_loop && symbols_added < max_symbols) {
            // Prediction net step from the committed state — only when the cache
            // is stale (first step, or the previous step emitted). SOS until the
            // first emit; otherwise feed the last EMITTED token.
            if (!g_valid) {
                const bool is_sos = !emitted_any;
                const int32_t last_label = emitted_any ? last_token : blank_id;
                pred.step(last_label, is_sos, committed, g, out_state);
                g_valid = true;
            }

            // Joint for (t,u): precomputed enc_proj[t] x g -> raw logits [V_plus].
            // `t` is always in [0, T): the outer loop guards the first inner
            // iteration, and subsequent inner iterations only run when skip==0
            // (t unchanged). A positive skip exits the inner loop. This matches
            // the old per-step `enc[t*enc_hidden]` access exactly.
            assert(t < T && "enc_proj row out of range");
            joint.step_logits(enc_proj.data() + (size_t)t * H,
                              g.data(), (int)g.size(), logits);

            // Split: token logits [0, token_count), duration logits [token_count, V_plus).
            const int k   = decode_argmax(logits.data(), token_count);
            const int d_k = decode_argmax(logits.data() + token_count, num_dur);
            skip = durations[d_k];

            // Commit state + last_token ONLY when k != blank.
            if (k != blank_id) {
                hyp.push_back((int32_t)k);
                if (tokens) {
                    // NeMo per-token metadata (matches GreedyTDTInfer._greedy_decode
                    // + max_prob confidence):
                    //   frame = the encoder frame t at emission (hypothesis.timestamp).
                    //   conf  = max_prob over the TOKEN slice logits[0:vocab+1]
                    //           (NeMo log_softmaxes that slice; exclude the duration
                    //           logits). N = token_count = vocab + 1.
                    //   span  = durations[d_k] (the duration/skip applied to the token).
                    const float conf = decode_max_prob_conf(logits.data(), token_count, k);
                    tokens->push_back(TokenInfo{ (int32_t)k, (int32_t)t, conf,
                                                 (int32_t)skip });
                }
                last_token = (int32_t)k;
                committed = out_state;   // carry the step's new (h', c')
                emitted_any = true;
                g_valid = false;         // committed state advanced -> recompute g
            }
            // else: discard out_state; committed/last_token unchanged (g stays valid).

            symbols_added += 1;
            t += skip;
            need_loop = (skip == 0);
        }

        // Infinite-loop guard: if we exited with duration 0 (blank + dur 0), step
        // forward by one frame anyway.
        if (skip == 0) skip = 1;

        // If we stopped because max_symbols was hit (not because of a positive
        // duration), advance the frame by one to make progress.
        if (symbols_added == max_symbols) t += 1;
    }

    return hyp;
}

} // namespace pk
