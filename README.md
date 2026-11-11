# cinder-agent

My setup for running [OpenCode](https://opencode.ai) on Cloudflare, so I can use it from any
browser, my phone or the OpenCode desktop app.

Each sandbox is an `opencode serve` in its own [Cloudflare container](https://developers.cloudflare.com/containers/),
behind a small Worker. It's reachable at `https://<name>.<your-domain>`, and you sign in with
OpenCode's pairing links.

A sandbox stops after 30 minutes idle by default. Before it stops, its files, sessions and model
logins are backed up to R2 and restored on the next start. Changes made since the last stop are
lost if the container dies unexpectedly.

**Work in progress.** See [PLAN.md](PLAN.md) for what's next.

## Requirements

- Cloudflare account on the Workers Paid plan (needed for Containers)
- A domain on Cloudflare
- Docker
- [Gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`), used by the pre-commit hook
- [Vite+](https://viteplus.dev) (`vp`)

## Deploy

1. Install dependencies and log in:

   ```bash
   vp install
   ```

   ```bash
   vp -C apps/gateway exec wrangler login
   ```

2. In [apps/gateway/wrangler.jsonc](apps/gateway/wrangler.jsonc), replace `example.com` (in
   `SANDBOX_DOMAIN` and `routes`) with your domain. `SANDBOXES` is the list of sandbox names.
3. Add a DNS record in Cloudflare: `AAAA`, name `*`, content `100::`, proxied.
4. Create the R2 bucket for backups:

   ```bash
   vp -C apps/gateway exec wrangler r2 bucket create cinder-agent-backups
   ```

5. Set up the [GitHub App](#github), which adds `GITHUB_APP_PRIVATE_KEY` to `.secrets.env`.
   Then deploy with an admin token:

   ```bash
   echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> apps/gateway/.secrets.env
   ```

   ```bash
   vp -C apps/gateway exec wrangler deploy --secrets-file .secrets.env
   ```

6. Get a sign-in link (valid 5 minutes, works once) and open it in a browser or paste it into the
   OpenCode desktop app:

   ```bash
   curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://<worker>.workers.dev/admin/sandboxes/me/pair
   ```

## GitHub

Sandboxes can clone, push and open pull requests as your own GitHub App. The sandbox only has a
placeholder token; the gateway swaps in a short-lived installation token on its way to GitHub.

1. [Create a GitHub App](https://github.com/settings/apps/new) with webhooks off and these
   repository permissions: Contents, Pull requests, Issues and Checks (read and write).
2. Install it on your repositories. The installation ID is the number at the end of the
   installation's settings URL.
3. Generate a private key and convert it to PKCS#8:

   ```bash
   openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pkcs8.pem
   ```

4. Set `GITHUB_APP_ID` and `GITHUB_INSTALLATION_ID` in `wrangler.jsonc`, and add the key to
   `.secrets.env` on one line:

   ```bash
   printf 'GITHUB_APP_PRIVATE_KEY="%s"\n' "$(awk '{printf "%s\\n", $0}' app.pkcs8.pem)" >> apps/gateway/.secrets.env
   ```

Inside the sandbox, `git` and `gh` work as usual. Commits and pull requests show up as
`<app-name>[bot]`. Restart a running sandbox (`/admin/sandboxes/me/stop`) to pick up changes.

## Local development

```bash
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars
```

```bash
vp run dev
```

Sandboxes are at `http://me.localhost:8787`. `vp run ready` runs the checks, [knip](https://knip.dev) and the
tests. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
