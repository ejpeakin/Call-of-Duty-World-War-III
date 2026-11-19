# Turning on accounts, friends and party invites

FortDay's accounts run on **Supabase** (free). Players sign up with an email and password and pick a unique player name.
Friend requests and party invites show up **in the game**: straight away if the friend is online, or waiting in their Friends card next time they play.
Emails (sign-up confirmation, "forgot password", and emailed requests and invites) are optional and switched off for now; see [Adding emails later](#adding-emails-later).

Until step 4, the game works exactly as before and the Friends card stays hidden.
Supabase moves its menus around now and then, so a button may have a slightly different name.

**Never paste these anywhere public, including a chat:** the Supabase database password and the Supabase `service_role` / secret key.
The Project URL and the `anon` / publishable key in step 4 are meant to be public, so those are fine to share.

---

## 1. Make the Supabase project

1. Go to https://supabase.com, sign up, and press **New project**.
2. Name it `FortDay`, make up a database password (save it somewhere safe), and pick the region closest to your players.
3. Wait a couple of minutes while it sets up.

## 2. Set up the database

1. In the project, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](schema.sql) from this repo, copy all of it, paste it in, and press **Run**.
3. It should say *Success. No rows returned*. Running it again later is safe.

## 3. Turn off email confirmation

Until emails are set up, Supabase can't send confirmation emails to players, so new players couldn't finish signing up.

1. Open **Authentication** → **Sign In / Providers** (sometimes just **Providers**) → **Email**.
2. Turn off **Confirm email** and press **Save**.

## 4. Switch it on in the game

1. In Supabase, open **Project Settings** → **Data API** (or **API Keys**) and copy:
   - the **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - the **anon / publishable** key (*not* the service_role / secret key)
2. Put them at the top of `src/89_social.js`:
   ```js
   url: 'https://abcdefgh.supabase.co',
   key: 'eyJ…',
   ```
3. Run `bash build.sh` and push to `main`.

Or send those two values to Claude and ask it to switch accounts on.

## 5. Try it

1. Open the game. The **Friends** card is on the left of the Play screen. Press **Create account**, then sign in.
2. Make a second account in another browser (or a private window) and sign in there too.
3. Search for the first account's player name and press **Add**. The first account should get a pop-up straight away.
4. Accept it, then press **Invite** next to your friend. They get a pop-up with **Join**, which puts them in your room.

---

## Adding emails later

With emails on, players confirm their email when they sign up, can reset a forgotten password, and also get friend requests and party invites by email (an emailed invite has a link that joins the room). Players can turn the request and invite emails off.

Every email needs an address to come from. These steps use a Gmail account made for the game.

### a. Make a Gmail for FortDay and an app password

1. Make a new Google account just for the game, like `fortday.invites@gmail.com`.
2. In that account, turn on **2-Step Verification** (Google Account → Security).
3. Go to https://myaccount.google.com/apppasswords, make an app password named `FortDay`, and copy the 16 letters it shows you. You'll paste it into Supabase twice below.

Gmail lets this account send about 500 emails a day. You can use an email account you already have instead, but then every player who gets an email sees that address.

### b. Send sign-up emails through that Gmail

Supabase's built-in email only reaches your own team's addresses, so players would never get their confirmation emails without this.

1. Open **Authentication** → **Emails** → **SMTP Settings** and turn on **custom SMTP**.
2. Fill it in:
   - Sender email: your FortDay Gmail address
   - Sender name: `FortDay`
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: your FortDay Gmail address
   - Password: the 16-letter app password
3. Save. Then in **Authentication** → **Rate Limits**, raise *emails sent per hour* to something like `30`.

### c. Tell Supabase where the game lives

In **Authentication** → **URL Configuration**:

- **Site URL:** `https://ejpeakin.github.io/FortDay/`
- **Redirect URLs:** add `https://ejpeakin.github.io/FortDay/**` and `http://localhost:3000/**`

The links in confirmation and password-reset emails send players back here.

### d. Add the email function

This is what emails friend requests and party invites. It's the only thing that can see players' email addresses.

1. Open **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `notify`.
3. Replace the example code with everything in [`supabase/functions/notify/index.ts`](functions/notify/index.ts), and press **Deploy**. Leave **Verify JWT** on.
4. Open **Edge Functions** → **Secrets** and add two:
   - `GMAIL_USER` = your FortDay Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-letter app password

(If you use the Supabase command line instead: `supabase functions deploy notify`, then `supabase secrets set GMAIL_USER=… GMAIL_APP_PASSWORD=…`.)

### e. Switch emails on

1. Turn **Confirm email** back on (the setting from step 3).
2. In `src/89_social.js`, change `emails: false` to `emails: true`, run `bash build.sh`, and push. Or ask Claude to do it.

---

## If something doesn't work

| What happens | What to check |
|---|---|
| A new player can't sign in after making an account ("Confirm your email first") | **Confirm email** is still on: step 3. |
| A player forgot their password | Until emails are on, set a new one for them in **SQL Editor**: `update auth.users set encrypted_password = extensions.crypt('their-new-password', extensions.gen_salt('bf')) where email = 'their@email.com';` |
| No confirmation email (with emails on) | Step b settings, the spam folder, and **Authentication → Logs** in Supabase. |
| Friend request or invite email doesn't arrive (with emails on) | **Edge Functions → notify → Logs**. Check both secrets from step d are there and spelled exactly right. The pop-up in the game still works without the email. |
| "Could not reach the account service" | Check the Project URL in `src/89_social.js`. A free Supabase project pauses after a week with nobody using it; open the dashboard and press **Restore**. |
| Confirmation link opens the wrong page | Step c. |

## How it fits together

- **`supabase/schema.sql`**: the tables (player names, friend requests, party invites) and the rules for who can see and change what. Players only ever see player names. Every change goes through functions that check who is asking.
- **`supabase/functions/notify/index.ts`** (only used once emails are on): sends an email when someone gets a friend request or party invite. It sends at most one email per request, at most 20 an hour from any one player, and none to players who turned emails off.
- **`src/89_social.js`**: the Friends card, the pop-ups, and the live updates. If a friend is online they hear about a request or invite instantly. A party invite carries your room code, and **Join** joins that room. `SOCIAL.emails` switches the email parts on and off.

Without email confirmation, someone could sign up with an email address that isn't theirs. Nothing is ever sent to it, but that address can't be used for another account. Turning emails on (with **Confirm email**) stops this.
