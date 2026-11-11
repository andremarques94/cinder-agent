import { createApp } from "@/app";
import { loadConfig } from "@/config";
import { durableObjectDirectory } from "@/sandbox";
import { d1UserStore } from "@/users";

export { DirectoryBackupGateway } from "@cloudflare/sandbox";
export { GithubOutbound, OpencodeSandbox } from "@/sandbox";

export default createApp((env) => ({
  config: loadConfig(env),
  sandboxes: durableObjectDirectory(env.OPENCODE_SANDBOX),
  users: d1UserStore(env.DB),
}));
