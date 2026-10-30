// Turns the Android project that `tauri android init` generates into one that also installs on Android TV:
// a leanback launcher entry, no touchscreen requirement, and plain-http access for servers on the home network.
// Safe to run more than once.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "apps/app/src-tauri/gen/android/app/src/main/AndroidManifest.xml");

if (!existsSync(manifestPath)) {
  console.error("No Android project found. Run `pnpm --filter @vesper/app tauri android init` first.");
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");
const features = [
  '<uses-feature android:name="android.software.leanback" android:required="false" />',
  '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
];
for (const feature of features) {
  if (!xml.includes(feature)) xml = xml.replace("<application", `${feature}\n    <application`);
}

const leanback = '<category android:name="android.intent.category.LEANBACK_LAUNCHER" />';
if (!xml.includes(leanback)) {
  xml = xml.replace(
    /(<category android:name="android.intent.category.LAUNCHER"\s*\/>)/,
    `$1\n                ${leanback}`,
  );
}

// Home-network servers speak plain http.
xml = xml.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="true"');
if (!xml.includes("usesCleartextTraffic")) xml = xml.replace("<application", '<application android:usesCleartextTraffic="true"');

writeFileSync(manifestPath, xml);
console.log("Android manifest updated for Android TV.");
