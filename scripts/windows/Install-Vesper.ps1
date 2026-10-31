# Installs the Vesper MSIX from this folder. Run it through Install-Vesper.cmd (double-click).
# The package is signed with a self-signed certificate, so Windows must trust that certificate
# first; this script does it once (Local Machine > Trusted People) and then installs the package.
$ErrorActionPreference = "Stop"

$admin = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

try {
  $msix = Get-ChildItem $PSScriptRoot -Filter *.msix | Sort-Object Name | Select-Object -Last 1
  if (-not $msix) { throw "No .msix file found next to this script." }
  $cer = [IO.Path]::ChangeExtension($msix.FullName, ".cer")
  if (-not (Test-Path $cer)) { $cer = (Get-ChildItem $PSScriptRoot -Filter *.cer | Select-Object -First 1).FullName }
  if (-not $cer) { throw "No .cer file found next to the .msix. Download both files into the same folder." }

  # The package must be signed by exactly this certificate.
  $sig = Get-AuthenticodeSignature $msix.FullName
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2 $cer
  if ($sig.SignerCertificate -and $sig.SignerCertificate.Thumbprint -ne $cert.Thumbprint) {
    throw "The .cer file does not belong to this .msix. Download both from the same release."
  }

  Write-Host "Trusting the Vesper certificate..."
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
  Write-Host "Installing $($msix.Name)..."
  Add-AppxPackage -Path $msix.FullName -ForceUpdateFromAnyVersion
  Write-Host "Done. Open Vesper from the Start menu."
} catch {
  Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "Press Enter to close"
