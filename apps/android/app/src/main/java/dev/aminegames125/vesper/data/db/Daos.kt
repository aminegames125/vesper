package dev.aminegames125.vesper.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface SourceDao {
    @Query("SELECT * FROM sources ORDER BY name")
    fun observe(): Flow<List<SourceEntity>>

    @Query("SELECT * FROM sources")
    suspend fun all(): List<SourceEntity>

    @Query("SELECT * FROM sources WHERE id = :id")
    suspend fun find(id: String): SourceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(source: SourceEntity)

    @Query("DELETE FROM sources WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface LibraryDao {
    // ---- channels ----
    @Query(
        """SELECT * FROM channels
           WHERE (:group = '' OR grp = :group) AND (:query = '' OR name LIKE '%' || :query || '%')
           ORDER BY name LIMIT :limit""",
    )
    fun channels(group: String, query: String, limit: Int): Flow<List<ChannelEntity>>

    @Query("SELECT grp FROM channels GROUP BY grp ORDER BY COUNT(*) DESC LIMIT 60")
    fun channelGroups(): Flow<List<String>>

    @Query("SELECT * FROM channels WHERE id IN (:ids)")
    fun channelsByIds(ids: List<String>): Flow<List<ChannelEntity>>

    @Query("SELECT * FROM channels WHERE id = :id")
    suspend fun channel(id: String): ChannelEntity?

    @Query("SELECT COUNT(*) FROM channels")
    fun channelCount(): Flow<Int>

    // ---- movies ----
    @Query(
        """SELECT * FROM movies
           WHERE (:group = '' OR grp = :group) AND (:query = '' OR name LIKE '%' || :query || '%')
           ORDER BY CASE :sort WHEN 'new' THEN addedAt WHEN 'az' THEN 0 ELSE IFNULL(rating, 0) END DESC, name
           LIMIT :limit""",
    )
    fun movies(group: String, query: String, sort: String, limit: Int): Flow<List<MovieEntity>>

    @Query("SELECT grp FROM movies GROUP BY grp ORDER BY COUNT(*) DESC LIMIT 40")
    fun movieGroups(): Flow<List<String>>

    @Query("SELECT * FROM movies WHERE id = :id")
    suspend fun movie(id: String): MovieEntity?

    @Query("SELECT * FROM movies ORDER BY addedAt DESC LIMIT :limit")
    fun newestMovies(limit: Int): Flow<List<MovieEntity>>

    @Query("SELECT * FROM movies WHERE poster IS NOT NULL AND poster != '' ORDER BY IFNULL(rating, 0) DESC LIMIT 1 OFFSET :offset")
    suspend fun featuredMovie(offset: Int): MovieEntity?

    // ---- shows ----
    @Query(
        """SELECT * FROM shows
           WHERE (:group = '' OR grp = :group) AND (:query = '' OR name LIKE '%' || :query || '%')
           ORDER BY CASE :sort WHEN 'az' THEN 0 ELSE IFNULL(rating, 0) END DESC, name
           LIMIT :limit""",
    )
    fun shows(group: String, query: String, sort: String, limit: Int): Flow<List<ShowEntity>>

    @Query("SELECT grp FROM shows GROUP BY grp ORDER BY COUNT(*) DESC LIMIT 40")
    fun showGroups(): Flow<List<String>>

    @Query("SELECT * FROM shows WHERE id = :id")
    suspend fun show(id: String): ShowEntity?

    @Query("SELECT * FROM shows ORDER BY IFNULL(rating, 0) DESC LIMIT :limit")
    fun topShows(limit: Int): Flow<List<ShowEntity>>

    // ---- writes ----
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannels(items: List<ChannelEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMovies(items: List<MovieEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertShows(items: List<ShowEntity>)

    @Query("DELETE FROM channels WHERE sourceId = :sourceId")
    suspend fun clearChannels(sourceId: String)

    @Query("DELETE FROM movies WHERE sourceId = :sourceId")
    suspend fun clearMovies(sourceId: String)

    @Query("DELETE FROM shows WHERE sourceId = :sourceId")
    suspend fun clearShows(sourceId: String)

    /** Replaces everything a source provided in one go, so the library never shows half a refresh. */
    @Transaction
    suspend fun replaceLibrary(
        sourceId: String,
        channels: List<ChannelEntity>,
        movies: List<MovieEntity>,
        shows: List<ShowEntity>,
    ) {
        clearChannels(sourceId)
        clearMovies(sourceId)
        clearShows(sourceId)
        channels.chunked(500).forEach { insertChannels(it) }
        movies.chunked(500).forEach { insertMovies(it) }
        shows.chunked(500).forEach { insertShows(it) }
    }
}

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    fun observe(): Flow<List<FavoriteEntity>>

    @Query("SELECT id FROM favorites")
    fun observeIds(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun add(favorite: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE id = :id")
    suspend fun remove(id: String)
}

@Dao
interface HistoryDao {
    @Query("SELECT * FROM history WHERE live = 0 AND durationMs > 0 AND positionMs < durationMs * 0.95 ORDER BY updatedAt DESC LIMIT :limit")
    fun resumable(limit: Int): Flow<List<HistoryEntity>>

    @Query("SELECT * FROM history WHERE live = 1 ORDER BY updatedAt DESC LIMIT :limit")
    fun recentChannels(limit: Int): Flow<List<HistoryEntity>>

    @Query("SELECT * FROM history WHERE id = :id")
    suspend fun find(id: String): HistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: HistoryEntity)

    @Query("DELETE FROM history")
    suspend fun clear()
}

@Dao
interface RecordingDao {
    @Query("SELECT * FROM recordings ORDER BY startedAt DESC")
    fun observe(): Flow<List<RecordingEntity>>

    @Query("SELECT * FROM recordings WHERE id = :id")
    suspend fun find(id: String): RecordingEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(recording: RecordingEntity)

    @Query("DELETE FROM recordings WHERE id = :id")
    suspend fun delete(id: String)

    /** A recording left "recording" by a killed process can never finish; mark it failed. */
    @Query("UPDATE recordings SET status = 'failed', error = 'Interrupted' WHERE status = 'recording'")
    suspend fun failInterrupted()
}

@Dao
interface SettingDao {
    @Query("SELECT value FROM settings WHERE `key` = :key")
    fun observe(key: String): Flow<String?>

    @Query("SELECT value FROM settings WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(setting: SettingEntity)

    @Query("DELETE FROM settings WHERE `key` = :key")
    suspend fun remove(key: String)
}
