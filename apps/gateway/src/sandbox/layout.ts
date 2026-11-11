import { TOKEN_PLACEHOLDER, type GitIdentity } from "@/github";

export const OPENCODE_PORT = 4096;
export const PERSIST_DIR = "/persist";

const RUN_DIR = "/run/cinder";

export function containerEnv(
  password: string,
  github: { identity: GitIdentity | null } | null,
): Record<string, string> {
  return {
    ...(github ? { GH_TOKEN: TOKEN_PLACEHOLDER, GH_PROMPT_DISABLED: "1" } : {}),
    ...(github?.identity ? gitIdentityEnv(github.identity) : {}),
    OPENCODE_PASSWORD: password,
    OPENCODE_PORT: `${OPENCODE_PORT}`,
    CINDER_RUN_DIR: RUN_DIR,
    CINDER_WORKSPACE: `${PERSIST_DIR}/workspace`,
    XDG_CONFIG_HOME: `${PERSIST_DIR}/config`,
    XDG_DATA_HOME: `${PERSIST_DIR}/data`,
    XDG_STATE_HOME: `${PERSIST_DIR}/state`,
  };
}

function gitIdentityEnv({ name, email }: GitIdentity): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}

export const Command = {
  isReady: ["test", "-e", `${RUN_DIR}/ready`],
  markReady: ["sh", "-c", `mkdir -p ${RUN_DIR} && touch ${RUN_DIR}/ready`],
  pauseOpencode: ["sh", "-c", `kill -STOP "$(cat ${RUN_DIR}/opencode.pid)"`],
  resumeOpencode: ["sh", "-c", `kill -CONT "$(cat ${RUN_DIR}/opencode.pid)"`],
} as const;
