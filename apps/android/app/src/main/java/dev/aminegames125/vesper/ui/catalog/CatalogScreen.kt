package dev.aminegames125.vesper.ui.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.repo.LibraryRepository
import dev.aminegames125.vesper.ui.common.FilterRow
import dev.aminegames125.vesper.ui.common.LoadingBox
import dev.aminegames125.vesper.ui.common.Message
import dev.aminegames125.vesper.ui.common.PosterCard
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

/** One poster, whatever it is, so movies and series share a screen. */
data class Poster(val id: String, val title: String, val image: String?)

data class CatalogData(val posters: List<Poster>, val groups: List<String>)

/** Movies and series are the same page with a different source of posters; `kind` is "movie" or "show". */
@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class CatalogViewModel @Inject constructor(
    savedState: SavedStateHandle,
    library: LibraryRepository,
) : ViewModel() {

    val kind: String = savedState["kind"] ?: "movie"
    val query = MutableStateFlow("")
    val group = MutableStateFlow("")
    val sort = MutableStateFlow("popular")

    val state: StateFlow<UiState<CatalogData>> = combine(query.debounce(150), group, sort) { q, g, s -> Triple(q, g, s) }
        .flatMapLatest { (q, g, s) ->
            if (kind == "movie") {
                combine(library.movies(g, q, s), library.movieGroups) { items, groups ->
                    CatalogData(items.map { Poster(it.id, it.name, it.poster) }, groups)
                }
            } else {
                combine(library.shows(g, q, s), library.showGroups) { items, groups ->
                    CatalogData(items.map { Poster(it.id, it.name, it.cover) }, groups)
                }
            }
        }
        .map { data ->
            val state: UiState<CatalogData> =
                if (data.posters.isEmpty() && data.groups.isEmpty()) UiState.Empty else UiState.Content(data)
            state
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)
}

@Composable
fun CatalogScreen(onOpen: (kind: String, id: String) -> Unit, viewModel: CatalogViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val query by viewModel.query.collectAsState()
    val group by viewModel.group.collectAsState()
    val sort by viewModel.sort.collectAsState()
    val isMovies = viewModel.kind == "movie"
    val label = if (isMovies) "Movies" else "Series"

    Column {
        ScreenTitle(group.ifEmpty { label }, (state as? UiState.Content)?.data?.posters?.size)
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.query.value = it },
            placeholder = { Text("Search ${label.lowercase()}") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val options = if (isMovies) listOf("popular" to "Popular", "new" to "New", "az" to "A–Z") else listOf("popular" to "Popular", "az" to "A–Z")
            options.forEach { (value, text) ->
                FilterChip(selected = sort == value, onClick = { viewModel.sort.value = value }, label = { Text(text) })
            }
        }
        when (val s = state) {
            UiState.Loading -> LoadingBox()
            UiState.Empty -> Message("No ${label.lowercase()} yet", "Your provider has none, or no source is added yet.")
            is UiState.Error -> Message("Something went wrong", s.message)
            is UiState.Content -> {
                FilterRow(s.data.groups, group, { viewModel.group.value = it })
                if (s.data.posters.isEmpty()) {
                    Message("Nothing here", "Try another category or clear the search.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(128.dp),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(s.data.posters, key = { it.id }) { p ->
                            PosterCard(p.title, p.image, onClick = { onOpen(viewModel.kind, p.id) })
                        }
                    }
                }
            }
        }
    }
}
