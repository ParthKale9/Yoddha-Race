# Yoddha Race — Athletes Fitness Club

Registration, volunteer station tracking, leaderboards, athlete profiles, penalties and heat booking.
Stack: Next.js 14 (App Router) + Tailwind + Supabase (Postgres, Auth).

## Setup (about 15 minutes)

1. **Create a Supabase project** at supabase.com (free tier is fine).
2. **Run the database script:** Supabase dashboard > SQL Editor > paste all of `supabase/schema.sql` > Run.
   It creates the tables, security rules, leaderboard views, and sample stations and heats.
3. **Add your keys:** copy `.env.example` to `.env.local` and fill in the Project URL and anon key
   (Supabase > Project Settings > API).
4. **Run locally:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000
5. **Create your admin account:** go to `/login`, choose "Create an account", sign up, then run this in the SQL Editor:
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL');
   ```
6. **Volunteers:** each volunteer signs up at `/login`. No station assignment is needed; they pick their athlete by bib on race day.
   Tip: in Supabase > Authentication > Providers > Email, turn off "Confirm email" so volunteers can sign in instantly.
7. **Deploy:** push to GitHub, import the repo in Vercel, and add **all three** environment variables (including
   `SUPABASE_SERVICE_ROLE_KEY`) in Vercel's project settings, then deploy. If you add it after the first deploy,
   redeploy once so the server picks it up.

## Customise before the event

| What | Where |
|---|---|
| Station distances, weights and reps | `/admin` > Stations (no code or database editing needed — admin can edit this live, any time) |
| Heats/waves (name, start time, capacity) | Supabase Table Editor > `heats` |
| Penalty reasons and default seconds | `lib/penalties.ts` |
| Waiver text, event date and venue | `app/register/page.tsx`, `app/page.tsx` |
| Colours, fonts and the logo | `tailwind.config.ts`, `public/logo.png` |

## How it works

- **Course:** 7 stations with a 700 m run between each (`lib/config.ts`). Men and women have different loads, stored per station in `spec_male` / `spec_female`.
- **One volunteer per athlete.** In a wave of 5 or 10 athletes, each volunteer enters their athlete's bib on `/volunteer`, then:
  1. presses **Start** when the whistle blows (starts the race clock);
  2. presses **Arrived** when the athlete reaches a station (starts the station timer; the app already knows the next station and shows the athlete's load);
  3. presses **Finished** when the station is done (stops the station timer);
  4. repeats for all 7 stations. Finishing station 7 stops the race clock and shows the final time.
- **Total time** = whistle to the end of the last station, plus penalties. The 700 m runs are included automatically.
- **Run splits:** the time between finishing one station and arriving at the next is shown on the athlete profile.
- **Station leaderboards** use the station timer and rank men and women separately, since the loads differ.
- **Ownership:** the volunteer who presses Start for a bib is the only one (besides admins) who can record that athlete. Volunteers can undo their last tap or remove a penalty for 10 minutes; after that only an admin can correct it.
- **Every change** to station entries and penalties is recorded in `audit_log`.
- **Public pages** read only safe views (`leaderboard`, `station_leaderboard`, `heat_availability`). Phone numbers and emails are never public.
- **Live updates:** public pages and the volunteer screen refresh every 5 seconds.
- **Phone mode:** `/volunteer` is built for phones (large buttons). Add it to the home screen for a full-screen app feel.

## Before race day

- Do a full mock run: invite a test volunteer, assign them in `/admin`, start a wave, and have them follow a test
  athlete through all 7 stations and finish.
- Test the Wi-Fi at every station and on the 700 m loop. Volunteers need a working connection to save entries.
- Make sure every athlete in a wave has a volunteer assigned before you start that wave — the "Start wave" button
  is disabled until they do, to prevent an unfollowed athlete.
- **Invite volunteers in good time, not all at once right before the race.** Supabase's built-in email sending
  has a modest rate limit on the free tier, so if you have many volunteers, send invites gradually (the day
  before works well), not all in the final few minutes.
- Export registrations and results from `/admin` as a backup.
