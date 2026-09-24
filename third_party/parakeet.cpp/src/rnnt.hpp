#pragma once
#include "prediction.hpp"
#include "joint.hpp"
#include "decode_types.hpp"
#include <vector>
#include <cstdint>

namespace pk {

// Standard RNN-Transducer greedy decoding (no duration head).
//
// Ports NeMo GreedyRNNTInfer._greedy_decode (rnnt_greedy_decoding.py). Drives the
// prediction net + joint frame-by-frame. Unlike TDT there are NO duration logits:
// the joint output is exactly vocab+1 (num_durations()==0 -> V_plus=vocab+1). On a
// blank the time index advances by exactly one frame; on a non-blank a symbol is
// emitted and the loop STAYS at the same frame (capped by max_symbols).
//
// Algorithm (NeMo):
//   t = 0; hyp = []; committed_state = zeros; last_token = SOS; have_token = false
//   while t < T:
//     emitted = 0
//     while emitted < max_symbols:
//       is_sos = !have_token
//       g, out_state = pred.step(last_label, is_sos, committed_state)
//       logits = joint(enc[t], g)             # raw [vocab+1]
//       k = argmax(logits)                    # token (incl. blank)
//       if k == blank: break                  # blank -> stop emitting, advance time
//       hyp.append(k); last_token = k; committed_state = out_state; have_token = true
//       emitted += 1                          # commit on non-blank, STAY at t
//     t += 1                                  # advance exactly one frame
//
// Argmax is taken over the RAW joint logits — argmax is invariant under the
// monotonic log_softmax NeMo applies for confidence, so greedy needs no softmax.
//
// pred:       stateful prediction net (carries LSTM h,c across steps).
// joint:      RNN-T joint network (called per (t, u) with T=U=1), V_plus=vocab+1.
// enc:        encoder output, row-major [T, enc_hidden] — enc[t*enc_hidden + c].
// T:          number of encoder time frames.
// enc_hidden: encoder feature dimension (= d_model).
// blank_id:   blank token id (= vocab_size); argmax range is [0, vocab+1).
// max_symbols: max symbols emitted per time frame (NeMo default 10).
//
// Returns the emitted token-id sequence (hyp). All emitted ids are < blank_id.
//
// If `tokens` is non-null it is filled (one entry per emitted id, in order) with
// per-token metadata (see TokenInfo): frame = the encoder frame t at emission,
// conf = max_prob over the full joint output vector, span = 1. The id-only path
// (tokens == nullptr) is unchanged.
std::vector<int32_t> rnnt_greedy(const PredictionNet& pred, const Joint& joint,
                                 const std::vector<float>& enc, int T, int enc_hidden,
                                 int blank_id, int max_symbols,
                                 std::vector<TokenInfo>* tokens = nullptr);

// Carried RNN-T greedy decoding state, so the per-frame loop can be driven
// INCREMENTALLY (the encoder frames arrive in chunks but the decoder must NOT
// reset across chunk boundaries). This is exactly the loop-carried state of
// rnnt_greedy lifted into a struct (NeMo partial_hypotheses): the committed
// (non-blank) prediction-net LSTM state, the last emitted label + "have we
// emitted yet" flag (== SOS handling), and the accumulated hypothesis.
//
// Feeding the encoder frames [0..T) split into chunks of any size, via repeated
// rnnt_decode_frames calls on the SAME RnntDecodeState, produces the identical
// token sequence as rnnt_greedy on the whole [0..T) at once — because the only
// thing the frame loop carries across frames is exactly this struct, and the
// per-frame inner emit-until-blank loop is independent of how the frames were
// chunked.
struct RnntDecodeState {
    PredState state;          // committed prediction-net LSTM state (h,c per layer)
    int32_t   last_token = -1; // last EMITTED token (-1 sentinel: nothing yet → SOS)
    bool      have_token = false; // have we emitted any token (false → use SOS)
    std::vector<int32_t> hyp;  // accumulated emitted token ids (across all chunks)
};

// Initialise a fresh decode state (zeroed prediction-net LSTM state, SOS).
RnntDecodeState rnnt_decode_init(const PredictionNet& pred);

// Run the RNN-T greedy frame loop over `Tnew` NEW encoder frames, carrying and
// updating `st` (so subsequent calls continue from where this one left off).
// enc_frames: row-major [Tnew, enc_hidden], enc_frames[t*enc_hidden + c].
// Appends the newly emitted token ids to st.hyp AND returns the ids emitted in
// THIS call (for the streaming "newly finalized tokens" API). The decoder state
// (LSTM, last token, SOS flag) persists in `st` across calls.
//
// If `emit_frames` is non-null it is filled (one entry per returned token) with
// the LOCAL frame index t in [0, Tnew) at which that token was emitted — the
// caller adds the running global encoder-frame offset to recover an absolute
// frame index (used for EOU/EOB event timing, matching NeMo's per-token
// timestamp = the encoder time index that produced the symbol).
//
// If `tokens` is non-null it is APPENDED to (one entry per token emitted in this
// call, same convention as `emit_frames`) with per-token metadata matching
// NeMo's timestamps=True + 'max_prob' confidence (see TokenInfo): frame = the
// LOCAL emission frame t in [0, Tnew), conf = max_prob over the full joint output
// vector (N = V_plus = vocab+1), span = 1. The id-only paths (both out-params
// null) are unchanged.
std::vector<int32_t> rnnt_decode_frames(const PredictionNet& pred, const Joint& joint,
                                        const std::vector<float>& enc_frames,
                                        int Tnew, int enc_hidden,
                                        RnntDecodeState& st,
                                        int blank_id, int max_symbols,
                                        std::vector<int32_t>* emit_frames = nullptr,
                                        std::vector<TokenInfo>* tokens = nullptr);

} // namespace pk
