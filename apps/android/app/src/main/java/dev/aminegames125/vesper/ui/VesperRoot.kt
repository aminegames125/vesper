@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalTvMaterial3Api::class)

package dev.aminegames125.vesper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
import androidx.tv.material3.DrawerValue
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.ModalNavigationDrawer
import androidx.tv.material3.NavigationDrawerItem
import androidx.tv.material3.rememberDrawerState
import dev.aminegames125.vesper.cast.CastSupport
import dev.aminegames125.vesper.work.Notifications
import kotlinx.coroutines.delay
import androidx.tv.material3.Icon as TvIcon
import androidx.tv.material3.MaterialTheme as TvTheme
import androidx.tv.material3.Text as TvText
import androidx.tv.material3.darkColorScheme as tvDarkColorScheme

/** The three places a phone has in its bottom bar; a TV has these plus Home and Channels. */
private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val PhoneTabs = listOf(
    Tab("schedule", "Schedule", Icons.Filled.Event),
    Tab("recordings", "Recordings", Icons.Filled.PlayCircle),
    Tab("settings", "Settings", Icons.Filled.Settings),
)

private val TvTabs = listOf(
    Tab("home", "Home", Icons.Filled.Home),
    Tab("schedule", "Schedule", Icons.Filled.Event),
    Tab("recordings", "Recordings", Icons.Filled.PlayCircle),
    Tab("channels", "Channels", Icons.Filled.LiveTv),
    Tab("settings", "Settings", Icons.Filled.Settings),
)

@Composable
fun VesperRoot(isTv: Boolean) {
    val vm: VesperViewModel = viewModel()
    val gate by vm.gate.collectAsState()
    val busy by vm.busy.collectAsState()
    when (val state = gate) {
        Gate.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is Gate.NeedServer, is Gate.NeedLogin -> {
            val snackbar = remember { SnackbarHostState() }
            LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
            Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
                Box(Modifier.padding(padding)) {
                    ConnectScreen(state, busy, vm::connect, vm::signIn, vm::changeServer)
                }
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
    val snackbar = remember { SnackbarHostState() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current
    // Casting is for phones; a TV box is the thing being cast to.
    val cast = remember(isTv) { if (isTv) null else CastSupport(context) }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
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

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (onTop && !isTv) {
                NavigationBar {
                    PhoneTabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = { nav.goTo(tab.route, PhoneTabs.first().route) },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
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
                        onBack = { nav.popBackStack() },
                    )
                }
            }
        }

        if (isTv) {
            TvShell(
                tabs = tabs,
                route = route,
                showDrawer = onTop,
                onSelect = { nav.goTo(it, "home") },
                modifier = Modifier.padding(padding).fillMaxSize(),
            ) { host(Modifier.fillMaxSize()) }
        } else {
            host(Modifier.padding(padding).fillMaxSize())
        }
    }
}

/**
 * The TV's menu: a strip of icons at the left edge that opens into labels when the remote moves
 * onto it, over the screen instead of pushing it aside. It is absent on full-screen pages.
 */
@Composable
private fun TvShell(
    tabs: List<Tab>,
    route: String?,
    showDrawer: Boolean,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val m3 = androidx.compose.material3.MaterialTheme.colorScheme
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    TvTheme(
        colorScheme = tvDarkColorScheme(
            primary = m3.primary,
            onPrimary = m3.onPrimary,
            surface = m3.surface,
            onSurface = m3.onSurface,
            background = m3.background,
            onBackground = m3.onBackground,
            surfaceVariant = m3.surfaceVariant,
            onSurfaceVariant = m3.onSurfaceVariant,
            secondaryContainer = m3.secondaryContainer,
            onSecondaryContainer = m3.onSecondaryContainer,
        ),
    ) {
        ModalNavigationDrawer(
            drawerContent = {
                if (showDrawer) {
                    androidx.compose.foundation.layout.Column(
                        Modifier.fillMaxSize().padding(horizontal = 12.dp),
                        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                    ) {
                        tabs.forEach { tab ->
                            NavigationDrawerItem(
                                selected = route == tab.route,
                                onClick = {
                                    onSelect(tab.route)
                                },
                                leadingContent = { TvIcon(tab.icon, contentDescription = tab.label) },
                            ) { TvText(tab.label) }
                        }
                    }
                }
            },
            drawerState = drawerState,
            modifier = modifier,
        ) {
            Box(Modifier.fillMaxSize().padding(start = if (showDrawer) 72.dp else 0.dp)) { content() }
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
