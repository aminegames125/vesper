package dev.aminegames125.vesper.ui.home

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.aminegames125.vesper.ui.common.RemoteImage
import dev.aminegames125.vesper.ui.common.tvFocus

/** What the big backdrop and the text above the rows describe: whatever the remote is on. */
private data class Spot(val key: String, val title: String, val meta: String, val plot: String?, val image: String?)

private val Gutter = 64.dp

/**
 * Television Home. One full-screen backdrop that follows focus: move across a row and the
 * picture, title and story above it change with you. The rows sit low so the artwork leads.
 */
@Composable
fun TvHome(home: HomeData, viewModel: HomeViewModel, onOpenDetail: (String, String) -> Unit) {
    val options by viewModel.options.collectAsState()
    val colors = MaterialTheme.colorScheme
    val first = remember(home) {
        home.resume.firstOrNull()?.let { Spot("r:${it.id}", it.title, it.subtitle.orEmpty(), null, it.image) }
            ?: home.newest.firstOrNull()?.let { Spot("m:${it.id}", it.name, it.grp, null, it.poster) }
            ?: home.topShows.firstOrNull()?.let { Spot("s:${it.id}", it.name, it.grp, it.plot, it.cover) }
    }
    var spot by remember(first) { mutableStateOf(first) }
    // Channels have no artwork of their own, so the backdrop keeps the last picture.
    var backdrop by remember(first) { mutableStateOf(first?.image) }
    val start = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { start.requestFocus() } }

    fun show(next: Spot) {
        spot = next
        if (next.image != null) backdrop = next.image
    }

    Box(Modifier.fillMaxSize()) {
        Crossfade(backdrop, animationSpec = tween(600), label = "backdrop") { image ->
            RemoteImage(image, Modifier.fillMaxSize(), ContentScale.Crop)
        }
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to colors.background, 0.55f to colors.background.copy(alpha = 0.82f), 1f to Color.Transparent)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to colors.background.copy(alpha = 0.5f), 0.4f to Color.Transparent, 0.62f to colors.background.copy(alpha = 0.88f), 1f to colors.background)))

        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.height(88.dp))
            Crossfade(spot, animationSpec = tween(350), label = "spot", modifier = Modifier.padding(horizontal = Gutter).fillMaxWidth(0.52f).height(190.dp)) { s ->
                Column(Modifier.fillMaxHeight(), verticalArrangement = Arrangement.Bottom) {
                    if (s != null) {
                        Text(s.title, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (s.meta.isNotBlank()) {
                            Text(s.meta, style = MaterialTheme.typography.titleMedium, color = colors.onSurfaceVariant, maxLines = 1, modifier = Modifier.padding(top = 6.dp))
                        }
                        if (!s.plot.isNullOrBlank()) {
                            Text(s.plot, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 40.dp)) {
                if (home.resume.isNotEmpty()) item("resume") {
                    Row("Continue watching") {
                        items(home.resume, key = { it.id }) { r ->
                            Tile(
                                width = 270.dp, height = 152.dp,
                                modifier = if (r == home.resume.first()) Modifier.focusRequester(start) else Modifier,
                                onFocus = { show(Spot("r:${r.id}", r.title, r.subtitle.orEmpty(), null, r.image)) },
                                onClick = { viewModel.play(r) },
                            ) {
                                RemoteImage(r.image, Modifier.fillMaxSize())
                                Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(4.dp).background(Color.Black.copy(alpha = 0.5f))) {
                                    Box(Modifier.fillMaxWidth(r.progress).fillMaxHeight().background(colors.primary))
                                }
                            }
                        }
                    }
                }
                if (options.live && home.channels.isNotEmpty()) item("live") {
                    Row("Live now") {
                        items(home.channels, key = { it.id }) { c ->
                            Tile(
                                width = 270.dp, height = 152.dp,
                                modifier = if (home.resume.isEmpty() && c == home.channels.first() && home.newest.isEmpty()) Modifier.focusRequester(start) else Modifier,
                                onFocus = { show(Spot("c:${c.id}", c.name, c.grp, null, null)) },
                                onClick = { viewModel.playChannel(c) },
                            ) {
                                Box(Modifier.fillMaxSize().background(colors.surfaceVariant), contentAlignment = Alignment.Center) {
                                    RemoteImage(c.logo, Modifier.size(width = 150.dp, height = 90.dp), ContentScale.Fit)
                                }
                            }
                        }
                    }
                }
                if (options.movies && home.newest.isNotEmpty()) item("movies") {
                    Row("New movies") {
                        items(home.newest, key = { it.id }) { m ->
                            Tile(
                                width = 150.dp, height = 225.dp,
                                modifier = if (home.resume.isEmpty() && m == home.newest.first()) Modifier.focusRequester(start) else Modifier,
                                onFocus = {
                                    show(Spot("m:${m.id}", m.name, listOfNotNull("Movie", m.grp, m.rating?.let { r -> "★ %.1f".format(r) }).joinToString(" · "), null, m.poster))
                                },
                                onClick = { onOpenDetail("movie", m.id) },
                            ) { RemoteImage(m.poster, Modifier.fillMaxSize()) }
                        }
                    }
                }
                if (options.shows && home.topShows.isNotEmpty()) item("shows") {
                    Row("Top series") {
                        items(home.topShows, key = { it.id }) { s ->
                            Tile(
                                width = 150.dp, height = 225.dp,
                                onFocus = {
                                    show(Spot("s:${s.id}", s.name, listOfNotNull("Series", s.year, s.rating?.let { r -> "★ %.1f".format(r) }).joinToString(" · "), s.plot, s.cover))
                                },
                                onClick = { onOpenDetail("show", s.id) },
                            ) { RemoteImage(s.cover, Modifier.fillMaxSize()) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Row(title: String, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = Gutter, vertical = 6.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = Gutter, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            content = content,
        )
    }
}

/** A focusable card: it lifts, gains a bright edge and tells the screen what it is. */
@Composable
private fun Tile(
    width: Dp,
    height: Dp,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier
            .width(width)
            .height(height)
            .onFocusChanged { if (it.isFocused) onFocus() }
            .tvFocus(shape)
            .clip(shape)
            .clickable(onClick = onClick),
        content = content,
    )
}
