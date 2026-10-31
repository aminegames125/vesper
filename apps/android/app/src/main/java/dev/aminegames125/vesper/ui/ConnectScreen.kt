package dev.aminegames125.vesper.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

/** First run: the address of your Vesper server, then your account if the server has accounts. */
@Composable
fun ConnectScreen(
    gate: Gate,
    busy: Boolean,
    onConnect: (String) -> Unit,
    onSignIn: (String, String, Boolean, String?) -> Unit,
    onChangeServer: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(pagePadding()).padding(top = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 480.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Vesper", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary)
            Text("Schedule your IPTV recordings.", style = MaterialTheme.typography.titleMedium)
            when (gate) {
                is Gate.NeedLogin -> LoginForm(gate, busy, onSignIn, onChangeServer)
                is Gate.NeedServer -> AddressForm(gate, busy, onConnect)
                else -> CircularProgressIndicator()
            }
        }
    }
}

@Composable
private fun AddressForm(gate: Gate.NeedServer, busy: Boolean, onConnect: (String) -> Unit) {
    var address by remember(gate.address) { mutableStateOf(gate.address) }
    Text(
        "Enter the address of the Vesper server that will make the recordings, for example 192.168.1.20:8484.",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedTextField(
        address,
        { address = it },
        label = { Text("Server address") },
        singleLine = true,
        isError = gate.error != null,
        supportingText = gate.error?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        modifier = Modifier.fillMaxWidth(),
    )
    Button(onClick = { onConnect(address) }, enabled = !busy && address.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
        Text(if (busy) "Connecting…" else "Connect")
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

    if (gate.info.needsSetup) {
        Text(
            "This server has no accounts yet. Open its /admin/ page in a browser to create the first administrator, then sign in here.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (canRegister) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = !register, onClick = { register = false }, label = { Text("Sign in") })
            FilterChip(selected = register, onClick = { register = true }, label = { Text("Create account") })
        }
    }
    OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(
        password,
        { password = it },
        label = { Text("Password") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
    )
    if (register && gate.info.registration == "invite") {
        OutlinedTextField(invite, { invite = it }, label = { Text("Invite code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    }
    Button(
        onClick = { onSignIn(username, password, register, invite.ifBlank { null }) },
        enabled = !busy && username.isNotBlank() && password.isNotBlank(),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (busy) "Please wait…" else if (register) "Create account" else "Sign in") }
    TextButton(onClick = onChangeServer, enabled = !busy) { Text("Use another server") }
}
