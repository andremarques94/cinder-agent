import { describe, expect, test } from "vite-plus/test";

import { loadOrCreatePassword, type PasswordStore } from "./password.ts";

const KEY = "opencode-password";

function memoryStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const store: PasswordStore = {
    get: async (key) => values.get(key),
    put: async (key, value) => {
      values.set(key, value);
    },
  };
  return { store, values };
}

describe("given an empty store", () => {
  test("when the password is loaded twice, then it is created once and kept", async () => {
    const { store } = memoryStore();

    const first = await loadOrCreatePassword(store);
    const second = await loadOrCreatePassword(store);

    expect(first).not.toBe("");
    expect(second).toBe(first);
  });
});

describe("given a password saved in an older format", () => {
  test("when it is loaded, then it is kept so devices stay signed in", async () => {
    const { store } = memoryStore({ [KEY]: "older-base64url-password" });

    const password = await loadOrCreatePassword(store);

    expect(password).toBe("older-base64url-password");
  });
});

describe("given an empty or non-string password", () => {
  test.each(["", 42, null])(
    "when %j is loaded, then it is replaced, because an empty password disables auth",
    async (broken) => {
      const { store, values } = memoryStore({ [KEY]: broken });

      const password = await loadOrCreatePassword(store);

      expect(password).not.toBe("");
      expect(values.get(KEY)).toBe(password);
    },
  );
});
