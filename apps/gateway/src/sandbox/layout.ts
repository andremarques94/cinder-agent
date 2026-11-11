export const OPENCODE_PORT = 4096;
export const PERSIST_DIR = "/persist";

const RUN_DIR = "/run/cinder";

export function containerEnv(password: string): Record<string, string> {
  return {
    OPENCODE_PASSWORD: password,
    OPENCODE_PORT: `${OPENCODE_PORT}`,
    CINDER_RUN_DIR: RUN_DIR,
    CINDER_WORKSPACE: `${PERSIST_DIR}/workspace`,
    XDG_CONFIG_HOME: `${PERSIST_DIR}/config`,
    XDG_DATA_HOME: `${PERSIST_DIR}/data`,
    XDG_STATE_HOME: `${PERSIST_DIR}/state`,
  };
}

export const Command = {
  isReady: ["test", "-e", `${RUN_DIR}/ready`],
  markReady: ["sh", "-c", `mkdir -p ${RUN_DIR} && touch ${RUN_DIR}/ready`],
  pauseOpencode: ["sh", "-c", `kill -STOP "$(cat ${RUN_DIR}/opencode.pid)"`],
  resumeOpencode: ["sh", "-c", `kill -CONT "$(cat ${RUN_DIR}/opencode.pid)"`],
} as const;
