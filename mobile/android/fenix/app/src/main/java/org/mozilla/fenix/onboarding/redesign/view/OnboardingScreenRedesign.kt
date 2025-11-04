/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view

import android.content.res.Configuration
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.setup.checklist.ChecklistItem
import org.mozilla.fenix.components.components
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.compose.PagerIndicator
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.onboarding.WidgetPinnedReceiver.WidgetPinnedState
import org.mozilla.fenix.onboarding.redesign.view.defaultbrowser.SetToDefaultMainImage
import org.mozilla.fenix.onboarding.redesign.view.sync.SyncMainImage
import org.mozilla.fenix.onboarding.store.OnboardingAction.OnboardingToolbarAction
import org.mozilla.fenix.onboarding.store.OnboardingStore
import org.mozilla.fenix.onboarding.view.Caption
import org.mozilla.fenix.onboarding.view.OnboardingPageState
import org.mozilla.fenix.onboarding.view.OnboardingPageUiData
import org.mozilla.fenix.onboarding.view.OnboardingTermsOfService
import org.mozilla.fenix.onboarding.view.OnboardingTermsOfServiceEventHandler
import org.mozilla.fenix.onboarding.view.ToolbarOption
import org.mozilla.fenix.onboarding.view.ToolbarOptionType
import org.mozilla.fenix.onboarding.view.mapToOnboardingPageState
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.isLargeScreenSize

private val logger: Logger = Logger("OnboardingScreenRedesign")

