import { WorkerEntrypoint } from "cloudflare:workers";

import { loadConfig } from "@/lib/config";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";

import { githubApp } from "./github-app.ts";
import { authorizeGithubRequest } from "./outbound.ts";

export interface GithubOutboundProps {
  installationId: number;
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
      const authorized = await authorizeGithubRequest(request, () =>
        app.installationToken(this.ctx.props.installationId),
      );
      return await fetch(authorized, { redirect: "manual" });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
