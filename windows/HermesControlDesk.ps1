# ==============================================================
# HERMES CONTROL DESK
# Full Windows desktop controller for Hermes VPS
# ==============================================================

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$ErrorActionPreference = "Continue"

# --------------------------------------------------------------
# SERVER CONFIGURATION
# --------------------------------------------------------------

$Repo          = "/opt/hermes-memory-os"
$ProdCompose   = "docker-compose.prod.yml"
$LabsCompose   = "docker-compose.agent-zero-kali.yml"
$RunnerService = "actions.runner.lordamos-hermes-memory-os.vps-hermes.service"

$ConfigDir  = Join-Path $env:APPDATA "HermesControlDesk"
$ConfigFile = Join-Path $ConfigDir "config.json"

if (!(Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
}

$DefaultConfig = [PSCustomObject]@{
    Host = "100.118.230.116"
    User = "root"
}

if (Test-Path $ConfigFile) {
    try {
        $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    }
    catch {
        $Config = $DefaultConfig
    }
}
else {
    $Config = $DefaultConfig
}

# --------------------------------------------------------------
# XAML
# --------------------------------------------------------------

[xml]$Xaml = @'
<Window
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Hermes Control Desk"
    Width="1180"
    Height="820"
    MinWidth="980"
    MinHeight="680"
    WindowStartupLocation="CenterScreen"
    Background="#080C12"
    Foreground="#EAF1F8">

    <Window.Resources>
        <Style TargetType="Button">
            <Setter Property="Background" Value="#172131"/>
            <Setter Property="Foreground" Value="#EAF2FA"/>
            <Setter Property="BorderBrush" Value="#314257"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="14,9"/>
            <Setter Property="Margin" Value="4"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="Cursor" Value="Hand"/>
        </Style>
        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#0C1420"/>
            <Setter Property="Foreground" Value="#EAF2FA"/>
            <Setter Property="BorderBrush" Value="#314257"/>
            <Setter Property="Padding" Value="8"/>
            <Setter Property="FontFamily" Value="Consolas"/>
        </Style>
        <Style TargetType="TabItem">
            <Setter Property="Background" Value="#101823"/>
            <Setter Property="Foreground" Value="#DCE7F2"/>
            <Setter Property="Padding" Value="18,8"/>
        </Style>
    </Window.Resources>

    <Grid Margin="18">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="230"/>
        </Grid.RowDefinitions>

        <!-- HEADER -->
        <Grid Grid.Row="0" Margin="0,0,0,16">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>

            <StackPanel>
                <TextBlock
                    Text="HERMES CONTROL DESK"
                    FontSize="30"
                    FontWeight="Bold"
                    Foreground="#62DFFF"/>
                <TextBlock
                    Text="Memory OS • Root Console • Infrastructure Control"
                    Foreground="#8092A7"
                    Margin="1,3,0,0"/>
            </StackPanel>

            <StackPanel
                Grid.Column="1"
                Orientation="Horizontal"
                VerticalAlignment="Center">
                <TextBox
                    x:Name="UserBox"
                    Width="80"/>
                <TextBlock
                    Text="@"
                    Margin="6,0"
                    VerticalAlignment="Center"/>
                <TextBox
                    x:Name="HostBox"
                    Width="160"/>
                <Button
                    x:Name="RefreshButton"
                    Content="↻ REFRESH"/>
            </StackPanel>
        </Grid>

        <!-- STATUS -->
        <StackPanel Grid.Row="1" Margin="0,0,0,14">
        <Grid>
            <Grid.ColumnDefinitions>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
            </Grid.ColumnDefinitions>

            <Border
                Grid.Column="0"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="HERMES API" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="ApiStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="8000" Foreground="#566579"/>
                </StackPanel>
            </Border>

            <Border
                Grid.Column="1"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="DASHBOARD" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="DashboardStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="3001" Foreground="#566579"/>
                </StackPanel>
            </Border>

            <Border
                Grid.Column="2"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="QDRANT" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="QdrantStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="6333" Foreground="#566579"/>
                </StackPanel>
            </Border>

            <Border
                Grid.Column="3"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="GITHUB RUNNER" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="RunnerStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="SYSTEMD" Foreground="#566579"/>
                </StackPanel>
            </Border>

            <Border
                Grid.Column="4"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="HERMES CLI" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="CliStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="SSH" Foreground="#566579"/>
                </StackPanel>
            </Border>
        </Grid>
        <Grid>
            <Grid.ColumnDefinitions>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
                <ColumnDefinition/>
            </Grid.ColumnDefinitions>
            <Border
                Grid.Column="0"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="AGENT ZERO" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="AgentZeroStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="50080" Foreground="#566579"/>
                </StackPanel>
            </Border>
            <Border
                Grid.Column="1"
                Background="#101823"
                BorderBrush="#26374A"
                BorderThickness="1"
                CornerRadius="6"
                Margin="4"
                Padding="14">
                <StackPanel>
                    <TextBlock Text="KALI NOVNC" Foreground="#8192A5"/>
                    <TextBlock
                        x:Name="KaliStatus"
                        Text="UNKNOWN"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="0,5,0,0"/>
                    <TextBlock Text="6901" Foreground="#566579"/>
                </StackPanel>
            </Border>
        </Grid>
        </StackPanel>

        <!-- MAIN TABS -->
        <TabControl
            Grid.Row="2"
            Background="#0B111A"
            BorderBrush="#26374A">

            <!-- CONTROL -->
            <TabItem Header="CONTROL">
                <ScrollViewer VerticalScrollBarVisibility="Auto">
                    <StackPanel Margin="14">
                        <TextBlock
                            Text="Hermes Stack"
                            FontSize="18"
                            FontWeight="Bold"
                            Margin="4,4,4,8"/>
                        <WrapPanel>
                            <Button
                                x:Name="StartCoreButton"
                                Content="▶ START STACK"/>
                            <Button
                                x:Name="StopCoreButton"
                                Content="■ STOP STACK"
                                Background="#3D1920"
                                BorderBrush="#7F2F3C"/>
                            <Button
                                x:Name="RestartCoreButton"
                                Content="↻ RESTART STACK"/>
                            <Button
                                x:Name="RebuildButton"
                                Content="⚙ REBUILD + START"/>
                        </WrapPanel>

                        <TextBlock
                            Text="Services"
                            FontSize="18"
                            FontWeight="Bold"
                            Margin="4,18,4,8"/>
                        <WrapPanel>
                            <Button
                                x:Name="RestartApiButton"
                                Content="↻ API"/>
                            <Button
                                x:Name="RestartDashboardButton"
                                Content="↻ DASHBOARD"/>
                            <Button
                                x:Name="RestartQdrantButton"
                                Content="↻ QDRANT"/>
                            <Button
                                x:Name="RestartRunnerButton"
                                Content="↻ GITHUB RUNNER"/>
                        </WrapPanel>

                        <TextBlock
                            Text="Hermes Agent"
                            FontSize="18"
                            FontWeight="Bold"
                            Margin="4,18,4,8"/>
                        <WrapPanel>
                            <Button
                                x:Name="PauseButton"
                                Content="Ⅱ PAUSE"/>
                            <Button
                                x:Name="ResumeButton"
                                Content="▶ RESUME"/>
                            <Button
                                x:Name="HermesChatButton"
                                Content="💬 HERMES CHAT"/>
                            <Button
                                x:Name="RootShellButton"
                                Content="⌘ ROOT SSH"/>
                        </WrapPanel>

                        <TextBlock
                            Text="Agent Zero &amp; Kali"
                            FontSize="18"
                            FontWeight="Bold"
                            Margin="4,18,4,8"/>
                        <WrapPanel>
                            <Button
                                x:Name="StartLabsButton"
                                Content="▶ START LABS"/>
                            <Button
                                x:Name="RestartAgentZeroButton"
                                Content="↻ AGENT ZERO"/>
                            <Button
                                x:Name="RestartKaliButton"
                                Content="↻ KALI"/>
                        </WrapPanel>

                        <TextBlock
                            Text="Web"
                            FontSize="18"
                            FontWeight="Bold"
                            Margin="4,18,4,8"/>
                        <WrapPanel>
                            <Button
                                x:Name="OpenDashboardButton"
                                Content="🌐 CONTROL DESK"/>
                            <Button
                                x:Name="OpenApiButton"
                                Content="🌐 API DOCS"/>
                            <Button
                                x:Name="OpenQdrantButton"
                                Content="🌐 QDRANT"/>
                            <Button
                                x:Name="OpenAgentZeroButton"
                                Content="🌐 AGENT ZERO"/>
                            <Button
                                x:Name="OpenKaliButton"
                                Content="🌐 KALI DESKTOP"/>
                        </WrapPanel>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- REMOTE CONSOLE -->
            <TabItem Header="REMOTE CONSOLE">
                <Grid Margin="16">
                    <Grid.RowDefinitions>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="*"/>
                        <RowDefinition Height="Auto"/>
                    </Grid.RowDefinitions>

                    <StackPanel>
                        <TextBlock
                            Text="Direct root command"
                            FontSize="18"
                            FontWeight="Bold"/>
                        <TextBlock
                            Text="Sent directly to the VPS shell over SSH."
                            Foreground="#73869A"
                            Margin="0,4,0,10"/>
                    </StackPanel>

                    <TextBox
                        x:Name="RawCommandBox"
                        Grid.Row="1"
                        AcceptsReturn="True"
                        AcceptsTab="True"
                        VerticalScrollBarVisibility="Auto"
                        HorizontalScrollBarVisibility="Auto"
                        TextWrapping="NoWrap"
                        FontSize="13"
                        Text="cd /opt/hermes-memory-os &amp;&amp; docker ps"/>

                    <WrapPanel
                        Grid.Row="2"
                        Margin="0,10,0,0">
                        <Button
                            x:Name="RunRawCommandButton"
                            Content="▶ EXECUTE"/>
                        <Button
                            x:Name="ClearCommandButton"
                            Content="CLEAR"/>
                        <Button
                            x:Name="RootShell2Button"
                            Content="OPEN INTERACTIVE SSH"/>
                    </WrapPanel>
                </Grid>
            </TabItem>

            <!-- LOGS -->
            <TabItem Header="LOGS">
                <StackPanel Margin="16">
                    <TextBlock
                        Text="Logs & Diagnostics"
                        FontSize="18"
                        FontWeight="Bold"
                        Margin="4,4,4,10"/>
                    <WrapPanel>
                        <Button
                            x:Name="AppLogsButton"
                            Content="API LOGS"/>
                        <Button
                            x:Name="DashboardLogsButton"
                            Content="DASHBOARD LOGS"/>
                        <Button
                            x:Name="RunnerLogsButton"
                            Content="RUNNER LOGS"/>
                        <Button
                            x:Name="DockerButton"
                            Content="DOCKER PS"/>
                        <Button
                            x:Name="HermesLogsButton"
                            Content="HERMES LOGS"/>
                        <Button
                            x:Name="SystemButton"
                            Content="SYSTEM STATUS"/>
                        <Button
                            x:Name="AgentZeroLogsButton"
                            Content="AGENT ZERO LOGS"/>
                        <Button
                            x:Name="KaliLogsButton"
                            Content="KALI LOGS"/>
                    </WrapPanel>
                </StackPanel>
            </TabItem>
        </TabControl>

        <!-- OUTPUT -->
        <Border
            Grid.Row="3"
            Margin="0,14,0,0"
            Background="#04080D"
            BorderBrush="#26374A"
            BorderThickness="1"
            CornerRadius="5">
            <Grid>
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                </Grid.RowDefinitions>

                <DockPanel Margin="10,7">
                    <TextBlock
                        Text="OPERATIONS CONSOLE"
                        Foreground="#687D94"
                        FontWeight="Bold"
                        VerticalAlignment="Center"/>
                    <Button
                        x:Name="ClearOutputButton"
                        DockPanel.Dock="Right"
                        Content="CLEAR OUTPUT"
                        Padding="7,2"
                        FontSize="11"/>
                </DockPanel>

                <TextBox
                    x:Name="OutputBox"
                    Grid.Row="1"
                    IsReadOnly="True"
                    AcceptsReturn="True"
                    VerticalScrollBarVisibility="Auto"
                    HorizontalScrollBarVisibility="Auto"
                    BorderThickness="0"
                    Background="#04080D"
                    Foreground="#9FDCAD"
                    FontFamily="Consolas"
                    FontSize="12"
                    Padding="10"/>
            </Grid>
        </Border>
    </Grid>
</Window>
'@

$Reader = New-Object System.Xml.XmlNodeReader $Xaml
$Window = [Windows.Markup.XamlReader]::Load($Reader)

# --------------------------------------------------------------
# CONTROLS
# --------------------------------------------------------------

$ControlNames = @(
    "UserBox",
    "HostBox",
    "RefreshButton",
    "ApiStatus",
    "DashboardStatus",
    "QdrantStatus",
    "RunnerStatus",
    "CliStatus",
    "AgentZeroStatus",
    "KaliStatus",
    "StartCoreButton",
    "StopCoreButton",
    "RestartCoreButton",
    "RebuildButton",
    "RestartApiButton",
    "RestartDashboardButton",
    "RestartQdrantButton",
    "RestartRunnerButton",
    "PauseButton",
    "ResumeButton",
    "HermesChatButton",
    "RootShellButton",
    "RootShell2Button",
    "StartLabsButton",
    "RestartAgentZeroButton",
    "RestartKaliButton",
    "OpenDashboardButton",
    "OpenApiButton",
    "OpenQdrantButton",
    "OpenAgentZeroButton",
    "OpenKaliButton",
    "RawCommandBox",
    "RunRawCommandButton",
    "ClearCommandButton",
    "AppLogsButton",
    "DashboardLogsButton",
    "RunnerLogsButton",
    "DockerButton",
    "HermesLogsButton",
    "SystemButton",
    "AgentZeroLogsButton",
    "KaliLogsButton",
    "OutputBox",
    "ClearOutputButton"
)

foreach ($Name in $ControlNames) {
    Set-Variable -Name $Name -Value $Window.FindName($Name)
}

$UserBox.Text = $Config.User
$HostBox.Text = $Config.Host

# --------------------------------------------------------------
# HELPERS
# --------------------------------------------------------------

function Save-HermesConfig {
    @{
        Host = $HostBox.Text.Trim()
        User = $UserBox.Text.Trim()
    } |
        ConvertTo-Json |
        Set-Content -Path $ConfigFile -Encoding UTF8
}

function Get-Target {
    Save-HermesConfig
    return "$($UserBox.Text.Trim())@$($HostBox.Text.Trim())"
}

function Add-ConsoleLine {
    param(
        [string]$Text
    )

    $Timestamp = Get-Date -Format "HH:mm:ss"
    $OutputBox.AppendText(
        "[$Timestamp] $Text`r`n"
    )
    $OutputBox.ScrollToEnd()
}

function Invoke-HermesSSH {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Command,
        [switch]$Quiet
    )

    $Target = Get-Target

    if (!$Quiet) {
        Add-ConsoleLine "SSH → $Target"
        Add-ConsoleLine "> $Command"
    }

    try {
        $Result = & ssh `
            -o BatchMode=yes `
            -o ConnectTimeout=8 `
            $Target `
            $Command 2>&1 | Out-String

        $ExitCode = $LASTEXITCODE
        $Result   = $Result.TrimEnd()

        if (!$Quiet) {
            if ($Result) {
                Add-ConsoleLine $Result
            }
            Add-ConsoleLine "Exit code: $ExitCode"
        }

        return [PSCustomObject]@{
            ExitCode = $ExitCode
            Output   = $Result
        }
    }
    catch {
        if (!$Quiet) {
            Add-ConsoleLine "ERROR: $($_.Exception.Message)"
        }
        return $null
    }
}