/**
 * A screen for displaying onboarding.
 *
 * @param pagesToDisplay List of pages to be displayed in onboarding pager ui.
 * @param onMakeFirefoxDefaultClick Invoked when positive button on default browser page is clicked.
 * @param onSkipDefaultClick Invoked when negative button on default browser page is clicked.
 * @param onSignInButtonClick Invoked when the positive button on the sign in page is clicked.
 * @param onSkipSignInClick Invoked when the negative button on the sign in page is clicked.
 * @param onAddFirefoxWidgetClick Invoked when positive button on add search widget page is clicked.
 * @param onSkipFirefoxWidgetClick Invoked when negative button on add search widget page is clicked.
 * @param onboardingStore The store which contains all the state related to the add-ons onboarding screen.
 * @param termsOfServiceEventHandler Invoked when the primary button on the terms of service page is clicked.
 * @param onCustomizeToolbarClick Invoked when positive button customize toolbar page is clicked.
 * @param onMarketingDataLearnMoreClick callback for when the user clicks the learn more text link
 * @param onMarketingOptInToggle callback for when the user toggles the opt-in checkbox
 * @param onMarketingDataContinueClick callback for when the user clicks the continue button on the
 * marketing data opt out screen.
 * @param onFinish Invoked when the onboarding is completed.
 * @param onImpression Invoked when a page in the pager is displayed.
 * @param currentIndex callback for when the current horizontal pager page changes
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
fun OnboardingScreenRedesign(
    pagesToDisplay: MutableList<OnboardingPageUiData>,
    onMakeFirefoxDefaultClick: () -> Unit,
    onSkipDefaultClick: () -> Unit,
    onSignInButtonClick: () -> Unit,
    onSkipSignInClick: () -> Unit,
    onAddFirefoxWidgetClick: () -> Unit,
    onSkipFirefoxWidgetClick: () -> Unit,
    onboardingStore: OnboardingStore? = null,
    termsOfServiceEventHandler: OnboardingTermsOfServiceEventHandler,
    onCustomizeToolbarClick: () -> Unit,
    onMarketingDataLearnMoreClick: () -> Unit,
    onMarketingOptInToggle: (optIn: Boolean) -> Unit,
    onMarketingDataContinueClick: (allowMarketingDataCollection: Boolean) -> Unit,
    onFinish: (pageType: OnboardingPageUiData) -> Unit,
    onImpression: (pageType: OnboardingPageUiData) -> Unit,
    currentIndex: (index: Int) -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()
    val pagerState = rememberPagerState(pageCount = { pagesToDisplay.size })
    val isSignedIn: State<Boolean?> = components.backgroundServices.syncStore
        .observeAsComposableState { it.account != null }
    val widgetPinnedFlow: StateFlow<Boolean> = WidgetPinnedState.isPinned
    val isWidgetPinnedState by widgetPinnedFlow.collectAsState()

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }
            .distinctUntilChanged()
            .collect { page ->
                currentIndex(page)
            }
    }

    BackHandler(enabled = pagerState.currentPage > 0) {
        coroutineScope.launch {
            pagerState.animateScrollToPage(pagerState.currentPage - 1)
        }
    }

    val scrollToNextPageOrDismiss: () -> Unit = {
        if (pagerState.currentPage >= pagesToDisplay.lastIndex) {
            onFinish(pagesToDisplay[pagesToDisplay.lastIndex])
        } else {
            coroutineScope.launch {
                pagerState.animateScrollToPage(pagerState.currentPage + 1)
            }
        }
    }

    val hasScrolledToNextPage = remember { mutableStateOf(false) }

    LaunchedEffect(isSignedIn.value, isWidgetPinnedState) {
        val scrollToNextCardFromSignIn = isSignedIn.value?.let {
            scrollToNextCardFromSignIn(
                pagesToDisplay,
                pagerState.currentPage,
                it,
            )
        } ?: false

        val scrollToNextCardFromAddWidget = scrollToNextCardFromAddWidget(
            pagesToDisplay,
            pagerState.currentPage,
            isWidgetPinnedState,
        )

        val scrollToNextCard = scrollToNextCardFromSignIn || scrollToNextCardFromAddWidget

        if (scrollToNextCard && !hasScrolledToNextPage.value) {
            scrollToNextPageOrDismiss()
            hasScrolledToNextPage.value = true
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page ->
            onImpression(pagesToDisplay[page])
        }
    }

    OnboardingContent(
        pagesToDisplay = pagesToDisplay,
        pagerState = pagerState,
        onMakeFirefoxDefaultClick = {
            scrollToNextPageOrDismiss()
            onMakeFirefoxDefaultClick()
        },
        onMakeFirefoxDefaultSkipClick = {
            scrollToNextPageOrDismiss()
            onSkipDefaultClick()
        },
        onSignInButtonClick = {
            onSignInButtonClick()
            scrollToNextPageOrDismiss()
        },
        onSignInSkipClick = {
            scrollToNextPageOrDismiss()
            onSkipSignInClick()
        },
        onAddFirefoxWidgetClick = {
            if (isWidgetPinnedState) {
                scrollToNextPageOrDismiss()
            } else {
                onAddFirefoxWidgetClick()
            }
        },
        onSkipFirefoxWidgetClick = {
            scrollToNextPageOrDismiss()
            onSkipFirefoxWidgetClick()
        },
        onCustomizeToolbarButtonClick = {
            scrollToNextPageOrDismiss()
            onCustomizeToolbarClick()
        },
        termsOfServiceEventHandler = termsOfServiceEventHandler,
        onAgreeAndConfirmTermsOfService = {
            scrollToNextPageOrDismiss()
            termsOfServiceEventHandler.onAcceptTermsButtonClicked()
        },
        onMarketingDataLearnMoreClick = onMarketingDataLearnMoreClick,
        onMarketingOptInToggle = onMarketingOptInToggle,
        onMarketingDataContinueClick = { allowMarketingDataCollection ->
            onMarketingDataContinueClick(allowMarketingDataCollection)
            scrollToNextPageOrDismiss()
        },
        onboardingStore = onboardingStore,
    )
}

private fun scrollToNextCardFromAddWidget(
    pagesToDisplay: List<OnboardingPageUiData>,
    currentPageIndex: Int,
    isWidgetPinnedState: Boolean,
): Boolean {
    val indexOfWidgetPage =
        pagesToDisplay.indexOfFirst { it.type == OnboardingPageUiData.Type.ADD_SEARCH_WIDGET }
    val currentPageIsWidgetPage = currentPageIndex == indexOfWidgetPage
    return isWidgetPinnedState && currentPageIsWidgetPage
}

private fun scrollToNextCardFromSignIn(
    pagesToDisplay: List<OnboardingPageUiData>,
    currentPageIndex: Int,
    isSignedIn: Boolean,
): Boolean {
    val indexOfSignInPage =
        pagesToDisplay.indexOfFirst { it.type == OnboardingPageUiData.Type.SYNC_SIGN_IN }
    val currentPageIsSignInPage = currentPageIndex == indexOfSignInPage
    return isSignedIn && currentPageIsSignInPage
}

@Composable
@Suppress("LongParameterList")
private fun OnboardingContent(
    pagesToDisplay: List<OnboardingPageUiData>,
    pagerState: PagerState,
    onMakeFirefoxDefaultClick: () -> Unit,
    onMakeFirefoxDefaultSkipClick: () -> Unit,
    onSignInButtonClick: () -> Unit,
    onSignInSkipClick: () -> Unit,
    onAddFirefoxWidgetClick: () -> Unit,
    onSkipFirefoxWidgetClick: () -> Unit,
    onboardingStore: OnboardingStore? = null,
    onCustomizeToolbarButtonClick: () -> Unit,
    termsOfServiceEventHandler: OnboardingTermsOfServiceEventHandler,
    onAgreeAndConfirmTermsOfService: () -> Unit,
    onMarketingOptInToggle: (optIn: Boolean) -> Unit,
    onMarketingDataLearnMoreClick: () -> Unit,
    onMarketingDataContinueClick: (allowMarketingDataCollection: Boolean) -> Unit,
) {
    val nestedScrollConnection = remember { DisableForwardSwipeNestedScrollConnection(pagerState) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val boxWithConstraintsScope = this

        val isLargeScreen = LocalContext.current.isLargeScreenSize()
        val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE

        val pagerWidth = pageContentWidth(boxWithConstraintsScope, isLargeScreen, isLandscape)
        val pagerHeight = pageContentHeight(boxWithConstraintsScope, isLargeScreen, isLandscape)

        val pagePeekWidth = ((maxWidth - pagerWidth) / 2).coerceAtLeast(8.dp)
        val paddingValue = if (!isLargeScreen && isLandscape) 0.dp else pagePeekWidth

        if (!isNonLargeScreenLandscape(isLargeScreen, isLandscape)) {
            Image(
                painter = painterResource(onboardingRedesignBackground(isLandscape)),
                contentDescription = null, // Decorative image only.
                contentScale = ContentScale.FillWidth,
            )
        }

        Column(verticalArrangement = Arrangement.Center) {
            Spacer(Modifier.weight(1f))

            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(pagerHeight)
                    .nestedScroll(nestedScrollConnection),
                contentPadding = PaddingValues(horizontal = paddingValue),
                pageSize = PageSize.Fill,
                beyondViewportPageCount = 2,
                pageSpacing = pageSpacing(isLargeScreen, pagePeekWidth),
                key = { pagesToDisplay[it].type },
                overscrollEffect = null,
            ) { pageIndex ->
                // protect against a rare case where the user goes to the marketing screen at the same
                // moment it gets removed by [MarketingPageRemovalSupport]
                val pageUiState = pagesToDisplay.getOrElse(pageIndex) { pagesToDisplay[it.dec()] }
                val onboardingPageState = mapToOnboardingPageState(
                    onboardingPageUiData = pageUiState,
                    onMakeFirefoxDefaultClick = onMakeFirefoxDefaultClick,
                    onMakeFirefoxDefaultSkipClick = onMakeFirefoxDefaultSkipClick,
                    onSignInButtonClick = onSignInButtonClick,
                    onSignInSkipClick = onSignInSkipClick,
                    onAddFirefoxWidgetClick = onAddFirefoxWidgetClick,
                    onAddFirefoxWidgetSkipClick = onSkipFirefoxWidgetClick,
                    onCustomizeToolbarButtonClick = onCustomizeToolbarButtonClick,
                    onTermsOfServiceButtonClick = onAgreeAndConfirmTermsOfService,
                )

                OnboardingPageForType(
                    type = pageUiState.type,
                    state = onboardingPageState,
                    onboardingStore = onboardingStore,
                    termsOfServiceEventHandler = termsOfServiceEventHandler,
                    onMarketingDataLearnMoreClick = onMarketingDataLearnMoreClick,
                    onMarketingOptInToggle = onMarketingOptInToggle,
                    onMarketingDataContinueClick = onMarketingDataContinueClick,
                )
            }

            Spacer(Modifier.weight(1f))

            PagerIndicator(
                pagerState = pagerState,
                activeColor = FirefoxTheme.colors.actionPrimary,
                inactiveColor = FirefoxTheme.colors.actionSecondary,
                leaveTrail = true,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(bottom = 16.dp),
            )
        }
    }
}

@Composable
private fun OnboardingPageForType(
    type: OnboardingPageUiData.Type,
    state: OnboardingPageState,
    onboardingStore: OnboardingStore? = null,
    termsOfServiceEventHandler: OnboardingTermsOfServiceEventHandler,
    onMarketingDataLearnMoreClick: () -> Unit,
    onMarketingOptInToggle: (optIn: Boolean) -> Unit,
    onMarketingDataContinueClick: (allowMarketingDataCollection: Boolean) -> Unit,
) {
    when (type) {
        OnboardingPageUiData.Type.DEFAULT_BROWSER -> OnboardingPageRedesign(
            pageState = state,
            mainImage = { SetToDefaultMainImage() },
        )

        OnboardingPageUiData.Type.SYNC_SIGN_IN -> OnboardingPageRedesign(
            pageState = state,
            mainImage = { SyncMainImage() },
        )

        OnboardingPageUiData.Type.TOOLBAR_PLACEMENT -> {
            val context = LocalContext.current
            onboardingStore?.let { store ->
                ToolbarOnboardingPageRedesign(
                    onboardingStore = store,
                    pageState = state,
                    onToolbarSelectionClicked = {
                        store.dispatch(OnboardingToolbarAction.UpdateSelected(it))
                        context.components.appStore.dispatch(
                            AppAction.SetupChecklistAction.TaskPreferenceUpdated(
                                ChecklistItem.Task.Type.CHANGE_TOOLBAR_PLACEMENT,
                                true,
                            ),
                        )
                    },
                )
            }
        }

        OnboardingPageUiData.Type.MARKETING_DATA -> MarketingDataOnboardingPageRedesign(
            state = state,
            onMarketingDataLearnMoreClick = onMarketingDataLearnMoreClick,
            onMarketingOptInToggle = onMarketingOptInToggle,
            onMarketingDataContinueClick = onMarketingDataContinueClick,
        )

        OnboardingPageUiData.Type.TERMS_OF_SERVICE -> TermsOfServiceOnboardingPageRedesign(
            state,
            termsOfServiceEventHandler,
        )

        // no-ops
        OnboardingPageUiData.Type.ADD_SEARCH_WIDGET,
        OnboardingPageUiData.Type.NOTIFICATION_PERMISSION,
        OnboardingPageUiData.Type.THEME_SELECTION,
            -> {
            logger.error("Unsupported page type: $type used for onboarding redesign.")
        }
    }
}

private object PageContentLayout {
    val MIN_HEIGHT_DP = 650.dp
    val MIN_WIDTH_DP = 360.dp
    val MIN_HEIGHT_TABLET_DP = 620.dp
    val MIN_WIDTH_TABLET_DP = 440.dp
    const val HEIGHT_RATIO = 0.8f
    const val WIDTH_RATIO = 0.85f
    const val TABLET_WIDTH_RATIO = 0.35f
    const val TABLET_HEIGHT_RATIO = 0.50f
    const val HEIGHT_RATIO_LANDSCAPE_NON_LARGE_SCREEN = 1f
    const val WIDTH_RATIO_LANDSCAPE_NON_LARGE_SCREEN = 1f
}

private fun pageContentHeight(
    scope: BoxWithConstraintsScope,
    isLargeScreen: Boolean,
    isLandscape: Boolean,
): Dp {
    val minHeight =
        if (isLargeScreen) PageContentLayout.MIN_HEIGHT_TABLET_DP else PageContentLayout.MIN_HEIGHT_DP
    val heightRatio =
        when {
            isLargeScreen -> PageContentLayout.TABLET_HEIGHT_RATIO
            !isLargeScreen && isLandscape -> PageContentLayout.HEIGHT_RATIO_LANDSCAPE_NON_LARGE_SCREEN
            else -> PageContentLayout.HEIGHT_RATIO
        }

    return scope.maxHeight.times(heightRatio).coerceAtLeast(minHeight)
}

private fun pageContentWidth(
    scope: BoxWithConstraintsScope,
    isLargeScreen: Boolean,
    isLandscape: Boolean,
): Dp {
    val minWidth =
        if (isLargeScreen) PageContentLayout.MIN_WIDTH_TABLET_DP else PageContentLayout.MIN_WIDTH_DP
    val widthRatio =
        when {
            isLargeScreen -> PageContentLayout.TABLET_WIDTH_RATIO
            !isLargeScreen && isLandscape -> PageContentLayout.WIDTH_RATIO_LANDSCAPE_NON_LARGE_SCREEN
            else -> PageContentLayout.WIDTH_RATIO
        }

    return scope.maxWidth.times(widthRatio).coerceAtLeast(minWidth)
}

private fun onboardingRedesignBackground(isLandscape: Boolean) =
    if (isLandscape) {
        R.drawable.onboarding_redesign_background_landscape
    } else {
        R.drawable.onboarding_redesign_background
    }

private fun isNonLargeScreenLandscape(isLargeScreen: Boolean, isLandscape: Boolean) =
    (isLandscape && !isLargeScreen)

private fun pageSpacing(isLargeScreen: Boolean, pagePeekWidth: Dp) =
    if (isLargeScreen) pagePeekWidth else 8.dp

private class DisableForwardSwipeNestedScrollConnection(
    private val pagerState: PagerState,
) : NestedScrollConnection {

    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset =
        if (available.x > 0) {
            // Allow going back on swipe
            Offset.Zero
        } else {
            // For forward swipe, only allow if the visible item offset is less than 0,
            // this would be a result of a slow back fling, and we should allow snapper to
            // snap to the appropriate item.
            // Else consume the whole offset and disable going forward.
            if (pagerState.currentPageOffsetFraction < 0) {
                Offset.Zero
            } else {
                Offset(available.x, 0f)
            }
        }
}

// *** Code below used for previews only *** //

@FlexibleWindowLightDarkPreview
@Composable
private fun OnboardingScreenPreview() {
    val pageCount = defaultPreviewPages().size
    FirefoxTheme {
        OnboardingContent(
            pagesToDisplay = defaultPreviewPages(),
            pagerState = rememberPagerState(initialPage = 0) {
                pageCount
            },
            onMakeFirefoxDefaultClick = {},
            onMakeFirefoxDefaultSkipClick = {},
            onSignInButtonClick = {},
            onSignInSkipClick = {},
            onAddFirefoxWidgetClick = {},
            onSkipFirefoxWidgetClick = {},
            onCustomizeToolbarButtonClick = {},
            onAgreeAndConfirmTermsOfService = {},
            termsOfServiceEventHandler = object : OnboardingTermsOfServiceEventHandler {},
            onMarketingDataLearnMoreClick = {},
            onMarketingOptInToggle = {},
            onMarketingDataContinueClick = {},
        )
    }
}

@Composable
private fun defaultPreviewPages() = listOf(
    touPageUIData(),
    defaultBrowserPageUiData(),
    syncPageUiData(),
    toolbarPlacementPageUiData(),
)

@Composable
private fun touPageUIData() = OnboardingPageUiData(
    type = OnboardingPageUiData.Type.TERMS_OF_SERVICE,
    title = stringResource(id = R.string.onboarding_redesign_tou_title),
    description = "",
    termsOfService = OnboardingTermsOfService(
        subheaderOneText = stringResource(id = R.string.onboarding_redesign_tou_subheader_one),
        subheaderTwoText = stringResource(id = R.string.onboarding_redesign_tou_subheader_two),
        subheaderThreeText = stringResource(id = R.string.onboarding_redesign_tou_subheader_three),
        lineOneText = stringResource(id = R.string.onboarding_redesign_tou_body_one),
        lineOneLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_one_link_text),
        lineOneLinkUrl = "URL",
        lineTwoText = stringResource(id = R.string.onboarding_redesign_tou_body_two),
        lineTwoLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_two_link_text),
        lineTwoLinkUrl = "URL",
        lineThreeText = stringResource(id = R.string.onboarding_redesign_tou_body_three),
        lineThreeLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_three_link_text),
    ),
    imageRes = R.drawable.ic_firefox,
    primaryButtonLabel = stringResource(
        id = R.string.onboarding_redesign_tou_agree_and_continue_button_label,
    ),
)

@Composable
private fun defaultBrowserPageUiData() = OnboardingPageUiData(
    type = OnboardingPageUiData.Type.DEFAULT_BROWSER,
    imageRes = R.drawable.ic_onboarding_welcome,
    title = stringResource(R.string.onboarding_redesign_set_default_browser_title),
    description = stringResource(R.string.onboarding_redesign_set_default_browser_body),
    primaryButtonLabel = stringResource(R.string.juno_onboarding_default_browser_positive_button),
    secondaryButtonLabel = stringResource(R.string.juno_onboarding_default_browser_negative_button),
)

@Composable
private fun syncPageUiData() = OnboardingPageUiData(
    type = OnboardingPageUiData.Type.SYNC_SIGN_IN,
    imageRes = R.drawable.ic_onboarding_sync,
    title = stringResource(R.string.juno_onboarding_sign_in_title_2),
    description = stringResource(R.string.juno_onboarding_sign_in_description_3),
    primaryButtonLabel = stringResource(R.string.juno_onboarding_sign_in_positive_button),
    secondaryButtonLabel = stringResource(R.string.juno_onboarding_sign_in_negative_button),
    privacyCaption = Caption(
        text = stringResource(R.string.juno_onboarding_privacy_notice_text),
        linkTextState = LinkTextState(
            text = stringResource(R.string.juno_onboarding_privacy_notice_text),
            url = "",
            onClick = {},
        ),
    ),
)

@Composable
private fun toolbarPlacementPageUiData() = OnboardingPageUiData(
    type = OnboardingPageUiData.Type.TOOLBAR_PLACEMENT,
    imageRes = R.drawable.ic_onboarding_customize_toolbar,
    title = stringResource(R.string.onboarding_customize_toolbar_title),
    description = stringResource(R.string.onboarding_customize_toolbar_description),
    primaryButtonLabel = stringResource(R.string.onboarding_save_and_start_button),
    toolbarOptions = listOf(
        ToolbarOption(
            toolbarType = ToolbarOptionType.TOOLBAR_TOP,
            imageRes = R.drawable.ic_onboarding_top_toolbar,
            label = stringResource(R.string.onboarding_customize_toolbar_top_option),
        ),
        ToolbarOption(
            toolbarType = ToolbarOptionType.TOOLBAR_BOTTOM,
            imageRes = R.drawable.ic_onboarding_bottom_toolbar,
            label = stringResource(R.string.onboarding_customize_toolbar_bottom_option),
        ),
    ),
)
