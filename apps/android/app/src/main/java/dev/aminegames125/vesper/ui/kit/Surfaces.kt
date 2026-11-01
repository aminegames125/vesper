package dev.aminegames125.vesper.ui.kit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import dev.aminegames125.vesper.ui.theme.LocalIsTv
import kotlinx.coroutines.delay

/** A pane of glass that holds a group of things. Give it [onClick] and it can be pressed. */
@Composable
fun VCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: Dp = 16.dp,
    shape: Shape = Shapes.card,
    strong: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val base = if (onClick != null) modifier.pressable(onClick, shape, focusScale = 1.03f) else modifier
    Column(base.glass(shape, strong).padding(padding), content = content)
}

/** The heading of a group: small, spaced capitals, with an optional control on the right. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 18.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        VText(text.uppercase(), Modifier.weight(1f), style = Vesper.type.label, color = Vesper.colors.textFaint, maxLines = 1)
        trailing?.invoke()
    }
}

/** The big title at the top of a main screen, with a quiet line under it. */
@Composable
fun ScreenTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            VText(title, style = Vesper.type.display, maxLines = 1)
            if (subtitle != null) VText(subtitle, style = Vesper.type.body, color = Vesper.colors.textDim, maxLines = 2)
        }
        trailing?.invoke()
    }
}

/** The bar on a screen you went into: a round back button, the title, and actions on the right. */
@Composable
fun VTopBar(title: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = if (LocalIsTv.current) 36.dp else 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (onBack != null) VIconButton(Ic.Back, "Back", onBack, style = IconStyle.Glass)
        VText(
            title,
            Modifier.weight(1f).padding(start = if (onBack == null) 8.dp else 4.dp),
            style = Vesper.type.title,
            maxLines = 1,
        )
        actions()
    }
}

/** The floating action: an accent pill with a glow. */
@Composable
fun VFab(text: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Vesper.colors
    Row(
        modifier
            .shadow(22.dp, Shapes.pill, ambientColor = c.accent, spotColor = c.accent)
            .pressable(onClick, Shapes.pill, focusScale = 1.08f)
            .background(Brush.horizontalGradient(listOf(c.accent, c.accent2)), Shapes.pill)
            .heightIn(min = 54.dp)
            .padding(horizontal = 22.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalInk provides c.onAccent) {
            VIcon(icon, null, size = 22.dp)
            VText(text, style = Vesper.type.button, maxLines = 1)
        }
    }
}

/** A line in a list: leading picture, title with a quiet line under it, something on the right. */
@Composable
fun VRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    titleColor: Color = Color.Unspecified,
    subtitleColor: Color = Color.Unspecified,
    subtitleLines: Int = 2,
) {
    val c = Vesper.colors
    val base = if (onClick != null) modifier.pressable(onClick, Shapes.tile, focusScale = 1.02f) else modifier
    Row(
        base.fillMaxWidth().glass(Shapes.tile).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            VText(title, style = Vesper.type.bodyStrong, color = titleColor, maxLines = 1)
            if (subtitle != null) {
                VText(subtitle, style = Vesper.type.small, color = subtitleColor.takeIf { it != Color.Unspecified } ?: c.textDim, maxLines = subtitleLines)
            }
        }
        trailing?.invoke()
    }
}

/**
 * A 16:9 picture for a recording or a channel. With no picture it shows a soft gradient and the
 * first letter, so a list of them still looks designed. A [progress] draws a bar along the bottom.
 */
@Composable
fun Poster(
    url: String?,
    title: String,
    modifier: Modifier = Modifier,
    shape: Shape = Shapes.thumb,
    progress: Float? = null,
    contentScale: ContentScale = ContentScale.Crop,
    overlay: (@Composable BoxScope.() -> Unit)? = null,
) {
    val c = Vesper.colors
    Box(
        modifier
            .clip(shape)
            .background(Brush.linearGradient(listOf(c.surfaceTop, c.surfaceHi, c.surface))),
        contentAlignment = Alignment.Center,
    ) {
        if (url == null) {
            VText(
                title.trim().take(1).uppercase(),
                style = Vesper.type.display.copy(fontSize = 44.sp, fontWeight = FontWeight.Black),
                color = c.text.copy(alpha = 0.16f),
            )
        } else {
            AsyncImage(model = url, contentDescription = null, contentScale = contentScale, modifier = Modifier.fillMaxSize())
        }
        if (progress != null) {
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp)) {
                VProgress(progress, height = 4.dp)
            }
        }
        overlay?.invoke(this)
    }
}

/** A square logo tile for a channel: its picture, or its first letter. */
@Composable
fun LogoTile(url: String?, name: String, modifier: Modifier = Modifier) {
    val c = Vesper.colors
    Box(
        modifier.size(46.dp).clip(Shapes.field).background(c.surfaceTop.copy(alpha = if (c.dark) 0.8f else 1f)),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isNullOrBlank()) {
            VText(name.trim().take(1).uppercase(), style = Vesper.type.heading, color = c.textDim)
        } else {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(4.dp))
        }
    }
}

/**
 * The panel that appears over the screen for a question or a small form. Tapping the dim area or
 * pressing Back closes it. [actions] are laid out as a row of buttons at the bottom right.
 */
