package dev.aminegames125.vesper.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.aminegames125.vesper.data.FoundServer
import dev.aminegames125.vesper.data.discoverServers
import dev.aminegames125.vesper.ui.kit.ButtonKind
import dev.aminegames125.vesper.ui.kit.Ic
import dev.aminegames125.vesper.ui.kit.SectionHeader
import dev.aminegames125.vesper.ui.kit.VButton
import dev.aminegames125.vesper.ui.kit.VCard
import dev.aminegames125.vesper.ui.kit.VChip
import dev.aminegames125.vesper.ui.kit.VField
import dev.aminegames125.vesper.ui.kit.VFlow
import dev.aminegames125.vesper.ui.kit.VIcon
import dev.aminegames125.vesper.ui.kit.VRow
import dev.aminegames125.vesper.ui.kit.VSpinner
import dev.aminegames125.vesper.ui.kit.VText
import dev.aminegames125.vesper.ui.kit.Vesper

/** First run: the address of your Vesper server, then your account if the server has accounts. */
@Composable
fun ConnectScreen(
    gate: Gate,
    busy: Boolean,
    onConnect: (String) -> Unit,
    onSignIn: (String, String, Boolean, String?) -> Unit,
    onChangeServer: () -> Unit,
) {
    Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(pagePadding()), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 480.dp).padding(top = 40.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Wordmark()
            when (gate) {
                is Gate.NeedLogin -> LoginForm(gate, busy, onSignIn, onChangeServer)
                is Gate.NeedServer -> AddressForm(gate, busy, onConnect)
                else -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { VSpinner() }
            }
        }
    }
}

/** The mark from the brand kit (a coral bar over three shrinking paper bars) and the name. */
@Composable
private fun Wordmark() {
    val c = Vesper.colors
    Column(Modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Canvas(Modifier.size(64.dp)) {
            val unit = size.width / 64f
            val bar = 7f * unit
            val radius = CornerRadius(bar / 2f, bar / 2f)
            drawRoundRect(c.surfaceHi, size = size, cornerRadius = CornerRadius(14f * unit, 14f * unit))
            drawRoundRect(
                Brush.horizontalGradient(listOf(c.accent, c.accent2), startX = 8f * unit, endX = 56f * unit),
                topLeft = Offset(8f * unit, 10f * unit),
                size = Size(48f * unit, bar),
                cornerRadius = radius,
            )
            listOf(14f to 36f, 20f to 24f, 26f to 12f).forEachIndexed { index, (x, width) ->
                drawRoundRect(
                    c.text,
                    topLeft = Offset(x * unit, (21f + index * 11f) * unit),
                    size = Size(width * unit, bar),
                    cornerRadius = radius,
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            VText("Vesper", style = Vesper.type.display.copy(fontSize = 44.sp, lineHeight = 48.sp))
            VText("Schedule your IPTV recordings.", style = Vesper.type.heading, color = c.textDim)
        }
    }
}

@Composable
private fun AddressForm(gate: Gate.NeedServer, busy: Boolean, onConnect: (String) -> Unit) {
    var address by remember(gate.address) { mutableStateOf(gate.address) }
    val context = LocalContext.current
    var nearby by remember { mutableStateOf(emptyList<FoundServer>()) }
    LaunchedEffect(Unit) { discoverServers(context).collect { nearby = it } }
    val c = Vesper.colors
    if (nearby.isNotEmpty()) {
        SectionHeader("Found on your network")
        nearby.forEach { server ->
            VRow(
                title = server.name,
                subtitle = server.address,
                onClick = if (busy) null else ({ onConnect(server.address) }),
                leading = { VIcon(Ic.Tv, null, tint = c.accent, size = 24.dp) },
                trailing = { VIcon(Ic.Right, null, tint = c.textFaint, size = 20.dp) },
            )
        }
        SectionHeader("Or type an address")
    } else {
        VText("Looking for a Vesper server on your network…", style = Vesper.type.small, color = c.textDim)
    }
    VCard(Modifier.fillMaxWidth(), strong = true) {
        VText(
            "Enter the address of the Vesper server that will make the recordings, for example 192.168.1.20:8484.",
            style = Vesper.type.small,
            color = c.textDim,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        VField(
            address,
            { address = it },
            "Server address",
            Modifier.fillMaxWidth(),
            error = gate.error,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        VButton(
            if (busy) "Connecting…" else "Connect",
            { onConnect(address) },
            Modifier.fillMaxWidth().padding(top = 14.dp),
            enabled = !busy && address.isNotBlank(),
        )
    }
}

@Composable
private fun LoginForm(
    gate: Gate.NeedLogin,
    busy: Boolean,
    onSignIn: (String, String, Boolean, String?) -> Unit,
    onChangeServer: () -> Unit,
) {
    var register by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var invite by remember { mutableStateOf("") }
    val canRegister = gate.info.registration != "closed"
    val c = Vesper.colors

    if (gate.info.needsSetup) {
        VText(
            "This server has no accounts yet. Open its /admin/ page in a browser to create the first administrator, then sign in here.",
            style = Vesper.type.small,
            color = c.textDim,
        )
    }
    VCard(Modifier.fillMaxWidth(), strong = true) {
        if (canRegister) {
            VFlow(Modifier.padding(bottom = 12.dp)) {
                VChip("Sign in", selected = !register, onClick = { register = false })
                VChip("Create account", selected = register, onClick = { register = true })
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            VField(username, { username = it }, "Username", Modifier.fillMaxWidth())
            VField(
                password,
                { password = it },
                "Password",
                Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            if (register && gate.info.registration == "invite") {
                VField(invite, { invite = it }, "Invite code", Modifier.fillMaxWidth())
            }
        }
        VButton(
            if (busy) "Please wait…" else if (register) "Create account" else "Sign in",
            { onSignIn(username, password, register, invite.ifBlank { null }) },
            Modifier.fillMaxWidth().padding(top = 14.dp),
            enabled = !busy && username.isNotBlank() && password.isNotBlank(),
        )
    }
    VButton("Use another server", onChangeServer, Modifier.fillMaxWidth(), kind = ButtonKind.Ghost, enabled = !busy)
}
