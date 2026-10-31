package dev.aminegames125.vesper.data.repo

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.aminegames125.vesper.data.db.RecordingDao
import dev.aminegames125.vesper.data.db.RecordingEntity
import dev.aminegames125.vesper.recording.RecordingService
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

/** Recordings kept on this device. The recording itself runs in [RecordingService]. */
@Singleton
class LocalRecordingRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dao: RecordingDao,
) {
    val recordings: Flow<List<RecordingEntity>> = dao.observe()

    suspend fun cleanUpAfterCrash() = dao.failInterrupted()

    fun start(item: PlayItem, seconds: Int) {
        RecordingService.start(context, item.url, item.title, item.subtitle.orEmpty(), seconds)
    }

    fun stop(id: String) = RecordingService.stop(context, id)

    suspend fun delete(recording: RecordingEntity) {
        withContext(Dispatchers.IO) { runCatching { File(recording.path).delete() } }
        dao.delete(recording.id)
    }
}
