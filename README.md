# Trade Journal Protocol

Vercel-ready trading journal for pre-market preparation, bias planning, and automatic Notion journaling.

## Why this is now a framework app

The old single HTML file was good for local-only storage, but real Notion sync needs a secure server-side token. That is why this version uses Next.js:

- the browser keeps fast local state for responsiveness
- the server route holds the Notion secret safely
- Vercel can deploy the full app without adding a separate backend

## Features

- per-instrument journals with daily history
- readiness gauge and execution score
- session profile matrix with setup classification
- daily bias, playbook focus, macro theme, and rule-of-day fields
- trade blotter with net R, win rate, and best trade stats
- automatic Notion journal creation and updates
- markdown export fallback

## Environment variables

Create `.env.local` from `.env.example`.

- `NOTION_TOKEN`: internal Notion integration token
- `NOTION_DATABASE_ID`: target Notion database ID
- `NEXT_PUBLIC_TIMEZONE`: display timezone for the PK clock

## Notion setup

1. Create a Notion internal integration at https://www.notion.so/my-integrations
2. Copy the integration token into `NOTION_TOKEN`
3. Share your Trade Journal database with that integration in Notion
4. Copy the database ID from the Notion database URL into `NOTION_DATABASE_ID`

Important:

- the Codex/ChatGPT Notion connector being connected is not enough for a deployed app
- your Vercel app needs its own Notion internal integration token
- the Trade Journal database already created in your connected workspace has database ID `d467f437705c4e3a82e0a953580258e6`

## Local development

```bash
npm install
npm run dev
```

## Vercel deployment

1. Push the project to GitHub
2. Import the repo into Vercel
3. Add the same environment variables in Vercel Project Settings
4. Deploy

## Legacy file

The original standalone prototype remains in `pre-market-protocol.html` as a local artifact reference.