function Invoke-RawHermesCommand {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Command
    )

    #
    # Encode locally so quotes, pipes, redirects, &&, multiline
    # scripts etc. survive the SSH command boundary.
    #
    $Bytes   = [System.Text.Encoding]::UTF8.GetBytes($Command)
    $Encoded = [Convert]::ToBase64String($Bytes)
    $RemoteCommand =
        "echo '$Encoded' | base64 -d | bash -s"

    Add-ConsoleLine "━━ REMOTE ROOT COMMAND ━━"
    Add-ConsoleLine $Command

    $Result = Invoke-HermesSSH `
        -Command $RemoteCommand `
        -Quiet

    if ($Result) {
        if ($Result.Output) {
            Add-ConsoleLine $Result.Output
        }
        Add-ConsoleLine "Exit code: $($Result.ExitCode)"
    }
}

function Test-HermesPort {
    param(
        [string]$HostName,
        [int]$Port
    )

    $Client = New-Object System.Net.Sockets.TcpClient
    try {
        $Async = $Client.BeginConnect(
            $HostName,
            $Port,
            $null,
            $null
        )
        $Connected =
            $Async.AsyncWaitHandle.WaitOne(800)
        if (!$Connected) {
            return $false
        }
        $Client.EndConnect($Async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $Client.Close()
    }
}

function Set-Status {
    param(
        $Control,
        [bool]$Online,
        [string]$OnlineText = "ONLINE",
        [string]$OfflineText = "OFFLINE"
    )

    if ($Online) {
        $Control.Text = $OnlineText
        $Control.Foreground = "#52E59A"
    }
    else {
        $Control.Text = $OfflineText
        $Control.Foreground = "#FF6179"
    }
}

function Invoke-ControlAction {
    param(
        [string]$Name,
        [string]$Command
    )

    Add-ConsoleLine "━━ $Name ━━"
    $Window.Cursor =
        [System.Windows.Input.Cursors]::Wait

    try {
        Invoke-HermesSSH $Command
    }
    finally {
        $Window.Cursor =
            [System.Windows.Input.Cursors]::Arrow
    }
}

function Refresh-HermesDashboard {
    $HostName = $HostBox.Text.Trim()
    Add-ConsoleLine "Refreshing status..."

    Set-Status `
        $ApiStatus `
        (Test-HermesPort $HostName 8000)

    Set-Status `
        $DashboardStatus `
        (Test-HermesPort $HostName 3001)

    Set-Status `
        $QdrantStatus `
        (Test-HermesPort $HostName 6333)

    Set-Status `
        $AgentZeroStatus `
        (Test-HermesPort $HostName 50080)

    Set-Status `
        $KaliStatus `
        (Test-HermesPort $HostName 6901)

    $Runner = Invoke-HermesSSH `
        "systemctl is-active $RunnerService 2>/dev/null || true" `
        -Quiet

    $RunnerOnline =
        $Runner -and
        ($Runner.Output.Trim() -eq "active")

    Set-Status `
        $RunnerStatus `
        $RunnerOnline `
        "ACTIVE" `
        "DOWN"

    $Cli = Invoke-HermesSSH `
        "bash -lc 'command -v hermes >/dev/null 2>&1 && echo READY || echo MISSING'" `
        -Quiet

    $CliOnline =
        $Cli -and
        ($Cli.Output.Trim() -eq "READY")

    Set-Status `
        $CliStatus `
        $CliOnline `
        "READY" `
        "MISSING"

    Add-ConsoleLine "Refresh complete."
}

function Open-InteractiveSSH {
    $Target = Get-Target
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoExit",
            "-Command",
            "ssh $Target"
        )
}

