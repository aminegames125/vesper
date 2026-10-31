package dev.aminegames125.vesper.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.RemoteViews
import dev.aminegames125.vesper.MainActivity
import dev.aminegames125.vesper.R
import dev.aminegames125.vesper.VesperApp
import dev.aminegames125.vesper.data.Api
import dev.aminegames125.vesper.data.formatMoment
import dev.aminegames125.vesper.data.formatUntil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** A home-screen widget that shows what records next. Tapping it opens the calendar. */
class NextRecordingWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val (title, whenText) = describeNext(context)
                val open = PendingIntent.getActivity(
                    context,
                    0,
                    Intent(context, MainActivity::class.java).setAction(MainActivity.ACTION_CALENDAR),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
                ids.forEach { id ->
                    val views = RemoteViews(context.packageName, R.layout.widget_next)
                    views.setTextViewText(R.id.widget_title, title)
                    views.setTextViewText(R.id.widget_when, whenText)
                    views.setOnClickPendingIntent(R.id.widget_root, open)
                    manager.updateAppWidget(id, views)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun describeNext(context: Context): Pair<String, String> {
        val container = (context.applicationContext as VesperApp).container
        val stored = container.settings.current()
        if (stored.server.isEmpty()) return "Open Vesper" to "Connect to your server"
        val api = Api()
        api.base = stored.server
        api.token = stored.token
        return try {
            val next = api.status().next
            if (next == null) "Nothing scheduled" to "Tap to plan a recording"
            else next.title to "${formatUntil(next.startAt)} · ${formatMoment(next.startAt)}"
        } catch (e: Exception) {
            "Vesper" to "Could not reach the server"
        }
    }
}

/** Quick settings tile: opens the channel list so something can be recorded right now. */
class RecordTile : TileService() {
    override fun onStartListening() {
        qsTile?.apply {
            state = Tile.STATE_INACTIVE
            updateTile()
        }
    }

    override fun onClick() {
        val intent = Intent(this, MainActivity::class.java)
            .setAction(MainActivity.ACTION_RECORD)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
