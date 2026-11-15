# BloxyBet (React + TypeScript + Supabase)

## 1. Supabase setup

1. Create a project at supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql` and run it. This creates the `profiles` table, row-level security and the public `leaderboard` view.
3. Go to **Authentication → Providers → Email** and turn **off** "Confirm email". Logins use a username that is mapped to a placeholder email, so no real confirmation email can be sent.
4. Go to **Project Settings → API** and copy the Project URL and the `anon` public key.

## 2. Run it

```bash
cp .env.example .env     # then paste your URL and anon key
npm install
npm run dev
```

## 3. Images and videos

Copy all of your existing image and video files into `public/`, using the same names:

- Items: `CIcecream.png`, `CSands.png`, `CSR.png`, ... (see `src/items.ts`)
- Coins: `heads.webp`, `tails.webp`
- Flip videos: `XRecorder_20251107_052.mp4`, `XRecorder_20251107_062.mp4`

## Structure

```
src/
  App.tsx                 game flow (join, battle, deposit)
  supabase.ts             Supabase client
  items.ts / types.ts     data + types
  hooks/                  useAuth, useUserData, useBotMatches
  components/             Navbar, MatchList, modals, Leaderboard, AuthScreen
  styles.css              design tokens + all styles
supabase/schema.sql       database schema + policies
```

## Notes

- Existing Firebase accounts and data are not migrated; players start fresh in Supabase.
- Game results are computed in the browser and saved by the client, so a technical user could edit their own profit or inventory. For a real-money or competitive game, move flips and inventory changes into a Supabase Edge Function or database function.
