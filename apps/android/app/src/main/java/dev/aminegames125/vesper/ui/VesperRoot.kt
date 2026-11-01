package dev.aminegames125.vesper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.aminegames125.vesper.cast.CastSupport
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.LoadingBox
import dev.aminegames125.vesper.ui.kit.Shapes
import dev.aminegames125.vesper.ui.kit.VDivider
import dev.aminegames125.vesper.ui.kit.ToastHost
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper
import dev.aminegames125.vesper.ui.kit.backdrop
import dev.aminegames125.vesper.ui.kit.glass
import dev.aminegames125.vesper.ui.kit.pressable
import dev.aminegames125.vesper.ui.kit.rememberToastState
import dev.aminegames125.vesper.work.Notifications
import kotlinx.coroutines.delay

/** The three places a phone has in its bottom bar; a TV has these plus Home and Channels. */
private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val PhoneTabs = listOf(
    Tab("schedule", "Schedule", Ic.Calendar),
    Tab("recordings", "Recordings", Ic.Library),
    Tab("settings", "Settings", Ic.Sliders),
)

private val TvTabs = listOf(
    Tab("home", "Home", Ic.Home),
    Tab("schedule", "Schedule", Ic.Calendar),
    Tab("recordings", "Recordings", Ic.Library),
    Tab("channels", "Channels", Ic.Tv),
    Tab("settings", "Settings", Ic.Sliders),
)

@Composable
fun VesperRoot(isTv: Boolean) {
    val vm: VesperViewModel = viewModel()
    val gate by vm.gate.collectAsState()
    val busy by vm.busy.collectAsState()
    when (val state = gate) {
        Gate.Loading -> LoadingBox()
        is Gate.NeedServer, is Gate.NeedLogin -> {
            val toast = rememberToastState()
            LaunchedEffect(Unit) { vm.messages.collect { toast.show(it) } }
            Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                ConnectScreen(state, busy, vm::connect, vm::signIn, vm::changeServer)
                ToastHost(toast, Modifier.align(Alignment.BottomCenter))
            }
        }
        is Gate.Ready -> MainScaffold(vm, state, isTv)
    }
}

@Composable
private fun MainScaffold(vm: VesperViewModel, gate: Gate.Ready, isTv: Boolean) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val tabs = if (isTv) TvTabs else PhoneTabs
    val onTop = tabs.any { it.route == route }
    val toast = rememberToastState()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current
    // Casting is for phones; a TV box is the thing being cast to.
    val cast = remember(isTv) { if (isTv) null else CastSupport(context) }

    LaunchedEffect(Unit) { vm.messages.collect { toast.show(it) } }
    // Keep the lists fresh while the app is on screen, so a recording's progress moves.
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                vm.refresh()
                delay(5_000)
            }
        }
    }
    // A tile, a widget, or a link shared from another app asked to open a screen.
    val launch = vm.launchRoute
    LaunchedEffect(launch) {
        launch?.let {
            vm.launchRoute = null
            vm.returningToEditor = false
            nav.navigate(it) { launchSingleTop = true }
        }
    }
    val shared = vm.sharedUrl
    LaunchedEffect(shared) {
        if (shared != null && route != "channels") {
            vm.returningToEditor = false
            nav.navigate("channels") { launchSingleTop = true }
        }
    }
    // Ask once, on the phone, so finished recordings can notify you.
    var asked by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (!asked && !isTv && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Notifications.canPost(context)) {
            asked = true
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
        val host: @Composable (Modifier) -> Unit = { modifier ->
            NavHost(nav, startDestination = if (isTv) "home" else "schedule", modifier = modifier) {
                composable("home") {
                    TvHome(
                        vm,
                        onPlay = { nav.navigate("player/${it.id}") },
                        onRecordNow = {
                            vm.returningToEditor = false
                            nav.navigate("channels")
                        },
                        onGuide = { nav.navigate("guide") },
                        onCalendar = { nav.navigate("calendar") },
                    )
                }
                composable("schedule") {
                    ScheduleScreen(
                        vm,
                        onNew = {
                            vm.returningToEditor = false
                            vm.editing = null
                            vm.draftChannel = null
                            nav.navigate("channels")
                        },
                        onEdit = {
                            vm.editing = it
                            vm.draftChannel = null
                            nav.navigate("editor")
                        },
                        onGuide = { nav.navigate("guide") },
                        onCalendar = { nav.navigate("calendar") },
                    )
                }
                composable("recordings") {
                    RecordingsScreen(
                        vm,
                        onRecordNow = {
                            vm.returningToEditor = false
                            nav.navigate("channels")
                        },
                        onPlay = { nav.navigate("player/${it.id}") },
                    )
                }
                composable("settings") { SettingsScreen(vm, gate) }
                composable("channels") {
                    ChannelsScreen(
                        vm,
                        onBack = {
                            vm.returningToEditor = false
                            vm.sharedUrl = null
                            // On a TV this is a top-level tab, so "back" has nowhere to go.
                            if (!nav.popBackStack()) nav.goTo("home", "home")
                        },
                        onSchedule = {
                            if (vm.returningToEditor) {
                                vm.returningToEditor = false
                                vm.picked = it
                                nav.popBackStack()
                            } else {
                                vm.editing = null
                                vm.draftChannel = it
                                nav.navigate("editor") { popUpTo("channels") { inclusive = true } }
                            }
                        },
                        onWatch = {
                            vm.watching = it
                            nav.navigate("live")
                        },
                    )
                }
                composable("editor") {
                    ScheduleEditorScreen(
                        vm,
                        onBack = { nav.popBackStack() },
                        onPickChannel = { nav.navigate("channels") },
                    )
                }
                composable("guide") { GuideScreen(vm, onBack = { nav.popBackStack() }) }
                composable("calendar") { CalendarScreen(vm, onBack = { nav.popBackStack() }) }
                composable("live") {
                    val channel = vm.watching
                    if (channel == null) {
                        LaunchedEffect(Unit) { nav.popBackStack() }
                    } else {
                        PlayerScreen(
                            incoming = vm.playerFor(channel),
                            cast = cast,
                            bookmarks = emptyList(),
                            onProgress = { _, _ -> },
                            onBookmark = {},
                            castOnly = !isTv,
                            onZap = { step ->
                                val live = vm.browser.value.channels.filter { it.isLive }
                                val at = live.indexOfFirst { it.url == channel.url }
                                if (live.size > 1 && at >= 0) vm.watching = live[(at + step + live.size) % live.size]
                            },
                            onBack = { nav.popBackStack() },
                        )
                    }
                }
                composable("player/{id}") { backStack ->
                    val id = backStack.arguments?.getString("id").orEmpty()
                    val recordings by vm.recordings.collectAsState()
                    val bookmarks by vm.bookmarks.collectAsState()
                    LaunchedEffect(id) { vm.loadBookmarks(id) }
                    val recording = recordings.firstOrNull { it.id == id }
                    PlayerScreen(
                        incoming = recording?.let(vm::playerFor) ?: PlayerSource(title = "", url = vm.playlistUrl(id)),
                        cast = cast,
                        bookmarks = bookmarks,
                        onProgress = { seconds, finished -> vm.saveProgress(id, seconds, finished) },
                        onBookmark = { seconds -> vm.addBookmark(id, seconds) },
                        onDeleteBookmark = { bookmark -> vm.deleteBookmark(id, bookmark) },
                        onBack = { nav.popBackStack() },
                    )
                }
            }
        }

        if (isTv) {
            TvShell(
                tabs = tabs,
                route = route,
                showRail = onTop,
                onSelect = { nav.goTo(it, "home") },
                modifier = Modifier.fillMaxSize(),
            ) { host(Modifier.fillMaxSize()) }
        } else {
            host(Modifier.fillMaxSize())
        }
        ToastHost(toast, Modifier.align(Alignment.BottomCenter))
        }
        if (onTop && !isTv) {
            PhoneNav(PhoneTabs, route) { nav.goTo(it, PhoneTabs.first().route) }
        }
    }
}

