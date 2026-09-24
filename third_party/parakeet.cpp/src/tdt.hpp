#pragma once
#include "prediction.hpp"
#include "joint.hpp"
#include "decode_types.hpp"
#include <vector>
#include <cstdint>

namespace pk {

// TDT (Token-and-Duration Transducer) duration-aware greedy decoding.
//
// Ports NeMo GreedyTDTInfer._greedy_decode (rnnt_greedy_decoding.py). Drives the
// prediction net + joint frame-by-frame, advancing the time index by the
// predicted duration each inner step.
//
// Algorithm (per the Phase 3 plan / NeMo):
//   t = 0; hyp = []; committed_state = zeros; last_token = SOS
//   while t < T:
//     symbols_added = 0; need_loop = true
//     while need_loop and symbols_added < max_symbols:
//       g, out_state = pred.step(last_label, committed_state)   # SOS on first emit
//       logits = joint(enc[t], g)                               # raw [V_plus]
//       k   = argmax(logits[:vocab+1])        # token (incl. blank)
//       d_k = argmax(logits[vocab+1:])        # duration index
//       skip = durations[d_k]
//       if k != blank:                        # commit ONLY on non-blank
//         hyp.append(k); last_token = k; committed_state = out_state
//       symbols_added += 1; t += skip; need_loop = (skip == 0)
//     if skip == 0: skip = 1                  # infinite-loop guard
//     if symbols_added == max_symbols: t += 1
//
// Argmax is taken over the RAW joint logits — NeMo log_softmaxes the token and
// duration slices separately only for confidence; argmax is invariant under a
// monotonic log_softmax, so greedy needs no softmax.
//
// pred:       stateful prediction net (carries LSTM h,c across steps).
// joint:      RNN-T joint network (called per (t, u) with T=U=1).
// enc:        encoder output, row-major [T, enc_hidden] — enc[t*enc_hidden + c].
// T:          number of encoder time frames.
// enc_hidden: encoder feature dimension (= d_model).
// durations:  the TDT durations table (e.g. [0,1,2,3,4]); skip = durations[d_k].
// blank_id:   blank token id (= vocab_size); token argmax range is [0, vocab+1).
// max_symbols: max symbols emitted per time frame (NeMo default 10).
//
// Returns the emitted token-id sequence (hyp). All emitted ids are < blank_id.
//
// If `tokens` is non-null it is filled (one entry per emitted id, in order) with
// per-token metadata matching NeMo's timestamps=True + 'max_prob' confidence
// (see TokenInfo): frame = the encoder frame t at emission, conf = max_prob over
// the token slice logits[0:vocab+1] (excluding the TDT duration logits), span =
// durations[d_k] (the predicted duration applied to the token). The id-only path
// (tokens == nullptr) is unchanged.
std::vector<int32_t> tdt_greedy(const PredictionNet& pred, const Joint& joint,
                                const std::vector<float>& enc, int T, int enc_hidden,
                                const std::vector<int32_t>& durations,
                                int blank_id, int max_symbols,
                                std::vector<TokenInfo>* tokens = nullptr);

} // namespace pk
