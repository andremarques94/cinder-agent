import { raw } from "hono/html";
import type { Child } from "hono/jsx";

import { APP_NAME } from "@/lib/config";

import { FONT_PATH } from "./fonts/font-routes.ts";

const STYLE = `
@font-face {
  font-family: "Inter Variable";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(${FONT_PATH}) format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
:root {
  color-scheme: light dark;
  --level-0: #f4f4f5;
  --level-1: #ffffff;
  --level-2: #f7f7f8;
  --level-3: #ededef;
  --text-1: #18191b;
  --text-2: #3c3f44;
  --text-3: #6b6f76;
  --border: rgb(0 0 0 / 0.08);
  --border-strong: rgb(0 0 0 / 0.14);
  --success: #1f8a5b;
  --danger: #c4361f;
  --font: "Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --level-0: #08090a;
    --level-1: #0f1011;
    --level-2: #141516;
    --level-3: #1c1d1f;
    --text-1: #f7f8f8;
    --text-2: #d0d6e0;
    --text-3: #8a8f98;
    --border: #23252a;
    --border-strong: #34343a;
    --success: #27a644;
    --danger: #f2765f;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--level-0);
  color: var(--text-1);
  font: 13px/1.5 var(--font);
  font-optical-sizing: auto;
  font-feature-settings: "cv01", "ss03";
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
h1, h2, p, ul, ol, dl, dd { margin: 0; }
ul, ol { padding: 0; list-style: none; }
:focus-visible { outline: 2px solid var(--text-3); outline-offset: 1px; border-radius: 6px; }
svg.icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

.app { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; padding: 12px 10px; gap: 16px; }
.workspace { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-weight: 590; }
.mark { width: 20px; height: 20px; border-radius: 5px; background: var(--text-1); color: var(--level-1); display: grid; place-items: center; font-size: 11px; font-weight: 680; }
.nav { display: grid; gap: 1px; }
.nav a { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 8px; border-radius: 6px; color: var(--text-2); font-weight: 510; }
.nav a:hover { background: var(--level-3); color: var(--text-1); }
.nav a[aria-current="page"] { background: var(--level-3); color: var(--text-1); }
.nav a .icon { color: var(--text-3); }
.account { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 6px 8px; color: var(--text-3); min-width: 0; }
.account span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.avatar { width: 20px; height: 20px; border-radius: 50%; flex: none; background: var(--level-3); object-fit: cover; display: grid; place-items: center; font-size: 11px; font-weight: 590; color: var(--text-2); text-transform: uppercase; }
.row .avatar { width: 24px; height: 24px; }

.panel { margin: 8px 8px 8px 0; background: var(--level-1); border: 1px solid var(--border); border-radius: 8px; min-width: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 48px; padding: 0 20px; border-bottom: 1px solid var(--border); }
.panel-head h1 { font-size: 13px; font-weight: 510; }
.panel-body { max-width: 760px; padding: 28px 20px 48px; }
.title { font-size: 28px; font-weight: 600; letter-spacing: -0.6px; line-height: 1.2; }
.lede { color: var(--text-3); margin-top: 4px; font-size: 14px; }

.group { margin-top: 32px; }
.group-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-bottom: 8px; }
.group-head h2 { font-size: 13px; font-weight: 510; color: var(--text-3); }
.rows { border: 1px solid var(--border); border-radius: 12px; background: var(--level-1); overflow: hidden; }
.row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 8px 12px; }
.row + .row { border-top: 1px solid var(--border); }
.row .grow { flex: 1; min-width: 0; }
.row strong { display: block; font-weight: 510; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; }
.row .sub { color: var(--text-3); }
.grow .sub { display: block; }
.group-note { margin-top: 8px; }
.instructions { display: grid; gap: 16px; }
.empty { padding: 14px 12px; color: var(--text-3); }

.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 12px; background: var(--level-1); margin-top: 24px; }
.stat { padding: 16px; min-width: 0; }
.stat + .stat { border-left: 1px solid var(--border); }
.stat dt { color: var(--text-3); font-weight: 510; }
.stat dd { margin-top: 6px; font-size: 20px; font-weight: 510; letter-spacing: -0.02em; color: var(--text-1); overflow-wrap: anywhere; }
.stat dd small { font-size: 13px; font-weight: 400; letter-spacing: -0.01em; color: var(--text-3); margin-left: 6px; }
.stat dd.ok { color: var(--success); }

.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
form { margin: 0; }
.button {
  font: inherit; font-weight: 510; height: 28px; padding: 0 12px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 6px; border: 1px solid var(--border-strong); background: var(--level-2); color: var(--text-1);
  cursor: pointer; white-space: nowrap;
}
.button:hover { background: var(--level-3); }
.button.primary { background: var(--text-1); border-color: var(--text-1); color: var(--level-1); }
.button.primary:hover { opacity: 0.88; }
.button.quiet { background: transparent; border-color: transparent; color: var(--text-3); }
.button.quiet:hover { background: var(--level-3); color: var(--danger); }

.pair { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 24px; }
.qr { background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border); width: 220px; }
.qr svg { display: block; width: 100%; height: auto; }
.steps { display: grid; gap: 12px; counter-reset: step; }
.steps li { display: flex; gap: 10px; color: var(--text-2); }
.steps li::before { counter-increment: step; content: counter(step); flex: none; width: 20px; height: 20px; border-radius: 5px; background: var(--level-3); color: var(--text-3); font-size: 12px; font-weight: 510; display: grid; place-items: center; }
.copy { display: flex; gap: 8px; }
.field { flex: 1; min-width: 0; height: 28px; padding: 0 8px; font: inherit; color: var(--text-2); background: var(--level-2); border: 1px solid var(--border-strong); border-radius: 6px; }
.hint { color: var(--text-3); }

.mobile-head { display: none; }

@media (max-width: 760px) {
  body { font-size: 15px; background: var(--level-1); }
  .app { display: block; }
  .sidebar { display: none; }
  .mobile-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 52px; padding: 0 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--level-1); z-index: 1; }
  .mobile-head .workspace { padding: 0; }
  .panel { margin: 0; border: 0; border-radius: 0; }
  .panel-head { display: none; }
  .panel-body { padding: 20px 16px 40px; }
  .title { font-size: 22px; }
  .stats { grid-template-columns: 1fr; }
  .stat + .stat { border-left: 0; border-top: 1px solid var(--border); }
  .stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 14px; }
  .stat dd { margin: 0; font-size: 17px; text-align: right; }
  .row { min-height: 52px; }
  .group-head .actions { width: 100%; }
  .group-head .actions .button { flex: 1; }
  .button { height: 40px; padding: 0 14px; }
  .button.quiet { height: 36px; }
  .field { height: 40px; }
  .pair { grid-template-columns: 1fr; }
  .pair .instructions { order: -1; }
  .qr { width: 180px; }
}
`;