# --------------------------------------------------------------
# STATUS
# --------------------------------------------------------------

$RefreshButton.Add_Click({
    Refresh-HermesDashboard
})

# --------------------------------------------------------------
# STACK CONTROL
# --------------------------------------------------------------

$StartCoreButton.Add_Click({
    Invoke-ControlAction `
        "START HERMES STACK" `
        "cd $Repo && docker compose -f $ProdCompose up -d"
    Refresh-HermesDashboard
})

$StopCoreButton.Add_Click({
    Invoke-ControlAction `
        "STOP HERMES STACK" `
        "cd $Repo && docker compose -f $ProdCompose stop"
    Refresh-HermesDashboard
})

$RestartCoreButton.Add_Click({
    Invoke-ControlAction `
        "RESTART HERMES STACK" `
        "cd $Repo && docker compose -f $ProdCompose restart"
    Refresh-HermesDashboard
})

$RebuildButton.Add_Click({
    Invoke-ControlAction `
        "REBUILD HERMES STACK" `
        "cd $Repo && docker compose -f $ProdCompose up -d --build"
    Refresh-HermesDashboard
})

# --------------------------------------------------------------
# INDIVIDUAL SERVICES
# --------------------------------------------------------------

$RestartApiButton.Add_Click({
    Invoke-ControlAction `
        "RESTART API" `
        "cd $Repo && docker compose -f $ProdCompose restart app"
    Refresh-HermesDashboard
})

