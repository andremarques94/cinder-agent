# cinder-agent

My setup for running [OpenCode](https://opencode.ai) on Cloudflare, so I can use it from any
browser, my phone or the OpenCode desktop app.

Each sandbox is an `opencode serve` in its own [Cloudflare container](https://developers.cloudflare.com/containers/),
behind a small Worker. It's reachable at `https://<name>.<your-domain>`, and you sign in with
OpenCode's pairing links.

**Work in progress.** Nothing is persisted yet: when a sandbox stops (after 30 minutes idle by
default), its files, sessions and model logins are lost. See [PLAN.md](PLAN.md) for what's next.

## Requirements

- Cloudflare account on the Workers Paid plan (needed for Containers)
- A domain on Cloudflare
- Docker
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
4. Deploy with an admin token:

   ```bash
   echo "ADMIN_TOKEN=$(openssl rand -hex 32)" > apps/gateway/.secrets.env
   ```

   ```bash
   vp -C apps/gateway exec wrangler deploy --secrets-file .secrets.env
   ```

5. Get a sign-in link (valid 5 minutes, works once) and open it in a browser or paste it into the
   OpenCode desktop app:

   ```bash
   curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://<worker>.workers.dev/admin/sandboxes/me/pair
   ```

## Local development

```bash
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars
```

```bash
vp run dev
```

Sandboxes are at `http://me.localhost:8787`. `vp check` and `vp run -r test` run the checks and
tests; `vp install` also sets up a pre-commit hook that runs `vp check --fix` on staged files.
Code layout: [apps/gateway/README.md](apps/gateway/README.md).
