#pragma once

#include <cstdint>
#include <vector>
#include <unordered_map>
#include <unordered_set>

struct range_nfd {
    uint32_t first;
    uint32_t last;
    uint32_t nfd;
};

static const uint32_t MAX_CODEPOINTS = 0x110000;

extern const std::initializer_list<std::pair<uint32_t, uint16_t>> unicode_ranges_flags;
// Firefox (no static constructors): the std::unordered_set has a non-trivial
// constructor/destructor, so expose it via a lazily-initialized accessor instead
// of a load-time global. The initializer_list globals are constant-initialized
// and need no such treatment.
const std::unordered_set<uint32_t> & get_unicode_set_whitespace();
extern const std::initializer_list<std::pair<uint32_t, uint32_t>> unicode_map_lowercase;
extern const std::initializer_list<std::pair<uint32_t, uint32_t>> unicode_map_uppercase;
extern const std::initializer_list<range_nfd> unicode_ranges_nfd;
