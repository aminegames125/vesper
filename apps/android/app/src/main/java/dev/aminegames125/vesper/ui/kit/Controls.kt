@file:OptIn(ExperimentalLayoutApi::class)

package dev.aminegames125.vesper.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.ui.theme.LocalIsTv

enum class ButtonKind { Primary, Soft, Ghost, Danger }

/** A pill. [ButtonKind.Primary] is the one thing on a screen you most likely want to press. */
@Composable
fun VButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.Primary,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    compact: Boolean = false,
) {
    val c = Vesper.colors
    val tv = LocalIsTv.current
    val fill: Brush? = when (kind) {
        ButtonKind.Primary -> Brush.horizontalGradient(listOf(c.accent, c.accent2))
        ButtonKind.Soft -> SolidColor(c.surfaceTop.copy(alpha = if (c.dark) 0.7f else 1f))
        ButtonKind.Ghost -> null
        ButtonKind.Danger -> SolidColor(c.danger.copy(alpha = 0.16f))
    }
    val ink = when (kind) {
        ButtonKind.Primary -> c.onAccent
        ButtonKind.Soft -> c.text
        ButtonKind.Ghost -> c.accent
        ButtonKind.Danger -> c.danger
    }
    val minHeight = when {
        compact -> 36.dp
        tv -> 54.dp
        else -> 48.dp
    }
    Row(
        modifier
            .alpha(if (enabled) 1f else 0.38f)
            .heightIn(min = minHeight)
            .pressable(onClick, Shapes.pill, enabled, focusScale = 1.05f)
            .then(if (fill != null) Modifier.background(fill, Shapes.pill) else Modifier)
            .padding(horizontal = if (compact) 14.dp else 22.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalInk provides ink) {
            if (icon != null) VIcon(icon, null, size = 20.dp)
            VText(text, style = if (compact) Vesper.type.small.copy(fontWeight = Vesper.type.button.fontWeight) else Vesper.type.button, maxLines = 1)
        }
    }
}

enum class IconStyle { Plain, Glass, Scrim }

@Composable
fun VIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = Color.Unspecified,
    style: IconStyle = IconStyle.Plain,
    enabled: Boolean = true,
) {
    val c = Vesper.colors
    val tv = LocalIsTv.current
    val size = if (tv) 52.dp else 44.dp
    val backing = when (style) {
        IconStyle.Plain -> Modifier
        IconStyle.Glass -> Modifier.glass(CircleShape)
        IconStyle.Scrim -> Modifier.background(Color.Black.copy(alpha = 0.42f), CircleShape)
    }
    val ink = when {
        tint != Color.Unspecified -> tint
        style == IconStyle.Scrim -> Color.White
        else -> c.text
    }
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.38f)
            .size(size)
            .pressable({ onClick() }, CircleShape, enabled, focusScale = 1.12f)
            .then(backing),
        contentAlignment = Alignment.Center,
    ) {
        VIcon(icon, contentDescription, tint = ink, size = if (tv) 24.dp else 22.dp)
    }
}

/** A choice you can toggle. Selected is a tinted pill with an accent outline, not a solid slab. */
@Composable
fun VChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    val c = Vesper.colors
    val tv = LocalIsTv.current
    val fill by animateColorAsState(if (selected) c.accentSoft else c.surfaceHi.copy(alpha = if (c.dark) 0.6f else 1f), tween(160), label = "chipFill")
    val edge by animateColorAsState(if (selected) c.accent.copy(alpha = 0.7f) else c.line, tween(160), label = "chipEdge")
    val ink = if (selected) c.accent else c.textDim
    Row(
        modifier
            .heightIn(min = if (tv) 46.dp else 38.dp)
            .semantics { this.selected = selected }
            .pressable(onClick, Shapes.pill, role = Role.RadioButton, focusScale = 1.06f)
            .background(fill, Shapes.pill)
            .border(1.dp, edge, Shapes.pill)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalInk provides ink) {
            if (selected && icon == null) VIcon(Ic.Check, null, size = 16.dp)
            if (icon != null) VIcon(icon, null, size = 16.dp)
            VText(label, style = Vesper.type.small.copy(fontWeight = Vesper.type.button.fontWeight), maxLines = 1)
        }
    }
}

/** A flowing group of chips (or anything else small) that wraps onto more lines. */
@Composable
fun VFlow(modifier: Modifier = Modifier, gap: Dp = 8.dp, content: @Composable () -> Unit) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(gap),
        verticalArrangement = Arrangement.spacedBy(gap),
    ) { content() }
}

@Composable
fun VSwitch(checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, label: String? = null) {
    val c = Vesper.colors
    val interaction = remember { MutableInteractionSource() }
    val travel by animateDpAsState(if (checked) 22.dp else 0.dp, spring(dampingRatio = 0.7f, stiffness = 500f), label = "switchThumb")
    val track by animateColorAsState(if (checked) c.accent else c.surfaceTop, tween(160), label = "switchTrack")
    Box(
        modifier
            .focusFx(interaction, Shapes.pill, focusScale = 1.08f)
            .toggleable(
                value = checked,
                interactionSource = interaction,
                indication = null,
                role = Role.Switch,
                onValueChange = onChange,
            )
            .size(width = 52.dp, height = 30.dp)
            .background(track, Shapes.pill)
            .border(1.dp, if (checked) Color.Transparent else c.lineStrong, Shapes.pill)
            .padding(3.dp),
    ) {
        Box(
            Modifier
                .offset(x = travel)
                .size(24.dp)
                .background(if (checked) c.onAccent else c.textDim, CircleShape),
        )
    }
}