$RestartDashboardButton.Add_Click({
    Invoke-ControlAction `
        "RESTART DASHBOARD" `
        "cd $Repo && docker compose -f $ProdCompose restart dashboard"
    Refresh-HermesDashboard
})

#
# Qdrant is standalone on this VPS.
# Do NOT start another Compose Qdrant on port 6333.
#
$RestartQdrantButton.Add_Click({
    Invoke-ControlAction `
        "RESTART QDRANT" `
        "docker restart qdrant"
    Refresh-HermesDashboard
})

$RestartRunnerButton.Add_Click({
    Invoke-ControlAction `
        "RESTART GITHUB RUNNER" `
        "systemctl restart $RunnerService && systemctl is-active $RunnerService"
    Refresh-HermesDashboard
})

# --------------------------------------------------------------
# HERMES CLI ACTIONS
# --------------------------------------------------------------

$PauseButton.Add_Click({
    Invoke-ControlAction `
        "PAUSE HERMES" `
        "bash -lc 'hermes pause'"
})

$ResumeButton.Add_Click({
    Invoke-ControlAction `
        "RESUME HERMES" `
        "bash -lc 'hermes resume'"
})

$HermesChatButton.Add_Click({
    $Target = Get-Target
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoExit",
            "-Command",
            "ssh -t $Target `"bash -lc 'hermes chat'`""
        )
})

# --------------------------------------------------------------
# SSH TERMINALS
# --------------------------------------------------------------

$RootShellButton.Add_Click({
    Open-InteractiveSSH
})

$RootShell2Button.Add_Click({
    Open-InteractiveSSH
})

# --------------------------------------------------------------
# RAW ROOT CONSOLE
# --------------------------------------------------------------

$RunRawCommandButton.Add_Click({
    $Command = $RawCommandBox.Text
    if (![string]::IsNullOrWhiteSpace($Command)) {
        $Window.Cursor =
            [System.Windows.Input.Cursors]::Wait
        try {
            Invoke-RawHermesCommand $Command
        }
        finally {
            $Window.Cursor =
                [System.Windows.Input.Cursors]::Arrow
        }
        Refresh-HermesDashboard
    }
})

$ClearCommandButton.Add_Click({
    $RawCommandBox.Clear()
    $RawCommandBox.Focus()
})

# --------------------------------------------------------------
# WEB BUTTONS
# --------------------------------------------------------------

$OpenDashboardButton.Add_Click({
    $HostName = $HostBox.Text.Trim()
    Start-Process "http://${HostName}:3001"
})

$OpenApiButton.Add_Click({
    $HostName = $HostBox.Text.Trim()
    Start-Process "http://${HostName}:8000/docs"
})

$OpenQdrantButton.Add_Click({
    $HostName = $HostBox.Text.Trim()
    Start-Process "http://${HostName}:6333/dashboard"
})

$OpenAgentZeroButton.Add_Click({
    $HostName = $HostBox.Text.Trim()
    Start-Process "http://${HostName}:50080"
})

$OpenKaliButton.Add_Click({
    $HostName = $HostBox.Text.Trim()
    Start-Process "https://${HostName}:6901"
})

# --------------------------------------------------------------
# AGENT ZERO + KALI
# --------------------------------------------------------------

$StartLabsButton.Add_Click({
    Invoke-ControlAction `
        "START AGENT ZERO + KALI" `
        "if [ ! -f $Repo/$LabsCompose ]; then echo MISSING $Repo/$LabsCompose; echo Copy deploy/docker-compose.agent-zero-kali.yml from Publisher-Pro onto the VPS.; exit 2; fi && mkdir -p /opt/agent-zero/usr && cd $Repo && docker compose -f $LabsCompose up -d"
    Refresh-HermesDashboard
})

$RestartAgentZeroButton.Add_Click({
    Invoke-ControlAction `
        "RESTART AGENT ZERO" `
        "docker restart agent-zero"
    Refresh-HermesDashboard
})

$RestartKaliButton.Add_Click({
    Invoke-ControlAction `
        "RESTART KALI" `
        "docker restart kali-novnc"
    Refresh-HermesDashboard
})

# --------------------------------------------------------------
# LOGS
# --------------------------------------------------------------

$AppLogsButton.Add_Click({
    Invoke-ControlAction `
        "API LOGS" `
        "cd $Repo && docker compose -f $ProdCompose logs --tail=150 app"
})

$DashboardLogsButton.Add_Click({
    Invoke-ControlAction `
        "DASHBOARD LOGS" `
        "cd $Repo && docker compose -f $ProdCompose logs --tail=150 dashboard"
})

$RunnerLogsButton.Add_Click({
    Invoke-ControlAction `
        "RUNNER LOGS" `
        "journalctl -u $RunnerService -n 150 --no-pager"
})

$DockerButton.Add_Click({
    Invoke-ControlAction `
        "DOCKER STATUS" `
        "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}'"
})

$HermesLogsButton.Add_Click({
    Invoke-ControlAction `
        "HERMES LOGS" `
        "bash -lc 'hermes logs'"
})

$SystemButton.Add_Click({
    Invoke-ControlAction `
        "SYSTEM STATUS" `
        "printf '%s\n' '--- uptime ---'; uptime; printf '%s\n' '--- memory ---'; free -h; printf '%s\n' '--- disk ---'; df -h /; printf '%s\n' '--- docker ---'; docker ps"
})

$AgentZeroLogsButton.Add_Click({
    Invoke-ControlAction `
        "AGENT ZERO LOGS" `
        "docker logs --tail=150 agent-zero"
})

$KaliLogsButton.Add_Click({
    Invoke-ControlAction `
        "KALI LOGS" `
        "docker logs --tail=150 kali-novnc"
})

# --------------------------------------------------------------
# OUTPUT
# --------------------------------------------------------------

$ClearOutputButton.Add_Click({
    $OutputBox.Clear()
})

# --------------------------------------------------------------
# STARTUP
# --------------------------------------------------------------

$Window.Add_ContentRendered({
    Add-ConsoleLine "Hermes Control Desk initialized."
    Add-ConsoleLine "Production compose: $Repo/$ProdCompose"
    Add-ConsoleLine "Standalone Qdrant container: qdrant"
    Add-ConsoleLine "Labs compose: $Repo/$LabsCompose"
    Add-ConsoleLine "Agent Zero UI: http://$($HostBox.Text.Trim()):50080"
    Add-ConsoleLine "Kali noVNC: https://$($HostBox.Text.Trim()):6901"
    Refresh-HermesDashboard
})

$Window.Add_Closing({
    Save-HermesConfig
})

$Window.ShowDialog() | Out-Null
