import * as v from "valibot";

const PASSWORD_KEY = "opencode-password";

const StoredPassword = v.pipe(v.string(), v.nonEmpty());

export interface PasswordStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export async function loadOrCreatePassword(storage: PasswordStore): Promise<string> {
  const existing = await storage.get(PASSWORD_KEY);
  if (v.is(StoredPassword, existing)) {
    return existing;
  }
  const password = crypto.randomUUID();
  await storage.put(PASSWORD_KEY, password);
  return password;
}
