import inter from "@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2";

import { createApp } from "@/app";
import { loadConfig } from "@/lib/config";
import { durableObjectDirectory } from "@/sandbox";
import { d1UserStore } from "@/users";

export { DirectoryBackupGateway } from "@cloudflare/sandbox";
export { GithubOutbound, OpencodeSandbox } from "./sandbox/worker.ts";

export default createApp((env) => ({
  config: loadConfig(env),
  sandboxes: durableObjectDirectory(env.OPENCODE_SANDBOX),
  users: d1UserStore(env.DB),
  fetch: (input, init) => fetch(input, init),
  font: inter,
}));
