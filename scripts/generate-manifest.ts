import { execSync } from "node:child_process";
import manifest from "../src/manifest";

const json = JSON.stringify(manifest, null, 2);

execSync("pbcopy", { input: json });
console.log(json);
console.log(`
✔︎ Copied to clipboard

Open manifest: https://app.slack.com/app-settings/T02AAEL0P/A0AGXCCJ883/app-manifest
`);
