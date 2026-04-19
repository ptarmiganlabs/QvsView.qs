#!/usr/bin/env pwsh
# =============================================================================
# Tool: Extract App Scripts (Qlik Sense Client-Managed)
# =============================================================================
# Usage: pwsh ./extract_scripts_cm.ps1
# Requirements: PowerShell 7+, Ctrl-Q tool, Qlik Sense certificates in PEM format
# Config: Edit the === Config === section below
# Output: ./output/YYYY-MM-DD_HHMMSS/*.qvs + optional latest/ folder
# =============================================================================

# === Config: Qlik Sense Connection ===
$QS_HOST = "qlikserver.domain.com"
$QS_PORT = "4242"                  # QRS API port (for app list)
$QS_ENGINE_PORT = "4747"            # Engine port (for script extraction)
$QS_VIRTUAL_PROXY = ""             # Virtual proxy prefix (e.g., "/qvd")
$QS_AUTH_TYPE = "cert"            # "cert" or "sense"
$QS_AUTH_USER_DIR = ""             # User directory for cert auth
$QS_AUTH_USER_ID = ""             # User ID for cert auth
$QS_CERT_FILE = "./cert/client.pem"
$QS_CERT_KEY_FILE = "./cert/client_key.pem"
$QS_ROOT_CERT_FILE = "./cert/root.pem"
$INSECURE_SSL = $false           # Skip SSL verification (for self-signed certs)

# === Config: Ctrl-Q Tool ===
$CTRLQ_BIN = "/path/to/ctrl-q"

# === Config: App Filter ===
# Filter apps by tags. Empty = all apps. Multiple tags = OR logic.
$APP_TAGS = @()

# === Config: Output ===
$DEST_ROOT = "./output"
$ENABLE_TIMESTAMP_FOLDER = $true     # Create YYYY-MM-DD_HHMMSS subfolder
$ENABLE_LATEST_FOLDER = $true    # Copy files to "latest" folder

# === Config: Logging ===
$DEBUG_MODE = $false              # Set to $true for verbose debug output

# === Config: Retention ===
$RETENTION_DAYS = 30              # Delete folders older than N days
$RETENTION_ENABLED = $true        # Enable retention cleanup

# =============================================================================
# Script Logic - Edit below only if you need to customize the extraction flow
# =============================================================================

$ScriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = $MyInvocation.MyCommand.Path | Split-Path -Parent
}
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$XrfKey = "1234567890abcdef"       # gitleaks:allow
# Required for Qlik QRS API xrfkey validation

# === Logging functions for INFO, DEBUG, WARN, ERROR ===
function Write-LogInfo {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] INFO: $Message"
}

function Write-LogDebug {
    param([string]$Message)
    if ($DEBUG_MODE) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "[$timestamp] DEBUG: $Message" -ForegroundColor Cyan
    }
}

function Write-LogWarn {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] WARN: $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] ERROR: $Message" -ForegroundColor Red
}

# === Retention: Delete old timestamped folders ===
function Remove-OldFolders {
    param(
        [string]$DestRoot,
        [int]$RetentionDays
    )

    if (-not (Test-Path $DestRoot)) { return }

    Write-LogInfo "Checking for folders older than $RetentionDays days in $DestRoot"

    # Calculate cutoff date
    $cutoffDate = (Get-Date).AddDays(-$RetentionDays).ToString("yyyy-MM-dd")

    # Find timestamped folders matching YYYY-MM-DD_HHMMSS pattern
    Get-ChildItem -Path $DestRoot -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' } |
        ForEach-Object {
            $folderDate = $_.Name.Substring(0, 10)
            if ($folderDate -lt $cutoffDate) {
                Write-LogInfo "Removing old folder: $($_.Name)"
                Remove-Item $_.FullName -Recurse -Force
            }
        }
}

