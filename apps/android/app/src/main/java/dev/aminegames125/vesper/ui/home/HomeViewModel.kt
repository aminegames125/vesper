package dev.aminegames125.vesper.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.ChannelEntity
import dev.aminegames125.vesper.data.db.HistoryEntity
import dev.aminegames125.vesper.data.db.MovieEntity
import dev.aminegames125.vesper.data.db.ShowEntity
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.data.repo.HomeOptions
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.SettingsRepository
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.UiState
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** A watch-history row with how far along it is, ready to draw. */
data class ResumeItem(
    val id: String,
    val title: String,
    val subtitle: String?,
    val image: String?,
    val url: String,
    val live: Boolean,
    val progress: Float,
)

data class HomeData(
    val resume: List<ResumeItem>,
    val channels: List<ChannelEntity>,
    val newest: List<MovieEntity>,
    val topShows: List<ShowEntity>,
    val featured: MovieEntity?,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val library: LibraryRepository,
    private val userData: UserDataRepository,
    private val player: PlayerSession,
    settings: SettingsRepository,
) : ViewModel() {

    val options: StateFlow<HomeOptions> =
        settings.homeOptions.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeOptions())

    val favoriteIds: StateFlow<List<String>> =
        userData.favoriteIds.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val state: StateFlow<UiState<HomeData>> = combine(
        library.channels("", "", 16),
        library.newestMovies(),
        library.topShows(),
        userData.resumable(),
    ) { channels, movies, shows, history ->
        if (channels.isEmpty() && movies.isEmpty() && shows.isEmpty()) {
            UiState.Empty
        } else {
            UiState.Content(
                HomeData(
                    resume = history.map(::toResume),
                    channels = channels,
                    newest = movies,
                    topShows = shows,
                    featured = library.featuredMovie(),
                ),
            )
        }
    }.map<UiState<HomeData>, UiState<HomeData>> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    fun play(item: ResumeItem) =
        player.play(PlayItem(item.id, item.title, item.subtitle, item.url, item.image, item.live))

    fun playChannel(channel: ChannelEntity) =
        player.play(PlayItem(channel.id, channel.name, channel.grp, channel.url, channel.logo, live = true))

    fun playMovie(movie: MovieEntity) {
        viewModelScope.launch {
            val url = library.movieUrl(movie) ?: return@launch
            player.play(PlayItem(movie.id, movie.name, movie.grp, url, movie.poster))
        }
    }

    fun toggleFavorite(channel: ChannelEntity, on: Boolean) {
        viewModelScope.launch { userData.toggleFavorite(channel.id, "channel", channel.name, channel.logo, on) }
    }

    private fun toResume(h: HistoryEntity) = ResumeItem(
        id = h.id,
        title = h.title,
        subtitle = h.subtitle,
        image = h.image,
        url = h.url,
        live = h.live,
        progress = (h.positionMs.toFloat() / h.durationMs.coerceAtLeast(1)).coerceIn(0f, 1f),
    )
}
