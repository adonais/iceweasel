#include "rnnt.hpp"
#include "decode_common.hpp"
#include <cassert>
#include <cmath>

namespace pk {

RnntDecodeState rnnt_decode_init(const PredictionNet& pred) {
    RnntDecodeState st;
    st.state      = pred.zero_state();
    st.last_token = -1;     // -1 sentinel: nothing emitted yet -> SOS.
    st.have_token = false;
    st.hyp.clear();
    return st;
}

std::vector<int32_t> rnnt_decode_frames(const PredictionNet& pred, const Joint& joint,
                                        const std::vector<float>& enc_frames,
                                        int Tnew, int enc_hidden,
                                        RnntDecodeState& st,
                                        int blank_id, int max_symbols,
                                        std::vector<int32_t>* emit_frames,
                                        std::vector<TokenInfo>* tokens) {
    assert((int)enc_frames.size() == (size_t)Tnew * enc_hidden);
    assert(joint.num_durations() == 0);

    const int V_plus      = joint.V_plus();   // vocab + 1 (incl. blank), no durations
    const int token_count = V_plus;           // argmax over the full output vector
    assert(token_count == joint.vocab_size() + 1);

    // Tokens emitted in THIS call only (st.hyp accumulates across all calls).
    std::vector<int32_t> emitted_this_call;

    // Precompute the encoder projection over ALL frames ONCE (one matmul on the
    // persistent backend), reused for every step. The per-step joint below is a
    // tight churn-free graph on the same backend. The old code rebuilt the full
    // joint per (t,u) (a fresh graph per step, the bulk of the per-utterance
    // graph dispatches).
    std::vector<float> enc_proj;   // row-major [Tnew, joint_hidden]
    joint.precompute_enc_proj(enc_frames, Tnew, enc_hidden, enc_proj);
    const int H = joint.joint_hidden();

    // Scratch reused across inner steps.
    std::vector<float> g;
    PredState out_state;
    std::vector<float> logits;

    // Prediction-net output cache. `g` (and the resulting `out_state`) depend
    // ONLY on the committed (last_token, lstm_state), which change exclusively on
    // an emit. The RNN-T loop visits every encoder frame and emits blank on most
    // of them (advancing time without changing the hypothesis), so recomputing
    // the LSTM each frame repeats an identical forward pass. Cache it and only
    // recompute after an emit — this is what NeMo's GreedyRNNTInfer does, and it
    // collapses the LSTM from ~T+U forwards to ~U (the dominant decode cost).
    bool g_valid = false;

    int t = 0;
    while (t < Tnew) {
        int emitted = 0;
        while (emitted < max_symbols) {
            // Prediction net step from the committed state — only when the cache
            // is stale (first step, or the previous iteration emitted). On a
            // blank frame the committed state is unchanged, so `g`/`out_state`
            // from the prior step are reused verbatim.
            if (!g_valid) {
                // First step (no token committed yet, EVER across the whole
                // stream) uses SOS; otherwise feed the last EMITTED token. The
                // committed state / last_token / have_token are carried in `st`.
                const bool is_sos = !st.have_token;
                const int32_t last_label = st.have_token ? st.last_token : blank_id;
                pred.step(last_label, is_sos, st.state, g, out_state);
                g_valid = true;
            }

            // Joint for (t,u): precomputed enc_proj[t] x g -> raw logits [V_plus].
            joint.step_logits(enc_proj.data() + (size_t)t * H,
                              g.data(), (int)g.size(), logits);

            const int k = decode_argmax(logits.data(), token_count);

            // Blank -> stop emitting at this frame and advance time.
            if (k == blank_id) break;

            // Non-blank -> emit, commit state + last token, STAY at this frame.
            st.hyp.push_back((int32_t)k);
            emitted_this_call.push_back((int32_t)k);
            if (emit_frames) emit_frames->push_back((int32_t)t);
            if (tokens) {
                // NeMo per-token metadata (GreedyRNNTInfer._greedy_decode +
                // max_prob confidence): frame = the (local) encoder frame t at
                // emission, conf = max_prob over the full joint output vector
                // (N = V_plus = vocab+1), span = 1 (RNN-T advances one frame).
                const float conf = decode_max_prob_conf(logits.data(), token_count, k);
                tokens->push_back(TokenInfo{ (int32_t)k, (int32_t)t, conf, 1 });
            }
            st.last_token = (int32_t)k;
            st.state = out_state;
            st.have_token = true;
            g_valid = false;   // committed state advanced -> recompute g next step
            emitted += 1;
        }

        // Advance exactly one frame (blank, or max_symbols exhausted).
        t += 1;
    }

    return emitted_this_call;
}

std::vector<int32_t> rnnt_greedy(const PredictionNet& pred, const Joint& joint,
                                 const std::vector<float>& enc, int T, int enc_hidden,
                                 int blank_id, int max_symbols,
                                 std::vector<TokenInfo>* tokens) {
    // The whole-encoder greedy decode is exactly the stateful stepper driven
    // once over all T frames from a fresh state (the loop carries nothing but
    // RnntDecodeState across frames, so chunking is irrelevant to the result).
    RnntDecodeState st = rnnt_decode_init(pred);
    if (tokens) tokens->clear();
    rnnt_decode_frames(pred, joint, enc, T, enc_hidden, st, blank_id, max_symbols,
                       /*emit_frames=*/nullptr, tokens);
    return st.hyp;
}

} // namespace pk
