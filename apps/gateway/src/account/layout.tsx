import type { Child } from "hono/jsx";

const STYLE = `
:root { color-scheme: light dark; --muted: #6b6b6b; --line: #d9d9d9; --bg: #fff; --fg: #1a1a1a; --link: #0b57d0; }
@media (prefers-color-scheme: dark) { :root { --muted: #a3a3a3; --line: #3a3a3a; --bg: #161616; --fg: #ededed; --link: #8ab4f8; } }
a { color: var(--link); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
h2 { font-size: 1.1rem; margin: 2rem 0 0.5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
p, ul, dl { margin: 0.5rem 0; }
.muted { color: var(--muted); }
ul { padding-left: 1.25rem; }
li form { display: inline; margin-left: 0.5rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
button, .button { font: inherit; padding: 0.45rem 0.9rem; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-decoration: none; display: inline-block; }
li button { padding: 0.1rem 0.5rem; font-size: 0.9rem; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.75rem 0; }
.qr { background: #fff; padding: 12px; border-radius: 8px; width: min(100%, 320px); }
.qr svg { display: block; width: 100%; height: auto; }
code { overflow-wrap: anywhere; font-size: 0.9rem; }
`;

export function Layout({ title, children }: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <Layout title="cinder-agent">
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <p>
        <a href="/">Back to the dashboard</a>
      </p>
    </Layout>
  );
}
