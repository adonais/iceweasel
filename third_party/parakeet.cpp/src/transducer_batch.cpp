#include "transducer_batch.hpp"
#include "decode_common.hpp"
#include <cassert>
#include <cstring>

namespace pk {

// Batched greedy transducer decode. This is a faithful transposition of the
// per-item loops in tdt.cpp (tdt_greedy) and rnnt.cpp (rnnt_decode_frames),
// run for N items in lockstep "rounds". Each round runs ONE batched prediction
// step and ONE batched joint step over all active items, then applies the
// EXACT per-item rule from the oracle to each item independently.
//
// Parity rationale:
//  - The per-item `g_valid` cache (skip the batched LSTM forward on rounds where
//    no active item emitted) is a pure speed optimization: recomputing g from the
//    SAME committed state yields an identical g, so reusing the cached g column is
//    byte-identical. Mirrors the per-item `g_valid` in tdt.cpp/rnnt.cpp.
//  - State recovery / masking: we only copy out_state columns into `committed`
//    for items that emitted this round; non-emitting items keep their prior
//    committed columns, exactly as the per-item loop leaves committed unchanged
//    on a blank.
void transducer_greedy_batch(
    const PredictionNet& pred, const Joint& joint,
    const std::vector<std::vector<float>>& encs,
    const std::vector<int>& T,
    int enc_hidden,
    const std::vector<int32_t>& durations,
    int blank_id, int max_symbols,
    std::vector<std::vector<int32_t>>& ids,
    std::vector<std::vector<TokenInfo>>* toks) {

    const bool is_tdt = !durations.empty();
    const int N = (int)encs.size();
    assert((int)T.size() == N);

    const int Hj      = joint.joint_hidden();
    const int Hp      = pred.hidden_size();
    const int L       = pred.num_layers();
    const int Vp      = joint.V_plus();
    const int num_dur = (int)durations.size();
    // RNNT: argmax over the full V_plus. TDT: argmax over the token slice
    // (vocab+1), durations live in [token_count, V_plus). Mirrors the oracle:
    //   tdt.cpp  token_count = V_plus - num_dur
    //   rnnt.cpp token_count = V_plus
    const int token_count = is_tdt ? (Vp - num_dur) : Vp;

    // Per-item precomputed encoder projection [T[n], Hj].
    std::vector<std::vector<float>> ep(N);
    for (int n = 0; n < N; ++n) {
        joint.precompute_enc_proj(encs[n], T[n], enc_hidden, ep[n]);
    }

    // Outputs.
    ids.assign(N, {});
    if (toks) toks->assign(N, {});

    // Per-item host state.
    std::vector<int> t(N, 0);
    std::vector<uint8_t> active(N, 0);
    std::vector<int32_t> last_token(N, -1);
    std::vector<uint8_t> have_token(N, 0);
    // Per-frame symbol counter (TDT symbols_added / RNNT emitted).
    std::vector<int> sym_at_frame(N, 0);
    for (int n = 0; n < N; ++n) active[n] = (T[n] > 0) ? 1 : 0;

    // Per-item prediction-net cache validity. 0 = stale (g column must be
    // recomputed before the joint), 1 = fresh (the persistent `g` buffer still
    // holds this item's correct column from a prior round). All stale initially
    // so the first round runs pred from SOS. Mirrors tdt.cpp/rnnt.cpp `g_valid`:
    // set false on emit (committed state advanced), reused otherwise. Bit-exact:
    // recomputing g from an UNCHANGED committed state yields an identical g, so
    // skipping the pred step on all-valid rounds reuses the same values.
    std::vector<uint8_t> g_valid(N, 0);

    // Committed batched LSTM state, zero-initialized [L][Hp*N].
    BatchedPredState committed;
    committed.h.assign((size_t)L, std::vector<float>((size_t)Hp * N, 0.0f));
    committed.c.assign((size_t)L, std::vector<float>((size_t)Hp * N, 0.0f));

    // Scratch reused across rounds.
    std::vector<int32_t> token_ids(N);
    std::vector<uint8_t>  is_sos(N);
    std::vector<float>    g;            // [Hp*N]
    BatchedPredState      out_state;
    std::vector<float>    enc_proj_gathered((size_t)Hj * N);
    std::vector<float>    logits;       // [Vp*N]

    auto any_active = [&]() {
        for (int n = 0; n < N; ++n) if (active[n]) return true;
        return false;
    };

    // Commit item n's state columns (offset n*Hp, all L layers, both h and c)
    // from out_state into committed. Used on every emit in both branches.
    auto commit_state = [&](int n) {
        for (int l = 0; l < L; ++l) {
            std::memcpy(&committed.h[l][(size_t)n * Hp],
                        &out_state.h[l][(size_t)n * Hp], (size_t)Hp * sizeof(float));
            std::memcpy(&committed.c[l][(size_t)n * Hp],
                        &out_state.c[l][(size_t)n * Hp], (size_t)Hp * sizeof(float));
        }
    };

    // Assumes max_symbols >= 1 (NeMo default 10). The per-round emit rule below
    // mirrors the oracle inner loops, which never run at max_symbols==0.
    while (any_active()) {
        // (1) Batched prediction step from the committed state, but only when
        // some active item's cache is stale. If every active item already has a
        // fresh `g` column (no emit since it was last computed), the persistent
        // `g` buffer still holds the correct values and we skip the LSTM forward
        // entirely — the same per-item caching as tdt.cpp/rnnt.cpp, batched.
        bool any_stale = false;
        for (int n = 0; n < N; ++n) {
            if (active[n] && !g_valid[n]) { any_stale = true; break; }
        }
        if (any_stale) {
            // Build inputs from committed last_token/have_token. Inactive items
            // still need valid inputs (their output is ignored): SOS / blank_id.
            for (int n = 0; n < N; ++n) {
                is_sos[n]    = have_token[n] ? 0 : 1;
                token_ids[n] = have_token[n] ? last_token[n] : (int32_t)blank_id;
            }
            pred.step_batch(token_ids, is_sos, committed, g, out_state);
            // Every active item's g column is now fresh. (Recomputing a
            // non-emitter's g from its unchanged committed state reproduces its
            // cached value bit-for-bit, so marking it valid is exact.)
            for (int n = 0; n < N; ++n) if (active[n]) g_valid[n] = 1;
        }

        // (2) Gather each active item's enc_proj row for its current frame and
        // run ONE batched joint step -> logits[Vp*N].
        for (int n = 0; n < N; ++n) {
            int tf = t[n];
            if (tf < 0) tf = 0;                 // t[n] only grows from 0; lower clamp is defensive. Upper clamp matters for inactive/boundary columns.
            if (tf > T[n] - 1) tf = T[n] - 1;   // clamp (boundary / inactive)
            if (T[n] <= 0) tf = 0;              // no frames: harmless, ignored
            const float* src = (T[n] > 0) ? (ep[n].data() + (size_t)tf * Hj) : ep[n].data();
            if (T[n] > 0) {
                std::memcpy(&enc_proj_gathered[(size_t)n * Hj], src, (size_t)Hj * sizeof(float));
            } else {
                std::memset(&enc_proj_gathered[(size_t)n * Hj], 0, (size_t)Hj * sizeof(float));
            }
        }
        joint.step_logits_batch(enc_proj_gathered.data(), g.data(), Hp, N, logits);

        // (3) Per-item rule from the oracle.
        for (int n = 0; n < N; ++n) {
            if (!active[n]) continue;
            const float* lz = logits.data() + (size_t)n * Vp;
            const int k = decode_argmax(lz, token_count);

            if (is_tdt) {
                // --- tdt.cpp inner iteration ---
                const int d_k  = decode_argmax(lz + token_count, num_dur);
                int skip = durations[d_k];

                if (k != blank_id) {
                    ids[n].push_back((int32_t)k);
                    if (toks) {
                        const float conf = decode_max_prob_conf(lz, token_count, k);
                        (*toks)[n].push_back(TokenInfo{ (int32_t)k, (int32_t)t[n], conf,
                                                        (int32_t)skip });
                    }
                    last_token[n] = (int32_t)k;
                    have_token[n] = 1;
                    commit_state(n);
                    g_valid[n] = 0;   // committed state advanced -> g stale next round
                }
                // ALWAYS: symbols_added += 1; t += skip; need_loop = (skip == 0).
                sym_at_frame[n] += 1;
                t[n] += skip;

                // Inner loop in tdt.cpp continues iff (need_loop && symbols_added
                // < max_symbols), i.e. (skip == 0 && sym_at_frame < max_symbols).
                // Otherwise the frame is done. Post-inner: tdt.cpp does
                //   if (skip == 0) skip = 1;   // dead for t (skip is local)
                //   if (symbols_added == max_symbols) t += 1;
                const bool frame_done = !(skip == 0 && sym_at_frame[n] < max_symbols);
                if (frame_done) {
                    if (sym_at_frame[n] == max_symbols) t[n] += 1;
                    sym_at_frame[n] = 0;
                }
            } else {
                // --- rnnt.cpp inner iteration ---
                if (k == blank_id) {
                    // Blank -> stop emitting at this frame, advance time.
                    t[n] += 1;
                    sym_at_frame[n] = 0;
                } else {
                    ids[n].push_back((int32_t)k);
                    if (toks) {
                        const float conf = decode_max_prob_conf(lz, token_count, k);
                        (*toks)[n].push_back(TokenInfo{ (int32_t)k, (int32_t)t[n], conf, 1 });
                    }
                    last_token[n] = (int32_t)k;
                    have_token[n] = 1;
                    commit_state(n);
                    g_valid[n] = 0;   // committed state advanced -> g stale next round
                    sym_at_frame[n] += 1;
                    // emitted == max_symbols exits the inner while -> advance frame.
                    if (sym_at_frame[n] >= max_symbols) {
                        t[n] += 1;
                        sym_at_frame[n] = 0;
                    }
                }
            }

            // Recompute activity after time update.
            active[n] = (t[n] < T[n]) ? 1 : 0;
        }
    }
}

} // namespace pk
