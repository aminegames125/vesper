package dev.aminegames125.vesper.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.aminegames125.vesper.ui.theme.LocalIsTv

/*
 * Vesper's own design language. Nothing in here comes from Material.
 *
 *  - Ink canvas, warm paper text, one coral accent (the brand kit's colours).
 *  - Layered "glass" surfaces: a soft vertical gradient and a hairline that is brighter on top,
 *    the way light catches the upper edge of a pane.
 *  - Pills and big squircles, no elevation shadows except a coloured glow on the one primary thing.
 *  - On a TV the focused thing lifts, grows and lights up; nothing else moves.
 */

@Immutable
class VColors(
    val dark: Boolean,
    val bg: Color,
    val surface: Color,
    val surfaceHi: Color,
    val surfaceTop: Color,
    val line: Color,
    val lineStrong: Color,
    val text: Color,
    val textDim: Color,
    val textFaint: Color,
    val accent: Color,
    val accent2: Color,
    val onAccent: Color,
    val accentSoft: Color,
    val danger: Color,
    val ok: Color,
    val warn: Color,
    val scrim: Color,
)

val NightColors = VColors(
    dark = true,
    bg = Color(0xFF0D0D0F),
    surface = Color(0xFF161618),
    surfaceHi = Color(0xFF1F1F22),
    surfaceTop = Color(0xFF2A2A2E),
    line = Color(0x1AFFFFFF),
    lineStrong = Color(0x33FFFFFF),
    text = Color(0xFFF2F2F0),
    textDim = Color(0xFFA1A1A6),
    textFaint = Color(0xFF6E6E73),
    accent = Color(0xFFFF6B57),
    accent2 = Color(0xFFFF6B57),
    onAccent = Color(0xFF1C0910),
    accentSoft = Color(0x29FF5C7A),
    danger = Color(0xFFFF6B6B),
    ok = Color(0xFF5BD6A0),
    warn = Color(0xFFFFC857),
    scrim = Color(0xB3050507),
)

val PaperColors = VColors(
    dark = false,
    bg = Color(0xFFFBF9F8),
    surface = Color(0xFFFFFFFF),
    surfaceHi = Color(0xFFF4F0EE),
    surfaceTop = Color(0xFFEAE4E1),
    line = Color(0x14000000),
    lineStrong = Color(0x26000000),
    text = Color(0xFF1B1B1F),
    textDim = Color(0xFF625F68),
    textFaint = Color(0xFF9A97A0),
    accent = Color(0xFFD81B60),
    accent2 = Color(0xFFE8503A),
    onAccent = Color(0xFFFFFFFF),
    accentSoft = Color(0x1FD81B60),
    danger = Color(0xFFC62828),
    ok = Color(0xFF17805A),
    warn = Color(0xFF946400),
    scrim = Color(0x66120A0E),
)

@Immutable
class VType(
    val display: TextStyle,
    val title: TextStyle,
    val heading: TextStyle,
    val body: TextStyle,
    val bodyStrong: TextStyle,
    val small: TextStyle,
    val label: TextStyle,
    val button: TextStyle,
    val numeral: TextStyle,
)

private val Sans = FontFamily.SansSerif

val DefaultType = VType(
    display = TextStyle(fontFamily = Sans, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp, lineHeight = 38.sp, letterSpacing = (-0.9).sp),
    title = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 27.sp, letterSpacing = (-0.4).sp),
    heading = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    body = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 21.sp),
    bodyStrong = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 21.sp),
    small = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),
    label = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, lineHeight = 16.sp, letterSpacing = 1.1.sp),
    button = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    numeral = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = (-0.5).sp),
)

val LocalColors = compositionLocalOf { NightColors }
val LocalType = compositionLocalOf { DefaultType }

/** Where the design values are read from: `Vesper.colors.accent`, `Vesper.type.title`. */
object Vesper {
    val colors: VColors
        @Composable @ReadOnlyComposable get() = LocalColors.current

    val type: VType
        @Composable @ReadOnlyComposable get() = LocalType.current
}

object Shapes {
    val pill = RoundedCornerShape(percent = 50)
    val card = RoundedCornerShape(14.dp)
    val tile = RoundedCornerShape(10.dp)
    val field = RoundedCornerShape(10.dp)
    val sheet = RoundedCornerShape(18.dp)
    val thumb = RoundedCornerShape(8.dp)
}

/** The page's side margin: wider on a TV, where the edges of the screen can be cut off. */
@Composable
fun gutter(): Dp = if (LocalIsTv.current) 48.dp else 16.dp

@Composable
fun gutterPadding(top: Dp = 8.dp, bottom: Dp = 24.dp): PaddingValues =
    PaddingValues(start = gutter(), end = gutter(), top = top, bottom = bottom)

/** The app's backdrop: the ink canvas with a warm glow in one corner and a cool one in the other. */
@Composable
fun Modifier.backdrop(): Modifier = this.background(Vesper.colors.bg)

/** A flat panel: one solid colour and a hairline. No gradients, no glow. */
@Composable
fun Modifier.glass(shape: Shape = Shapes.card, strong: Boolean = false): Modifier {
    val c = Vesper.colors
    return this
        .background(if (strong) c.surfaceHi else c.surface, shape)
        .border(1.dp, c.line, shape)
}
