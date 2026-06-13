/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.protection.dashboard

import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mozilla.components.compose.base.theme.AcornTheme

/**
 * Composable for the Tracker Protection Dashboard.
 *
 * @param modifier Modifier to be applied to the dashboard.
 * @param totalTrackersBlocked Total number of trackers blocked this week.
 * @param dataSavedMB Approximate data saved in megabytes, or null if not available.
 * @param trackersBlocked Breakdown of trackers blocked by their category.
 */
@Composable
fun TrackerProtectionDashboard(
    modifier: Modifier = Modifier,
    totalTrackersBlocked: Int,
    dataSavedMB: Int? = null,
    trackersBlocked: List<TrackersBlockedCategory> = emptyList(),
) {
    val colors = rememberProtectionsDashboardColors()
    Column(modifier = modifier) {
        WeeklyStatsCard(
            totalTrackersBlocked = totalTrackersBlocked,
            dataSavedMB = dataSavedMB,
            colors = colors,
        )
        if (trackersBlocked.isNotEmpty()) {
            TrackerBreakdownSection(
                trackersBlocked = trackersBlocked,
                maxCount = trackersBlocked.maxOfOrNull { it.count } ?: 1,
                colors = colors,
                modifier = Modifier.padding(horizontal = AcornTheme.layout.space.dynamic200),
            )
        }
    }
}

@Composable
private fun WeeklyStatsCard(
    totalTrackersBlocked: Int,
    dataSavedMB: Int?,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .background(colors.background),
    ) {
        Image(
            painter = painterResource(R.drawable.mozac_protections_dashboard_waves),
            contentDescription = null,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter),
            contentScale = ContentScale.FillWidth,
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AcornTheme.layout.space.dynamic200)
                .padding(bottom = AcornTheme.layout.space.static150),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.mozac_protections_dashboard_youre_protected),
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium,
                color = colors.textPrimary,
            )

            Column(
                modifier = Modifier.semantics(mergeDescendants = true) { heading() },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = totalTrackersBlocked.toString(),
                    fontSize = 64.sp,
                    fontWeight = FontWeight.Black,
                    color = colors.textAccent,
                )

                Text(
                    text = pluralStringResource(
                        R.plurals.mozac_protections_dashboard_trackers_blocked_this_week,
                        totalTrackersBlocked,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                )
            }

            dataSavedMB?.takeIf { it > 0 }?.let { dataSaved ->
                Spacer(modifier = Modifier.height(AcornTheme.layout.space.dynamic100))

                DataSavedChip(
                    dataSavedMB = dataSaved,
                    colors = colors,
                )
            }
        }
    }
}

@Composable
private fun DataSavedChip(
    dataSavedMB: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.semantics { heading() },
        shape = MaterialTheme.shapes.small,
        color = colors.chipBackground,
    ) {
        Text(
            text = pluralStringResource(
                R.plurals.mozac_protections_dashboard_data_saved,
                dataSavedMB,
                dataSavedMB,
            ),
            modifier = Modifier.padding(
                horizontal = AcornTheme.layout.space.static100,
                vertical = AcornTheme.layout.space.static25,
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.chipText,
        )
    }
}

@Composable
private fun TrackerBreakdownSection(
    trackersBlocked: List<TrackersBlockedCategory>,
    maxCount: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.padding(top = AcornTheme.layout.space.static150)) {
        Text(
            text = stringResource(R.string.protections_dashboard_where_they_came_from),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(modifier = Modifier.height(AcornTheme.layout.space.static200))

        trackersBlocked.forEach { trackersBlocked ->
            TrackerCategoryRow(
                trackersBlocked = trackersBlocked,
                maxCount = maxCount,
                colors = colors,
            )
            Spacer(modifier = Modifier.height(AcornTheme.layout.space.static200))
        }
    }
}

@Composable
private fun TrackerCategoryRow(
    trackersBlocked: TrackersBlockedCategory,
    maxCount: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(trackersBlocked.name),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.width(80.dp),
        )

        val fraction = if (maxCount > 0) trackersBlocked.count.toFloat() / maxCount else 0f
        val trackHeight = AcornTheme.layout.space.static100
        Canvas(
            modifier = Modifier
                .weight(1f)
                .height(trackHeight),
        ) {
            val strokeWidth = trackHeight.toPx()
            val y = size.height / 2

            if (fraction > 0f) {
                drawLine(
                    color = colors.progressBar,
                    strokeWidth = strokeWidth,
                    start = Offset(0f, y),
                    end = Offset(size.width * fraction, y),
                    cap = StrokeCap.Round,
                )
            }
        }

        Spacer(modifier = Modifier.width(AcornTheme.layout.space.static150))

        Text(
            text = trackersBlocked.count.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(min = AcornTheme.layout.space.static400),
        )
    }
}

@PreviewLightDark
@Composable
@Suppress("MagicNumber")
private fun TrackerProtectionDashboardPreview() {
    val isDark = isSystemInDarkTheme()
    val colors = if (isDark) {
        ProtectionsDashboardColors(
            background = Color(0xFF4B3974),
            textPrimary = Color(0xFFFBFBFE),
            textAccent = Color(0xFFD9BFFF),
            chipBackground = Color(0xFF1C1B22).copy(alpha = 0.4f),
            chipText = Color(0xFFD9BFFF),
            progressBar = Color(0xFFD9BFFF),
        )
    } else {
        ProtectionsDashboardColors(
            background = Color(0xFFE6E0F5),
            textPrimary = Color(0xFF15141A),
            textAccent = Color(0xFF312A64),
            chipBackground = Color.White.copy(alpha = 0.4f),
            chipText = Color(0xFF312A64),
            progressBar = Color(0xFF592ACB),
        )
    }
    val trackersBlocked = listOf(
        TrackersBlockedCategory(R.string.protections_dashboard_category_ads, 302),
        TrackersBlockedCategory(R.string.protections_dashboard_category_analytics, 241),
        TrackersBlockedCategory(R.string.protections_dashboard_category_social, 198),
        TrackersBlockedCategory(R.string.protections_dashboard_category_others, 13),
    )
    AcornTheme {
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface)
                .padding(AcornTheme.layout.space.static200),
        ) {
            WeeklyStatsCard(
                totalTrackersBlocked = 754,
                dataSavedMB = 68,
                colors = colors,
            )
            TrackerBreakdownSection(
                trackersBlocked = trackersBlocked,
                maxCount = trackersBlocked.maxOfOrNull { it.count } ?: 1,
                colors = colors,
            )
        }
    }
}

/**
 * Represents a category of trackers with its count.
 *
 * @property name String resource ID for the category name.
 * @property count Number of trackers blocked in this category.
 */
data class TrackersBlockedCategory(
    @param:StringRes val name: Int,
    val count: Int,
)