/** A text field: a soft pane with the label sitting inside it, and an accent edge while you type. */
@Composable
fun VField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    error: String? = null,
    hint: String? = null,
    leading: ImageVector? = null,
    enabled: Boolean = true,
) {
    val c = Vesper.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val edge by animateColorAsState(
        when {
            error != null -> c.danger
            focused -> c.accent
            else -> c.line
        },
        tween(140),
        label = "fieldEdge",
    )
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            textStyle = Vesper.type.body.copy(color = c.text),
            cursorBrush = SolidColor(c.accent),
            singleLine = singleLine,
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            interactionSource = interaction,
            decorationBox = { inner ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(if (focused) c.surfaceHi else c.surface.copy(alpha = if (c.dark) 0.8f else 1f), Shapes.field)
                        .border(if (focused || error != null) 1.8.dp else 1.dp, edge, Shapes.field)
                        .padding(horizontal = 16.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (leading != null) VIcon(leading, null, tint = if (focused) c.accent else c.textFaint, size = 20.dp)
                    Column(Modifier.weight(1f)) {
                        VText(label, style = Vesper.type.small, color = if (focused) c.accent else c.textDim, maxLines = 1)
                        Box(Modifier.heightIn(min = 22.dp), contentAlignment = Alignment.CenterStart) { inner() }
                    }
                }
            },
        )
        if (error != null) {
            VText(error, style = Vesper.type.small, color = c.danger, modifier = Modifier.padding(horizontal = 6.dp))
        } else if (hint != null) {
            VText(hint, style = Vesper.type.small, color = c.textFaint, modifier = Modifier.padding(horizontal = 6.dp))
        }
    }
}

/** A thin pill-shaped meter. Give it no progress and it sweeps, for "working, no idea how long". */
@Composable
fun VProgress(progress: Float?, modifier: Modifier = Modifier, height: Dp = 6.dp, tone: Color = Color.Unspecified) {
    val c = Vesper.colors
    val track = c.text.copy(alpha = 0.10f)
    val start = tone.takeIf { it != Color.Unspecified } ?: c.accent
    val end = tone.takeIf { it != Color.Unspecified } ?: c.accent2
    val sweep = if (progress == null) {
        val transition = rememberInfiniteTransition(label = "sweep")
        val t by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart), label = "sweepT")
        t
    } else {
        0f
    }
    Canvas(modifier.fillMaxWidth().height(height)) {
        val radius = CornerRadius(size.height / 2f, size.height / 2f)
        drawRoundRect(track, size = size, cornerRadius = radius)
        val brush = Brush.horizontalGradient(listOf(start, end), startX = 0f, endX = size.width)
        if (progress != null) {
            val width = (size.width * progress.coerceIn(0f, 1f)).coerceAtLeast(if (progress > 0f) size.height else 0f)
            if (width > 0f) drawRoundRect(brush, size = Size(width, size.height), cornerRadius = radius)
        } else {
            val width = size.width * 0.34f
            val x = (size.width + width) * sweep - width
            clipRect(0f, 0f, size.width, size.height) {
                drawRoundRect(brush, topLeft = Offset(x, 0f), size = Size(width, size.height), cornerRadius = radius)
            }
        }
    }
}

@Composable
fun VSpinner(modifier: Modifier = Modifier, size: Dp = 36.dp, tint: Color = Color.Unspecified) {
    val c = Vesper.colors
    val ink = tint.takeIf { it != Color.Unspecified } ?: c.accent
    val transition = rememberInfiniteTransition(label = "spin")
    val turn by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "spinTurn")
    Canvas(modifier.size(size)) {
        val stroke = Stroke(width = size.toPx() * 0.11f, cap = StrokeCap.Round)
        val inset = stroke.width / 2f
        drawArc(
            color = c.text.copy(alpha = 0.10f),
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(this.size.width - stroke.width, this.size.height - stroke.width),
            style = stroke,
        )
        drawArc(
            color = ink,
            startAngle = turn,
            sweepAngle = 96f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(this.size.width - stroke.width, this.size.height - stroke.width),
            style = stroke,
        )
    }
}

enum class Tone { Neutral, Live, Ok, Warn, Bad, Accent }

/** A small status label with a dot: REC, Done, Scheduled, Failed. */
@Composable
fun VPill(text: String, tone: Tone = Tone.Neutral, modifier: Modifier = Modifier, pulse: Boolean = false) {
    val c = Vesper.colors
    val ink = when (tone) {
        Tone.Neutral -> c.textDim
        Tone.Live -> c.danger
        Tone.Ok -> c.ok
        Tone.Warn -> c.warn
        Tone.Bad -> c.danger
        Tone.Accent -> c.accent
    }
    val glow = if (pulse) {
        val transition = rememberInfiniteTransition(label = "pulse")
        val a by transition.animateFloat(
            0.35f, 1f,
            infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
            label = "pulseAlpha",
        )
        a
    } else {
        1f
    }
    Row(
        modifier
            .background(ink.copy(alpha = 0.14f), Shapes.pill)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).alpha(glow).background(ink, CircleShape))
        VText(text, style = Vesper.type.small.copy(fontWeight = Vesper.type.button.fontWeight), color = ink, maxLines = 1)
    }
}

/** A hairline between groups. */
@Composable
fun VDivider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Vesper.colors.line))
}
