import { APP_NAME } from "@/lib/config";

export const GITHUB_URL = "https://github.com";
export const GITHUB_API_URL = "https://api.github.com";

const API_VERSION = "2022-11-28";
const MEDIA_TYPE = "application/vnd.github+json";

// https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
export function githubApiHeaders(token: string): Record<string, string> {
  return {
    accept: MEDIA_TYPE,
    authorization: `Bearer ${token}`,
    "user-agent": APP_NAME,
    "x-github-api-version": API_VERSION,
  };
}
