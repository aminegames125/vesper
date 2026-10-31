package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.db.FavoriteDao
import dev.aminegames125.vesper.data.db.FavoriteEntity
import dev.aminegames125.vesper.data.db.HistoryDao
import dev.aminegames125.vesper.data.db.HistoryEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/** Something the player can open. */
data class PlayItem(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val url: String,
    val image: String? = null,
    val live: Boolean = false,
)

/** Favourites and watch history: the things that belong to the viewer rather than the provider. */
@Singleton
class UserDataRepository @Inject constructor(
    private val favoriteDao: FavoriteDao,
    private val historyDao: HistoryDao,
) {
    val favorites: Flow<List<FavoriteEntity>> = favoriteDao.observe()
    val favoriteIds: Flow<List<String>> = favoriteDao.observeIds()

    suspend fun toggleFavorite(id: String, kind: String, name: String, image: String?, currentlyOn: Boolean) {
        if (currentlyOn) favoriteDao.remove(id)
        else favoriteDao.add(FavoriteEntity(id, kind, name, image, System.currentTimeMillis()))
    }

    fun resumable(limit: Int = 12): Flow<List<HistoryEntity>> = historyDao.resumable(limit)

    fun recentChannels(limit: Int = 12): Flow<List<HistoryEntity>> = historyDao.recentChannels(limit)

    suspend fun resumePosition(id: String): Long = historyDao.find(id)?.positionMs ?: 0

    suspend fun saveProgress(item: PlayItem, positionMs: Long, durationMs: Long) {
        historyDao.upsert(
            HistoryEntity(
                id = item.id,
                title = item.title,
                subtitle = item.subtitle,
                url = item.url,
                image = item.image,
                live = item.live,
                positionMs = positionMs,
                durationMs = durationMs,
                updatedAt = System.currentTimeMillis(),
            ),
        )
    }
}
