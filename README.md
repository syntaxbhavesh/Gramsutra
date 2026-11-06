# GramSutra 2.0

A farmer-first digital workspace for Indian agriculture. This repository is an independent implementation inspired by the publicly described feature set of GramSutra AI; it does not copy the reference project's source files or assets.

## Product modules
- Pragati AI assistant and crop-photo review (provider keys stay on the server)
- Live weather through Open-Meteo after user-initiated location sharing
- Live mandi records through data.gov.in when configured
- Satellite field-health imagery through Sentinel Hub when configured
- Farmer marketplace, equipment/input listings and private inquiries
- Profiles, farmer communities, connections and private messaging
- Offline-first farm calendar with optional Supabase sync
- Multilingual-ready interface, responsive mobile navigation and voice hooks

## Run locally
Requires Node.js 18+.

```bash
cp .env.example .env
npm start
```

Open http://localhost:3000. The app works in demo/offline mode without credentials; provider-backed modules clearly show when configuration is missing.

## Environment
See `.env.example`. Never commit real API keys or Supabase service-role credentials.

## Supabase
Run `supabase/schema.sql` in the Supabase SQL editor. Configure the project URL and anon key in the app's Settings panel. Enable Realtime for messages if using live chat.

## Deploy
Deploy the repository as a Node web service with `npm start`. A `render.yaml` blueprint is included. Configure secrets in the hosting dashboard, not in Git.

## Safety and data accuracy
AI crop review is informational, not a confirmed diagnosis or treatment prescription. Mandi and weather panels display source timestamps and do not invent fallback live values. Location is requested only after the user chooses a location-based feature.
