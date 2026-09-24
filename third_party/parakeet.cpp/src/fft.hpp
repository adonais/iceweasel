#pragma once
#include <vector>
namespace pk {
// Real FFT of length n (n must be power of 2). Fills re/im for bins [0, n/2].
void rfft(const std::vector<float>& in, std::vector<float>& re, std::vector<float>& im);
}
