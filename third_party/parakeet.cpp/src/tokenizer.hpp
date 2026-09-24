#pragma once
#include <string>
#include <vector>
#include <cstdint>
namespace pk {
// Map each id to its SentencePiece piece, concatenate, replace the U+2581
// meta-space character (▁, UTF-8: 0xE2 0x96 0x81) with a regular space, and
// strip a single leading space if present.  This matches the behavior of
// NeMo SentencePieceTokenizer::ids_to_text (non-legacy path) which calls
// sentencepiece::SentencePieceProcessor::decode_ids.
std::string detokenize(const std::vector<std::string>& pieces,
                       const std::vector<int32_t>& ids);
} // namespace pk
