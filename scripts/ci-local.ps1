<#
.SYNOPSIS
    Runs continuous integration suite for agogpixel.github.io.
.DESCRIPTION
    Single CI orchestrator for both local runs and GitHub Actions CI:
    - Gate 0: Workflow single-source-of-truth contract & exact step allowlist
    - Gate 1: Action commit SHA pin verification & agent file leak audit
    - Gate 2: PowerShell AST parse validation (*.ps1)
    - Gate 3: Typecheck, contrast pairs & unit tests (astro check, contrast-pairs.ts, node --test)
    - Gate 4: Production build, structural gates & weight budgets
    - Gate 5: Fixture build (SITE_FIXTURES=1), structural gates, diagnostics, accessibility & fixture budgets
    - Gate 6: CSS/OFL/credits lints, negative validation smoke checks & dist restore
.PARAMETER CI
    Enforces strict fail-closed contract for CI runners: emits GitHub Actions log groups and annotations.
.PARAMETER Quick
    Skips extended negative smoke checks. Forbidden in -CI mode.
.PARAMETER Gate0Only
    Executes Gate 0 workflow contract verification and exits. Forbidden in -CI mode.
.PARAMETER WorkflowsPath
    Custom path to workflow definitions directory (defaults to .github/workflows). Forbidden in -CI mode.
