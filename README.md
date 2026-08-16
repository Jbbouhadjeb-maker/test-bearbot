# 🐻 BearTrapBot

A Discord reminder bot. Schedule **daily**, **interval**, **weekly**, or
**one-time** reminders through an interactive `/config` panel, and the bot pings
your members in a chosen channel before each event.

- `/config` — open the configuration panel (set channel, role, timezone, start
  date, and add/edit/remove events). Requires the **Manage Server** permission.
- `/today` — list the reminders firing today and tomorrow (UTC). Open to everyone.

---

## ✅ Prerequisites

- **Node.js 24** (pinned in `.nvmrc`). With [nvm](https://github.com/nvm-sh/nvm)
  just run `nvm use` in the project folder.
- A Discord account and a server where you have the **Manage Server** permission.

---

## 📦 Install

```bash
git clone <repo-url>
cd BearTrapBot-Fork
nvm use            # selects Node 24 from .nvmrc
npm install
```

---

## 🤖 Create the bot & get a token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   → **New Application** and give it a name.
2. Left sidebar → **Bot** → **Add Bot**, then **Reset Token** → **Copy** the token.
   ⚠️ Treat this token like a password — never commit or share it.
3. Still on the **Bot** page, under **Privileged Gateway Intents**, leave **all
   three OFF** (Presence, Server Members, Message Content). This bot only uses the
   default `Guilds` intent.

---

## 🔑 Configure `.env`

The bot reads its token from the `DC_TOKEN` environment variable in a `.env`
file in the project root (`.env` is gitignored, so it stays out of the repo).

Create/edit `.env`:

```
DC_TOKEN=your-bot-token-here
```

> A `.env.example` is provided as a template — copy it to `.env` and replace the
> placeholder with your real token.

---

## 🔗 Invite the bot to your server (OAuth2 URL Generator)

In the Developer Portal: left sidebar → **OAuth2** → **URL Generator**.

**Scopes** — tick exactly these two:

- ✅ `bot`
- ✅ `applications.commands`  *(required for the `/config` and `/today` slash commands)*

**Bot Permissions** — tick these:

- ✅ View Channels
- ✅ Send Messages
- ✅ Embed Links  *(the config panel and reminders use embeds)*
- ✅ Mention Everyone  *(reminders ping `@everyone` or a role)*

Leave everything else unchecked — do **not** grant Administrator.

Copy the **Generated URL** at the bottom, open it in your browser, select your
server, and click **Authorize**.

---

## ▶️ Run the bot

```bash
npm start          # node index.js
# or, auto-restart on file changes:
npm run dev        # node --watch index.js
```

On success you should see logs like:

```
✅ Logged in as YourBot#0000
🔧 Registered global /config command
```

> First-time note: global slash commands can take up to ~1 hour to appear. If
> `/config` doesn't show right away, wait a bit or re-invite the bot.

---

## 🧪 Test it on your server

1. Confirm the bot shows **online** in the member list.
2. Run **`/config`** (you need the **Manage Server** permission). The
   configuration panel appears.
3. In the panel:
   - **📢 Channel** — pick the announcement channel for reminders.
   - **🏷️ Role** *(optional)* — choose who gets pinged (defaults to `@everyone`).
   - **📅 Start Date** *(only for interval events)* — set the cycle anchor.
4. Click **➕ Add Event** — try a **Daily** event a couple of minutes from now
   with lead `0 min`, then save.
5. Run **`/today`** to confirm the upcoming reminder is listed.
6. Wait for the scheduled time — the bot should post the reminder in your chosen
   channel. The terminal will log `📤 ... sending to #channel`.

---

## 🛠️ Troubleshooting

- **Bot stays offline / "Login failed":** wrong or empty `DC_TOKEN` in `.env`.
- **Slash commands don't appear:** the `applications.commands` scope wasn't
  selected when inviting, or global commands are still propagating — wait, or
  re-invite with the corrected URL.
- **Bot can't post reminders:** the bot's role lacks **View Channel**,
  **Send Messages**, **Embed Links**, or **Mention Everyone** in that channel —
  adjust the channel/role permissions.
- **Missing modules:** run `npm install` again.
- **"❌ You need the Manage Server permission":** `/config` is restricted to
  members with **Manage Server**; ask a server admin to grant it.
