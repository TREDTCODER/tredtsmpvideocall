# TREDT SMP Gameplay Conference

Minecraft/blocky themed video-conference web app.

## Included

- **No intro/loading screen** — the app opens directly to login/registration or the dashboard.

- Registration/login with Minecraft username, email and password
- Instant meetings
- Scheduled meetings
- 9-letter meeting IDs in `abc-def-ghi` format
- Optional 5-digit passcodes
- Automatic join — no host approval flow
- Host status
- Host mute/kick signaling hooks
- Camera/microphone controls
- Screen sharing
- Text chat
- Admin command-block UI
- Profile/Steve UI
- Ban/delete with typed reason
- Supabase schema + RLS policies
- Netlify deployment configuration

## Important architecture note

Netlify is excellent for the frontend/functions, but it is not a WebSocket server. This project uses **Supabase Realtime** for signaling/presence/chat and browser WebRTC for media.

For larger meetings, replace the mesh WebRTC layer with an SFU such as LiveKit/mediasoup. The current implementation is intended as a small-room MVP.

## Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Authentication > Providers > Email, disable email confirmation if you want no verification.
4. Create your admin account in Supabase Auth using the admin email/password you choose.
5. In the `profiles` table, set that account's `is_admin=true`.
6. Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SITE_URL`
7. `npm install`
8. `npm run dev`

## Netlify

Connect this repository to Netlify.

Build command:
`npm run build`

Publish directory:
`dist`

Set the same VITE variables in Netlify Environment Variables.


## Custom domain

If you own `meet.tredtsmp.net`, add it to Netlify as a custom domain and set:
`VITE_SITE_URL=https://meettredtsmp.netlify.app`

If you instead use the Netlify subdomain, set the site URL to that exact address.

## Security

Do NOT hard-code the admin password or admin access key in frontend JavaScript. Frontend code is public.

The requested admin credentials/access key should be entered as private deployment credentials, then the account should be marked `is_admin=true` in Supabase. For a stronger production system, move all admin moderation into a server-side Edge Function with a server-only secret.

## Loading video

The supplied 15-second video has been adapted into `public/assets/tredt-loading.mp4`. The edited intro removes/obscures the original Mojang/Minecraft/Xbox branding and overlays only the requested TREDT wording:
- `TREDT PUBLICATIONS STUDIOS`
- `TREDT SMP GAMEPLAY CONFERENCE CALL WEB APP`

The source video remains outside the ZIP.

## Current MVP limitations

- WebRTC mesh is suitable for small rooms, not large conferences.
- TURN is not bundled; some networks will require a TURN server.
- The meeting membership database trigger enforces a hard maximum of 7 participants.
- Password reset and account recovery are not included yet.
