#!/usr/bin/env bun
/**
 * Deploys oda-butler to a remote macOS host over SSH.
 *
 *   bun run deploy [user@host]
 *
 * Defaults to `autofoos@autofoos-mac.local`. Assumes:
 * - bun is installed on the remote at ~/.bun/bin/bun
 * - the local .env contains the secrets you want deployed
 *
 * What it does:
 * 1. rsyncs the working tree (sans node_modules / data / .git) to ~/src/oda-butler
 * 2. copies the local .env to the same directory
 * 3. runs `bun install` on the remote
 * 4. writes a LaunchAgent plist and (re)loads it via launchctl
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.argv[2] ?? "autofoos@autofoos-mac.local";
const REMOTE_DIR = "~/src/oda-butler";
const LABEL = "com.autofoos.oda-butler";
const PROJECT_ROOT = resolve(import.meta.dir, "..");

if (!existsSync(`${PROJECT_ROOT}/.env`)) {
  console.error("✗ no .env found in project root");
  process.exit(1);
}

const ssh = (cmd: string) => {
  const result = spawnSync("ssh", [HOST, cmd], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ssh failed: ${cmd}`);
  }
};

const sshCapture = (cmd: string) => {
  const result = spawnSync("ssh", [HOST, cmd], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ssh failed: ${cmd}\n${result.stderr}`);
  }
  return result.stdout.trim();
};

console.log(`→ deploying to ${HOST}`);

console.log("→ syncing source");
const rsync = spawnSync(
  "rsync",
  [
    "-az",
    "--delete",
    "--exclude=node_modules",
    "--exclude=data",
    "--exclude=.git",
    "--exclude=.DS_Store",
    "--exclude=*.log",
    `${PROJECT_ROOT}/`,
    `${HOST}:${REMOTE_DIR}/`,
  ],
  { stdio: "inherit" },
);
if (rsync.status !== 0) {
  throw new Error("rsync failed");
}

console.log("→ copying .env");
const envCopy = spawnSync(
  "scp",
  ["-q", `${PROJECT_ROOT}/.env`, `${HOST}:${REMOTE_DIR}/.env`],
  { stdio: "inherit" },
);
if (envCopy.status !== 0) {
  throw new Error("scp .env failed");
}
ssh(`chmod 600 ${REMOTE_DIR}/.env`);

console.log("→ installing dependencies");
ssh(
  `cd ${REMOTE_DIR} && ~/.bun/bin/bun install --production --frozen-lockfile`,
);

console.log("→ resolving remote paths");
const remoteHome = sshCapture("echo $HOME");
const remoteBun = sshCapture("readlink -f ~/.bun/bin/bun");
const projectDir = `${remoteHome}/src/oda-butler`;
const logDir = `${remoteHome}/Library/Logs`;
const plistPath = `${remoteHome}/Library/LaunchAgents/${LABEL}.plist`;
ssh(`mkdir -p ${logDir}`);

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${remoteBun}</string>
        <string>run</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${projectDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${remoteHome}/.bun/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${logDir}/oda-butler.out.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/oda-butler.err.log</string>
</dict>
</plist>
`;

console.log("→ writing LaunchAgent");
const writePlist = spawnSync("ssh", [HOST, `cat > ${plistPath}`], {
  input: plist,
  stdio: ["pipe", "inherit", "inherit"],
});
if (writePlist.status !== 0) {
  throw new Error("failed to write plist");
}

console.log("→ reloading service");
const uid = sshCapture("id -u");
ssh(`launchctl bootout gui/${uid}/${LABEL} 2>/dev/null; true`);
ssh(`launchctl bootstrap gui/${uid} ${plistPath}`);
ssh(`launchctl kickstart -k gui/${uid}/${LABEL}`);

console.log(`
✔︎ deployed

  status: ssh ${HOST} 'launchctl print gui/${uid}/${LABEL} | head -30'
  logs:   ssh ${HOST} 'tail -f ${logDir}/oda-butler.out.log ${logDir}/oda-butler.err.log'
  stop:   ssh ${HOST} 'launchctl bootout gui/${uid}/${LABEL}'
`);
