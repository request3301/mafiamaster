# Mafia Master

A compact moderator console for a ten-player sports-mafia game. The same
stateless React interface runs as a Telegram Web App, a vinext site, and a
static GitHub Pages build; it is designed around a 360×640 viewport and keeps
the current game only in browser memory.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

Refreshing or closing the page starts a new game. Use the in-app **Back**
control to undo the latest recorded action without leaving the current game.

## Game Flow

- After the final regular speech, review nominations in a compact full-screen
  table with one row per speaker in the actual speech order. In each row, choose
  **Никого** or a living candidate to assign, replace, or remove the nomination.
  A candidate can appear only once, and the non-empty rows set the voting order
  from top to bottom without manual reordering. An empty table goes directly to
  night. In the initial (zero) round, one nominee skips the voting screen and
  proceeds directly to night; two or more nominees use the normal voting flow,
  and this single-nominee shortcut does not apply in later rounds. A penalty
  removal that cancels the vote skips this review.
- A tied group receives 30-second speeches and another vote. If the leading set
  changes (for example, five players to three to two), the cycle continues
  without a limit. The lift vote appears only when the same set ties twice in a
  row, regardless of seat order.
- Every farewell speech lasts 60 seconds and has controls to add or remove
  fouls and yellow cards, or buy 30 seconds for two fouls. A fourth foul or
  second yellow ends only the current farewell; it does not create another
  removal or cancel the completed vote.
- A Don or Sheriff shot during the current night still receives their
  15-second check; a role that left during the day does not. Checks may target
  any other seat, including a previously eliminated player whose role remains
  known to the app. A check can also be skipped explicitly; the skip is written
  to the event log and night summary.
- The shared penalty panel is available during regular and tie speeches, but
  not during voting or night. Farewell penalties use the dedicated controls on
  the farewell screen.

## Runtime Shape

- `app/` owns the interface and game rules used by every deployment target.
- `github-pages/src/main.tsx` mounts that same app for the static build instead
  of maintaining a second implementation.
- `.openai/hosting.json` declares no D1 or R2 bindings. The game does not send
  or persist game state on a server.
- `vite.config.ts` retains optional local binding support for the example D1
  surface; the Mafia Master interface does not use it.

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: create the production vinext/Sites build
- `npm run build:pages`: create the static GitHub Pages build in `dist-pages/`
- `npm test`: build the app and run the game-rule and server-render checks
- `npm run lint`: run the configured ESLint checks
- `npm run db:generate`: generate Drizzle migrations after schema changes

The Pages workflow builds on pushes to `main` and can also be started manually.
Its configured project base path is `/mafiamaster/`.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
