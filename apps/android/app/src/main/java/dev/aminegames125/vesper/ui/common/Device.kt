package dev.aminegames125.vesper.ui.common

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext

/** What kind of screen the app is on, which decides the navigation and how big things are drawn. */
enum class FormFactor { Phone, Tablet, Tv }

@Composable
fun rememberFormFactor(): FormFactor {
    val context = LocalContext.current
    val widthDp = LocalConfiguration.current.screenWidthDp
    val tv = remember(context) { isTelevision(context) }
    return when {
        tv -> FormFactor.Tv
        widthDp >= 600 -> FormFactor.Tablet
        else -> FormFactor.Phone
    }
}

fun isTelevision(context: Context): Boolean {
    val ui = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
    return ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
        context.packageManager.hasSystemFeature("android.software.leanback")
}
