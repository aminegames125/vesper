package dev.aminegames125.vesper.ui

import androidx.compose.foundation.background
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.aminegames125.vesper.player.PlayerScreen
import dev.aminegames125.vesper.player.PlayerSession
import dev.aminegames125.vesper.ui.catalog.CatalogScreen
import dev.aminegames125.vesper.ui.common.FormFactor
import dev.aminegames125.vesper.ui.common.rememberFormFactor
import dev.aminegames125.vesper.ui.common.tvFocus
import dev.aminegames125.vesper.ui.detail.DetailScreen
import dev.aminegames125.vesper.ui.home.HomeScreen
import dev.aminegames125.vesper.ui.library.FavoritesScreen
import dev.aminegames125.vesper.ui.library.RecordingsScreen
import dev.aminegames125.vesper.ui.library.SettingsScreen
import dev.aminegames125.vesper.ui.library.SourcesScreen
import dev.aminegames125.vesper.ui.live.LiveScreen
import dev.aminegames125.vesper.ui.search.SearchScreen
import androidx.compose.ui.text.font.FontWeight

private data class Dest(val route: String, val label: String, val icon: ImageVector)

private val Home = Dest("home", "Home", Icons.Filled.Home)
private val Live = Dest("live", "Live TV", Icons.Filled.LiveTv)
private val Movies = Dest("catalog/movie", "Movies", Icons.Filled.Movie)
private val Series = Dest("catalog/show", "Series", Icons.Filled.VideoLibrary)
private val Search = Dest("search", "Search", Icons.Filled.Search)
private val Favorites = Dest("favorites", "Favourites", Icons.Filled.Favorite)
private val Recordings = Dest("recordings", "Recordings", Icons.Filled.FiberManualRecord)
private val Sources = Dest("sources", "Sources", Icons.Filled.Storage)
private val Settings = Dest("settings", "Settings", Icons.Filled.Settings)
private val More = Dest("more", "Library", Icons.Filled.Menu)
private val MyVesper = Dest("more", "My Vesper", Icons.Filled.Menu)

private val PhoneTabs = listOf(Home, Live, Movies, Series, More)
private val RailTabs = listOf(Home, Live, Movies, Series, Search, Favorites, Recordings, Sources, Settings)
private val TvTabs = listOf(Search, Home, Live, Movies, Series, MyVesper)
private val MoreItems = listOf(Search, Favorites, Recordings, Sources, Settings)

@Composable
fun VesperRoot(session: PlayerSession) {
    val form = rememberFormFactor()
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route.orEmpty()
    val current by session.current.collectAsState()
    val inDetail = route.startsWith("detail")

    fun go(dest: Dest) = nav.navigate(dest.route) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (form) {
            FormFactor.Phone -> Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).statusBarsPadding()) { Graph(nav, form) }
                if (!inDetail) {
                    NavigationBar {
                        PhoneTabs.forEach { d ->
                            NavigationBarItem(
                                selected = route == d.route || (d == More && route in MoreItems.map { it.route }),
                                onClick = { go(d) },
                                icon = { Icon(d.icon, d.label) },
                                label = { Text(d.label) },
                            )
                        }
                    }
                }
            }

            FormFactor.Tablet -> Row(Modifier.fillMaxSize()) {
                if (!inDetail) {
                    NavigationRail(Modifier.statusBarsPadding()) {
                        RailTabs.forEach { d ->
                            NavigationRailItem(selected = route == d.route, onClick = { go(d) }, icon = { Icon(d.icon, d.label) }, label = { Text(d.label) })
                        }
                    }
                }
                Box(Modifier.weight(1f).statusBarsPadding()) { Graph(nav, form) }
            }

            // A television gets a centred row of tabs along the top, like Netflix.
            FormFactor.Tv -> Box(Modifier.fillMaxSize()) {
                Column(Modifier.fillMaxSize()) {
                    if (!inDetail) TvTopBar(route, ::go)
                    Box(Modifier.weight(1f)) { Graph(nav, form) }
                }
            }
        }

        current?.let { PlayerScreen(it) }
    }
}

@Composable
private fun TvTopBar(route: String, onSelect: (Dest) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Box(Modifier.fillMaxWidth().padding(horizontal = 48.dp, vertical = 14.dp)) {
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvTabs.forEach { d ->
                var focused by remember { mutableStateOf(false) }
                val selected = route == d.route || (d.route == More.route && route in MoreItems.map { it.route })
                val fg = when {
                    focused -> colors.background
                    selected -> colors.onBackground
                    else -> colors.onSurfaceVariant
                }
                Row(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(
                            when {
                                focused -> colors.onBackground
                                selected -> colors.surfaceVariant
                                else -> Color.Transparent
                            },
                        )
                        .onFocusChanged { focused = it.isFocused }
                        .clickable { onSelect(d) }
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (d == Search) Icon(d.icon, d.label, tint = fg) else Text(d.label, color = fg, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Text(
            "Vesper",
            color = colors.primary,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.align(Alignment.CenterEnd),
        )
    }
}

@Composable
private fun Graph(nav: NavHostController, form: FormFactor) {
    val openDetail = { kind: String, id: String -> nav.navigate("detail/$kind/${android.net.Uri.encode(id)}") }
    NavHost(nav, startDestination = Home.route) {
        composable(Home.route) {
            HomeScreen(form, onOpenDetail = openDetail, onAddSource = { nav.navigate(Sources.route) })
        }
        composable(Live.route) { LiveScreen() }
        composable(
            "catalog/{kind}",
            arguments = listOf(navArgument("kind") { type = NavType.StringType }),
        ) { CatalogScreen(onOpen = openDetail) }
        composable(Search.route) { SearchScreen(onOpen = openDetail) }
        composable(Favorites.route) { FavoritesScreen(onOpen = openDetail) }
        composable(Recordings.route) { RecordingsScreen() }
        composable(Sources.route) { SourcesScreen() }
        composable(Settings.route) { SettingsScreen() }
        composable(More.route) { MoreScreen { nav.navigate(it.route) } }
        composable(
            "detail/{kind}/{id}",
            arguments = listOf(navArgument("kind") { type = NavType.StringType }, navArgument("id") { type = NavType.StringType }),
        ) { DetailScreen(onBack = { nav.popBackStack() }) }
    }
}

@Composable
private fun MoreScreen(onSelect: (Dest) -> Unit) {
    Column(Modifier.padding(16.dp)) {
        Text("Library", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(vertical = 12.dp))
        MoreItems.forEach { d ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { onSelect(d) }.padding(horizontal = 12.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(d.icon, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.padding(horizontal = 10.dp))
                Text(d.label, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
