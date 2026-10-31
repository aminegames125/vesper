package dev.aminegames125.vesper.ui.search

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.ChannelEntity
import dev.aminegames125.vesper.data.db.MovieEntity
import dev.aminegames125.vesper.data.db.ShowEntity
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.ChannelTile
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.PosterCard
import dev.aminegames125.vesper.ui.common.Rail
import dev.aminegames125.vesper.ui.common.ScreenTitle
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SearchResults(
    val channels: List<ChannelEntity> = emptyList(),
    val movies: List<MovieEntity> = emptyList(),
    val shows: List<ShowEntity> = emptyList(),
) {
    val total get() = channels.size + movies.size + shows.size
}

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    library: LibraryRepository,
    private val userData: UserDataRepository,
    private val player: PlayerSession,
) : ViewModel() {

    val query = MutableStateFlow("")

    val favoriteIds: StateFlow<List<String>> =
        userData.favoriteIds.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val results: StateFlow<SearchResults> = query.debounce(200).flatMapLatest { q ->
        if (q.isBlank()) flowOf(SearchResults())
        else combine(library.channels("", q, 30), library.movies("", q, "popular", 30), library.shows("", q, "popular", 30)) { c, m, s ->
            SearchResults(c, m, s)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchResults())

    fun play(channel: ChannelEntity) =
        player.play(PlayItem(channel.id, channel.name, channel.grp, channel.url, channel.logo, live = true))

    fun toggleFavorite(channel: ChannelEntity, on: Boolean) {
        viewModelScope.launch { userData.toggleFavorite(channel.id, "channel", channel.name, channel.logo, on) }
    }
}

@Composable
fun SearchScreen(onOpen: (kind: String, id: String) -> Unit, viewModel: SearchViewModel = hiltViewModel()) {
    val query by viewModel.query.collectAsState()
    val results by viewModel.results.collectAsState()
    val favourites by viewModel.favoriteIds.collectAsState()

    Column {
        ScreenTitle("Search", results.total.takeIf { query.isNotBlank() })
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.query.value = it },
            placeholder = { Text("Channels, movies, series") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        when {
            query.isBlank() -> Message("Find anything", "Search your channels, movies and series at once.")
            results.total == 0 -> Message("No matches", "Nothing in your library matches that search.")
            else -> LazyColumn {
                item {
                    Rail("Channels · ${results.channels.size}", results.channels, { it.id }, itemWidth = 280.dp) { c ->
                        ChannelTile(c.name, c.grp, c.logo, c.id in favourites, { viewModel.play(c) }, { viewModel.toggleFavorite(c, c.id in favourites) })
                    }
                }
                item {
                    Rail("Movies · ${results.movies.size}", results.movies, { it.id }, itemWidth = 128.dp) { m ->
                        PosterCard(m.name, m.poster, onClick = { onOpen("movie", m.id) })
                    }
                }
                item {
                    Rail("Series · ${results.shows.size}", results.shows, { it.id }, itemWidth = 128.dp) { s ->
                        PosterCard(s.name, s.cover, onClick = { onOpen("show", s.id) })
                    }
                }
            }
        }
    }
}
