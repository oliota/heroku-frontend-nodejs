Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$script:job = $null
$script:server = $null
$script:steps = @()
$script:index = 0
$script:stopping = $false
$script:jobStream = $null
$script:serverStream = $null
$script:jobOffset = 0L
$script:serverOffset = 0L
$script:jobFile = $null
$script:serverFile = $null
$script:colors = @{ Background = [Drawing.Color]::FromArgb(15,22,34); Panel = [Drawing.Color]::FromArgb(27,37,51); Button = [Drawing.Color]::FromArgb(43,58,75); Accent = [Drawing.Color]::FromArgb(64,205,181); Text = [Drawing.Color]::FromArgb(241,245,250); Muted = [Drawing.Color]::FromArgb(170,185,199) }
$form = New-Object Windows.Forms.Form
$form.Text = 'Oliota - Frontend Command Hub'
$form.ClientSize = New-Object Drawing.Size(1160,760)
$form.MinimumSize = New-Object Drawing.Size(940,650)
$form.StartPosition = 'CenterScreen'
$form.BackColor = $script:colors.Background
$form.ForeColor = $script:colors.Text
$form.Font = New-Object Drawing.Font('Segoe UI',10)
$header = New-Object Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 82
$header.BackColor = $script:colors.Background
$form.Controls.Add($header)
$title = New-Object Windows.Forms.Label
$title.Text = 'Oliota / Frontend'
$title.Font = New-Object Drawing.Font('Segoe UI Semibold',20)
$title.Location = New-Object Drawing.Point(20,8)
$title.AutoSize = $true
$header.Controls.Add($title)
$sub = New-Object Windows.Forms.Label
$sub.Text = 'Servidor local  |  Quality checks  |  GitHub  |  Heroku  |  Firebase'
$sub.ForeColor = $script:colors.Muted
$sub.Location = New-Object Drawing.Point(23,53)
$sub.AutoSize = $true
$header.Controls.Add($sub)
$footer = New-Object Windows.Forms.Panel
$footer.Dock = 'Bottom'
$footer.Height = 78
$footer.BackColor = $script:colors.Background
$form.Controls.Add($footer)
$status = New-Object Windows.Forms.Label
$status.Text = 'Pronto'
$status.ForeColor = $script:colors.Muted
$status.Location = New-Object Drawing.Point(20,10)
$status.AutoSize = $true
$footer.Controls.Add($status)
$progress = New-Object Windows.Forms.ProgressBar
$progress.Location = New-Object Drawing.Point(20,41)
$progress.Size = New-Object Drawing.Size(775,15)
$footer.Controls.Add($progress)
$cancel = New-Object Windows.Forms.Button
$cancel.Text = 'Cancelar tarefa'
$cancel.Size = New-Object Drawing.Size(135,36)
$cancel.Enabled = $false
$cancel.FlatStyle = 'Flat'
$cancel.Location = New-Object Drawing.Point(950,22)
$footer.Controls.Add($cancel)
$split = New-Object Windows.Forms.SplitContainer
$split.Dock = 'Fill'
$split.SplitterWidth = 8
$split.Panel1.BackColor = $script:colors.Panel
$split.Panel2.BackColor = $script:colors.Panel
$form.Controls.Add($split)
$form.Controls.SetChildIndex($split,0)
$left = New-Object Windows.Forms.Panel
$left.Dock = 'Fill'
$left.AutoScroll = $true
$split.Panel1.Controls.Add($left)
$log = New-Object Windows.Forms.RichTextBox
$log.ReadOnly = $true
$log.Dock = 'Fill'
$log.BorderStyle = 'None'
$log.BackColor = [Drawing.Color]::FromArgb(9,14,23)
$log.ForeColor = [Drawing.Color]::FromArgb(205,232,225)
$log.Font = New-Object Drawing.Font('Consolas',9.5)
$log.WordWrap = $false
$split.Panel2.Controls.Add($log)
$logHeader = New-Object Windows.Forms.Label
$logHeader.Text = 'Saida do terminal'
$logHeader.Dock = 'Top'
$logHeader.Height = 40
$logHeader.Padding = New-Object Windows.Forms.Padding(12,10,0,0)
$logHeader.Font = New-Object Drawing.Font('Segoe UI Semibold',11)
$split.Panel2.Controls.Add($logHeader)
$script:buttons = New-Object 'System.Collections.Generic.List[System.Windows.Forms.Button]'
$script:y = 12
function Section([string]$name) {
    $script:y += 9
    $heading = New-Object Windows.Forms.Label
    $heading.Text = $name.ToUpperInvariant()
    $heading.ForeColor = $script:colors.Muted
    $heading.Font = New-Object Drawing.Font('Segoe UI Semibold',9)
    $heading.Location = New-Object Drawing.Point(16,$script:y)
    $heading.AutoSize = $true
    $left.Controls.Add($heading)
    $script:y += 31
}
function Button([string]$label,[scriptblock]$action,[bool]$primary=$false) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $label
    $button.TextAlign = 'MiddleLeft'
    $button.FlatStyle = 'Flat'
    $button.FlatAppearance.BorderSize = 0
    $button.BackColor = $(if($primary){$script:colors.Accent}else{$script:colors.Button})
    $button.ForeColor = $(if($primary){[Drawing.Color]::FromArgb(8,31,35)}else{$script:colors.Text})
    $button.Font = New-Object Drawing.Font('Segoe UI Semibold',10)
    $button.Location = New-Object Drawing.Point(16,$script:y)
    $button.Size = New-Object Drawing.Size(370,39)
    $button.Anchor = 'Top,Left,Right'
    $button.Add_Click($action)
    $left.Controls.Add($button)
    $script:buttons.Add($button)
    $script:y += 46
    return $button
}
function WriteView([string]$value) {
    if ($form.IsDisposed) { return }
    $log.AppendText("$value`r`n")
    $log.SelectionStart = $log.TextLength
    $log.ScrollToCaret()
}
function Command([string]$name,[string]$line){ return @{ Name=$name; Line=$line } }
function NewRunner([string]$line,[string]$file){
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = 'node.exe'
    $runner = Join-Path $PSScriptRoot 'desktop-runner.mjs'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line))
    $info.Arguments = ('"{0}" "{1}" "{2}"' -f $runner,$file,$encoded)
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "Unable to start $line" }
    return $process
}
function StopTree($process) {
    if ($null -eq $process) { return }
    try {
        if (-not $process.HasExited) {
            $kill = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID',"$($process.Id)",'/T','/F') -WindowStyle Hidden -PassThru -Wait
            if ($kill.ExitCode -ne 0 -and -not $process.HasExited) { throw 'Unable to stop process' }
        }
    } catch { WriteView $_.Exception.Message }
}
function Drain([string]$file,[ref]$offset) {
    if (-not $file -or -not [IO.File]::Exists($file)) { return }
    $stream = [IO.File]::Open($file,'Open','Read','ReadWrite')
    try {
        if ($stream.Length -le $offset.Value) { return }
        $stream.Position = $offset.Value
        $length = [int][Math]::Min($stream.Length-$offset.Value,131072)
        $bytes = New-Object byte[] $length
        $read = $stream.Read($bytes,0,$length)
        $offset.Value += $read
        if ($read -gt 0) {
            $part = [Text.Encoding]::UTF8.GetString($bytes,0,$read)
            $log.AppendText($part)
            $log.SelectionStart = $log.TextLength
            $log.ScrollToCaret()
        }
    } finally { $stream.Dispose() }
}
function RefreshState {
    $running = ($null -ne $script:server -and -not $script:server.HasExited)
    $script:startButton.Enabled = -not $running
    $script:devButton.Enabled = -not $running
    $script:stopButton.Enabled = $running
    $script:serverLabel.Text = $(if($running){'SERVIDOR: ATIVO'}else{'SERVIDOR: PARADO'})
    $script:serverLabel.ForeColor = $(if($running){$script:colors.Accent}else{$script:colors.Muted})
}
function StartServer([string]$line) {
    RefreshState
    if ($null -ne $script:server -and -not $script:server.HasExited) { return }
    $script:serverFile = Join-Path ([IO.Path]::GetTempPath()) ("oliota-server-$([guid]::NewGuid().ToString('N')).txt")
    $script:serverOffset = 0L
    try {
        $script:server = NewRunner $line $script:serverFile
        WriteView "Started: $line"
        RefreshState
    } catch { WriteView "Start error: $($_.Exception.Message)" }
}
function StopServer {
    if ($null -ne $script:server) {
        StopTree $script:server
        Drain $script:serverFile ([ref]$script:serverOffset)
        $script:server.Dispose()
        $script:server = $null
        WriteView 'Servidor local stopped.'
    }
    RefreshState
}
function SetTaskBusy([bool]$busy) {
    foreach ($button in $script:buttons) { if($button -ne $script:startButton -and $button -ne $script:devButton -and $button -ne $script:stopButton){$button.Enabled = -not $busy} }
    $cancel.Enabled = $busy
}
function NextStep {
    if ($script:stopping) { $status.Text = 'Cancelado'; SetTaskBusy $false; return }
    if ($script:index -ge $script:steps.Count) {
        $status.Text = 'Concluido com sucesso'
        WriteView 'All steps completed.'
        SetTaskBusy $false
        return
    }
    $step = $script:steps[$script:index]
    $status.Text = "Step $($script:index+1)/$($script:steps.Count): $($step.Name)"
    WriteView "[$($script:index+1)/$($script:steps.Count)] $($step.Name)"
    $script:jobFile = Join-Path ([IO.Path]::GetTempPath()) ("oliota-task-$([guid]::NewGuid().ToString('N')).txt")
    $script:jobOffset = 0L
    try { $script:job = NewRunner $step.Line $script:jobFile }
    catch { WriteView "Task start error: $($_.Exception.Message)"; $status.Text = 'Failed'; SetTaskBusy $false }
}
function RunSteps([object[]]$items) {
    if ($null -ne $script:job -or $items.Count -eq 0) { return }
    $script:steps = @($items)
    $script:index = 0
    $script:stopping = $false
    $progress.Maximum = $script:steps.Count
    $progress.Value = 0
    SetTaskBusy $true
    NextStep
}
Section 'Servidor local'
$script:serverLabel = New-Object Windows.Forms.Label
$script:serverLabel.Text = 'SERVIDOR: PARADO'
$script:serverLabel.ForeColor = $script:colors.Muted
$script:serverLabel.Location = New-Object Drawing.Point(18,$script:y)
$script:serverLabel.AutoSize = $true
$left.Controls.Add($script:serverLabel)
$script:y += 27
$script:startButton = Button 'Iniciar servidor' { StartServer 'npm start' } $true
$script:devButton = Button 'Iniciar desenvolvimento' { StartServer 'npm run dev' }
$script:stopButton = Button 'Parar servidor' { StopServer }
Button 'Abrir jogo local' { Start-Process 'http://localhost:3000/adedonha' } | Out-Null
Section 'Manutencao'
Button 'Instalar dependencias' { RunSteps @((Command 'Install' 'npm install')) } | Out-Null
Button 'Testes' { RunSteps @((Command 'Testes' 'npm test')) } | Out-Null
Button 'Build' { RunSteps @((Command 'Build' 'npm run build')) } | Out-Null
Button 'Lint' { RunSteps @((Command 'Lint' 'npm run lint')) } | Out-Null
Button 'Estado do Git' { RunSteps @((Command 'Estado do Git' 'npm run status')) } | Out-Null
Section 'Autenticacao'
Button 'Entrar no Heroku' { RunSteps @((Command 'Heroku login' 'npm run heroku:login')) } | Out-Null
Button 'Entrar no Firebase' { RunSteps @((Command 'Firebase login' 'npm run firebase:login')) } | Out-Null
Button 'Contas Firebase' { RunSteps @((Command 'Firebase status' 'npm run firebase:status')) } | Out-Null
Section 'Publicacao'
Button 'Publicar tudo: GitHub + Heroku' {
    $message = [Microsoft.VisualBasic.Interaction]::InputBox('Commit message:', 'Deploy frontend', 'chore: update frontend')
    if ([string]::IsNullOrWhiteSpace($message)) { return }
    if ([Windows.Forms.MessageBox]::Show("Run tests, build, GitHub push and Heroku deploy?`r`n`r`n$message",'Confirm deploy','YesNo','Question') -ne 'Yes') { return }
    $quoted = '"' + $message.Replace('"','') + '"'
    RunSteps @((Command 'Testes' 'npm test'),(Command 'Build' 'npm run build'),(Command 'GitHub' "npm run deploy:github -- $quoted"),(Command 'Heroku' 'npm run deploy:heroku'))
} $true | Out-Null
Button 'Publicar somente GitHub' {
    $message = [Microsoft.VisualBasic.Interaction]::InputBox('Commit message:', 'GitHub', 'chore: update frontend')
    if ([string]::IsNullOrWhiteSpace($message)) { return }
    $quoted = '"' + $message.Replace('"','') + '"'
    RunSteps @((Command 'GitHub' "npm run deploy:github -- $quoted"))
} | Out-Null
Button 'Publicar somente Heroku' {
    if ([Windows.Forms.MessageBox]::Show('Deploy HEAD to existing Heroku app?','Confirm deploy','YesNo','Question') -eq 'Yes') { RunSteps @((Command 'Heroku' 'npm run deploy:heroku')) }
} | Out-Null
Button 'Saida do Heroku' { RunSteps @((Command 'Saida do Heroku' 'npm run heroku:logs')) } | Out-Null
Button 'Abrir jogo publicado' { Start-Process 'https://oliota.com/stop' } | Out-Null
$cancel.Add_Click({
    if ($null -ne $script:job) {
        $script:stopping = $true
        StopTree $script:job
        $status.Text = 'Cancelling task...'
    }
})
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 150
$timer.Add_Tick({
    try {
        Drain $script:serverFile ([ref]$script:serverOffset)
        Drain $script:jobFile ([ref]$script:jobOffset)
        if ($null -ne $script:server -and $script:server.HasExited) {
            $script:server.Dispose()
            $script:server = $null
            WriteView 'Servidor local exited.'
            RefreshState
        }
        if ($null -ne $script:job -and $script:job.HasExited) {
            $script:job.WaitForExit()
            Drain $script:jobFile ([ref]$script:jobOffset)
            $code = $script:job.ExitCode
            $script:job.Dispose()
            $script:job = $null
            if ($script:stopping) { $status.Text = 'Cancelado'; SetTaskBusy $false }
            elseif ($code -ne 0) { $status.Text = "Failed with exit code $code"; WriteView "Task failed ($code). Workflow stopped."; SetTaskBusy $false }
            else { $script:index++; $progress.Value = [Math]::Min($script:index,$progress.Maximum); NextStep }
        }
    } catch { WriteView "UI error: $($_.Exception.Message)" }
})
$form.Add_FormClosing({
    if ($null -ne $script:server -or $null -ne $script:job) {
        if ([Windows.Forms.MessageBox]::Show('Stop running server and tasks before closing?','Confirm exit','YesNo','Question') -ne 'Yes') { $_.Cancel = $true; return }
    }
    StopTree $script:job
    StopTree $script:server
    $timer.Stop()
})
$form.Add_Shown({
    $split.SplitterDistance = 420
    $progress.Width = [Math]::Max(400,$footer.Width-215)
    $cancel.Left = $footer.Width-150
    RefreshState
    WriteView 'Pronto. Iniciar servidor or choose an action.'
})
$footer.Add_Resize({
    $progress.Width = [Math]::Max(400,$footer.Width-215)
    $cancel.Left = $footer.Width-150
})
$timer.Start()
[Windows.Forms.Application]::Run($form)
