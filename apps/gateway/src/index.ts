import { createApp } from "@/app";
import { loadConfig } from "@/config";
import { durableObjectDirectory } from "@/sandbox";

export { OpencodeSandbox } from "@/sandbox";

export default createApp((env) => ({
  config: loadConfig(env),
  sandboxes: durableObjectDirectory(env.OPENCODE_SANDBOX),
}));
