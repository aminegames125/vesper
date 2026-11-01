package dev.aminegames125.vesper

import android.app.UiModeManager
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import dev.aminegames125.vesper.ui.VesperRoot
import dev.aminegames125.vesper.ui.kit.backdrop
import dev.aminegames125.vesper.ui.VesperViewModel
import dev.aminegames125.vesper.ui.theme.VesperTheme

class MainActivity : ComponentActivity() {
    private val vm: VesperViewModel by viewModels()

    /** A stream link shared from another app, or a request from a tile or widget to open a screen. */
    private fun handle(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                vm.sharedUrl = Regex("https?://\\S+").find(text)?.value
            }
            Intent.ACTION_VIEW -> vm.sharedUrl = intent.dataString?.takeIf { it.startsWith("http") }
            ACTION_RECORD -> vm.launchRoute = "channels"
            ACTION_CALENDAR -> vm.launchRoute = "calendar"
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handle(intent)
        val isTv = getSystemService(UiModeManager::class.java).currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        setContent {
            val theme by vm.theme.collectAsState()
            VesperTheme(isTv, theme) {
                Box(Modifier.fillMaxSize().backdrop()) { VesperRoot(isTv) }
            }
        }
    }

    companion object {
        const val ACTION_RECORD = "dev.aminegames125.vesper.RECORD"
        const val ACTION_CALENDAR = "dev.aminegames125.vesper.CALENDAR"
    }
}
