# GramSutra 2.0

A farmer-first digital workspace for Indian agriculture. This is an independent implementation inspired by the publicly described feature set of GramSutra AI; it does not reuse the reference project's source code or assets.

## Included in this foundation
- Responsive farmer dashboard with a refreshed visual system
- Pragati AI text chat API (Groq, with Gemini fallback)
- Live Open-Meteo weather after explicit location permission
- Live Agmarknet mandi records when a data.gov.in key is configured
- Offline-first farm task list and local farm profile
- Official agriculture resource links and feature entry points
- Node.js API server, Render blueprint and Supabase starter schema

## Planned / not yet wired
- Crop-photo review and satellite NDVI imagery
- Full Supabase authentication and profile sync
- Marketplace listings and private inquiries
- Farmer groups, connection requests, private messaging and WebRTC calls
- Full multilingual interface and speech input
- Production moderation, audit logging and end-to-end QA

The UI labels these modules as setup-required or planned rather than displaying fabricated live data.

## Run locally
Requires Node.js 18+.

```bash
cp .env.example .env
npm start
```

Open http://localhost:3000. The dashboard and offline calendar work without provider credentials. Pragati AI and live mandi records require server-side API keys; weather uses Open-Meteo.

## Environment
See `.env.example`. Never commit real API keys or Supabase service-role credentials.

## Supabase
`supabase/schema.sql` is a starter schema for the next integration phase. Review and test all policies in a non-production Supabase project before enabling accounts or user-generated content. The current frontend does not yet connect authentication or sync to Supabase.

## Deploy
Deploy as a Node web service with `npm start`. A `render.yaml` blueprint is included. Configure secrets in the hosting dashboard, not in Git.

## Data accuracy and safety
AI responses are informational, not professional agronomic advice. Do not use AI output as a confirmed crop diagnosis or treatment prescription. Mandi and weather panels show provider results only; missing configuration is reported rather than replaced with demo values. Location is requested only after the user selects the weather feature.
