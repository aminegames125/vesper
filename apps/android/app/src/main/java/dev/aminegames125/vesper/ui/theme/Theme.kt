package dev.aminegames125.vesper.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import dev.aminegames125.vesper.ui.kit.DefaultType
import dev.aminegames125.vesper.ui.kit.LocalColors
import dev.aminegames125.vesper.ui.kit.LocalType
import dev.aminegames125.vesper.ui.kit.NightColors
import dev.aminegames125.vesper.ui.kit.PaperColors

/** True on a television, where everything is bigger and the remote's arrows move the focus. */
val LocalIsTv = compositionLocalOf { false }

/**
 * Vesper's own look: ink and coral by default, warm paper in the light theme. It does not follow the
 * phone's wallpaper colours; the app always looks like itself. A TV is always dark.
 */
@Composable
fun VesperTheme(isTv: Boolean, mode: String = "system", content: @Composable () -> Unit) {
    val dark = isTv || when (mode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    val density = LocalDensity.current
    // Text is read from the sofa, so give it a little more room on a TV.
    val tvDensity = if (isTv) Density(density.density, density.fontScale * 1.2f) else density
    CompositionLocalProvider(
        LocalIsTv provides isTv,
        LocalDensity provides tvDensity,
        LocalColors provides (if (dark) NightColors else PaperColors),
        LocalType provides DefaultType,
        content = content,
    )
}
