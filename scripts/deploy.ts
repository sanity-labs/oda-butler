#!/usr/bin/env bun
/**
 * Deploys oda-butler to a remote macOS host over SSH.
 *
 *   bun run deploy [user@host]
 *
 * Defaults to `autofoos@autofoos-mac.local`. Assumes:
 * - bun is installed on the remote at ~/.bun/bin/bun
 * - the remote already has a populated `.env` at the install path
 *   (see README for the bootstrap step). The deploy never touches it.
 *
 * What it does:
 * 1. rsyncs the working tree (sans node_modules / data / .git / .env) to ~/src/oda-butler
 * 2. runs `bun install` on the remote
 * 3. writes a LaunchAgent plist and (re)loads it via launchctl
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOST = process.argv[2] ?? "autofoos@autofoos-mac.local";
const REMOTE_DIR = "~/src/oda-butler";
const LABEL = "com.autofoos.oda-butler";
const PROJECT_ROOT = resolve(import.meta.dir, "..");

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

console.log("→ verifying remote .env");
const envCheck = spawnSync(
  "ssh",
  [HOST, `test -s ${REMOTE_DIR}/.env && echo present || echo missing`],
  { encoding: "utf8" },
);
if (envCheck.stdout.trim() !== "present") {
  console.error(
    `✗ ${REMOTE_DIR}/.env is missing or empty on ${HOST}.\n  Bootstrap once with: scp .env ${HOST}:${REMOTE_DIR}/.env && ssh ${HOST} 'chmod 600 ${REMOTE_DIR}/.env'\n  After that, deploys leave the remote .env alone.`,
  );
  process.exit(1);
}

console.log("→ syncing source");
const rsync = spawnSync(
  "rsync",
  [
    "-az",
    "--delete",
    "--exclude=node_modules",
    "--exclude=data",
    "--exclude=.git",
    "--exclude=.env",
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
