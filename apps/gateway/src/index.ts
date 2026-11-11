import { createApp } from "@/app";
import { loadConfig } from "@/config";
import { durableObjectDirectory } from "@/sandbox";

export { DirectoryBackupGateway } from "@cloudflare/sandbox";
export { GithubOutbound, OpencodeSandbox } from "@/sandbox";

export default createApp((env) => ({
  config: loadConfig(env),
  sandboxes: durableObjectDirectory(env.OPENCODE_SANDBOX),
}));
