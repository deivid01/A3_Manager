import { spawnSync } from "node:child_process";

export function collectProcessMemory(rootPid) {
  const command = `
    $rootPid = __ROOT_PID__
    $all = Get-CimInstance Win32_Process
    $ids = @($rootPid)
    do {
      $children = @($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | Select-Object -ExpandProperty ProcessId)
      $ids += $children
    } while ($children.Count -gt 0)
    $rows = foreach ($item in ($all | Where-Object { $ids -contains $_.ProcessId })) {
      $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
      if (-not $process) { continue }
      $role = if ($item.CommandLine -match '--type=renderer') { 'renderer' }
        elseif ($item.CommandLine -match '--type=gpu-process') { 'gpu' }
        elseif ($item.CommandLine -match '--type=utility') { 'utility' }
        elseif ($item.CommandLine -match '--type=crashpad-handler') { 'crashpad' }
        elseif ($item.ProcessId -eq $rootPid) { 'main' }
        else { 'launcher-or-child' }
      [pscustomobject]@{
        id = $item.ProcessId
        parentId = $item.ParentProcessId
        role = $role
        workingSetMb = [math]::Round($process.WorkingSet64 / 1MB, 1)
        privateMb = [math]::Round($process.PrivateMemorySize64 / 1MB, 1)
      }
    }
    $rows | ConvertTo-Json -Compress
  `.replace("__ROOT_PID__", String(rootPid));

  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Não foi possível medir os processos do aplicativo.");
  }
  const parsed = JSON.parse(result.stdout || "[]");
  const processes = Array.isArray(parsed) ? parsed : [parsed];
  return {
    processes,
    totalWorkingSetMb: round(processes.reduce((sum, item) => sum + item.workingSetMb, 0)),
    totalPrivateMb: round(processes.reduce((sum, item) => sum + item.privateMb, 0)),
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}
