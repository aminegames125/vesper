package dev.aminegames125.vesper.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dev.aminegames125.vesper.MainActivity
import dev.aminegames125.vesper.R
import dev.aminegames125.vesper.VesperApp
import dev.aminegames125.vesper.data.Api
import dev.aminegames125.vesper.data.ApiException
import dev.aminegames125.vesper.data.Recording
import dev.aminegames125.vesper.data.withinQuietHours
import java.time.LocalTime
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.first

object Notifications {
    const val CHANNEL = "recordings"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.notification_channel), NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** The deletion timer is about to remove this; open the app to keep it. */
    fun expiring(context: Context, id: String, title: String) {
        if (!canPost(context)) return
        val open = PendingIntent.getActivity(
            context,
            id.hashCode() xor 0x5a5a,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_delete)
            .setContentTitle("Deleting soon: $title")
            .setContentText("It will be removed from the server within a day. Open Vesper to keep it.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(id.hashCode() xor 0x5a5a, notification)
    }

    fun finished(context: Context, recording: Recording) {
        if (!canPost(context)) return
        val open = PendingIntent.getActivity(
            context,
            recording.id.hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val failed = recording.status == "failed"
        val text = if (failed) recording.error ?: "The recording could not be made." else "Ready to watch."
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle(if (failed) "Recording failed: ${recording.title}" else "Recorded: ${recording.title}")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(recording.id.hashCode(), notification)
    }
}

/**
 * Checks the server now and then and tells you about recordings that finished or failed. Android does
 * not run background work more often than every 15 minutes, so a notice can arrive a little late.
 */
class StatusWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as VesperApp).container
        val stored = container.settings.current()
        if (stored.server.isEmpty()) return Result.success()
        val api = Api()
        api.base = stored.server
        api.token = stored.token
        val list = try {
            api.recordings().recordings
        } catch (e: ApiException) {
            return if (e.code == 401 || e.code == 403) Result.success() else Result.retry()
        } catch (e: Exception) {
            return Result.retry()
        }
        // Quiet hours: say nothing now, and keep what is new for the next check.
        val quiet = withinQuietHours(container.settings.quietStart.first(), container.settings.quietEnd.first(), LocalTime.now())
        if (quiet) return Result.success()

        // A cancelled or stopped item is not news.
        val finished = list.filter { it.isFinished && it.error?.startsWith("Cancelled") != true && it.error?.startsWith("Stopped") != true }
        val seen = container.settings.announced()
        // The first run only learns what is already there, so old recordings do not all ping at once.
        if (seen != null) finished.filter { it.id !in seen }.forEach { Notifications.finished(applicationContext, it) }

        // Warn once about anything the deletion timer is about to remove.
        val warned = seen.orEmpty().filter { it.startsWith("exp:") }.toMutableSet()
        if (seen != null) {
            runCatching { api.status().expiring }.getOrNull().orEmpty().filter { "exp:${it.id}" !in warned }.forEach {
                Notifications.expiring(applicationContext, it.id, it.title)
                warned += "exp:${it.id}"
            }
        }
        container.settings.saveAnnounced(finished.map { it.id }.toSet() + warned)
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<StatusWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork("status", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
