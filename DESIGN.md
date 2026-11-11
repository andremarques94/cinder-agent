---
version: alpha
name: cinder-agent
description: "A quiet, dense control panel for a personal coding sandbox. Near-black (or near-white) surfaces stacked in four levels, hairline borders instead of shadows, Inter with optical sizing, and no chromatic accent: the one filled button is ink on canvas. Green appears only to say the sandbox is running. Built to be used mostly on a phone."

colors:
  level-0: "#08090a"
  level-1: "#0f1011"
  level-2: "#141516"
  level-3: "#1c1d1f"
  text-1: "#f7f8f8"
  text-2: "#d0d6e0"
  text-3: "#8a8f98"
  border: "#23252a"
  border-strong: "#34343a"
  success: "#27a644"
  danger: "#f2765f"
  qr-plate: "#ffffff"

colors-light:
  level-0: "#f4f4f5"
  level-1: "#ffffff"
  level-2: "#f7f7f8"
  level-3: "#ededef"
  text-1: "#18191b"
  text-2: "#3c3f44"
  text-3: "#6b6f76"
  border: "rgb(0 0 0 / 0.08)"
  border-strong: "rgb(0 0 0 / 0.14)"
  success: "#1f8a5b"
  danger: "#c4361f"
  qr-plate: "#ffffff"

typography:
  family: "Inter Variable"
  fallback: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
  features: '"cv01", "ss03"'
  opticalSizing: auto
  title:
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.6px
  title-mobile:
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.6px
  stat:
    fontSize: 20px
    fontWeight: 510
    letterSpacing: -0.02em
  lede:
    fontSize: 14px
    fontWeight: 400
  body:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  body-mobile:
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: 13px
    fontWeight: 510
  small:
    fontSize: 12px
    fontWeight: 510

rounded:
  mark: 5px
  control: 6px
  panel: 8px
  card: 12px
  avatar: 50%

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

layout:
  sidebar: 232px
  content-max: 760px
  panel-inset: 8px
  panel-head: 48px
  mobile-breakpoint: 760px
  mobile-head: 52px
  gutter-mobile: 16px

components:
  sidebar:
    backgroundColor: "{colors.level-0}"
    padding: 12px 10px
  nav-item:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    height: 30px
    rounded: "{rounded.control}"
    selectedBackground: "{colors.level-3}"
  panel:
    backgroundColor: "{colors.level-1}"
    border: "1px {colors.border}"
    rounded: "{rounded.panel}"
  stats:
    backgroundColor: "{colors.level-1}"
    border: "1px {colors.border}"
    rounded: "{rounded.card}"
    padding: 16px
  rows:
    backgroundColor: "{colors.level-1}"
    border: "1px {colors.border}"
    rounded: "{rounded.card}"
    rowHeight: 40px
    rowHeightMobile: 52px
    padding: 8px 12px
  button:
    backgroundColor: "{colors.level-2}"
    border: "1px {colors.border-strong}"
    textColor: "{colors.text-1}"
    typography: "{typography.label}"
    height: 28px
    heightMobile: 40px
    rounded: "{rounded.control}"
  button-primary:
    backgroundColor: "{colors.text-1}"
    textColor: "{colors.level-1}"
  button-quiet:
    backgroundColor: transparent
    textColor: "{colors.text-3}"
    hoverTextColor: "{colors.danger}"
  field:
    backgroundColor: "{colors.level-2}"
    border: "1px {colors.border-strong}"
    height: 28px
    heightMobile: 40px
    rounded: "{rounded.control}"
  qr:
    backgroundColor: "{colors.qr-plate}"
    rounded: "{rounded.panel}"
    width: 220px
    widthMobile: 180px
---

## Overview

The dashboard on `app.<domain>` is a small control panel: see whether your sandbox is awake,
pair a device, link GitHub. Everything else happens in the OpenCode apps, so the dashboard stays
quiet and fast and gets out of the way.

The look follows the discipline of [Linear](https://linear.app)'s product UI, not its brand:
stepped near-black surfaces, hairline borders instead of shadows, dense rows, Inter with optical
sizing, and very little colour. None of Linear's logo, lavender accent or proprietary typefaces
are used.

## Principles

- **No accent colour.** The single filled button per screen is ink on the canvas
  (`button-primary`). Green (`success`) only ever means "running"; red (`danger`) only appears on
  hover of a destructive action. Don't add a third colour.
- **Hierarchy from surfaces and hairlines, never shadows or glows.** Canvas (`level-0`), then
  panels and cards (`level-1`), then controls (`level-2`), then hover and selection (`level-3`).
- **Dense, then roomy on touch.** 13px text and 28–40px rows on a pointer; 15px text, 40px
  buttons and 52px rows below 760px.
- **One primary action per screen.** On a laptop it sits in the panel header; on a phone the
  header is hidden, so the same action also appears inline as a normal button.
- **Words are UI.** Sentence case, plain verbs, the button says what happens ("Pair a device",
  "Copy link", "Unlink"). Empty states say what to do next. No all-caps labels, no eyebrows, no
  arrows or middle-dot meta strings.
- **No decorative motion.** Only state changes the user caused (a button saying "Copied").

## Type

Inter Variable is bundled with the gateway (`@fontsource-variable/inter`, latin subset with the
optical size axis, SIL Open Font License) and served from `/fonts/inter.woff2`, so pages make no
third-party font requests. `font-optical-sizing: auto` gives headings the tighter display cut and
small text the text cut. Features `cv01` and `ss03` are on everywhere. Numbers that change in
place (stats, countdowns) are plain text in the same face.

## Layout

- **Laptop:** a 232px sidebar on `level-0` (workspace mark, nav, account at the bottom) beside an
  inset panel (`level-1`, 8px from the window edge, 8px radius, hairline border). The panel has a
  48px header with the page title and the primary action, then a body at most 760px wide, left
  aligned.
- **Phone (≤ 760px):** the sidebar becomes a 52px sticky top bar with the mark and the viewer's
  avatar; the panel goes full bleed with 16px gutters; stats stack into label–value rows; group
  actions stretch to full width.

## Components

- **Stats** — a 12px-radius card split into equal cells by hairlines: a muted label and a 20px
  value with an optional muted detail (`Asleep` + "wakes on connect").
- **Rows** — a 12px-radius card of rows split by hairlines. A row is an optional 24px round
  avatar, a title with a muted line under it, and one quiet action on the right. Use for devices,
  GitHub installations and results.
- **Group** — a muted 13px heading with optional actions on the right, then stats or rows.
- **Buttons** — 6px radius, 28px high (40px on touch). Default is `level-2` with a strong
  hairline; `primary` is inverted ink; `quiet` has no border and turns `danger` on hover when it
  removes something.
- **Pair** — the QR code always sits on a white plate so it scans in dark mode. Beside it (above
  it on a phone): numbered steps, the link in a read-only field and **Copy link**, then a
  countdown.

## Adding a screen

Reuse the shell (`Layout` in `apps/gateway/src/account/layout.tsx`), add a nav item and an icon
(16px, 1.5px stroke, round caps), and build the body from groups of stats and rows. Charts, when
there's data over time, go inside a 12px-radius `level-1` card with hairline axes and at most two
series in `text-3` and `text-1`; keep `success` for state, not data.

## Known gaps

- No form validation or error styles beyond the error page; add them to this file when a form
  needs them.
- No tables wider than a row list, no tabs, no menus yet.
