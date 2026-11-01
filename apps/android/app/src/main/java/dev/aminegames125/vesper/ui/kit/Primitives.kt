package dev.aminegames125.vesper.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.ui.theme.LocalIsTv

/** The colour text and icons take when none is given: set by a button or chip for what is inside it. */
val LocalInk = compositionLocalOf { Color.Unspecified }

@Composable
fun VText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = Vesper.type.body,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Ellipsis,
) {
    val ink = color.takeOrElse { LocalInk.current.takeOrElse { Vesper.colors.text } }
    BasicText(
        text = text,
        modifier = modifier,
        style = style.copy(color = ink, textAlign = textAlign ?: style.textAlign),
        overflow = overflow,
        maxLines = maxLines,
    )
}

@Composable
fun VIcon(
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = Color.Unspecified,
    size: Dp = 22.dp,
) {
    val ink = tint.takeOrElse { LocalInk.current.takeOrElse { Vesper.colors.text } }
    Image(
        imageVector = icon,
        contentDescription = contentDescription,
        modifier = modifier.size(size),
        colorFilter = ColorFilter.tint(ink),
    )
}

/**
 * What the remote and the finger do to a thing that can be pressed: it dips when pressed and, when
 * focused (a TV remote, a keyboard), lifts, grows a little and lights up with a ring and a glow.
 */
@Composable
fun Modifier.focusFx(
    interaction: MutableInteractionSource,
    shape: Shape,
    focusScale: Float = 1.04f,
    ring: Boolean = true,
): Modifier {
    val c = Vesper.colors
    val focused by interaction.collectIsFocusedAsState()
    val pressed by interaction.collectIsPressedAsState()
    val tv = LocalIsTv.current
    val scale by animateFloatAsState(
        targetValue = when {
            pressed -> 0.96f
            focused -> if (tv) focusScale + 0.02f else focusScale
            else -> 1f
        },
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 420f),
        label = "focusScale",
    )
    val ringColor by animateColorAsState(
        targetValue = if (focused && ring) c.accent else Color.Transparent,
        animationSpec = tween(140),
        label = "focusRing",
    )
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .then(
            if (focused && ring) {
                Modifier.shadow(20.dp, shape, ambientColor = c.accent, spotColor = c.accent)
            } else {
                Modifier
            },
        )
        .then(if (ringColor.alpha > 0f) Modifier.border(if (tv) 3.dp else 2.dp, ringColor, shape) else Modifier)
        .clip(shape)
}

/** Click handling with Vesper's press and focus feel, and no ripple. */
@Composable
fun Modifier.pressable(
    onClick: () -> Unit,
    shape: Shape,
    enabled: Boolean = true,
    role: Role = Role.Button,
    focusScale: Float = 1.04f,
    ring: Boolean = true,
    onClickLabel: String? = null,
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    return this
        .focusFx(interaction, shape, focusScale, ring)
        .clickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            onClickLabel = onClickLabel,
            role = role,
            onClick = onClick,
        )
}
