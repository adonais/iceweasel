#pragma once
#include <cstdio>
#define PK_LOG(...)  do { std::fprintf(stderr, "[parakeet] " __VA_ARGS__); std::fprintf(stderr, "\n"); } while (0)