# === QRS API: Fetch app list with optional tag filtering ===
function Get-QrsApps {
    param(
        [string]$QlikHost,
        [string]$CertFile,
        [string]$CertKeyFile,
        [string]$RootCertFile,
        [bool]$InsecureSsl,
        [string[]]$Tags = @()
    )

    Write-LogDebug "Fetching apps from QRS: host=$QlikHost, tags=$($Tags -join ', ')"

    $url = "https://${QlikHost}:${QS_PORT}/qrs/app/full?Xrfkey=${XrfKey}"

    # Build filter clause for tag filtering (OR logic for multiple tags)
    if ($Tags.Count -gt 0) {
        $filterClause = @()
        for ($i = 0; $i -lt $Tags.Count; $i++) {
            if ($Tags[$i]) {
                $filterClause += "tags.name eq '$($Tags[$i])'"
            }
        }
        if ($filterClause.Count -gt 0) {
            # URL-encode the filter for QRS API
            $encoded = [System.Web.HttpUtility]::UrlEncode(($filterClause -join " or "))
            $url += "&filter=$encoded"
        }
    }

    # Build curl argument array and invoke curl directly so PowerShell handles quoting safely
    $curlArgs = @(
        "-s"
        "-L"
        "--cert", $CertFile
        "--key", $CertKeyFile
        "--cacert", $RootCertFile
    )
    if ($InsecureSsl) {
        $curlArgs += "-k"
    }
    $curlArgs += @(
        "-H", "Accept: application/json"
        "-H", "x-Qlik-Xrfkey: $XrfKey"
        "-H", "X-Qlik-User: UserDirectory=Internal; UserId=sa_repository"
        "-w", "%{http_code}"
        $url
    )

    Write-LogDebug "Invoking curl with arguments: $($curlArgs -join ' ')"

    $responseStr = (& curl @curlArgs 2>&1) -join "`n"

    # Extract HTTP status code (last 3 chars)
    $httpCode = $responseStr.Substring([Math]::Max(0, $responseStr.Length - 3)).Trim()
    $body = $responseStr.Substring(0, [Math]::Max(0, $responseStr.Length - 3)).Trim()

    Write-LogDebug "QRS HTTP status: $httpCode"

    if ($httpCode -ne "200") {
        Write-LogWarn "QRS API error: $body"
        return "[]"
    }

    return $body
}

# === Ctrl-Q: Extract script from a single app ===
function Extract-AppScript {
    param(
        [string]$CtrlQBin,
        [string]$HostName,
        [string]$Port,
        [string]$VirtualProxy,
        [string]$AuthType,
        [string]$AuthUserDir,
        [string]$AuthUserId,
        [string]$CertFile,
        [string]$CertKeyFile,
        [string]$RootCertFile,
        [string]$AppId,
        [string]$AppName,
        [string]$OutputPath,
        [bool]$InsecureSsl
    )

    Write-LogDebug "Extracting script: app=$AppName (ID: $AppId)"

    # Build Ctrl-Q argument list (binary excluded — called separately via & operator)
    $ctrlQArgs = @(
        "qseow", "script-get"
        "--host", $HostName
        "--port", $Port
        "--app-id", $AppId
        "--auth-type", $AuthType
        "--open-without-data", "true"
        "--log-level", "warn"
    )

    if ($InsecureSsl) {
        $ctrlQArgs += "--secure", "false"
    } else {
        $ctrlQArgs += "--secure", "true"
    }

    if ($VirtualProxy) {
        $ctrlQArgs += "--virtual-proxy", $VirtualProxy
    }

    $ctrlQArgs += @(
        "--auth-user-dir", $AuthUserDir
        "--auth-user-id", $AuthUserId
        "--auth-cert-file", $CertFile
        "--auth-cert-key-file", $CertKeyFile
        "--auth-root-cert-file", $RootCertFile
    )

    Write-LogDebug "Ctrl-Q command: $CtrlQBin $($ctrlQArgs -join ' ')"

    # Execute Ctrl-Q directly using the PowerShell call operator so argument quoting is safe
    $output = & $CtrlQBin @ctrlQArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -or -not $output) {
        Write-LogError "Ctrl-Q failed for $AppName (exit=$exitCode)"
        return $false
    }

    # Write script to file
    $output | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-LogInfo "Extracted: $AppName -> $OutputPath"
    return $true
}

# === Parser: Extract app ID and name from QRS JSON response ===
function Parse-AppEntries {
    param([string]$Json)

    try {
        $apps = $Json | ConvertFrom-Json
        $result = @()
        foreach ($app in $apps) {
            $result += "$($app.id)|$($app.name)"
        }
        return $result -join "`n"
    }
    catch {
        Write-LogWarn "JSON parsing failed: $_"
        return ""
    }
}