#>
[CmdletBinding()]
param(
    [switch]$CI,
    [switch]$Quick,
    [switch]$Gate0Only,
    [string]$WorkflowsPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$IsCI = $CI.IsPresent -or (-not [string]::IsNullOrWhiteSpace($env:GITHUB_ACTIONS))
$script:InGroup = $false

$TotalTimer = [System.Diagnostics.Stopwatch]::StartNew()

function Enter-Gate([int]$Gate, [int]$MaxGate, [string]$Title) {
    $Header = "[Gate $Gate/$MaxGate] $Title"
    if ($IsCI) {
        Write-Host "::group::$Header"
        $script:InGroup = $true
    } else {
        Write-Host "`n=== $Header ===" -ForegroundColor Yellow
    }
}

function Exit-GatePass([string]$Message, [System.Diagnostics.Stopwatch]$Timer) {
    $elapsed = [math]::Round($Timer.Elapsed.TotalSeconds, 2)
    Write-Host "  -> [OK] $Message (${elapsed}s)" -ForegroundColor Green
    if ($IsCI -and $script:InGroup) {
        Write-Host "::endgroup::"
        $script:InGroup = $false
    }
}

function Write-Fail([string]$Message) {
    if ($IsCI) {
        Write-Host "::error::$Message"
    }
    Write-Host "  -> [FAIL] $Message" -ForegroundColor Red
}

$GateResults = [ordered]@{
    "gate0_workflow_contract"           = "fail"
    "gate1_action_pins_and_leaks"       = "fail"
    "gate2_pwsh_ast"                    = "fail"
    "gate3_typecheck_contrast_and_unit" = "fail"
    "gate4_prod_build_and_structural"   = "fail"
    "gate5_fixture_axe_and_budgets"     = "fail"
    "gate6_lints_and_negative"          = "fail"
}

function Write-GateSummary {
    Write-Host "`nGate Summary:" -ForegroundColor Cyan
    foreach ($k in $GateResults.Keys) {
        $v = "$($GateResults[$k])".ToUpperInvariant()
        Write-Host "  [${k}: $v]"
    }
}

# Fail-closed guard for CI mode: reject skip or partial flags immediately
if ($IsCI) {
    $rejectedFlags = @()
    if ($Quick) { $rejectedFlags += "-Quick" }
    if ($Gate0Only) { $rejectedFlags += "-Gate0Only" }
    if ($WorkflowsPath) { $rejectedFlags += "-WorkflowsPath" }
    if ($rejectedFlags.Count -gt 0) {
        $flagList = $rejectedFlags -join ", "
        Write-Fail "CI mode is fail-closed and cannot be combined with skip or partial flags ($flagList)."
        exit 1
    }

    $requiredTools = @(
        @{ Name = "git"; Hint = "Install Git and ensure 'git' is on PATH." },
        @{ Name = "node"; Hint = "Install Node.js (via .nvmrc) and ensure 'node' is on PATH." },
        @{ Name = "npm"; Hint = "Install npm and ensure 'npm' is on PATH." },
        @{ Name = "npx"; Hint = "Install npx and ensure 'npx' is on PATH." }
    )
    foreach ($tool in $requiredTools) {
        if (-not (Get-Command $tool.Name -ErrorAction SilentlyContinue)) {
            Write-Fail "CI mode requires '$($tool.Name)' in PATH, but it was not found. $($tool.Hint)"
            exit 1
        }
    }
}

Push-Location $RootDir
$prodLogFile = Join-Path ([System.IO.Path]::GetTempPath()) "agogpixel-astro-build-prod-$PID.log"
$fixtureLogFile = Join-Path ([System.IO.Path]::GetTempPath()) "agogpixel-astro-build-fixture-$PID.log"
$prodDistBackup = Join-Path ([System.IO.Path]::GetTempPath()) "agogpixel-dist-prod-$PID"

try {
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host " agogpixel.github.io CI Orchestrator$(if ($IsCI) { ' [-CI Fail-Closed Mode]' } elseif ($Quick) { ' [-Quick Mode]' } else { '' })" -ForegroundColor Cyan
    Write-Host " Root: $RootDir" -ForegroundColor Gray
    Write-Host "====================================================" -ForegroundColor Cyan

    $MaxGate = 6

    # -------------------------------------------------------------
    # Gate 0: Workflow Single-Source Contract & Step Allowlist
    # -------------------------------------------------------------
    $Gate0Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 0 $MaxGate "Workflow Single-Source Contract"
    $targetWorkflows = if ($WorkflowsPath) { $WorkflowsPath } else { Join-Path $RootDir ".github/workflows" }
    Write-Host "Running: node --experimental-strip-types scripts/gates/workflow-contract.ts $targetWorkflows..." -ForegroundColor Yellow
    & node --experimental-strip-types scripts/gates/workflow-contract.ts $targetWorkflows
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Workflow contract verification failed."
        throw "Gate 0 Failed: Workflow contract verification failed."
    }
    $GateResults["gate0_workflow_contract"] = "pass"
    Exit-GatePass "All workflows conform to workflow-contract.ts AST invariants" $Gate0Timer

    if ($Gate0Only) {
        $GateResults["gate1_action_pins_and_leaks"] = "not-applicable"
        $GateResults["gate2_pwsh_ast"] = "not-applicable"
        $GateResults["gate3_typecheck_contrast_and_unit"] = "not-applicable"
        $GateResults["gate4_prod_build_and_structural"] = "not-applicable"
        $GateResults["gate5_fixture_axe_and_budgets"] = "not-applicable"
        $GateResults["gate6_lints_and_negative"] = "not-applicable"
        Write-GateSummary
        $totalElapsed = [math]::Round($TotalTimer.Elapsed.TotalSeconds, 2)
        Write-Host "`n====================================================" -ForegroundColor Green
        Write-Host " Gate 0 Workflow Contract Verification PASSED in ${totalElapsed}s" -ForegroundColor Green
        Write-Host "====================================================" -ForegroundColor Green
        exit 0
    }

    # -------------------------------------------------------------
    # Gate 1: Agent File Leak Audit (Action SHA pins enforced in Gate 0)
    # -------------------------------------------------------------
    $Gate1Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 1 $MaxGate "Public-Clean Repo Leak Audit"

    $LeakPattern = '^(\.agents?/|\.gemini/|\.ai/|\.cursor/|\.claude/|scratch/|docs/learnings/|AGENTS\.md$|GEMINI\.md$|CLAUDE\.md$)'
    $TrackedFiles = @(& git -C $RootDir ls-files)
    $TrackedLeaks = @($TrackedFiles | Where-Object { $_ -match $LeakPattern })
    $UntrackedFiles = @(& git -C $RootDir ls-files --others --exclude-standard)
    $UntrackedLeaks = @($UntrackedFiles | Where-Object { $_ -match $LeakPattern })

    if ($TrackedLeaks.Count -gt 0 -or $UntrackedLeaks.Count -gt 0) {
        Write-Fail "Public-clean repo leak detected (tracked: $($TrackedLeaks -join ', '); untracked: $($UntrackedLeaks -join ', '))."
        throw "Gate 1 Failed: Public-clean repo leak detected."
    }
    $GateResults["gate1_action_pins_and_leaks"] = "pass"
    Exit-GatePass "Public-clean leak audit passed (action SHA pins enforced in Gate 0)" $Gate1Timer

    # -------------------------------------------------------------
    # Gate 2: PowerShell AST Parse Validation (*.ps1)
    # -------------------------------------------------------------
    $Gate2Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 2 $MaxGate "PowerShell AST Parse Validation (*.ps1)"
    $Ps1Files = @(Get-ChildItem -Path $RootDir -Recurse -Filter "*.ps1" | Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules)[\\/]' })
    $ParseErrors = 0
    foreach ($ps in $Ps1Files) {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($ps.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        if (@($errors).Count -gt 0) {
            Write-Fail "Parse error in $($ps.FullName): $($errors | Out-String)"
            $ParseErrors++
        }
    }
    if ($ParseErrors -gt 0) {
        throw "Gate 2 Failed: $ParseErrors PowerShell script(s) failed AST parse validation."
    }
    $GateResults["gate2_pwsh_ast"] = "pass"
    Exit-GatePass "PowerShell AST validation passed ($($Ps1Files.Count) script(s))" $Gate2Timer

    # -------------------------------------------------------------
    # Gate 3: Typecheck, Static Contrast Pairs & Unit Tests
    # -------------------------------------------------------------
    $Gate3Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 3 $MaxGate "Typecheck, Static Contrast Pairs & Unit Tests"
    if (Test-Path (Join-Path $RootDir ".astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir ".astro") }
    if (Test-Path (Join-Path $RootDir "node_modules/.astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir "node_modules/.astro") }

    Write-Host "Running: npm run check..." -ForegroundColor Yellow
    & npm run check
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "astro check returned exit code $LASTEXITCODE"
        throw "CI Step Failed: astro check returned exit code $LASTEXITCODE"
    }

    Write-Host "Running: node --experimental-strip-types scripts/gates/contrast-pairs.ts..." -ForegroundColor Yellow
    & node --experimental-strip-types scripts/gates/contrast-pairs.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Contrast pairs gate returned exit code $LASTEXITCODE"
        throw "CI Step Failed: Contrast pairs gate returned exit code $LASTEXITCODE"
    }

    Write-Host "Running: npm test..." -ForegroundColor Yellow
    $statusBeforeTest = (& git -C $RootDir status --porcelain 2>$null | Out-String).Trim()
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm test returned exit code $LASTEXITCODE"
        throw "CI Step Failed: npm test returned exit code $LASTEXITCODE"
    }

    $statusAfterTest = (& git -C $RootDir status --porcelain 2>$null | Out-String).Trim()
    if ($IsCI -and (-not [string]::IsNullOrWhiteSpace($statusAfterTest))) {
        Write-Fail "Working tree must be completely clean in -CI mode, but detected changes:`n$statusAfterTest"
        throw "CI Step Failed: Working tree dirtied in -CI mode."
    }
    if ($statusBeforeTest -ne $statusAfterTest) {
        Write-Fail "Working tree was modified by npm test:`n$statusAfterTest"
        throw "CI Step Failed: Working tree was dirtied by npm test."
    }

    $GateResults["gate3_typecheck_contrast_and_unit"] = "pass"
    Exit-GatePass "Typecheck, contrast pairs, and unit tests passed with clean working tree" $Gate3Timer

    # -------------------------------------------------------------
    # Gate 4: Production Build & Structural Output Gates
    # -------------------------------------------------------------
    $Gate4Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 4 $MaxGate "Production Build & Structural Output Gates"
    if ($env:SITE_FIXTURES) {
        Write-Fail "Production build cannot run with SITE_FIXTURES set."
        throw "CI Step Failed: Production build cannot run with SITE_FIXTURES set."
    }
    if (Test-Path (Join-Path $RootDir ".astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir ".astro") }
    if (Test-Path (Join-Path $RootDir "node_modules/.astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir "node_modules/.astro") }
    if (Test-Path (Join-Path $RootDir "dist")) { Remove-Item -Recurse -Force (Join-Path $RootDir "dist") }

    Write-Host "Running: npm run build..." -ForegroundColor Yellow
    $prodOutput = & npm run build 2>&1 | Out-String
    $prodExitCode = $LASTEXITCODE
    Write-Host $prodOutput
    Set-Content -Path $prodLogFile -Value $prodOutput -Encoding UTF8
    if ($prodExitCode -ne 0) {
        Write-Fail "astro build returned exit code $prodExitCode"
        throw "CI Step Failed: astro build returned exit code $prodExitCode"
    }

    foreach ($gateCall in @(
        @("scripts/gates/zero-js.ts", "dist"),
        @("scripts/gates/origins.ts", "dist"),
        @("scripts/gates/links.ts", "dist"),
        @("scripts/gates/canonical-sitemap.ts", "dist"),
        @("scripts/gates/budgets.ts", "dist", "budgets.json")
    )) {
        Write-Host "Running: node --experimental-strip-types $($gateCall -join ' ')..." -ForegroundColor Yellow
        & node --experimental-strip-types @gateCall
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Gate $($gateCall[0]) returned exit code $LASTEXITCODE"
            throw "CI Step Failed: $($gateCall[0]) returned exit code $LASTEXITCODE"
        }
    }

    if (Test-Path $prodDistBackup) { Remove-Item -Recurse -Force $prodDistBackup }
    Copy-Item -Recurse -Force (Join-Path $RootDir "dist") $prodDistBackup
    $GateResults["gate4_prod_build_and_structural"] = "pass"
    Exit-GatePass "Production build, structural gates, and production weight budgets passed" $Gate4Timer

    # -------------------------------------------------------------
    # Gate 5: Fixture Build (SITE_FIXTURES=1), Accessibility Audit & Budgets
    # -------------------------------------------------------------
    $Gate5Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 5 $MaxGate "Fixture Build, Diagnostics, Accessibility Audit & Budgets"
    if (Test-Path (Join-Path $RootDir ".astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir ".astro") }
    if (Test-Path (Join-Path $RootDir "node_modules/.astro")) { Remove-Item -Recurse -Force (Join-Path $RootDir "node_modules/.astro") }
    if (Test-Path (Join-Path $RootDir "dist")) { Remove-Item -Recurse -Force (Join-Path $RootDir "dist") }

    Write-Host "Running: astro build with SITE_FIXTURES=1..." -ForegroundColor Yellow
    $env:SITE_FIXTURES = "1"
    try {
        $fixtureOutput = & npx astro build 2>&1 | Out-String
        $fixtureExitCode = $LASTEXITCODE
        Write-Host $fixtureOutput
        Set-Content -Path $fixtureLogFile -Value $fixtureOutput -Encoding UTF8
        if ($fixtureExitCode -ne 0) {
            Write-Fail "Fixture build returned exit code $fixtureExitCode"
            throw "CI Step Failed: Fixture build returned exit code $fixtureExitCode"
        }

        foreach ($gateCall in @(
            @("scripts/gates/zero-js.ts", "dist"),
            @("scripts/gates/origins.ts", "dist"),
            @("scripts/gates/links.ts", "dist"),
            @("scripts/gates/canonical-sitemap.ts", "dist"),
            @("scripts/gates/diagnostics.ts", "--log", $prodLogFile, "--log", $fixtureLogFile),
            @("scripts/gates/axe.ts", "dist", "budgets.json"),
            @("scripts/gates/budgets.ts", "dist", "budgets.json")
        )) {
            Write-Host "Running: node --experimental-strip-types $($gateCall -join ' ')..." -ForegroundColor Yellow
            & node --experimental-strip-types @gateCall
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Gate $($gateCall[0]) returned exit code $LASTEXITCODE"
                throw "CI Step Failed: $($gateCall[0]) returned exit code $LASTEXITCODE"
            }
        }
    } finally {
        $env:SITE_FIXTURES = ""
    }

    $GateResults["gate5_fixture_axe_and_budgets"] = "pass"
    Exit-GatePass "Fixture build, structural gates, diagnostics, offline axe audit, and fixture budgets passed" $Gate5Timer

    # -------------------------------------------------------------
    # Gate 6: Lints, Negative Checks & Production Dist Restore
    # -------------------------------------------------------------
    $Gate6Timer = [System.Diagnostics.Stopwatch]::StartNew()
    Enter-Gate 6 $MaxGate "CSS/Integrity Lints & Production Dist Restore"

    Write-Host "Running: node --experimental-strip-types scripts/gates/css-lint.ts src/styles..." -ForegroundColor Yellow
    & node --experimental-strip-types scripts/gates/css-lint.ts src/styles
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "CSS Lints gate returned exit code $LASTEXITCODE"
        throw "CI Step Failed: CSS Lints gate returned exit code $LASTEXITCODE"
    }

    Write-Host "Running: node --experimental-strip-types scripts/gates/integrity-lint.ts ...." -ForegroundColor Yellow
    & node --experimental-strip-types scripts/gates/integrity-lint.ts .
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Integrity Lints gate returned exit code $LASTEXITCODE"
        throw "CI Step Failed: Integrity Lints gate returned exit code $LASTEXITCODE"
    }

    if ($Quick) {
        Write-Host "  -> Skipping fixture-vs-prod iframe differential check under -Quick mode." -ForegroundColor Yellow
    } else {
        $prodIndex = Get-Content -Path (Join-Path $prodDistBackup "index.html") -Raw
        $fixtureIndex = Get-Content -Path (Join-Path $RootDir "dist/index.html") -Raw
        if ($prodIndex -match '<iframe\b') {
            Write-Fail "Production dist/index.html unexpectedly rendered an <iframe> while flagship entry is draft."
            throw "Gate 6 Failed: Production dist/index.html unexpectedly contains <iframe>."
        }
        if ($fixtureIndex -notmatch 'https://itch\.io/embed/' -or $fixtureIndex -notmatch 'https://store\.steampowered\.com/widget/') {
            Write-Fail "Fixture dist/index.html did not render both itch.io and Steam widget iframes."
            throw "Gate 6 Failed: Fixture dist/index.html missing expected storefront widget iframes."
        }
        Write-Host "  Prod (0 iframes) vs Fixture (itch.io + Steam iframes) differential check passed." -ForegroundColor Green
    }

    Write-Host "Restoring Production Build Output..." -ForegroundColor Yellow
    if (Test-Path (Join-Path $RootDir "dist")) { Remove-Item -Recurse -Force (Join-Path $RootDir "dist") }
    Copy-Item -Recurse -Force $prodDistBackup (Join-Path $RootDir "dist")

    foreach ($requiredArtifact in @("dist/index.html", "dist/credits/index.html", "dist/404.html", "dist/sitemap.xml", "dist/CNAME")) {
        if (-not (Test-Path (Join-Path $RootDir $requiredArtifact))) {
            Write-Fail "Required production artifact '$requiredArtifact' does not exist after restore."
            throw "CI Step Failed: Required production artifact '$requiredArtifact' missing after restore."
        }
    }

    $GateResults["gate6_lints_and_negative"] = "pass"
    Exit-GatePass "CSS/integrity lints, differential storefront verification, and prod dist restore passed" $Gate6Timer

    $totalElapsed = [math]::Round($TotalTimer.Elapsed.TotalSeconds, 2)
    Write-GateSummary

    Write-Host "`n====================================================" -ForegroundColor Green
    Write-Host " All CI Gates PASSED in ${totalElapsed}s" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan

    $global:LASTEXITCODE = 0
    exit 0
} catch {
    if ($IsCI -and $script:InGroup) {
        Write-Host "::endgroup::"
        $script:InGroup = $false
    }
    Write-GateSummary
    Write-Host "`n====================================================" -ForegroundColor Red
    Write-Host " CI FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "====================================================" -ForegroundColor Red
    exit 1
} finally {
    if (Test-Path $prodLogFile) { Remove-Item $prodLogFile -Force -ErrorAction SilentlyContinue }
    if (Test-Path $fixtureLogFile) { Remove-Item $fixtureLogFile -Force -ErrorAction SilentlyContinue }
    if ($prodDistBackup -and (Test-Path $prodDistBackup)) { Remove-Item $prodDistBackup -Recurse -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
