package dev.aminegames125.vesper.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        SourceEntity::class,
        ChannelEntity::class,
        MovieEntity::class,
        ShowEntity::class,
        FavoriteEntity::class,
        HistoryEntity::class,
        RecordingEntity::class,
        SettingEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class VesperDatabase : RoomDatabase() {
    abstract fun sources(): SourceDao
    abstract fun library(): LibraryDao
    abstract fun favorites(): FavoriteDao
    abstract fun history(): HistoryDao
    abstract fun recordings(): RecordingDao
    abstract fun settings(): SettingDao
}
