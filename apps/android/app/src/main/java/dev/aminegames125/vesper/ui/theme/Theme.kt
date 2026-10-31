package dev.aminegames125.vesper.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/** True on a television, where everything is bigger and the remote's arrows move the focus. */
val LocalIsTv = compositionLocalOf { false }

private val Coral = Color(0xFFFF5C7A)
private val Ink = Color(0xFF0D0D0F)

private val DarkFallback = darkColorScheme(
    primary = Coral,
    onPrimary = Ink,
    background = Ink,
    surface = Color(0xFF151518),
)

private val LightFallback = lightColorScheme(
    primary = Color(0xFFD81B60),
    background = Color(0xFFFBF9F8),
    surface = Color.White,
)

/** Material 3 as the system draws it: the phone's own colours when it has them, a dark screen on TV. */
@Composable
fun VesperTheme(isTv: Boolean, content: @Composable () -> Unit) {
    val dark = isTv || isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        !isTv && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkFallback
        else -> LightFallback
    }
    val density = LocalDensity.current
    // Text is read from the sofa, so give it a little more room on a TV.
    val tvDensity = if (isTv) Density(density.density, density.fontScale * 1.2f) else density
    CompositionLocalProvider(LocalIsTv provides isTv, LocalDensity provides tvDensity) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
