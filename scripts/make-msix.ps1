# Packs the built Windows app into an MSIX, the format the Microsoft Store and "App Installer" use.
# The package is signed with a self-signed certificate (so it can be sideloaded) unless you pass your own.
#
#   pwsh scripts/make-msix.ps1 -Version 0.2.0 -Out Vesper-0.2.0-windows-x64.msix
#
# To install a self-signed build, trust the .cer that is written next to the package (Local Machine > Trusted People).
param(
  [Parameter(Mandatory)] [string] $Version,
  [Parameter(Mandatory)] [string] $Out,
  [string] $ExeDir = "target/release",
  [string] $Publisher = "CN=Vesper",
  [string] $PfxPath,
  [string] $PfxPassword
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Find-SdkTool([string] $name) {
  $hit = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\$name" -ErrorAction SilentlyContinue |
    Sort-Object FullName | Select-Object -Last 1
  if (-not $hit) { throw "$name not found. Install the Windows 10/11 SDK." }
  $hit.FullName
}

$four = ($Version -replace "^v", "" -replace "[-+].*$", "")
while (($four -split "\.").Count -lt 4) { $four += ".0" }

$stage = Join-Path ([IO.Path]::GetTempPath()) "vesper-msix-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path "$stage/Assets" | Out-Null

$exe = Join-Path $ExeDir "vesper.exe"
if (-not (Test-Path $exe)) { throw "vesper.exe not found in $ExeDir. Build the app first." }
Copy-Item $exe $stage
# The cloud server ships inside the app; the app starts it from next to its own exe.
$server = Join-Path $ExeDir "vesper-server.exe"
if (-not (Test-Path $server)) {
  $server = Get-ChildItem "apps/app/src-tauri/binaries/vesper-server-*windows*.exe" | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $server) { throw "vesper-server.exe not found." }
Copy-Item $server (Join-Path $stage "vesper-server.exe")

$icons = "apps/app/src-tauri/icons"
foreach ($logo in "Square44x44Logo", "Square71x71Logo", "Square150x150Logo", "StoreLogo") {
  Copy-Item "$icons/$logo.png" "$stage/Assets/$logo.png"
}

@"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="Vesper.IPTV" Publisher="$Publisher" Version="$four" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>Vesper</DisplayName>
    <PublisherDisplayName>Vesper</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="Vesper" Executable="vesper.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="Vesper"
                          Description="A lightweight IPTV player with an optional self-hosted cloud."
                          BackgroundColor="#0d0d0f"
                          Square150x150Logo="Assets\Square150x150Logo.png"
                          Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Square71x71Logo="Assets\Square71x71Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <Capability Name="privateNetworkClientServer" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@ | Set-Content -Path "$stage/AppxManifest.xml" -Encoding UTF8

$makeappx = Find-SdkTool "makeappx.exe"
$outFull = [IO.Path]::GetFullPath($Out, (Get-Location).Path)
& $makeappx pack /d $stage /p $outFull /o | Out-Host
if ($LASTEXITCODE -ne 0) { throw "makeappx failed" }

$signtool = Find-SdkTool "signtool.exe"
$cer = [IO.Path]::ChangeExtension($outFull, ".cer")
if (-not $PfxPath) {
  $PfxPassword = [guid]::NewGuid().ToString("N")
  $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature `
    -FriendlyName "Vesper sideload" -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  $PfxPath = Join-Path $stage "vesper.pfx"
  Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password (ConvertTo-SecureString $PfxPassword -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
}
& $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword $outFull | Out-Host
if ($LASTEXITCODE -ne 0) { throw "signtool failed" }

Remove-Item $stage -Recurse -Force
Write-Host "Wrote $Out"
