param (
    [switch]$Install,
    [switch]$Delete
)

$source = "C:\Users\gunes\.gemini\config\plugins\ponytail\skills"
$destination = Join-Path $PWD "skills"

$ponytailSkills = @(
    "ponytail",
    "ponytail-audit",
    "ponytail-debt",
    "ponytail-gain",
    "ponytail-help",
    "ponytail-review"
)

function Install-Skills {
    if (!(Test-Path -Path $source)) {
        Write-Host "Error: Ponytail plugin repository not found in $source. Cloning now..." -ForegroundColor Yellow
        $pluginParent = "C:\Users\gunes\.gemini\config\plugins"
        if (!(Test-Path -Path $pluginParent)) {
            New-Item -ItemType Directory -Path $pluginParent | Out-Null
        }
        git clone https://github.com/DietrichGebert/ponytail C:\Users\gunes\.gemini\config\plugins\ponytail
    }

    if (Test-Path -Path $source) {
        foreach ($skill in $ponytailSkills) {
            $srcPath = Join-Path $source $skill
            $destPath = Join-Path $destination $skill
            if (Test-Path -Path $srcPath) {
                Copy-Item -Path $srcPath -Destination $destination -Recurse -Force
                Write-Host "Installed skill: $skill" -ForegroundColor Cyan
            }
        }
        Write-Host "Ponytail skills installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Error: Could not install Ponytail skills. Repository source missing." -ForegroundColor Red
    }
}

function Delete-Skills {
    foreach ($skill in $ponytailSkills) {
        $destPath = Join-Path $destination $skill
        if (Test-Path -Path $destPath) {
            Remove-Item -Path $destPath -Recurse -Force
            Write-Host "Deleted skill: $skill" -ForegroundColor Yellow
        }
    }
    Write-Host "Ponytail skills deleted successfully!" -ForegroundColor Green
}

if ($Install) {
    Install-Skills
} elseif ($Delete) {
    Delete-Skills
} else {
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "      Ponytail Skill Manager          " -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "1. Install Ponytail Skills" -ForegroundColor White
    Write-Host "2. Delete Ponytail Skills" -ForegroundColor White
    Write-Host "3. Exit" -ForegroundColor White
    Write-Host "--------------------------------------" -ForegroundColor Cyan
    $choice = Read-Host "Select an option (1-3)"

    switch ($choice) {
        "1" { Install-Skills }
        "2" { Delete-Skills }
        "3" { exit }
        default { Write-Host "Invalid option" -ForegroundColor Red }
    }
}
