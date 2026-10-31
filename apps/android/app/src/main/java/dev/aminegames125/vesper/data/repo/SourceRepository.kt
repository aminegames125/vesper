package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.db.LibraryDao
import dev.aminegames125.vesper.data.db.SourceDao
import dev.aminegames125.vesper.data.db.SourceEntity
import dev.aminegames125.vesper.data.parser.M3uParser
import dev.aminegames125.vesper.data.parser.XtreamParser
import dev.aminegames125.vesper.data.remote.VesperApi
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement

sealed interface SyncState {
    data object Idle : SyncState
    data class Loading(val source: String) : SyncState
    data class Failed(val message: String) : SyncState
}

/** Adds providers and keeps the local library in step with them. */
@Singleton
class SourceRepository @Inject constructor(
    private val sources: SourceDao,
    private val library: LibraryDao,
    private val api: VesperApi,
) {
    val all: Flow<List<SourceEntity>> = sources.observe()

    private val _sync = MutableStateFlow<SyncState>(SyncState.Idle)
    val sync: StateFlow<SyncState> = _sync.asStateFlow()

    suspend fun addM3u(name: String, url: String): Result<Unit> = runCatching {
        val source = SourceEntity(
            id = newId(),
            name = name.ifBlank { "Playlist" },
            kind = SourceEntity.KIND_M3U,
            url = url.trim(),
        )
        sources.upsert(source)
        refresh(source)
    }

    suspend fun addXtream(name: String, host: String, user: String, pass: String): Result<Unit> = runCatching {
        val source = SourceEntity(
            id = newId(),
            name = name.ifBlank { "IPTV" },
            kind = SourceEntity.KIND_XTREAM,
            url = XtreamParser.host(host),
            username = user.trim(),
            password = pass,
        )
        // Fail before saving anything when the credentials are wrong.
        XtreamParser.account(api.getJson(XtreamParser.apiUrl(source.url, source.username, source.password)))
        sources.upsert(source)
        refresh(source)
    }

    suspend fun remove(id: String) {
        library.replaceLibrary(id, emptyList(), emptyList(), emptyList())
        sources.delete(id)
    }

    suspend fun refreshAll() {
        sources.all().forEach { runCatching { refresh(it) } }
    }

    /** Downloads a provider's channels, movies and series and swaps them into the library. */
    suspend fun refresh(source: SourceEntity) {
        _sync.value = SyncState.Loading(source.name)
        try {
            if (source.isXtream) refreshXtream(source) else refreshM3u(source)
            sources.upsert(source.copy(updatedAt = System.currentTimeMillis()))
            _sync.value = SyncState.Idle
        } catch (e: Exception) {
            _sync.value = SyncState.Failed(e.message ?: "Could not load ${source.name}.")
            throw e
        }
    }

    private suspend fun refreshM3u(source: SourceEntity) {
        val channels = withContext(Dispatchers.IO) {
            api.getStream(source.url).use { body ->
                body.charStream().buffered().useLines { M3uParser.parse(it, source.id) }
            }
        }
        library.replaceLibrary(source.id, channels, emptyList(), emptyList())
    }

    private suspend fun refreshXtream(source: SourceEntity) = coroutineScope {
        fun url(action: String) = XtreamParser.apiUrl(source.url, source.username, source.password, action)

        suspend fun optional(action: String): JsonElement? = runCatching { api.getJson(url(action)) }.getOrNull()

        val liveCategories = async { optional("get_live_categories") }
        val vodCategories = async { optional("get_vod_categories") }
        val seriesCategories = async { optional("get_series_categories") }
        // Live channels are the one thing every Xtream panel has, so a failure there is a real error.
        val liveStreams = async { api.getJson(url("get_live_streams")) }
        val vodStreams = async { optional("get_vod_streams") }
        val series = async { optional("get_series") }

        val channels = XtreamParser.channels(
            source.id, source.url, source.username, source.password, liveCategories.await(), liveStreams.await(),
        )
        val movies = vodStreams.await()?.let { XtreamParser.movies(source.id, vodCategories.await(), it) }.orEmpty()
        val shows = series.await()?.let { XtreamParser.shows(source.id, seriesCategories.await(), it) }.orEmpty()
        library.replaceLibrary(source.id, channels, movies, shows)
    }

    private fun newId() = UUID.randomUUID().toString().take(8)
}
