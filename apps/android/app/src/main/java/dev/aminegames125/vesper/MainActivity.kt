package dev.aminegames125.vesper

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import dev.aminegames125.vesper.data.repo.SettingsRepository
import dev.aminegames125.vesper.data.repo.SourceRepository
import dev.aminegames125.vesper.data.repo.ThemeMode
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.VesperRoot
import dev.aminegames125.vesper.ui.theme.VesperTheme
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var settings: SettingsRepository
    @Inject lateinit var sources: SourceRepository
    @Inject lateinit var session: PlayerSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Keep every provider's library fresh without making the first screen wait for it.
        lifecycleScope.launch { runCatching { sources.refreshAll() } }

        setContent {
            val theme by settings.theme.collectAsState(initial = ThemeMode.Dark)
            val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
            LaunchedEffect(Unit) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            VesperTheme(theme) { VesperRoot(session) }
        }
    }
}
