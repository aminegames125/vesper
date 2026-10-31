package dev.aminegames125.vesper.ui.home

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.delay
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import dev.aminegames125.vesper.ui.common.BoldLabel
import dev.aminegames125.vesper.ui.common.ChannelTile
import dev.aminegames125.vesper.ui.common.ExpandRow
import dev.aminegames125.vesper.ui.common.FormFactor
import dev.aminegames125.vesper.ui.common.LoadingBox
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.PosterCard
import dev.aminegames125.vesper.ui.common.Rail
import dev.aminegames125.vesper.ui.common.RemoteImage
import dev.aminegames125.vesper.ui.common.UiState
import dev.aminegames125.vesper.ui.common.tvFocus
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.ui.unit.Dp

@Composable
fun HomeScreen(
    formFactor: FormFactor,
    onOpenDetail: (kind: String, id: String) -> Unit,
    onAddSource: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    when (val s = state) {
        UiState.Loading -> LoadingBox()
        UiState.Empty -> Message(
            "Welcome to Vesper",
            "Add your IPTV source to see channels, movies and series here.",
            action = { Button(onClick = onAddSource) { Text("Add a source") } },
        )
        is UiState.Error -> Message("Something went wrong", s.message)
        is UiState.Content -> HomeContent(s.data, formFactor, viewModel, onOpenDetail)
    }
}

