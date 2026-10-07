/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

/**
 * An article in the two pieces [splitFirstSentence] divides it into: what to read first, and what is left.
 *
 * The first has been through the chunker and is ready for the engine; the second is still the article's own text,
 * because how much of it belongs in a chunk cannot be worked out until the first piece has been read aloud and timed.
 *
 * @property firstChunks What to synthesize first. One sentence, or the parts of one sentence too long for the engine to
 *   accept in a single request.
 * @property remainingText The article after [firstChunks], exactly as the page gave it. A substring rather than
 *   something the chunker returned, so it can be chunked again later without anything having been dropped.
 */
internal data class SplitArticle(val firstChunks: List<String>, val remainingText: String)
