import { WorkerEntrypoint } from "cloudflare:workers";

import { loadConfig } from "@/lib/config";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";
import { d1UserStore } from "@/users";

import { githubApp } from "./github-app.ts";
import { authorizeGithubRequest, pickInstallation } from "./outbound.ts";

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
      const users = d1UserStore(this.env.DB);
      const { userId } = this.ctx.props;
      const user = await users.byId(userId);
      if (!user || user.deletingAt !== null) {
        throw new GatewayError(ErrorCode.NotFound, { details: { reason: "user deleted" } });
      }
      const authorized = await authorizeGithubRequest(request, async (owner) => {
        const [installations, account] = await Promise.all([
          users.installations(userId),
          users.githubAccount(userId),
        ]);
        const installationId = pickInstallation(installations, owner, account?.login ?? null);
        return installationId === null ? null : app.installationToken(installationId);
      });
      return await fetch(authorized, { redirect: "manual" });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
