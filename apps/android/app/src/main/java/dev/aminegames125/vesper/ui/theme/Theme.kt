package dev.aminegames125.vesper.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import dev.aminegames125.vesper.data.repo.ThemeMode

// Vesper's palette: ink and warm paper with one coral accent (pink in the light theme).
private val Ink = Color(0xFF0D0D0F)
private val Panel = Color(0xFF151518)
private val Raised = Color(0xFF1E1E22)
private val Line = Color(0xFF2A2A30)
private val Paper = Color(0xFFF4F1EA)
private val Muted = Color(0xFF9A9AA3)
private val Coral = Color(0xFFFF5C7A)
private val CoralTint = Color(0xFF3A1D27)

private val LightPaper = Color(0xFFFBF9F8)
private val LightRaised = Color(0xFFF3EFEE)
private val LightLine = Color(0xFFE8E2E0)
private val LightInk = Color(0xFF1B1B1F)
private val LightMuted = Color(0xFF6E6A6C)
private val Pink = Color(0xFFD81B60)
private val PinkTint = Color(0xFFFCE4EC)

private val DarkScheme = darkColorScheme(
    primary = Coral,
    onPrimary = Ink,
    primaryContainer = CoralTint,
    onPrimaryContainer = Paper,
    secondary = Coral,
    background = Ink,
    onBackground = Paper,
    surface = Panel,
    onSurface = Paper,
    surfaceVariant = Raised,
    onSurfaceVariant = Muted,
    surfaceContainer = Panel,
    surfaceContainerHigh = Raised,
    outline = Line,
    outlineVariant = Line,
    error = Color(0xFFFF8A80),
)

private val LightScheme = lightColorScheme(
    primary = Pink,
    onPrimary = Color.White,
    primaryContainer = PinkTint,
    onPrimaryContainer = LightInk,
    secondary = Pink,
    background = LightPaper,
    onBackground = LightInk,
    surface = Color.White,
    onSurface = LightInk,
    surfaceVariant = LightRaised,
    onSurfaceVariant = LightMuted,
    surfaceContainer = Color.White,
    surfaceContainerHigh = LightRaised,
    outline = LightLine,
    outlineVariant = LightLine,
    error = Color(0xFFB3261E),
)

private val VesperTypography = Typography(
    headlineLarge = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp),
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun VesperTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.Dark -> true
        ThemeMode.Light -> false
        ThemeMode.System -> isSystemInDarkTheme()
    }
    val scheme: ColorScheme = if (dark) DarkScheme else LightScheme
    MaterialTheme(colorScheme = scheme, typography = VesperTypography, content = content)
}
