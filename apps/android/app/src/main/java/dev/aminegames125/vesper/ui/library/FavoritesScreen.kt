package dev.aminegames125.vesper.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.db.FavoriteEntity
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.data.repo.PlayItem
import dev.aminegames125.vesper.data.repo.UserDataRepository
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.common.ChannelTile
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.PosterCard
import dev.aminegames125.vesper.ui.common.ScreenTitle
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class FavoritesViewModel @Inject constructor(
    private val userData: UserDataRepository,
    private val library: LibraryRepository,
    private val player: PlayerSession,
) : ViewModel() {

    val favorites: StateFlow<List<FavoriteEntity>?> =
        userData.favorites.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun playChannel(favorite: FavoriteEntity) {
        viewModelScope.launch {
            val channel = library.channel(favorite.id) ?: return@launch
            player.play(PlayItem(channel.id, channel.name, channel.grp, channel.url, channel.logo, live = true))
        }
    }

    fun remove(favorite: FavoriteEntity) {
        viewModelScope.launch { userData.toggleFavorite(favorite.id, favorite.kind, favorite.name, favorite.image, currentlyOn = true) }
    }
}

@Composable
fun FavoritesScreen(onOpen: (kind: String, id: String) -> Unit, viewModel: FavoritesViewModel = hiltViewModel()) {
    val favorites by viewModel.favorites.collectAsState()
    val list = favorites.orEmpty()

    Column {
        ScreenTitle("Favourites", list.size)
        if (favorites != null && list.isEmpty()) {
            Message("Nothing saved yet", "Tap the heart on a channel, movie or series to keep it here.")
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(list, key = { it.id }) { f ->
                    if (f.kind == "channel") {
                        ChannelTile(f.name, null, f.image, true, { viewModel.playChannel(f) }, { viewModel.remove(f) })
                    } else {
                        PosterCard(f.name, f.image, onClick = { onOpen(f.kind, f.id) })
                    }
                }
            }
        }
    }
}
