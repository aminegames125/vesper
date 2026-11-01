package dev.aminegames125.vesper.cast

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.CastConnected
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import androidx.media3.common.MimeTypes
import com.google.android.gms.cast.framework.CastContext

/**
 * The media type a Chromecast needs to be told about a stream. The default receiver plays HLS and
 * MP4 well; MPEG-TS and Matroska depend on the device.
 */
fun mimeFor(url: String): String {
    val path = url.substringBefore('?').substringBefore('#').lowercase()
    return when {
        path.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
        path.endsWith(".mp4") || path.endsWith(".m4v") -> MimeTypes.VIDEO_MP4
        path.endsWith(".mkv") -> MimeTypes.VIDEO_MATROSKA
        path.endsWith(".webm") -> MimeTypes.VIDEO_WEBM
        path.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
        // Live links without an extension are almost always HLS.
        else -> MimeTypes.APPLICATION_M3U8
    }
}

private val XTREAM_LIVE = Regex("""^(.*/live/[^/]+/[^/]+/[^/.]+)\.ts(\?.*)?$""", RegexOption.IGNORE_CASE)

/**
 * What to hand the Chromecast for a live channel. A raw `.ts` Xtream link does not play on the
 * default receiver, but the same provider normally serves the same channel as HLS (`.m3u8`).
 */
fun castUrlFor(url: String): String {
    val match = XTREAM_LIVE.matchEntire(url) ?: return url
    return match.groupValues[1] + ".m3u8" + match.groupValues[2]
}

/** True for addresses a Chromecast on the network cannot reach, because they only mean "this device". */
fun isLocalOnly(url: String): Boolean {
    val host = url.substringAfter("://", url).substringBefore('/').substringBefore(':').lowercase()
    return host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "::1"
}

/** Google Cast, when this phone has Google Play services. Nothing here runs on a TV box without them. */
class CastSupport(context: Context) {
    val castContext: CastContext? = runCatching { CastContext.getSharedInstance(context.applicationContext) }.getOrNull()

    val available get() = castContext != null

    val selector: MediaRouteSelector
        get() = castContext?.mergedSelector ?: MediaRouteSelector.EMPTY
}

/** A button that lists the Chromecasts and TVs nearby, and stops casting when one is connected. */
@Composable
fun CastButton(support: CastSupport, modifier: Modifier = Modifier) {
    if (!support.available) return
    val context = LocalContext.current
    val router = remember { MediaRouter.getInstance(context) }
    var open by remember { mutableStateOf(false) }
    val connected = router.selectedRoute.let { !it.isDefaultOrBluetooth }
    IconButton(onClick = { open = true }, modifier = modifier) {
        Icon(
            if (connected) Icons.Filled.CastConnected else Icons.Filled.Cast,
            contentDescription = "Cast to a TV",
        )
    }
    if (open) RoutePicker(router, support.selector) { open = false }
}

@Composable
private fun RoutePicker(router: MediaRouter, selector: MediaRouteSelector, onDismiss: () -> Unit) {
    // Any change in the list of devices bumps this number, which redraws the dialog.
    var version by remember { mutableIntStateOf(0) }
    DisposableEffect(router, selector) {
        val callback = object : MediaRouter.Callback() {
            override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) { version++ }
            override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) { version++ }
            override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) { version++ }
            override fun onRouteSelected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) { version++ }
            override fun onRouteUnselected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) { version++ }
        }
        router.addCallback(selector, callback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
        onDispose { router.removeCallback(callback) }
    }
    val routes = router.routes.filter { !it.isDefaultOrBluetooth && it.isEnabled && it.matchesSelector(selector) }
    val selected = router.selectedRoute
    val connected = !selected.isDefaultOrBluetooth
    // Reading `version` makes the list above re-evaluate when devices appear.
    check(version >= 0)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cast to") },
        text = {
            Column(Modifier.fillMaxWidth()) {
                if (routes.isEmpty()) {
                    Text(
                        "Looking for TVs and Chromecasts on this Wi-Fi…",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
                routes.forEach { route ->
                    ListItem(
                        headlineContent = { Text(route.name) },
                        supportingContent = route.description?.takeIf { it.isNotBlank() }?.let { { Text(it) } },
                        trailingContent = if (route.id == selected.id) ({ Text("Connected") }) else null,
                        modifier = Modifier.clickable {
                            route.select()
                            onDismiss()
                        },
                    )
                }
            }
        },
        confirmButton = {
            if (connected) {
                TextButton(onClick = {
                    router.unselect(MediaRouter.UNSELECT_REASON_STOPPED)
                    onDismiss()
                }) { Text("Stop casting") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
