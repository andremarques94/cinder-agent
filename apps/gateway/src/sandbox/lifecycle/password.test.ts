import { expect, test } from "vite-plus/test";

import { loadOrCreatePassword, type PasswordStore } from "./password.ts";

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

test("creates a password once, then keeps returning the same one", async () => {
  const { store } = memoryStore();
  const first = await loadOrCreatePassword(store);
  expect(first).not.toBe("");
  expect(await loadOrCreatePassword(store)).toBe(first);
});

test("keeps an existing password in an older format, so devices stay signed in", async () => {
  const { store } = memoryStore({ "opencode-password": "older-base64url-password" });
  expect(await loadOrCreatePassword(store)).toBe("older-base64url-password");
});

test("replaces an empty or non-string value, because an empty password disables auth", async () => {
  for (const broken of ["", 42, null]) {
    const { store, values } = memoryStore({ "opencode-password": broken });
    const password = await loadOrCreatePassword(store);
    expect(password).not.toBe("");
    expect(values.get("opencode-password")).toBe(password);
  }
});
