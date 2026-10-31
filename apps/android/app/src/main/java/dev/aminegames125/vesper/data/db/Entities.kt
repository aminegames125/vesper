package dev.aminegames125.vesper.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** An IPTV provider: an M3U playlist address or an Xtream login. */
@Entity(tableName = "sources")
data class SourceEntity(
    @PrimaryKey val id: String,
    val name: String,
    /** "m3u" or "xtream". */
    val kind: String,
    /** Playlist address, or the Xtream host. */
    val url: String,
    val username: String = "",
    val password: String = "",
    val updatedAt: Long = 0,
) {
    val isXtream get() = kind == KIND_XTREAM

    companion object {
        const val KIND_M3U = "m3u"
        const val KIND_XTREAM = "xtream"
    }
}

@Entity(tableName = "channels", indices = [Index("sourceId"), Index("grp")])
data class ChannelEntity(
    @PrimaryKey val id: String,
    val sourceId: String,
    val name: String,
    val grp: String,
    val logo: String?,
    val url: String,
    val tvgId: String? = null,
)

@Entity(tableName = "movies", indices = [Index("sourceId"), Index("grp")])
data class MovieEntity(
    @PrimaryKey val id: String,
    val sourceId: String,
    val streamId: Long,
    val name: String,
    val grp: String,
    val poster: String?,
    val rating: Double?,
    val extension: String,
    val addedAt: Long,
)

@Entity(tableName = "shows", indices = [Index("sourceId"), Index("grp")])
data class ShowEntity(
    @PrimaryKey val id: String,
    val sourceId: String,
    val seriesId: Long,
    val name: String,
    val grp: String,
    val cover: String?,
    val plot: String?,
    val rating: Double?,
    val year: String?,
)

@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey val id: String,
    /** "channel", "movie" or "show". */
    val kind: String,
    val name: String,
    val image: String?,
    val addedAt: Long,
)

/** Something that was played, with how far the viewer got. */
@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey val id: String,
    val title: String,
    val subtitle: String?,
    val url: String,
    val image: String?,
    val live: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAt: Long,
)

/** A recording saved on this device. */
@Entity(tableName = "recordings")
data class RecordingEntity(
    @PrimaryKey val id: String,
    val title: String,
    val channelName: String,
    val path: String,
    val startedAt: Long,
    val seconds: Int,
    val bytes: Long,
    /** "recording", "done" or "failed". */
    val status: String,
    val error: String? = null,
)

@Entity(tableName = "settings")
data class SettingEntity(
    @PrimaryKey val key: String,
    val value: String,
)
