/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket.ui

import android.graphics.Rect
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import mozilla.components.compose.base.modifier.onShown
import mozilla.components.compose.base.utils.inComposePreview
import mozilla.components.service.pocket.PocketStory
import mozilla.components.service.pocket.PocketStory.ContentRecommendation
import mozilla.components.service.pocket.PocketStory.PocketRecommendedStory
import mozilla.components.service.pocket.PocketStory.PocketSponsoredStory
import mozilla.components.service.pocket.PocketStory.SponsoredContent
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.IMAGE_SIZE
import org.mozilla.fenix.compose.ListItemTabSurface
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.home.pocket.PocketRecommendedStoriesCategory
import org.mozilla.fenix.home.ui.HomepageTestTag.HOMEPAGE_SPONSORED_STORY
import org.mozilla.fenix.home.ui.HomepageTestTag.HOMEPAGE_STORY
import org.mozilla.fenix.theme.FirefoxTheme
import kotlin.math.roundToInt

private const val URI_PARAM_UTM_KEY = "utm_source"
private const val POCKET_STORIES_UTM_VALUE = "pocket-newtab-android"
private const val DEFAULT_MAX_LINES = 3
private const val SPONSORED_MAX_LINES = 2

/**
 * Displays a single [PocketRecommendedStory].
 *
 * @param story The [PocketRecommendedStory] to be displayed.
 * @param backgroundColor The background [Color] of the story.
 * @param onStoryClick Callback for when the user taps on this story.
 */
@Composable
fun Story(
    @PreviewParameter(StoryProvider::class) story: PocketRecommendedStory,
    backgroundColor: Color,
    onStoryClick: (PocketRecommendedStory) -> Unit,
) {
    val imageUrl = story.imageUrl.replace(
        "{wh}",
        with(LocalDensity.current) {
            "${IMAGE_SIZE.dp.toPx().roundToInt()}x${
                IMAGE_SIZE.dp.toPx().roundToInt()
            }"
        },
    )

    ListItemTabSurface(
        imageUrl = imageUrl,
        backgroundColor = backgroundColor,
        onClick = { onStoryClick(story) },
    ) {
        Text(
            text = story.title,
            modifier = Modifier.semantics {
                testTagsAsResourceId = true
                testTag = "pocket.story.title"
            },
            color = FirefoxTheme.colors.textPrimary,
            overflow = TextOverflow.Ellipsis,
            maxLines = maxLines(),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

/**
 * Displays a single [PocketSponsoredStory].
 *
 * @param story The [PocketSponsoredStory] to be displayed.
 * @param backgroundColor The background [Color] of the story.
 * @param onStoryClick Callback for when the user taps on this story.
 */
@Composable
fun SponsoredStory(
    story: PocketSponsoredStory,
    backgroundColor: Color,
    onStoryClick: (PocketSponsoredStory) -> Unit,
) {
    val (imageWidth, imageHeight) = with(LocalDensity.current) {
        IMAGE_SIZE.dp.toPx().roundToInt() to IMAGE_SIZE.dp.toPx().roundToInt()
    }
    val imageUrl = story.imageUrl.replace(
        "&resize=w[0-9]+-h[0-9]+".toRegex(),
        "&resize=w$imageWidth-h$imageHeight",
    )

    ListItemTabSurface(
        imageUrl = imageUrl,
        backgroundColor = backgroundColor,
        onClick = { onStoryClick(story) },
    ) {
        Column(
            verticalArrangement = Arrangement.SpaceEvenly,
        ) {
            Text(
                text = story.title,
                modifier = Modifier.semantics {
                    testTagsAsResourceId = true
                    testTag = "pocket.sponsoredStory.title"
                },
                color = FirefoxTheme.colors.textPrimary,
                overflow = TextOverflow.Ellipsis,
                maxLines = maxSponsoredLines(),
                style = FirefoxTheme.typography.body2,
            )

            Text(
                text = stringResource(R.string.pocket_stories_sponsor_indication),
                modifier = Modifier.semantics {
                    testTagsAsResourceId = true
                    testTag = "pocket.sponsoredStory.identifier"
                },
                color = FirefoxTheme.colors.textSecondary,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                style = FirefoxTheme.typography.caption,
            )
        }
    }
}

/**
 * Displays a single [SponsoredContent].
 *
 * @param sponsoredContent The [SponsoredContent] to be displayed.
 * @param backgroundColor The background [Color] of the sponsored content.
 * @param onClick Callback for when the user taps on the sponsored content.
 */
@Composable
fun SponsoredContentStory(
    sponsoredContent: SponsoredContent,
    backgroundColor: Color,
    onClick: (SponsoredContent) -> Unit,
) {
    ListItemTabSurface(
        imageUrl = sponsoredContent.imageUrl,
        backgroundColor = backgroundColor,
        onClick = { onClick(sponsoredContent) },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.SpaceEvenly,
        ) {
            Text(
                text = sponsoredContent.title,
                modifier = Modifier.semantics {
                    testTagsAsResourceId = true
                    testTag = "pocket.sponsoredContent.title"
                },
                color = FirefoxTheme.colors.textPrimary,
                overflow = TextOverflow.Ellipsis,
                maxLines = maxSponsoredLines(),
                style = FirefoxTheme.typography.body2,
            )

            Text(
                text = stringResource(R.string.pocket_stories_sponsor_indication),
                modifier = Modifier.semantics {
                    testTagsAsResourceId = true
                    testTag = "pocket.sponsoredContent.identifier"
                },
                color = FirefoxTheme.colors.textSecondary,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                style = FirefoxTheme.typography.caption,
            )
        }
    }
}

/**
 * Displays a single [ContentRecommendation].
 *
 * @param recommendation The [ContentRecommendation] to be displayed.
 * @param backgroundColor The background [Color] of the recommendation.
 * @param onClick Callback for when the user taps on the recommendation.
 */
@Composable
fun ContentRecommendationStory(
    recommendation: ContentRecommendation,
    backgroundColor: Color,
    onClick: (ContentRecommendation) -> Unit,
) {
    val imageUrl = recommendation.imageUrl.replace(
        "{wh}",
        with(LocalDensity.current) {
            "${IMAGE_SIZE.dp.toPx().roundToInt()}x${
                IMAGE_SIZE.dp.toPx().roundToInt()
            }"
        },
    )

    ListItemTabSurface(
        imageUrl = imageUrl,
        backgroundColor = backgroundColor,
        onClick = { onClick(recommendation) },
    ) {
        Text(
            text = recommendation.title,
            modifier = Modifier.semantics {
                testTagsAsResourceId = true
                testTag = "pocket.contentRecommendation.title"
            },
            color = FirefoxTheme.colors.textPrimary,
            overflow = TextOverflow.Ellipsis,
            maxLines = maxLines(),
            style = FirefoxTheme.typography.body2,
        )
    }
}

