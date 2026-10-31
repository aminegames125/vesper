package dev.aminegames125.vesper.ui

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.aminegames125.vesper.data.repo.SettingsRepository
import dev.aminegames125.vesper.data.repo.SourceRepository
import dev.aminegames125.vesper.ui.common.FormFactor
import dev.aminegames125.vesper.ui.common.tvFocus
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val DEMO_URL = "https://iptv-org.github.io/iptv/countries/us.m3u"
private const val ONBOARDED = "onboarded"

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val sources: SourceRepository,
    private val settings: SettingsRepository,
) : ViewModel() {

    /** True only on a first run: no source yet and the welcome was never finished. */
    val needed: StateFlow<Boolean> = combine(sources.all, settings.observe(ONBOARDED)) { list, done ->
        list.isEmpty() && done != "1"
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun finish() {
        viewModelScope.launch { settings.put(ONBOARDED, "1") }
    }

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Adds the public list once; further taps while it loads do nothing, and a failure says so. */
    fun demo() {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            sources.addM3u("Free public channels", DEMO_URL)
                .onSuccess { settings.put(ONBOARDED, "1") }
                .onFailure { _error.value = "Could not load the public channels. Check your connection and try again." }
            _busy.value = false
        }
    }
}

private data class Slide(val title: String, val body: String)

private val Slides = listOf(
    Slide("Your TV, in one calm place.", "Vesper plays what you bring: an IPTV login or a playlist link."),
    Slide("Live, movies and series.", "One library that opens instantly and is easy to search, on phone, tablet and TV."),
    Slide("Record anything.", "Save live TV on this device or in your own Vesper Cloud, and watch it later."),
)

/**
 * First run. A full-screen story with a brand side and a short, paged message, deliberately
 * unlike the app behind it. On a TV or tablet the two sides sit next to each other.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun OnboardingScreen(form: FormFactor, busy: Boolean, error: String?, onAddSource: () -> Unit, onDemo: () -> Unit, onSkip: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    val last = page == Slides.lastIndex
    val wide = form != FormFactor.Phone
    val colors = MaterialTheme.colorScheme
    val focus = remember { FocusRequester() }
    LaunchedEffect(page) { runCatching { focus.requestFocus() } }

    val brand: @Composable (Modifier) -> Unit = { modifier ->
        Box(modifier.background(colors.surface), contentAlignment = Alignment.BottomStart) {
            Column(Modifier.padding(if (wide) 56.dp else 28.dp)) {
                Text("Vesper", style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.ExtraBold, color = colors.primary)
                Text("A calm, fast player.", style = MaterialTheme.typography.titleMedium, color = colors.onSurfaceVariant)
            }
        }
    }

    val story: @Composable (Modifier) -> Unit = { modifier ->
        Column(modifier.padding(horizontal = if (wide) 72.dp else 28.dp, vertical = 32.dp), verticalArrangement = Arrangement.Center) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Slides.indices.forEach { i ->
                    Box(Modifier.height(4.dp).width(36.dp).clip(CircleShape).background(if (i <= page) colors.primary else colors.surfaceVariant))
                }
            }
            Spacer(Modifier.height(40.dp))
            Crossfade(page, label = "slide") { p ->
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(Slides[p].title, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraBold)
                    Text(Slides[p].body, style = MaterialTheme.typography.titleMedium, color = colors.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(40.dp))
            if (last) {
                Button(onClick = onAddSource, modifier = Modifier.focusRequester(focus).tvFocus(RoundedCornerShape(50))) { Text("Add my source") }
                Spacer(Modifier.height(10.dp))
                FilledTonalButton(onClick = onDemo, enabled = !busy, modifier = Modifier.tvFocus(RoundedCornerShape(50))) {
                    Text(if (busy) "Loading…" else "Try free public channels")
                }
                if (error != null) {
                    Text(error, style = MaterialTheme.typography.bodyMedium, color = colors.error, modifier = Modifier.padding(top = 8.dp))
                }
            } else {
                Button(onClick = { page += 1 }, modifier = Modifier.focusRequester(focus).tvFocus(RoundedCornerShape(50))) { Text("Next") }
            }
            TextButton(onClick = onSkip, modifier = Modifier.padding(top = 8.dp).tvFocus(RoundedCornerShape(50))) { Text("Skip for now") }
        }
    }

    // The welcome covers the app, so the D-pad must not be able to walk out to the screen behind it.
    Box(
        Modifier.fillMaxSize().background(colors.background).clickable(enabled = false) {}
            .focusProperties { exit = { FocusRequester.Cancel } }.focusGroup().systemBarsPadding(),
    ) {
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                brand(Modifier.weight(5f).fillMaxHeight())
                story(Modifier.weight(6f).fillMaxHeight())
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                brand(Modifier.fillMaxWidth().height(200.dp))
                story(Modifier.weight(1f).fillMaxWidth())
            }
        }
    }
}
