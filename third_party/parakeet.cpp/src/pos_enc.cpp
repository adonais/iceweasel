#include "pos_enc.hpp"
#include <cmath>
#include <cassert>

namespace pk {

// INF_VAL from NeMo multi_head_attention.py (used as the sinusoid base).
static constexpr double kInfVal = 10000.0;

void rel_pos_encoding(int T, int d_model, std::vector<float>& out) {
    assert(T > 0 && d_model > 0 && (d_model % 2) == 0);
    const int P = 2 * T - 1;             // number of relative positions
    const int half = d_model / 2;        // number of (sin,cos) pairs

    // div_term[i] = exp(2i * -(log(INF_VAL)/d_model)) for i in [0, half).
    // Compute in double for parity, store the precomputed factors.
    std::vector<double> div_term(half);
    const double factor = -(std::log(kInfVal) / (double)d_model);
    for (int i = 0; i < half; ++i) {
        div_term[i] = std::exp((double)(2 * i) * factor);
    }

    out.assign((size_t)P * d_model, 0.0f);
    // positions run from +(T-1) down to -(T-1).
    for (int p = 0; p < P; ++p) {
        const double pos = (double)((T - 1) - p);   // (T-1), (T-2), ..., -(T-1)
        float* row = out.data() + (size_t)p * d_model;
        for (int i = 0; i < half; ++i) {
            const double arg = pos * div_term[i];
            row[2 * i]     = (float)std::sin(arg);   // even dims
            row[2 * i + 1] = (float)std::cos(arg);   // odd dims
        }
    }
}

void local_rel_pos_encoding(int att_left, int att_right, int d_model,
                            std::vector<float>& out) {
    assert(att_left >= 0 && att_right >= 0 && d_model > 0 && (d_model % 2) == 0);
    const int P = att_left + att_right + 1;   // local relative positions
    const int half = d_model / 2;

    std::vector<double> div_term(half);
    const double factor = -(std::log(kInfVal) / (double)d_model);
    for (int i = 0; i < half; ++i) {
        div_term[i] = std::exp((double)(2 * i) * factor);
    }

    out.assign((size_t)P * d_model, 0.0f);
    // positions run from +att_left down to -att_right (NeMo arange(left,-right-1,-1)).
    for (int p = 0; p < P; ++p) {
        const double pos = (double)(att_left - p);
        float* row = out.data() + (size_t)p * d_model;
        for (int i = 0; i < half; ++i) {
            const double arg = pos * div_term[i];
            row[2 * i]     = (float)std::sin(arg);
            row[2 * i + 1] = (float)std::cos(arg);
        }
    }
}

} // namespace pk