const ICONS = {
  overview: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z",
  devices: "M5 1.5h6a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM7 12h2",
  github:
    "M5 3.5a1.5 1.5 0 1 0 0 .01M5 5v6M5 12.5a1.5 1.5 0 1 0 0 .01M11 5.5a1.5 1.5 0 1 0 0 .01M11 7c0 2.5-6 1.5-6 4",
} as const;

type Page = keyof typeof ICONS;

const NAV: { page: Page; label: string; href: string }[] = [
  { page: "overview", label: "Overview", href: "/" },
  { page: "devices", label: "Devices", href: "/#devices" },
  { page: "github", label: "GitHub", href: "/#github" },
];

interface Viewer {
  email: string;
  avatar: string | null;
}

interface LayoutProps {
  title: string;
  viewer: Viewer | null;
  page?: Page;
  showGithub?: boolean;
  actions?: Child;
  children: Child;
}

export function Layout({ title, viewer, page, showGithub = true, actions, children }: LayoutProps) {
  const nav = NAV.filter((item) => showGithub || item.page !== "github");
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <link
            rel="preload"
            href={FONT_PATH}
            as="font"
            type="font/woff2"
            crossorigin="anonymous"
          />
          <title>{title === APP_NAME ? APP_NAME : `${title} – ${APP_NAME}`}</title>
          <style dangerouslySetInnerHTML={{ __html: STYLE }} />
        </head>
        <body>
          <header class="mobile-head">
            <Workspace />
            {viewer ? <ViewerAvatar viewer={viewer} /> : null}
          </header>
          <div class="app">
            <aside class="sidebar">
              <Workspace />
              {viewer ? (
                <nav class="nav">
                  {nav.map((item) => (
                    <a href={item.href} aria-current={item.page === page ? "page" : undefined}>
                      <Icon name={item.page} />
                      {item.label}
                    </a>
                  ))}
                </nav>
              ) : null}
              {viewer ? (
                <div class="account">
                  <ViewerAvatar viewer={viewer} />
                  <span>{viewer.email}</span>
                </div>
              ) : null}
            </aside>
            <main class="panel">
              <div class="panel-head">
                <h1>{title === APP_NAME ? "Overview" : title}</h1>
                {actions ? <div class="actions">{actions}</div> : null}
              </div>
              <div class="panel-body">{children}</div>
            </main>
          </div>
        </body>
      </html>
    </>
  );
}

function Workspace() {
  return (
    <a class="workspace" href="/">
      <span class="mark">c</span>
      {APP_NAME}
    </a>
  );
}

function ViewerAvatar({ viewer }: { viewer: Viewer }) {
  if (viewer.avatar) {
    return <img class="avatar" src={viewer.avatar} alt="" />;
  }
  return <span class="avatar">{viewer.email.charAt(0)}</span>;
}

function Icon({ name }: { name: Page }) {
  return (
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function githubAvatar(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`;
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <Layout title="Something went wrong" viewer={null}>
      <h2 class="title">Something went wrong</h2>
      <p class="lede">{message}</p>
      <div class="actions group">
        <a class="button primary" href="/">
          Back to overview
        </a>
      </div>
    </Layout>
  );
}
