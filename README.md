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

## 🎮 Kingshot Account Management & Gift Codes

The bot includes a **multi-account Kingshot system** that allows each Discord user to register multiple Kingshot accounts and manage gift code redemptions.

### Features

- **Register multiple Kingshot accounts** — each with a unique Player ID, Kingdom, and optional name
- **Manage accounts** — view, edit, or delete your registered accounts
- **Automatic gift code detection** — the bot scans Discord channels for new gift codes
- **Gift code tracking** — see all discovered codes and their status
- **Redemption tracking** — record which codes have been used on which accounts

### Commands

#### User Commands (open to everyone)

- **`/register`** — register a new Kingshot account
  - `player_id`: Your Kingshot Player ID (numbers only)
  - `kingdom`: Your Kingdom number
  - `name`: Optional account nickname (e.g., "Main" or "Farm 1")
  - Example: `/register player_id:123456789 kingdom:1234 name:Main`

- **`/accounts`** — list all your registered Kingshot accounts

- **`/edit-account`** — edit an existing account (name, Player ID, or Kingdom)
  - `account_id`: The ID of the account to edit (shown in `/accounts`)

- **`/remove-account`** — delete a registered account
  - `account_id`: The ID of the account to remove

- **`/giftcodes`** — view all discovered gift codes and their status

- **`/redeem`** — redeem a gift code on your accounts
  - `code`: The gift code to redeem
  - Select which accounts to redeem on from the menu

#### Admin Commands

- **`/giftcode-status`** — view scanner statistics (requires **Manage Server** permission)
  - Shows: last scan time, total codes found, new codes, active codes, errors

### Configuration

The scanner is enabled by default and runs every **15 minutes** (configurable).
Discovered codes are stored in `data/giftcodes.json`.

### Limitations & Important Notes

- **Automatic redemption** has limitations due to security on the Kingshot redemption site. If a CAPTCHA is encountered, you may need to manually redeem through the official site: https://ks-giftcode.centurygame.com
- **Player ID validation**: Player IDs must be numeric only, without special characters
- **Account limits**: Each Discord user can register up to 20 Kingshot accounts
- **Passwords are never stored**: The system only stores Player ID and Kingdom; it never asks for or stores your Kingshot password
- **One Player ID per user**: Each Kingshot Player ID can only be registered to one Discord account. Attempting to register an already-used Player ID will be rejected
- **Data persistence**: All accounts and codes are stored in JSON files in the `data/` folder, which survives bot restarts

### Data Storage

Player accounts are stored in `data/players.json`:
```json
{
  "DISCORD_USER_ID": {
    "accounts": [
      {
        "id": "uuid",
        "name": "Main",
        "playerId": "123456789",
        "kingdom": "1234",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

Gift codes are stored in `data/giftcodes.json`:
```json
{
  "CODE123": {
    "code": "CODE123",
    "firstSeenAt": "...",
    "lastSeenAt": "...",
    "source": "discord",
    "status": "new",
    "redeemResults": {
      "PLAYER_ID_KINGDOM": {
        "status": "success",
        "timestamp": "..."
      }
    }
  }
}
```

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
- **Can't register account:** Your Player ID might already be registered to another Discord account, or you've reached the 20-account limit.

