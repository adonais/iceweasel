#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Empirically maps each Windows process-mitigation to its bit position in the
    raw IFEO `MitigationOptions` registry value.

.DESCRIPTION
    Windows does not document how `Set-ProcessMitigation` lays out the
    `MitigationOptions` REG_BINARY value, and the constants are absent from
    win32metadata. This script recovers the layout empirically: for every
    mitigation flag accepted by `Set-ProcessMitigation -Enable`, it

        1. deletes the test IFEO key (clean slate),
        2. enables that one flag,
        3. reads the raw `MitigationOptions` / `MitigationAuditOptions` bytes,
        4. diffs against the empty baseline to find which nibble(s) changed and
           to what 2-bit value.

    Flags that change nothing on their own (modifiers such as StrictCFG or
    UserShadowStackStrictMode, which add a second bit to their base
    mitigation's nibble) get a second, leave-one-out pass: everything is
    enabled at once for a baseline, then re-enabled without that one flag,
    and the diff back to the baseline attributes the flag's bit.

    The result is the authoritative offset table you would feed into the Rust
    decoder's FIELDS list. The per-application value uses the exact same layout
    as the system-wide (`-System`) value, so calibrating per-app is sufficient
    and does not disturb system defaults or require a reboot.

.PARAMETER CsvPath
    Optional path to also dump the results as CSV.

.EXAMPLE
    .\Calibrate-MitigationOptions.ps1 -CsvPath .\mitigation-map.csv

.NOTES
    Written with Claude and refined against a live Windows VM: treat the offsets it
    produces as empirical observations, not documented behaviour.
#>
[CmdletBinding()]
param(
    [string]$CsvPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# A fake program we don't care about
$TestExe = "miticalib_probe.exe"

$IfeoRoot = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
$TestKey  = Join-Path $IfeoRoot $TestExe

if (Test-Path $TestKey) {
    throw "Test key '$TestKey' already exists; refusing to clobber it."
}

# --- helpers ---------------------------------------------------------------

# A REG_BINARY value as a little-endian byte array (empty if absent). The
# width is whatever the cmdlet wrote; it is not assumed anywhere.
function Get-Bytes($value) {
    if ($null -eq $value) { return ,[byte[]]::new(0) }
    return ,[byte[]]$value
}

# Split a byte array into nibbles (nibble 0 = low nibble of byte 0).
function Get-Nibbles([byte[]]$bytes) {
    $n = [int[]]::new($bytes.Length * 2)
    for ($i = 0; $i -lt $n.Length; $i++) {
        $b = $bytes[[Math]::Floor($i / 2)]
        $n[$i] = if ($i % 2 -eq 0) { $b -band 0x0F } else { ($b -shr 4) -band 0x0F }
    }
    return ,$n
}

# Read a single registry value, returning $null if it is absent.
function Get-RegValue([string]$name) {
    try {
        return (Get-ItemProperty -Path $TestKey -Name $name -ErrorAction Stop).$name
    } catch {
        return $null
    }
}

# Read the two mitigation values from the test key (either may be absent).
function Read-Raw {
    [pscustomobject]@{
        Options = Get-Bytes (Get-RegValue 'MitigationOptions')
        Audit   = Get-Bytes (Get-RegValue 'MitigationAuditOptions')
    }
}

function Reset-Key {
    if (Test-Path $TestKey) { Remove-Item -Path $TestKey -Recurse -Force }
}

# Diff two nibble arrays -> list of "nibble N: a -> b" changes. The shorter
# array is treated as zero-padded to the length of the longer one.
function Diff-Nibbles([int[]]$before, [int[]]$after) {
    $changes = @()
    $len = [Math]::Max($before.Length, $after.Length)
    for ($i = 0; $i -lt $len; $i++) {
        $b = if ($i -lt $before.Length) { $before[$i] } else { 0 }
        $a = if ($i -lt $after.Length)  { $after[$i]  } else { 0 }
        if ($b -ne $a) {
            $changes += [pscustomobject]@{
                Nibble   = $i
                AbsBit   = $i * 4
                Byte     = [Math]::Floor($i / 2)
                BitInByte = ($i % 2) * 4
                From     = $b
                To       = $a
            }
        }
    }
    return $changes
}

function Format-Changes($changes) {
    if (-not $changes) { return "(no change to MitigationOptions)" }
    ($changes | ForEach-Object {
        "nibble {0} (byte {1}, bit {2}, absbit {3}) = {4} -> {5}" -f `
            $_.Nibble, $_.Byte, $_.BitInByte, $_.AbsBit, $_.From, $_.To
    }) -join "; "
}

# --- discover the full set of flags from the cmdlet ------------------------
# The -Enable parameter's accepted names live in one of three places depending
# on the OS build: a ValidateSet attribute (most common; the type is string[]),
# an enum element type, or nowhere (then we fall back to a known list).

$FallbackFlags = @(
    "DEP", "EmulateAtlThunks", "SEHOP",
    "ForceRelocateImages", "RequireInfo", "BottomUp", "HighEntropy",
    "StrictHandle",
    "DisableWin32kSystemCalls", "AuditSystemCall",
    "DisableFsctlSystemCalls", "AuditFsctlSystemCalls",
    "ExtensionPoint",
    "BlockDynamicCode", "AllowThreadOptOut", "AuditDynamicCode",
    "CFG", "SuppressExports", "StrictCFG",
    "MicrosoftSignedOnly", "AllowStoreSignedBinaries", "EnforceModuleDependencySigning",
    "AuditMicrosoftSignedOnly", "AuditStoreSigned", "AuditEnforceModuleDependencySigning",
    "DisableNonSystemFonts", "AuditFont",
    "BlockRemoteImageLoads", "AuditRemoteImageLoads",
    "BlockLowLabelImageLoads", "AuditLowLabelImageLoads",
    "PreferSystem32", "AuditPreferSystem32",
    "EnableExportAddressFilter", "AuditEnableExportAddressFilter",
    "EnableExportAddressFilterPlus", "AuditEnableExportAddressFilterPlus",
    "EnableImportAddressFilter", "AuditEnableImportAddressFilter",
    "EnableRopStackPivot", "AuditEnableRopStackPivot",
    "EnableRopCallerCheck", "AuditEnableRopCallerCheck",
    "EnableRopSimExec", "AuditEnableRopSimExec",
    "TerminateOnError",
    "DisallowChildProcessCreation", "AuditChildProcess",
    "UserShadowStack", "UserShadowStackStrictMode", "AuditUserShadowStack",
    "CetDynamicApisOutOfProcOnly", "BlockNonCetBinaries", "AuditBlockNonCetBinaries"
)

function Get-MitigationFlags {
    $param = (Get-Command Set-ProcessMitigation).Parameters['Enable']

    $validate = $param.Attributes |
        Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] } |
        Select-Object -First 1
    if ($validate -and $validate.ValidValues.Count -gt 0) {
        Write-Host "Flags discovered from ValidateSet attribute." -ForegroundColor Cyan
        return $validate.ValidValues | Where-Object { $_ } | Sort-Object -Unique
    }

    $candidate = if ($param.ParameterType.IsArray) {
        $param.ParameterType.GetElementType()
    } else {
        $param.ParameterType
    }
    if ($candidate -and $candidate.IsEnum) {
        Write-Host "Flags discovered from enum $($candidate.Name)." -ForegroundColor Cyan
        return [enum]::GetNames($candidate) | Sort-Object -Unique
    }

    Write-Host "Could not introspect the flag list; using the built-in fallback." -ForegroundColor Yellow
    return $FallbackFlags | Sort-Object -Unique
}

$flags = Get-MitigationFlags
Write-Host "Discovered $($flags.Count) mitigation flags for Set-ProcessMitigation -Enable" -ForegroundColor Cyan

# --- baseline --------------------------------------------------------------

Reset-Key
# Touch the key so it exists with no MitigationOptions value.
New-Item -Path $TestKey -Force | Out-Null
$baseline = Read-Raw
$baseOptNibbles   = Get-Nibbles $baseline.Options
$baseAuditNibbles = Get-Nibbles $baseline.Audit

# --- calibration passes ----------------------------------------------------

# Build a result row. `SortNibble` is the first nibble touched in
# MitigationOptions (audit-only rows sort after those, unchanged rows last).
function New-Row([string]$flag, [string]$mode, [string]$status, $raw,
                 $optChanges, $auditChanges, [string]$note = "") {
    # An empty diff arrives as $null, and @($null) has one element.
    $optChanges   = @($optChanges   | Where-Object { $null -ne $_ })
    $auditChanges = @($auditChanges | Where-Object { $null -ne $_ })
    $hex = if ($null -ne $raw) {
        ($raw.Options | ForEach-Object { $_.ToString("x2") }) -join " "
    } else { "" }
    $sort = if ($optChanges.Count) { $optChanges[0].Nibble }
            elseif ($auditChanges.Count) { 100 + $auditChanges[0].Nibble }
            else { 999 }

    [pscustomobject]@{
        Flag          = $flag
        Mode          = $mode
        Status        = $status
        OptionsHex    = $hex
        OptionsChange = Format-Changes $optChanges
        AuditChange   = Format-Changes $auditChanges
        Note          = $note
        Silent        = ($optChanges.Count -eq 0 -and $auditChanges.Count -eq 0)
        SortNibble    = $sort
    }
}

function Invoke-Pass([string]$flag, [string]$mode) {
    Reset-Key
    try {
        if ($mode -eq "Enable") {
            Set-ProcessMitigation -Name $TestExe -Enable $flag -ErrorAction Stop
        } else {
            Set-ProcessMitigation -Name $TestExe -Disable $flag -ErrorAction Stop
        }
    } catch {
        return New-Row $flag $mode "ERROR" $null @() @() $_.Exception.Message
    }

    $raw = Read-Raw
    New-Row $flag $mode "OK" $raw `
        (Diff-Nibbles $baseOptNibbles   (Get-Nibbles $raw.Options)) `
        (Diff-Nibbles $baseAuditNibbles (Get-Nibbles $raw.Audit))
}

# Enable a set of flags in one cmdlet call; if that is rejected, apply them one
# at a time and return the names of those that failed.
function Enable-Flags([string[]]$enableFlags) {
    Reset-Key
    try {
        Set-ProcessMitigation -Name $TestExe -Enable $enableFlags -ErrorAction Stop
        return @()
    } catch {
        Write-Host "    group enable rejected; applying flags one at a time" -ForegroundColor Yellow
        Reset-Key
        $failed = @()
        foreach ($f in $enableFlags) {
            try {
                Set-ProcessMitigation -Name $TestExe -Enable $f -ErrorAction Stop
            } catch {
                $failed += $f
            }
        }
        return $failed
    }
}

function Format-Skipped([string[]]$skipped) {
    if ($skipped.Count) { "skipped: " + ($skipped -join ", ") } else { "" }
}

$results = @()

try {
    foreach ($flag in $flags) {
        Write-Host "  enable  $flag" -ForegroundColor DarkGray
        $results += Invoke-Pass $flag "Enable"
        Write-Host "  disable $flag" -ForegroundColor DarkGray
        $results += Invoke-Pass $flag "Disable"
    }

    # --- leave-one-out passes for flags that are silent on their own -------
    # See .DESCRIPTION. Flags rejected in the all-enabled baseline are dropped
    # from every subsequent pass and recorded in the Note column.

    $okFlags = @($results | Where-Object { $_.Mode -eq "Enable" -and $_.Status -eq "OK" } |
        ForEach-Object Flag)

    $skippedAll = @(Enable-Flags $okFlags)
    if ($skippedAll.Count) {
        Write-Host "Flags skipped in the all-enabled baseline: $($skippedAll -join ', ')" -ForegroundColor Yellow
        $okFlags = @($okFlags | Where-Object { $skippedAll -notcontains $_ })
    }
    $allRaw = Read-Raw
    $allOptNibbles   = Get-Nibbles $allRaw.Options
    $allAuditNibbles = Get-Nibbles $allRaw.Audit

    $results += New-Row "(all)" "AllEnabled" "OK" $allRaw `
        (Diff-Nibbles $baseOptNibbles   $allOptNibbles) `
        (Diff-Nibbles $baseAuditNibbles $allAuditNibbles) `
        (Format-Skipped $skippedAll)

    $silentFlags = @($results | Where-Object {
        $_.Mode -eq "Enable" -and $_.Status -eq "OK" -and $_.Silent -and $okFlags -contains $_.Flag
    } | ForEach-Object Flag)

    foreach ($flag in $silentFlags) {
        Write-Host "  leave-out $flag" -ForegroundColor DarkGray
        $skipped = @(Enable-Flags @($okFlags | Where-Object { $_ -ne $flag }))
        $raw = Read-Raw
        $status = if ($skipped.Count) { "PARTIAL" } else { "OK" }
        # Diff from the leave-one-out state to the all-enabled baseline, so the
        # reported change reads "without flag -> with flag".
        $results += New-Row $flag "LeaveOneOut" $status $raw `
            (Diff-Nibbles (Get-Nibbles $raw.Options) $allOptNibbles) `
            (Diff-Nibbles (Get-Nibbles $raw.Audit)   $allAuditNibbles) `
            (Format-Skipped $skipped)
    }
} finally {
    Reset-Key
}

# --- report ----------------------------------------------------------------

# Reword the solo rows of flags that were silent on their own, now that the
# leave-one-out pass has shown whether they act in combination.
foreach ($loo in @($results | Where-Object { $_.Mode -eq "LeaveOneOut" })) {
    $text = if ($loo.Silent) { "(no effect alone or combined)" }
            else { "(no effect on its own, see LeaveOneOut)" }
    $results | Where-Object { $_.Flag -eq $loo.Flag -and $_.Mode -ne "LeaveOneOut" -and $_.Silent } |
        ForEach-Object { $_.OptionsChange = $text }
}

$allRow = $results | Where-Object { $_.Mode -eq "AllEnabled" }
$sorted = $results |
    Where-Object { $_.Mode -ne "AllEnabled" } |
    Sort-Object SortNibble, Flag, Mode
$columns = "Flag", "Mode", "Status", "OptionsChange", "AuditChange", "Note"

Write-Host "`n=== MitigationOptions calibration ===" -ForegroundColor Green
Write-Host "All flags enabled: $($allRow.OptionsHex) $($allRow.Note)"
$sorted | Format-Table $columns -AutoSize -Wrap

if ($CsvPath) {
    @($allRow) + @($sorted) |
        Select-Object ($columns + "OptionsHex") |
        Export-Csv -Path $CsvPath -NoTypeInformation
    Write-Host "`nWrote CSV to $CsvPath" -ForegroundColor Cyan
}

Write-Host "`nNote: flags whose only effect is on 'AuditChange' write to" `
           "MitigationAuditOptions, which the crash annotation code does not read." -ForegroundColor Yellow
