package dev.aminegames125.vesper.ui.common

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

/** On a TV the focused item grows and gets a ring; elsewhere it is a plain clickable. */
fun Modifier.tvFocus(shape: Shape = RoundedCornerShape(14.dp)): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        if (focused) 1.07f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "focus-scale",
    )
    val ring = MaterialTheme.colorScheme.onBackground
    this
        .onFocusChanged { focused = it.isFocused }
        .scale(scale)
        .then(if (focused) Modifier.shadow(18.dp, shape, ambientColor = Color.Black, spotColor = Color.Black) else Modifier)
        .then(if (focused) Modifier.border(BorderStroke(3.dp, ring), shape) else Modifier)
}

@Composable
fun RemoteImage(url: String?, modifier: Modifier = Modifier, scale: ContentScale = ContentScale.Crop) {
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (!url.isNullOrBlank()) {
            AsyncImage(model = url, contentDescription = null, contentScale = scale, modifier = Modifier.fillMaxSize())
        }
    }
}

@Composable
fun PosterCard(
    title: String,
    image: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    rank: Int? = null,
) {
    Column(
        modifier
            .tvFocus()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
    ) {
        Box {
            RemoteImage(image, Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(14.dp)))
            if (rank != null) {
                Text(
                    "$rank",
                    style = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.ExtraBold, fontSize = 52.sp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.align(Alignment.BottomStart).padding(start = 10.dp, bottom = 2.dp),
                )
            }
        }
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 2.dp, vertical = 6.dp),
        )
    }
}

@Composable
fun ChannelTile(
    title: String,
    subtitle: String?,
    logo: String?,
    favorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .tvFocus()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RemoteImage(logo, Modifier.size(width = 64.dp, height = 46.dp).clip(RoundedCornerShape(8.dp)), ContentScale.Fit)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onToggleFavorite) {
            Icon(
                if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (favorite) "Remove from favourites" else "Add to favourites",
                tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A titled row of cards that scrolls sideways. */
@Composable
fun <T> Rail(
    title: String,
    items: List<T>,
    key: (T) -> Any,
    modifier: Modifier = Modifier,
    itemWidth: Dp = 140.dp,
    horizontalPadding: Dp = 16.dp,
    content: @Composable (T) -> Unit,
) {
    if (items.isEmpty()) return
    Column(modifier.padding(bottom = 12.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(horizontal = horizontalPadding, vertical = 8.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = horizontalPadding, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(items, key = key) { item -> Box(Modifier.width(itemWidth)) { content(item) } }
        }
    }
}

@Composable
fun FilterRow(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    allLabel: String = "All",
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FilterChip(selected = selected.isEmpty(), onClick = { onSelect("") }, label = { Text(allLabel) })
        }
        items(options, key = { it }) { option ->
            FilterChip(selected = selected == option, onClick = { onSelect(if (selected == option) "" else option) }, label = { Text(option, maxLines = 1) })
        }
    }
}

@Composable
fun ScreenTitle(title: String, count: Int? = null, modifier: Modifier = Modifier) {
    Row(modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Bottom) {
        Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f, fill = false))
        if (count != null) {
            Text(
                "  $count",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun Message(title: String, body: String, modifier: Modifier = Modifier, action: @Composable (() -> Unit)? = null) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            action()
        }
    }
}

@Composable
fun BoldLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier,
    )
}

/**
 * Netflix-style row for TV: posters in a line, and the one under focus opens into a wide card
 * with its details underneath.
 */
@Composable
fun <T> ExpandRow(
    title: String,
    items: List<T>,
    key: (T) -> Any,
    image: (T) -> String?,
    name: (T) -> String,
    meta: (T) -> String?,
    onClick: (T) -> Unit,
    gutter: Dp,
) {
    if (items.isEmpty()) return
    var focusedIndex by remember { mutableStateOf(-1) }
    val ring = MaterialTheme.colorScheme.onBackground
    Column(Modifier.padding(bottom = 12.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = gutter, vertical = 8.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = gutter, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(items, key = { _, item -> key(item) }) { index, item ->
                val focused = focusedIndex == index
                val width by animateDpAsState(if (focused) 380.dp else 150.dp, label = "expand")
                Box(
                    Modifier
                        .width(width)
                        .height(225.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .then(if (focused) Modifier.border(BorderStroke(3.dp, ring), RoundedCornerShape(12.dp)) else Modifier)
                        .onFocusChanged { state ->
                            if (state.isFocused) focusedIndex = index else if (focusedIndex == index) focusedIndex = -1
                        }
                        .clickable { onClick(item) },
                ) {
                    RemoteImage(image(item), Modifier.fillMaxSize())
                    if (focused) {
                        Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f)))))
                        Text(
                            name(item),
                            style = MaterialTheme.typography.titleLarge,
                            color = Color.White,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.align(Alignment.BottomStart).padding(14.dp),
                        )
                    }
                }
            }
        }
        // Reserved so the rows below do not jump while focus moves.
        val current = items.getOrNull(focusedIndex)
        Column(Modifier.padding(horizontal = gutter).height(44.dp)) {
            if (current != null) {
                Text(name(current), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                meta(current)?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }
        }
    }
}
