import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectProcessMemory } from "./process-memory.mjs";

const executablePath = path.resolve(process.argv[2] ?? "release/win-unpacked/A3 Manager.exe");
const mode = process.argv[3] === "debug" ? "debug" : "clean";
const outputPath = path.resolve(process.argv[4] ?? `output/memory/0.1.2-${mode}.json`);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `a3-memory-${mode}-`));
const args = [`--user-data-dir=${userDataDir}`];
if (mode === "debug") args.push(`--remote-debugging-port=${9900 + Math.floor(Math.random() * 90)}`);
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const appProcess = spawn(executablePath, args, { env: childEnv, stdio: "ignore", windowsHide: true });

try {
  await wait(10000);
  const measurement = {
    mode,
    executablePath,
    userDataDir,
    measuredAfterSeconds: 10,
    ...collectProcessMemory(appProcess.pid),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(measurement, null, 2));
  console.log(JSON.stringify(measurement, null, 2));
} finally {
  if (appProcess.pid) {
    spawnSync("taskkill", ["/PID", String(appProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
