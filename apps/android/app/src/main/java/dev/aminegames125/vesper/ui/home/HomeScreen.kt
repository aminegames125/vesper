package dev.aminegames125.vesper.ui.home

import androidx.compose.foundation.background
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

        railOf("live", "Live now", home.channels, wide, gutter, { it.id }) { c ->
            ChannelTile(
                title = c.name,
                subtitle = c.grp,
                logo = c.logo,
                favorite = c.id in favourites,
                onClick = { viewModel.playChannel(c) },
                onToggleFavorite = { viewModel.toggleFavorite(c, c.id in favourites) },
            )
        }

        railOf("movies", "New movies", home.newest, posterWidth, gutter, { it.id }) { m ->
            PosterCard(m.name, m.poster, onClick = { onOpenDetail("movie", m.id) })
        }

        railOf("shows", "Top series", home.topShows, posterWidth, gutter, { it.id }) { s ->
            PosterCard(s.name, s.cover, onClick = { onOpenDetail("show", s.id) })
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

/** The big banner at the top: where you left off, or something worth watching. */
@Composable
private fun Billboard(home: HomeData, tv: Boolean, viewModel: HomeViewModel, onOpenDetail: (String, String) -> Unit) {
    val resume = home.resume.firstOrNull()
    val featured = home.featured
    val image = resume?.image ?: featured?.poster
    val title = resume?.title ?: featured?.name ?: return
    val eyebrow = if (resume != null) "Continue watching" else "Featured"
    val meta = resume?.subtitle ?: featured?.let { m -> listOfNotNull(m.grp, m.rating?.let { "★ %.1f".format(it) }).joinToString(" · ") }
    val focus = remember { FocusRequester() }
    // On a TV the first thing a remote should land on is Play.
    LaunchedEffect(tv) { if (tv) runCatching { focus.requestFocus() } }

    Box(Modifier.fillMaxWidth().height(if (tv) 360.dp else 260.dp)) {
        RemoteImage(image, Modifier.fillMaxSize())
        val ink = MaterialTheme.colorScheme.background
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(ink, ink.copy(alpha = 0.75f), Color.Transparent))))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, ink))))
        Column(
            Modifier.align(Alignment.BottomStart).padding(horizontal = if (tv) 48.dp else 16.dp, vertical = 20.dp).fillMaxWidth(if (tv) 0.55f else 0.9f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            BoldLabel(eyebrow)
            Text(title, style = if (tv) MaterialTheme.typography.headlineLarge else MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!meta.isNullOrBlank()) {
                Text(meta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            Spacer(Modifier.height(8.dp))
            Row {
                Button(
                    onClick = { if (resume != null) viewModel.play(resume) else featured?.let(viewModel::playMovie) },
                    modifier = Modifier.focusRequester(focus).tvFocus(RoundedCornerShape(50)),
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(if (resume != null) "Resume" else "Play")
                }
                if (featured != null && resume == null) {
                    Spacer(Modifier.width(12.dp))
                    FilledTonalButton(onClick = { onOpenDetail("movie", featured.id) }, modifier = Modifier.tvFocus(RoundedCornerShape(50))) {
                        Text("More info")
                    }
                }
            }
        }
    }
}
