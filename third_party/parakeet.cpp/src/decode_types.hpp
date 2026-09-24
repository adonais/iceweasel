#pragma once
#include <cstdint>

namespace pk {

// Per-emitted-token decode metadata produced by the greedy decoders when an
// optional out-vector is requested. Mirrors NeMo's per-token timestamp +
// confidence (timestamps=True, confidence method 'max_prob').
//
//   id    : the emitted token id (always < blank_id; same as the id-only path).
//   frame : the encoder time frame attributed to the token (see per-head note).
//             * CTC  -> the frame where the token's consecutive RUN STARTS
//                       (NeMo `start_offset` for the collapsed token).
//             * RNNT -> the encoder frame `t` at the emission step.
//             * TDT  -> the encoder frame `t` at the emission step.
//           Time(seconds) = frame * frame_sec (= hop * subsampling / sample_rate).
//   conf  : NeMo's rescaled `max_prob` confidence in (0, 1]:
//               conf = (N * p_max - 1) / (N - 1)        (alpha == 1.0)
//           where p_max is the softmax probability of the emitted (argmax)
//           token over the SAME logit slice NeMo log-softmaxes, and N is the
//           number of classes in that slice (= vocab_size + 1, incl. blank).
//   span  : the number of encoder frames this token spans, for word-end timing.
//             * CTC  -> 1
//             * RNNT -> 1
//             * TDT  -> durations[d_k] (the predicted duration/skip applied
//                       for this token).
struct TokenInfo {
    int32_t id;
    int32_t frame;
    float   conf;
    int32_t span;
};

} // namespace pk
