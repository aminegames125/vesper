package dev.aminegames125.vesper.ui.detail

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.parser.Detail
import dev.aminegames125.vesper.data.parser.Episode
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.BoldLabel
import dev.aminegames125.vesper.ui.common.LoadingBox
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.RemoteImage
import dev.aminegames125.vesper.ui.common.UiState
import dev.aminegames125.vesper.ui.common.tvFocus
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** A movie or a series with everything the page shows. Episodes are empty for a movie. */
data class DetailData(
    val id: String,
    val kind: String,
    val title: String,
    val meta: String,
    val image: String?,
    val detail: Detail,
    val episodes: List<Episode>,
    val playUrl: String?,
)

@HiltViewModel
class DetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val library: LibraryRepository,
    private val userData: UserDataRepository,
    private val player: PlayerSession,
) : ViewModel() {

    private val kind: String = savedState["kind"] ?: "movie"
    private val id: String = savedState["id"] ?: ""

    private val _state = MutableStateFlow<UiState<DetailData>>(UiState.Loading)
    val state: StateFlow<UiState<DetailData>> = _state.asStateFlow()

    val favoriteIds: StateFlow<List<String>> =
        userData.favoriteIds.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        if (kind == "movie") {
            val movie = library.movie(id) ?: return run { _state.value = UiState.Error("This movie is no longer in your library.") }
            val detail = library.movieDetail(movie) ?: Detail()
            _state.value = UiState.Content(
                DetailData(
                    id = movie.id, kind = kind, title = movie.name,
                    meta = listOfNotNull(movie.grp, detail.year, movie.rating?.let { "★ %.1f".format(it) }).joinToString(" · "),
                    image = detail.backdrop ?: movie.poster, detail = detail, episodes = emptyList(),
                    playUrl = library.movieUrl(movie),
                ),
            )
        } else {
            val show = library.show(id) ?: return run { _state.value = UiState.Error("This series is no longer in your library.") }
            library.showDetail(show).fold(
                onSuccess = { (detail, episodes) ->
                    _state.value = UiState.Content(
                        DetailData(
                            id = show.id, kind = kind, title = show.name,
                            meta = listOfNotNull(show.grp, detail.year ?: show.year, show.rating?.let { "★ %.1f".format(it) }).joinToString(" · "),
                            image = detail.backdrop ?: show.cover,
                            detail = detail.copy(plot = detail.plot ?: show.plot), episodes = episodes, playUrl = null,
                        ),
                    )
                },
                onFailure = { _state.value = UiState.Error(it.message ?: "Could not load this series.") },
            )
        }
    }

    fun playMovie(data: DetailData) {
        val url = data.playUrl ?: return
        viewModelScope.launch {
            player.play(PlayItem(data.id, data.title, data.meta, url, data.image))
        }
    }

    fun playEpisode(data: DetailData, episode: Episode) {
        player.play(
            PlayItem(
                id = "${data.id}:${episode.id}",
                title = "${data.title} · S${episode.season} E${episode.number}",
                subtitle = episode.title,
                url = episode.url,
                image = episode.image ?: data.image,
            ),
        )
    }

    fun toggleFavorite(data: DetailData, on: Boolean) {
        viewModelScope.launch { userData.toggleFavorite(data.id, data.kind, data.title, data.image, on) }
    }
}

@Composable
fun DetailScreen(onBack: () -> Unit, viewModel: DetailViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val favourites by viewModel.favoriteIds.collectAsState()

    when (val s = state) {
        UiState.Loading -> LoadingBox()
        UiState.Empty -> Message("Nothing here", "")
        is UiState.Error -> Message("Could not open this", s.message)
        is UiState.Content -> DetailContent(s.data, s.data.id in favourites, onBack, viewModel)
    }
}

@Composable
private fun DetailContent(data: DetailData, favorite: Boolean, onBack: () -> Unit, viewModel: DetailViewModel) {
    var season by remember { mutableIntStateOf(data.episodes.firstOrNull()?.season ?: 1) }
    val seasons = remember(data.episodes) { data.episodes.map { it.season }.distinct() }
    val ink = MaterialTheme.colorScheme.background

    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Box(Modifier.fillMaxWidth().height(300.dp)) {
                RemoteImage(data.image, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.35f), Color.Transparent, ink))))
                IconButton(onClick = onBack, modifier = Modifier.padding(8.dp).tvFocus()) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BoldLabel(if (data.kind == "movie") "Movie" else "Series")
                    Text(data.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(data.meta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (data.kind == "movie") {
                        Button(onClick = { viewModel.playMovie(data) }, enabled = data.playUrl != null, modifier = Modifier.tvFocus(RoundedCornerShape(50))) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Play")
                        }
                    }
                    IconButton(onClick = { viewModel.toggleFavorite(data, favorite) }, modifier = Modifier.tvFocus()) {
                        Icon(
                            if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (favorite) "Remove from favourites" else "Add to favourites",
                            tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                data.detail.plot?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                data.detail.genre?.let { Text("Genre: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                data.detail.cast?.let { Text("Cast: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        if (seasons.size > 1) {
            item {
                androidx.compose.foundation.lazy.LazyRow(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(seasons, key = { it }) { n ->
                        FilterChip(selected = n == season, onClick = { season = n }, label = { Text("Season $n") })
                    }
                }
            }
        }
        items(data.episodes.filter { it.season == season }, key = { it.id }) { e ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp).tvFocus()
                    .clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surface)
                    .clickable { viewModel.playEpisode(data, e) }.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RemoteImage(e.image ?: data.image, Modifier.size(width = 120.dp, height = 68.dp).clip(RoundedCornerShape(8.dp)))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("${e.number}. ${e.title}", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    e.plot?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
