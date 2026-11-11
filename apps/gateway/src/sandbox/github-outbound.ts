import { WorkerEntrypoint } from "cloudflare:workers";

import { loadConfig } from "@/config";
import { ErrorCode, GatewayError, errorResponse } from "@/errors";
import { authorizeGithubRequest, githubApp } from "@/github";

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