/** The phone's navigation: a flat bar, each destination an icon over its name, the current one in the accent. */
@Composable
private fun PhoneNav(tabs: List<Tab>, route: String?, onSelect: (String) -> Unit) {
    val c = Vesper.colors
    Column(Modifier.fillMaxWidth().background(c.bg)) {
        VDivider()
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            tabs.forEach { tab ->
                val selected = route == tab.route
                val ink = if (selected) c.accent else c.textDim
                Column(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 56.dp)
                        .pressable({ onSelect(tab.route) }, Shapes.tile, role = Role.Tab, focusScale = 1.02f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
                ) {
                    VIcon(tab.icon, null, tint = ink, size = 24.dp)
                    VText(tab.label, style = Vesper.type.small.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium), color = ink, maxLines = 1)
                }
            }
        }
    }
}

/**
 * The TV's menu: a floating glass rail of icons at the left edge that opens into labels when the
 * remote moves onto it, over the screen instead of pushing it aside. It is absent on full-screen pages.
 */
@Composable
private fun TvShell(
    tabs: List<Tab>,
    route: String?,
    showRail: Boolean,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val c = Vesper.colors
    var open by remember { mutableStateOf(false) }
    val railWidth by animateDpAsState(if (open) 232.dp else 64.dp, spring(dampingRatio = 0.85f, stiffness = 360f), label = "railWidth")
    Box(modifier) {
        Box(Modifier.fillMaxSize().padding(start = if (showRail) 112.dp else 0.dp)) { content() }
        if (showRail) {
            if (open) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha = 0.72f), Color.Transparent))),
                )
            }
            Column(
                Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 20.dp)
                    .onFocusChanged { open = it.hasFocus }
                    .width(railWidth + 24.dp)
                    .glass(RoundedCornerShape(36.dp), strong = true)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tabs.forEach { tab ->
                    val selected = route == tab.route
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .pressable({ onSelect(tab.route) }, Shapes.pill, role = Role.Tab, focusScale = 1.03f)
                            .background(if (selected) c.accentSoft else Color.Transparent, Shapes.pill)
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        VIcon(tab.icon, tab.label, tint = if (selected) c.accent else c.textDim, size = 24.dp)
                        if (open) VText(tab.label, style = Vesper.type.heading, color = if (selected) c.accent else c.text, maxLines = 1)
                    }
                }
            }
        }
    }
}

private fun NavHostController.goTo(route: String, start: String? = null) {
    navigate(route) {
        popUpTo(start ?: graph.findStartDestination().route ?: route) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
