package dev.aminegames125.vesper.recording

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import dev.aminegames125.vesper.R
import dev.aminegames125.vesper.data.db.RecordingDao
import dev.aminegames125.vesper.data.db.RecordingEntity
import java.io.File
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Records streams to the device in the background. It runs as a foreground service so Android keeps
 * it alive while the screen is off, and stops itself when the last recording ends.
 */
@AndroidEntryPoint
class RecordingService : Service() {

    @Inject lateinit var recorder: HlsRecorder
    @Inject lateinit var dao: RecordingDao

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = mutableMapOf<String, Job>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> jobs[intent.getStringExtra(EXTRA_ID)]?.cancel()
            ACTION_STOP_ALL -> jobs.values.forEach { it.cancel() }
        }
        return START_NOT_STICKY
    }

    private fun start(intent: Intent) {
        val url = intent.getStringExtra(EXTRA_URL) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Recording" }
        val channel = intent.getStringExtra(EXTRA_CHANNEL).orEmpty()
        val seconds = intent.getIntExtra(EXTRA_SECONDS, 3600)
        val id = UUID.randomUUID().toString().take(8)
        val file = File(getExternalFilesDir("Recordings") ?: filesDir, "${safeName(title)}-$id.ts")

        startForeground(NOTIFICATION_ID, notification(title), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)

        jobs[id] = scope.launch {
            val started = System.currentTimeMillis()
            dao.upsert(RecordingEntity(id, title, channel, file.absolutePath, started, 0, 0, "recording"))
            try {
                // A row update per segment is about one a few seconds, which is plenty.
                val result = recorder.record(url, file, seconds) { progress ->
                    dao.upsert(RecordingEntity(id, title, channel, file.absolutePath, started, progress.seconds.toInt(), progress.bytes, "recording"))
                }
                dao.upsert(RecordingEntity(id, title, channel, file.absolutePath, started, result.seconds.toInt(), result.bytes, "done"))
            } catch (e: CancellationException) {
                // Stopping early keeps what was captured.
                withContext(NonCancellable) {
                    dao.upsert(RecordingEntity(id, title, channel, file.absolutePath, started, 0, file.length(), "done"))
                }
                throw e
            } catch (e: Exception) {
                dao.upsert(RecordingEntity(id, title, channel, file.absolutePath, started, 0, file.length(), "failed", e.message))
            } finally {
                jobs.remove(id)
                if (jobs.isEmpty()) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }

    private fun notification(title: String): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, getString(R.string.recording_channel_name), NotificationManager.IMPORTANCE_LOW),
            )
        }
        val stopAll = PendingIntent.getService(
            this, 0, Intent(this, RecordingService::class.java).setAction(ACTION_STOP_ALL),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle(getString(R.string.recording_notification_title))
            .setContentText(title)
            .setOngoing(true)
            .addAction(0, getString(R.string.recording_stop), stopAll)
            .build()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "recordings"
        private const val NOTIFICATION_ID = 7
        const val ACTION_START = "dev.aminegames125.vesper.RECORD"
        const val ACTION_STOP = "dev.aminegames125.vesper.STOP"
        const val ACTION_STOP_ALL = "dev.aminegames125.vesper.STOP_ALL"
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_CHANNEL = "channel"
        const val EXTRA_SECONDS = "seconds"
        const val EXTRA_ID = "id"

        fun start(context: Context, url: String, title: String, channel: String, seconds: Int) {
            val intent = Intent(context, RecordingService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_URL, url)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_CHANNEL, channel)
                .putExtra(EXTRA_SECONDS, seconds)
            context.startForegroundService(intent)
        }

        fun stop(context: Context, id: String) {
            context.startService(Intent(context, RecordingService::class.java).setAction(ACTION_STOP).putExtra(EXTRA_ID, id))
        }

        private fun safeName(title: String) = title.replace(Regex("[^A-Za-z0-9._-]+"), "_").take(40)
    }
}
