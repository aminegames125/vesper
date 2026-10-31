package dev.aminegames125.vesper.ui.live

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.ChannelEntity
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.ChannelTile
import dev.aminegames125.vesper.ui.common.FilterRow
import dev.aminegames125.vesper.ui.common.LoadingBox
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.ScreenTitle
import dev.aminegames125.vesper.ui.common.UiState
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class LiveData(val channels: List<ChannelEntity>, val groups: List<String>)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class LiveViewModel @Inject constructor(
    library: LibraryRepository,
    private val userData: UserDataRepository,
    private val player: PlayerSession,
) : ViewModel() {

    val query = MutableStateFlow("")
    val group = MutableStateFlow("")

    val favoriteIds: StateFlow<List<String>> =
        userData.favoriteIds.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val state: StateFlow<UiState<LiveData>> = combine(query.debounce(150), group) { q, g -> q to g }
        .flatMapLatest { (q, g) -> combine(library.channels(g, q), library.channelGroups) { c, groups -> c to groups } }
        .map { (channels, groups) ->
            val state: UiState<LiveData> =
                if (channels.isEmpty() && query.value.isEmpty() && group.value.isEmpty()) UiState.Empty
                else UiState.Content(LiveData(channels, groups))
            state
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    fun play(channel: ChannelEntity) =
        player.play(PlayItem(channel.id, channel.name, channel.grp, channel.url, channel.logo, live = true))

    fun toggleFavorite(channel: ChannelEntity, on: Boolean) {
        viewModelScope.launch { userData.toggleFavorite(channel.id, "channel", channel.name, channel.logo, on) }
    }
}

@Composable
fun LiveScreen(viewModel: LiveViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val query by viewModel.query.collectAsState()
    val group by viewModel.group.collectAsState()
    val favourites by viewModel.favoriteIds.collectAsState()

    Column {
        ScreenTitle("Live TV", (state as? UiState.Content)?.data?.channels?.size)
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.query.value = it },
            placeholder = { Text("Search channels") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        when (val s = state) {
            UiState.Loading -> LoadingBox()
            UiState.Empty -> Message("No channels yet", "Add a source in Sources and your channels appear here.")
            is UiState.Error -> Message("Something went wrong", s.message)
            is UiState.Content -> {
                FilterRow(s.data.groups, group, { viewModel.group.value = it }, modifier = Modifier.padding(top = 10.dp))
                if (s.data.channels.isEmpty()) {
                    Message("Nothing here", "Try another category or clear the search.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(300.dp),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(s.data.channels, key = { it.id }) { c ->
                            ChannelTile(
                                title = c.name,
                                subtitle = c.grp,
                                logo = c.logo,
                                favorite = c.id in favourites,
                                onClick = { viewModel.play(c) },
                                onToggleFavorite = { viewModel.toggleFavorite(c, c.id in favourites) },
                            )
                        }
                    }
                }
            }
        }
    }
}
