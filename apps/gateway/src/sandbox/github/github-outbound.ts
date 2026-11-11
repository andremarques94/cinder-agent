import { WorkerEntrypoint } from "cloudflare:workers";

import { loadConfig } from "@/lib/config";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";
import { d1UserStore } from "@/users";

import { githubApp } from "./github-app.ts";
import { installationTokens } from "./installation-tokens.ts";
import { authorizeGithubRequest } from "./outbound.ts";

export interface GithubOutboundProps {
  userId: string;
}

// https://developers.cloudflare.com/containers/configuration/outbound-traffic/
export class GithubOutbound extends WorkerEntrypoint<Env, GithubOutboundProps> {
  override async fetch(request: Request): Promise<Response> {
    try {
      const github = loadConfig(this.env).github;
      if (!github) {
        throw new GatewayError(ErrorCode.GithubUnavailable);
      }
      const app = githubApp(github);
      const tokenFor = await installationTokens(
        d1UserStore(this.env.DB),
        this.ctx.props.userId,
        (installationId) => app.installationToken(installationId),
      );
      return await fetch(await authorizeGithubRequest(request, tokenFor), { redirect: "manual" });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