@Composable
private fun HomeContent(
    home: HomeData,
    formFactor: FormFactor,
    viewModel: HomeViewModel,
    onOpenDetail: (String, String) -> Unit,
) {
    val tv = formFactor == FormFactor.Tv
    val gutter: Dp = if (tv) 48.dp else 16.dp
    val posterWidth = if (tv) 170.dp else 128.dp
    val wide = if (tv) 300.dp else 230.dp
    val favourites by viewModel.favoriteIds.collectAsState()
    val options by viewModel.options.collectAsState()

    LazyColumn(Modifier.fillMaxSize()) {
        item("billboard") { Billboard(home, tv, viewModel, onOpenDetail) }

        railOf("continue", "Continue watching", home.resume, wide, gutter, { it.id }) { h ->
            Column(
                Modifier.tvFocus().clip(RoundedCornerShape(14.dp)).clickable { viewModel.play(h) },
            ) {
                RemoteImage(h.image, Modifier.fillMaxWidth().height(if (tv) 150.dp else 120.dp).clip(RoundedCornerShape(14.dp)))
                Box(Modifier.fillMaxWidth().height(3.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                    Box(Modifier.fillMaxWidth(h.progress).height(3.dp).background(MaterialTheme.colorScheme.primary))
                }
                Text(h.title, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(vertical = 6.dp))
            }
        }

        railOf("live", "Live now", if (options.live) home.channels else emptyList(), wide, gutter, { it.id }) { c ->
            ChannelTile(
                title = c.name,
                subtitle = c.grp,
                logo = c.logo,
                favorite = c.id in favourites,
                onClick = { viewModel.playChannel(c) },
                onToggleFavorite = { viewModel.toggleFavorite(c, c.id in favourites) },
            )
        }

        if (tv) {
            item("movies-tv") {
                ExpandRow(
                    "New movies",
                    if (options.movies) home.newest else emptyList(),
                    { it.id },
                    { it.poster },
                    { it.name },
                    { listOfNotNull(it.grp, it.rating?.let { r -> "★ %.1f".format(r) }).joinToString(" · ") },
                    { onOpenDetail("movie", it.id) },
                    gutter,
                )
            }
        } else {
            railOf("movies", "New movies", if (options.movies) home.newest else emptyList(), posterWidth, gutter, { it.id }) { m ->
                PosterCard(m.name, m.poster, onClick = { onOpenDetail("movie", m.id) })
            }
        }

        if (tv) {
            item("shows-tv") {
                ExpandRow(
                    "Top series",
                    if (options.shows) home.topShows else emptyList(),
                    { it.id },
                    { it.cover },
                    { it.name },
                    { listOfNotNull(it.year, it.grp, it.rating?.let { r -> "★ %.1f".format(r) }).joinToString(" · ") },
                    { onOpenDetail("show", it.id) },
                    gutter,
                )
            }
        } else {
            railOf("shows", "Top series", if (options.shows) home.topShows else emptyList(), posterWidth, gutter, { it.id }) { s ->
                PosterCard(s.name, s.cover, onClick = { onOpenDetail("show", s.id) })
            }
        }
    }
}

private fun <T> LazyListScope.railOf(
    key: String,
    title: String,
    items: List<T>,
    width: Dp,
    gutter: Dp,
    itemKey: (T) -> Any,
    content: @Composable (T) -> Unit,
) {
    if (items.isEmpty()) return
    item(key) { Rail(title, items, itemKey, itemWidth = width, horizontalPadding = gutter, content = content) }
}

/** One slide of the billboard. */
private data class Feature(
    val title: String,
    val image: String?,
    val meta: String,
    val plot: String?,
    val playLabel: String,
    val onPlay: () -> Unit,
    val onInfo: (() -> Unit)?,
)

/** The full-bleed banner at the top: where you left off, then a few titles worth watching. */
@Composable
private fun Billboard(home: HomeData, tv: Boolean, viewModel: HomeViewModel, onOpenDetail: (String, String) -> Unit) {
    val features = buildList {
        home.resume.firstOrNull()?.let { r ->
            add(Feature(r.title, r.image, listOfNotNull("Continue watching", r.subtitle).joinToString(" · "), null, "Resume", { viewModel.play(r) }, null))
        }
        val movies = home.newest.filter { it.poster != null }.take(3)
        val shows = home.topShows.filter { it.cover != null }.take(3)
        for (i in 0 until maxOf(movies.size, shows.size)) {
            movies.getOrNull(i)?.let { m ->
                add(
                    Feature(
                        m.name, m.poster,
                        listOfNotNull("Movie", m.grp, m.rating?.let { "★ %.1f".format(it) }).joinToString(" · "),
                        null, "Play", { viewModel.playMovie(m) }, { onOpenDetail("movie", m.id) },
                    ),
                )
            }
            shows.getOrNull(i)?.let { s ->
                add(
                    Feature(
                        s.name, s.cover,
                        listOfNotNull("Series", s.year, s.rating?.let { "★ %.1f".format(it) }).joinToString(" · "),
                        s.plot, "Watch", { onOpenDetail("show", s.id) }, null,
                    ),
                )
            }
        }
    }
    if (features.isEmpty()) return

    var index by remember { mutableIntStateOf(0) }
    var inside by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    // On a TV the first thing a remote should land on is Play.
    LaunchedEffect(tv) { if (tv) runCatching { focus.requestFocus() } }
    // Rotate every few seconds, but never while someone is on a button.
    LaunchedEffect(features.size, inside) {
        if (features.size < 2 || inside) return@LaunchedEffect
        while (true) {
            delay(8_000)
            index = (index + 1) % features.size
        }
    }

    val ink = MaterialTheme.colorScheme.background
    Box(
        Modifier
            .fillMaxWidth()
            .height(if (tv) 520.dp else 340.dp)
            .onFocusChanged { inside = it.hasFocus },
    ) {
        Crossfade(targetState = features[index % features.size], animationSpec = tween(700), label = "billboard") { f ->
            Box(Modifier.fillMaxSize()) {
                RemoteImage(f.image, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(ink, ink.copy(alpha = 0.8f), Color.Transparent))))
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(ink.copy(alpha = 0.55f), Color.Transparent, ink))))
                Column(
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = if (tv) 64.dp else 16.dp, end = 16.dp, bottom = if (tv) 40.dp else 20.dp)
                        .fillMaxWidth(if (tv) 0.5f else 0.9f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        f.title,
                        style = if (tv) MaterialTheme.typography.displaySmall else MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(f.meta, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    if (tv && !f.plot.isNullOrBlank()) {
                        Text(f.plot, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = f.onPlay, modifier = Modifier.focusRequester(focus).tvFocus(RoundedCornerShape(50))) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text(f.playLabel)
                        }
                        f.onInfo?.let { info ->
                            FilledTonalButton(onClick = info, modifier = Modifier.tvFocus(RoundedCornerShape(50))) { Text("More info") }
                        }
                    }
                }
            }
        }
        if (features.size > 1) {
            Row(
                Modifier.align(Alignment.BottomEnd).padding(end = if (tv) 64.dp else 16.dp, bottom = 22.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                features.forEachIndexed { i, _ ->
                    Box(
                        Modifier
                            .height(4.dp)
                            .width(if (i == index % features.size) 24.dp else 8.dp)
                            .clip(CircleShape)
                            .background(if (i == index % features.size) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f)),
                    )
                }
            }
        }
    }
}