@Composable
fun VDialog(
    onDismiss: () -> Unit,
    title: String?,
    modifier: Modifier = Modifier,
    actions: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Vesper.colors
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(c.scrim)
                .pointerInput(Unit) { detectTapGestures { onDismiss() } }
                .padding(horizontal = 20.dp, vertical = 28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier
                    .widthIn(max = 560.dp)
                    .fillMaxWidth()
                    .pointerInput(Unit) { detectTapGestures { } }
                    .shadow(40.dp, Shapes.sheet, ambientColor = Color.Black, spotColor = Color.Black)
                    .glass(Shapes.sheet, strong = true)
                    .padding(horizontal = 24.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (title != null) VText(title, style = Vesper.type.title, maxLines = 3)
                Column(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
                if (actions != null) {
                    VFlow(Modifier.fillMaxWidth().padding(top = 6.dp)) { actions() }
                }
            }
        }
    }
}

@Stable
class SheetAction(
    val label: String,
    val icon: ImageVector? = null,
    val danger: Boolean = false,
    val onClick: () -> Unit,
)

/** A list of things to do with something, as a panel. Works the same with a finger and a remote. */
@Composable
fun VActionSheet(title: String?, actions: List<SheetAction>, onDismiss: () -> Unit) {
    val c = Vesper.colors
    VDialog(onDismiss = onDismiss, title = title) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            actions.forEach { action ->
                val ink = if (action.danger) c.danger else c.text
                Row(
                    Modifier
                        .fillMaxWidth()
                        .pressable({
                            onDismiss()
                            action.onClick()
                        }, Shapes.field, focusScale = 1.02f)
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    if (action.icon != null) VIcon(action.icon, null, tint = if (action.danger) c.danger else c.textDim, size = 20.dp)
                    VText(action.label, style = Vesper.type.bodyStrong, color = ink, maxLines = 2)
                }
            }
        }
    }
}

/** A pick-one row inside a dialog: a round marker that fills when chosen. */
@Composable
fun ChoiceRow(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, note: String? = null) {
    val c = Vesper.colors
    Row(
        modifier
            .fillMaxWidth()
            .pressable(onClick, Shapes.field, role = Role.RadioButton, focusScale = 1.02f)
            .padding(horizontal = 10.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(22.dp).clip(CircleShape).background(if (selected) c.accent else c.surfaceTop, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) VIcon(Ic.Check, null, tint = c.onAccent, size = 14.dp)
        }
        Column(Modifier.weight(1f)) {
            VText(label, style = Vesper.type.bodyStrong, maxLines = 2)
            if (note != null) VText(note, style = Vesper.type.small, color = c.textDim, maxLines = 2)
        }
    }
}

/** What to show when a list has nothing in it: a glowing icon, a plain sentence, maybe a button. */
@Composable
fun VEmpty(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Ic.Record,
    action: (@Composable () -> Unit)? = null,
) {
    val c = Vesper.colors
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(84.dp)
                .background(Brush.radialGradient(listOf(c.accent.copy(alpha = 0.30f), Color.Transparent)), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(56.dp).glass(Shapes.field, strong = true), contentAlignment = Alignment.Center) {
                VIcon(icon, null, tint = c.accent, size = 26.dp)
            }
        }
        Spacer(Modifier.size(4.dp))
        VText(title, style = Vesper.type.title, textAlign = TextAlign.Center)
        VText(
            body,
            Modifier.widthIn(max = 420.dp),
            style = Vesper.type.body,
            color = c.textDim,
            textAlign = TextAlign.Center,
        )
        if (action != null) {
            Spacer(Modifier.size(6.dp))
            action()
        }
    }
}

/** A message that rises from the bottom for a few seconds. */
@Stable
class ToastState {
    var message by mutableStateOf<String?>(null)
        private set
    var ticket by mutableIntStateOf(0)
        private set

    fun show(text: String) {
        message = text
        ticket++
    }

    internal fun clear() {
        message = null
    }
}

@Composable
fun rememberToastState(): ToastState = remember { ToastState() }

@Composable
fun ToastHost(state: ToastState, modifier: Modifier = Modifier) {
    val c = Vesper.colors
    var shown by remember { mutableStateOf("") }
    val message = state.message
    LaunchedEffect(message) { if (message != null) shown = message }
    LaunchedEffect(state.ticket) {
        if (state.message != null) {
            delay(3800)
            state.clear()
        }
    }
    Box(modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(
            visible = message != null,
            enter = fadeIn() + slideInVertically { it / 2 },
            exit = fadeOut() + slideOutVertically { it / 2 },
        ) {
            Row(
                Modifier
                    .widthIn(max = 520.dp)
                    .shadow(24.dp, Shapes.pill, ambientColor = Color.Black, spotColor = Color.Black)
                    .glass(Shapes.pill, strong = true)
                    .padding(horizontal = 20.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(8.dp).background(c.accent, CircleShape))
                VText(shown, style = Vesper.type.bodyStrong, maxLines = 3)
            }
        }
    }
}

/** Centers a spinner in the space it is given. */
@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { VSpinner() }
}
