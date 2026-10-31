package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.db.ChannelEntity
import dev.aminegames125.vesper.data.db.LibraryDao
import dev.aminegames125.vesper.data.db.MovieEntity
import dev.aminegames125.vesper.data.db.ShowEntity
import dev.aminegames125.vesper.data.db.SourceDao
import dev.aminegames125.vesper.data.parser.Detail
import dev.aminegames125.vesper.data.parser.Episode
import dev.aminegames125.vesper.data.parser.XtreamParser
import dev.aminegames125.vesper.data.remote.VesperApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/** What the screens read: the cached library, plus the detail calls that need the provider. */
@Singleton
class LibraryRepository @Inject constructor(
    private val library: LibraryDao,
    private val sources: SourceDao,
    private val api: VesperApi,
) {
    fun channels(group: String, query: String, limit: Int = PAGE): Flow<List<ChannelEntity>> =
        library.channels(group, query.trim(), limit)

    val channelGroups: Flow<List<String>> = library.channelGroups()
    val channelCount: Flow<Int> = library.channelCount()

    fun channelsByIds(ids: List<String>): Flow<List<ChannelEntity>> = library.channelsByIds(ids)

    fun movies(group: String, query: String, sort: String, limit: Int = PAGE): Flow<List<MovieEntity>> =
        library.movies(group, query.trim(), sort, limit)

    val movieGroups: Flow<List<String>> = library.movieGroups()

    fun shows(group: String, query: String, sort: String, limit: Int = PAGE): Flow<List<ShowEntity>> =
        library.shows(group, query.trim(), sort, limit)

    val showGroups: Flow<List<String>> = library.showGroups()

    fun newestMovies(limit: Int = 24): Flow<List<MovieEntity>> = library.newestMovies(limit)

    fun topShows(limit: Int = 24): Flow<List<ShowEntity>> = library.topShows(limit)

    suspend fun featuredMovie(): MovieEntity? = library.featuredMovie(3) ?: library.featuredMovie(0)

    suspend fun movie(id: String): MovieEntity? = library.movie(id)

    suspend fun show(id: String): ShowEntity? = library.show(id)

    suspend fun channel(id: String): ChannelEntity? = library.channel(id)

    /** The playable address of a movie, built from the source's own login. */
    suspend fun movieUrl(movie: MovieEntity): String? {
        val source = sources.find(movie.sourceId) ?: return null
        return XtreamParser.movieUrl(source.url, source.username, source.password, movie.streamId, movie.extension)
    }

    suspend fun movieDetail(movie: MovieEntity): Detail? {
        val source = sources.find(movie.sourceId) ?: return null
        val url = XtreamParser.apiUrl(source.url, source.username, source.password, "get_vod_info", mapOf("vod_id" to movie.streamId.toString()))
        return runCatching { XtreamParser.movieDetail(api.getJson(url)) }.getOrNull()
    }

    suspend fun showDetail(show: ShowEntity): Result<Pair<Detail, List<Episode>>> = runCatching {
        val source = sources.find(show.sourceId) ?: error("This series' source was removed.")
        val url = XtreamParser.apiUrl(source.url, source.username, source.password, "get_series_info", mapOf("series_id" to show.seriesId.toString()))
        XtreamParser.show(api.getJson(url), source.url, source.username, source.password)
    }

    companion object {
        const val PAGE = 240
    }
}
