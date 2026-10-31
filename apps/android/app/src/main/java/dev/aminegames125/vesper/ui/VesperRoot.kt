@file:OptIn(ExperimentalMaterial3Api::class)

package dev.aminegames125.vesper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
import dev.aminegames125.vesper.work.Notifications
import kotlinx.coroutines.delay

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Schedule("schedule", "Schedule", Icons.Filled.Event),
    Recordings("recordings", "Recordings", Icons.Filled.PlayCircle),
    Settings("settings", "Settings", Icons.Filled.Settings),
}

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
    val onTop = Tab.entries.any { it.route == route }
    val snackbar = remember { SnackbarHostState() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

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
                    Tab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = { nav.goTo(tab.route) },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Row(Modifier.padding(padding).fillMaxSize()) {
            if (onTop && isTv) {
                NavigationRail {
                    Tab.entries.forEach { tab ->
                        NavigationRailItem(
                            selected = route == tab.route,
                            onClick = { nav.goTo(tab.route) },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
            NavHost(nav, startDestination = Tab.Schedule.route, modifier = Modifier.weight(1f)) {
                composable(Tab.Schedule.route) {
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
                    )
                }
                composable(Tab.Recordings.route) {
                    RecordingsScreen(
                        vm,
                        onRecordNow = {
                            vm.returningToEditor = false
                            nav.navigate("channels")
                        },
                        onPlay = { nav.navigate("player/${it.id}") },
                    )
                }
                composable(Tab.Settings.route) { SettingsScreen(vm, gate) }
                composable("channels") {
                    ChannelsScreen(
                        vm,
                        onBack = {
                            vm.returningToEditor = false
                            nav.popBackStack()
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
                    )
                }
                composable("editor") {
                    ScheduleEditorScreen(
                        vm,
                        onBack = { nav.popBackStack() },
                        onPickChannel = { nav.navigate("channels") },
                    )
                }
                composable("player/{id}") { backStack ->
                    val id = backStack.arguments?.getString("id").orEmpty()
                    PlayerScreen(url = vm.playlistUrl(id), onBack = { nav.popBackStack() })
                }
            }
        }
    }
}

private fun NavHostController.goTo(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