/**
 * Displays a list of [PocketStory]s.
 *
 * @param stories The list of [PocketStory]s to be displayed.
 * @param contentPadding Dimension for padding the content after it has been clipped.
 * This space will be used for shadows and also content rendering when the list is scrolled.
 * @param backgroundColor The background [Color] of each story.
 * @param onStoryShown Callback for when a certain story is visible to the user.
 * @param onStoryClicked Callback for when the user taps on a recommended story.
 */
@Suppress("CyclomaticComplexMethod", "LongMethod")
@Composable
fun Stories(
    @PreviewParameter(StoryProvider::class) stories: List<PocketStory>,
    contentPadding: Dp,
    backgroundColor: Color = FirefoxTheme.colors.layer2,
    onStoryShown: (PocketStory, Triple<Int, Int, Int>) -> Unit,
    onStoryClicked: (PocketStory, Triple<Int, Int, Int>) -> Unit,
) {
    Row(
        modifier = Modifier
            .height(intrinsicSize = IntrinsicSize.Max)
            .horizontalScroll(rememberScrollState())
            .padding(start = contentPadding, end = contentPadding)
            .semantics {
                testTagsAsResourceId = true
                testTag = "pocket.stories"
            },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        stories.forEachIndexed { columnIndex, story ->
            val rowIndex = 0
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .semantics {
                        testTagsAsResourceId = true
                        testTag = when (story) {
                            is PocketRecommendedStory,
                            is ContentRecommendation,
                                -> HOMEPAGE_STORY

                            else -> HOMEPAGE_SPONSORED_STORY
                        }
                    },
            ) {
                when (story) {
                    is PocketRecommendedStory -> {
                        Story(
                            story = story,
                            backgroundColor = backgroundColor,
                        ) {
                            val uri = story.url.toUri()
                                .buildUpon()
                                .appendQueryParameter(
                                    URI_PARAM_UTM_KEY,
                                    POCKET_STORIES_UTM_VALUE,
                                )
                                .build().toString()
                            onStoryClicked(
                                it.copy(url = uri),
                                Triple(rowIndex, columnIndex, stories.indexOf(story)),
                            )
                        }
                    }

                    is PocketSponsoredStory -> {
                        val screenBounds = Rect()
                            .apply { LocalView.current.getWindowVisibleDisplayFrame(this) }
                            .apply {
                                // Check if this is in a preview because `.settings()` breaks previews
                                if (!inComposePreview) {
                                    val verticalOffset =
                                        with(LocalDensity.current) {
                                            dimensionResource(id = R.dimen.browser_toolbar_height).roundToPx()
                                        }

                                    if (LocalContext.current.settings().shouldUseBottomToolbar) {
                                        bottom -= verticalOffset
                                    } else {
                                        top += verticalOffset
                                    }
                                }
                            }
                        Box(
                            modifier = Modifier.onShown(
                                threshold = 0.5f,
                                onVisible = {
                                    onStoryShown(
                                        story,
                                        Triple(
                                            rowIndex,
                                            columnIndex,
                                            stories.indexOf(story),
                                        ),
                                    )
                                },
                                screenBounds = screenBounds,
                            ),
                        ) {
                            SponsoredStory(
                                story = story,
                                backgroundColor = backgroundColor,
                            ) {
                                onStoryClicked(
                                    story,
                                    Triple(rowIndex, columnIndex, stories.indexOf(story)),
                                )
                            }
                        }
                    }

                    is ContentRecommendation -> {
                        ContentRecommendationStory(
                            recommendation = story,
                            backgroundColor = backgroundColor,
                        ) {
                            onStoryClicked(
                                story,
                                Triple(rowIndex, columnIndex, stories.indexOf(story)),
                            )
                        }
                    }

                    is SponsoredContent -> {
                        val screenBounds = Rect()
                            .apply { LocalView.current.getWindowVisibleDisplayFrame(this) }
                            .apply {
                                // Check if this is in a preview because `settings()` breaks previews
                                if (!inComposePreview) {
                                    val verticalOffset =
                                        with(LocalDensity.current) {
                                            dimensionResource(id = R.dimen.browser_toolbar_height).roundToPx()
                                        }

                                    if (LocalContext.current.settings().shouldUseBottomToolbar) {
                                        bottom -= verticalOffset
                                    } else {
                                        top += verticalOffset
                                    }
                                }
                            }

                        Box(
                            modifier = Modifier.onShown(
                                threshold = 0.5f,
                                onVisible = {
                                    onStoryShown(
                                        story,
                                        Triple(
                                            rowIndex,
                                            columnIndex,
                                            stories.indexOf(story),
                                        ),
                                    )
                                },
                                screenBounds = screenBounds,
                            ),
                        ) {
                            SponsoredContentStory(
                                sponsoredContent = story,
                                backgroundColor = backgroundColor,
                            ) {
                                onStoryClicked(
                                    story,
                                    Triple(rowIndex, columnIndex, stories.indexOf(story)),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Suppress("MagicNumber")
@Composable
@Preview
private fun StoriesPreview() {
    FirefoxTheme {
        Box(
            Modifier
                .background(MaterialTheme.colorScheme.surface)
                .systemBarsPadding()
                .padding(top = 32.dp),
        ) {
            Column {
                Stories(
                    stories = listOf(
                        FakeHomepagePreview.pocketRecommendedStory(15),
                        FakeHomepagePreview.pocketSponsoredStory(15),
                        FakeHomepagePreview.contentRecommendation(15),
                        FakeHomepagePreview.sponsoredContent(15),
                        FakeHomepagePreview.pocketRecommendedStory(1),
                        FakeHomepagePreview.pocketSponsoredStory(1),
                        FakeHomepagePreview.contentRecommendation(1),
                        FakeHomepagePreview.sponsoredContent(1),
                    ),
                    contentPadding = 0.dp,
                    onStoryShown = { _, _ -> },
                    onStoryClicked = { _, _ -> },
                )
                Spacer(Modifier.height(10.dp))

                StoriesCategories(
                    categories = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor"
                        .split(" ")
                        .map { PocketRecommendedStoriesCategory(it) },
                    selections = emptyList(),
                    onCategoryClick = {},
                )
            }
        }
    }
}

@Composable
@ReadOnlyComposable
private fun maxLines() = if (limitMaxLines()) DEFAULT_MAX_LINES else Int.MAX_VALUE

@Composable
@ReadOnlyComposable
private fun maxSponsoredLines() = if (limitMaxLines()) SPONSORED_MAX_LINES else Int.MAX_VALUE

@Composable
@ReadOnlyComposable
private fun limitMaxLines() = LocalConfiguration.current.fontScale <= 1.0f

private class StoryProvider : PreviewParameterProvider<PocketStory> {
    override val values = FakeHomepagePreview.pocketStories(limit = 7).asSequence()
    override val count = 8
}
