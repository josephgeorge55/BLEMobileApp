package com.bladetcg.wearos.presentation.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object BladeColors {
    val Background = Color(0xFF0A1628)
    val Marine = Color(0xFF0A4D6E)
    val Accent = Color(0xFFA4D08B)
    val White = Color(0xFFFFFFFF)
    val Gray = Color(0xFF8E8E93)
    val Success = Color(0xFF34C759)
    val Warning = Color(0xFFFF9500)
    val Error = Color(0xFFFF3B30)
    val Surface = Color(0xFF1C1C1E)
    val CardBg = Color(0x1AFFFFFF)
}

private val BladeWearColors = Colors(
    primary = BladeColors.Marine,
    primaryVariant = BladeColors.Accent,
    secondary = BladeColors.Accent,
    secondaryVariant = BladeColors.Accent,
    background = BladeColors.Background,
    surface = BladeColors.Surface,
    error = BladeColors.Error,
    onPrimary = BladeColors.White,
    onSecondary = BladeColors.White,
    onBackground = BladeColors.White,
    onSurface = BladeColors.White,
    onError = BladeColors.White,
    onSurfaceVariant = BladeColors.Gray
)

private val BladeWearTypography = Typography(
    title1 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        color = BladeColors.White
    ),
    title2 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        color = BladeColors.White
    ),
    title3 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        color = BladeColors.White
    ),
    body1 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        color = BladeColors.White
    ),
    body2 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        color = BladeColors.Gray
    ),
    caption1 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 10.sp,
        color = BladeColors.Gray
    ),
    caption2 = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 9.sp,
        color = BladeColors.Gray,
        letterSpacing = 2.sp
    )
)

@Composable
fun BladeWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = BladeWearColors,
        typography = BladeWearTypography,
        content = content
    )
}
