package dev.aminegames125.vesper

import android.app.Application
import android.content.Context
import dev.aminegames125.vesper.data.Api
import dev.aminegames125.vesper.data.Settings
import dev.aminegames125.vesper.work.Notifications
import dev.aminegames125.vesper.work.StatusWorker

/** The few things the whole app shares. No dependency-injection framework is needed for this. */
class AppContainer(context: Context) {
    val api = Api()
    val settings = Settings(context)
}

class VesperApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifications.createChannel(this)
        StatusWorker.schedule(this)
    }
}
