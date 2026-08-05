$ErrorActionPreference = 'Stop'
Write-Host 'Configuración segura de Gemini para ArancelSmart' -ForegroundColor Cyan
$secureKey = Read-Host 'Pega la clave de Google AI Studio' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($plainKey)) { throw 'La clave está vacía.' }
  $configPath = Join-Path $PSScriptRoot '.env.local'
  [IO.File]::WriteAllText($configPath, "GEMINI_API_KEY=$plainKey`r`n", [Text.UTF8Encoding]::new($false))
  Write-Host 'Clave guardada correctamente en la configuracion privada de ArancelSmart.' -ForegroundColor Green
  Write-Host 'Cierra ArancelSmart y vuelve a ejecutar start-arancelsmart.cmd.' -ForegroundColor Yellow
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plainKey = $null
  $secureKey = $null
}
Read-Host 'Presiona Enter para cerrar'
