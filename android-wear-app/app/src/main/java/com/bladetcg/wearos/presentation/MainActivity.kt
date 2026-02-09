package com.bladetcg.wearos.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.HorizontalPageIndicator
import androidx.wear.compose.material.PageIndicatorState
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.bladetcg.wearos.presentation.screens.HomeScreen
import com.bladetcg.wearos.presentation.screens.TelemetryScreen
import com.bladetcg.wearos.presentation.screens.TripScreen
import com.bladetcg.wearos.presentation.theme.BladeColors
import com.bladetcg.wearos.presentation.theme.BladeWearTheme
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            BladeWearTheme {
                WearApp()
            }
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun WearApp() {
    val pagerState = rememberPagerState(pageCount = { 3 })

    val pageIndicatorState = remember {
        object : PageIndicatorState {
            override val pageOffset: Float
                get() = pagerState.currentPageOffsetFraction
            override val selectedPage: Int
                get() = pagerState.currentPage
            override val pageCount: Int
                get() = 3
        }
    }

    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .background(BladeColors.Background),
        timeText = { TimeText() },
        pageIndicator = {
            HorizontalPageIndicator(
                pageIndicatorState = pageIndicatorState
            )
        }
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxSize()
                .background(BladeColors.Background)
        ) { page ->
            when (page) {
                0 -> HomeScreen()
                1 -> TelemetryScreen()
                2 -> TripScreen()
            }
        }
    }
}
