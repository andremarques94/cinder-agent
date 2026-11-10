export function sandboxHost(name: string, sandboxDomain: string): string {
  return `${name}.${sandboxDomain}`;
}

export function isUnderDomain(hostname: string, sandboxDomain: string): boolean {
  return hostname.endsWith(`.${sandboxDomain}`);
}

export function sandboxOrigin(name: string, sandboxDomain: string, requestUrl: URL): string {
  const url = new URL(requestUrl);
  url.hostname = sandboxHost(name, sandboxDomain);
  return url.origin;
}
