#pragma once
#include <vector>
namespace pk {

// Relative positional encoding table for the FastConformer encoder, matching
// NeMo's RelPositionalEncoding (multi_head_attention.py).
//
// For an input of length T, NeMo builds `pos_emb` over 2T-1 relative positions
// running from +(T-1) DOWN TO -(T-1) (inclusive). Each row p holds a sinusoid:
//   div_term[i] = exp(2i * -(log(10000)/d_model))           for i in [0, d_model/2)
//   pe[p, 2i]   = sin(position(p) * div_term[i])
//   pe[p, 2i+1] = cos(position(p) * div_term[i])
// where position(0) = T-1, position(1) = T-2, ..., position(2T-2) = -(T-1).
//
// (NeMo precomputes the table over a larger length and slices the center; the
// sliced positions are exactly +(T-1)..-(T-1), independent of the precompute
// length, so computing directly for T reproduces the same values.)
//
// Output: row-major [2T-1, d_model] (d_model fastest), i.e. out[p*d_model + c].
void rel_pos_encoding(int T, int d_model, std::vector<float>& out);

// LOCAL relative positional encoding for NeMo rel_pos_local_attn
// (LocalAttRelPositionalEncoding): positions run from +att_left DOWN TO
// -att_right (att_left+att_right+1 rows), using the SAME sinusoid as
// rel_pos_encoding. These are exactly the centre rows of the full table, so
// banded attention's positional term is bit-identical to NeMo's local pos.
//
// Output: row-major [att_left+att_right+1, d_model] (d_model fastest).
void local_rel_pos_encoding(int att_left, int att_right, int d_model,
                            std::vector<float>& out);

} // namespace pk