# === Main: Orchestrate the extraction flow ===
function Main {
    Write-LogInfo "Starting extraction for Qlik Sense: $QS_HOST"

    # Validate Ctrl-Q binary
    if (-not (Test-Path $CTRLQ_BIN -PathType Leaf)) {
        Write-LogError "Ctrl-Q not found: $CTRLQ_BIN"
        exit 1
    }

    # Create output directory
    if (-not (Test-Path $DEST_ROOT)) {
        New-Item -ItemType Directory -Path $DEST_ROOT | Out-Null
    }

    # Determine output folder (timestamped or flat)
    $outputFolder = $DEST_ROOT
    if ($ENABLE_TIMESTAMP_FOLDER) {
        $outputFolder = Join-Path $DEST_ROOT $Timestamp
        New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null
        Write-LogInfo "Created folder: $outputFolder"
    }

    # Validate certificate files
    if (-not (Test-Path $QS_CERT_FILE -PathType Leaf)) {
        Write-LogError "Certificate not found: $QS_CERT_FILE"
        exit 1
    }

    # Fetch app list from QRS API
    Write-LogInfo "Fetching app list from QRS API..."

    $tagsArg = @()
    if ($APP_TAGS.Count -gt 0) {
        $tagsArg = $APP_TAGS
    }
    $appsJson = Get-QrsApps -QlikHost $QS_HOST -CertFile $QS_CERT_FILE -CertKeyFile $QS_CERT_KEY_FILE -RootCertFile $QS_ROOT_CERT_FILE -InsecureSsl $INSECURE_SSL -Tags $tagsArg

    if (-not $appsJson -or $appsJson -eq "[]") {
        Write-LogError "No apps found or QRS connection failed"
        exit 1
    }

    # Process each app
    $totalExtracted = 0
    $totalFailed = 0
    $entries = Parse-AppEntries -Json $appsJson

    Write-LogInfo "Processing apps..."

    $entriesArray = $entries -split "`n"
    foreach ($entry in $entriesArray) {
        if (-not $entry) { continue }

        $parts = $entry -split '\|'
        if ($parts.Count -lt 2) { continue }

        $appId = $parts[0].Trim()
        $appName = $parts[1].Trim()

        if (-not $appId) { continue }
        if (-not $appName) { $appName = "app_$appId" }

        # Sanitize filename (preserve Unicode)
        $safeAppName = $appName -replace '[\/\\:*?"<>|]', '_'
        if ($safeAppName.Length -gt 150) { $safeAppName = $safeAppName.Substring(0, 150) }
        $outputFile = Join-Path $outputFolder "$safeAppName`_$appId.qvs"

        # Extract script via Ctrl-Q
        $success = Extract-AppScript -CtrlQBin $CTRLQ_BIN -HostName $QS_HOST -Port $QS_ENGINE_PORT `
            -VirtualProxy $QS_VIRTUAL_PROXY -AuthType $QS_AUTH_TYPE `
            -AuthUserDir $QS_AUTH_USER_DIR -AuthUserId $QS_AUTH_USER_ID `
            -CertFile $QS_CERT_FILE -CertKeyFile $QS_CERT_KEY_FILE -RootCertFile $QS_ROOT_CERT_FILE `
            -AppId $appId -AppName $appName -OutputPath $outputFile -InsecureSsl $INSECURE_SSL

        if ($success) {
            $totalExtracted++

            # Copy to latest folder
            if ($ENABLE_LATEST_FOLDER) {
                $latestFolder = Join-Path $DEST_ROOT "latest"
                New-Item -ItemType Directory -Path $latestFolder -Force | Out-Null
                Copy-Item $outputFile -Destination (Join-Path $latestFolder "$safeAppName`_$appId.qvs")
            }
        } else {
            $totalFailed++
        }
    }

    # Create app_mapping.csv for traceability
    $csvFile = Join-Path $outputFolder "app_mapping.csv"
    "app_id,app_name,file_name" | Out-File -FilePath $csvFile -Encoding UTF8
    foreach ($entry in $entriesArray) {
        if (-not $entry) { continue }
        $parts = $entry -split '\|'
        if ($parts.Count -lt 2) { continue }
        $appId = $parts[0].Trim()
        $appName = $parts[1].Trim()
        if (-not $appId) { continue }
        if (-not $appName) { $appName = "app_$appId" }

        # Re-sanitize for mapping records to ensure file name match
        $csvSafeAppName = $appName -replace '[\/\\:*?"<>|]', '_'
        if ($csvSafeAppName.Length -gt 150) { $csvSafeAppName = $csvSafeAppName.Substring(0, 150) }
        $csvFileName = "$csvSafeAppName`_$appId.qvs"

        "`"$appId`",`"$appName`",`"$csvFileName`"" | Out-File -FilePath $csvFile -Append -Encoding UTF8
    }

    if ($ENABLE_LATEST_FOLDER) {
        Copy-Item $csvFile -Destination (Join-Path $DEST_ROOT "latest\app_mapping.csv")
    }

    Write-LogInfo "Mapping file: $csvFile"
    Write-LogInfo "Complete: $totalExtracted extracted, $totalFailed failed"

    # Run retention cleanup
    if ($RETENTION_ENABLED -and $ENABLE_TIMESTAMP_FOLDER) {
        Remove-OldFolders -DestRoot $DEST_ROOT -RetentionDays $RETENTION_DAYS
    }

    Write-LogInfo "Done!"
}

# Run script
Main