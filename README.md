# 🦠 VIRUS WhatsApp Bot (BOT 69)

<p align="center">
  <img src="https://raw.githubusercontent.com/FantoX/Atlas-MD/main/assets/banner.jpg" alt="VIRUS Bot Banner" width="650" onerror="this.style.display='none'"/>
</p>

<p align="center">
  <b>High-Speed Multi-Device WhatsApp Bot & Web Pairing Dashboard</b><br>
  <b>Identity:</b> VIRUS &nbsp;|&nbsp; <b>Owner:</b> BOT 69 &nbsp;|&nbsp; <b>Framework:</b> Baileys MD
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-web-pairing--free-hosting-on-hyehost">HYEHOST Deployment</a> •
  <a href="#-commands-list">Commands</a> •
  <a href="#-anti-ban--stealth-security">Anti-Ban Suite</a> •
  <a href="#-environment-variables">Environment Variables</a>
</p>

---

## 🌟 Overview

**VIRUS (BOT 69)** is an ultra-lightweight, high-performance WhatsApp bot engineered specifically for free cloud hosts like **HYEHOST**, Render, Koyeb, and VPS instances. It is designed to consume minimal RAM and zero unnecessary CPU while providing:

- 🎮 **Mobile Legends: Bang Bang Live Account Checker** (`.ml`)
- 🎙️ **Authentic Voice TTS & Anime Soundboards** (Sara, Gul, Asad, Loli, Goku, Gojo, Sukuna, Ben 10)
- 🛡️ **Group Moderation & Anti-Spam Auto-Kick** (Strict 5th warning & 6th kick rules for message and sticker spam)
- 🧹 **Spam Reset Control** (`.resetspam` / `.reset spam`)
- 👮‍♂️ **Formal Admin Warnings** (`.warn`) with auto-kick threshold
- 👋 **Auto-Welcome & Auto-Goodbye** with 100% accurate phone numbers (zero LID leaks, zero ghost-tagging)
- 🔒 **Stealth Anti-Delete** with separate controls (`.antidelgroup on/off` & `.antidelete on/off`)
- 👁️ **Automatic View-Once Media Delivery** directly to your private inbox without alerting anyone
- 📲 **Web Pairing Portal** allowing anyone to pair their WhatsApp in seconds

---

## 🚀 Features

### 1. 🎮 Mobile Legends Live Account Checker (`.ml`)
- Fetch official in-game nickname, server ID, player ID, and country with its **exact Unicode flag emoji** (e.g. 🇮🇩 Indonesia, 🇵🇰 Pakistan, 🇵🇭 Philippines, 🇲🇾 Malaysia).
- Multi-format input parser:
  - `.ml 1114917746 13486`
  - `.ml 1114917746(13486)`
  - `.ml 1114917746 (13486)`
  - Automatically detects reversed Server ID / Player ID order.
- Queries live Moonton gateways with sub-second response times.

### 2. 🎙️ Authentic Multilingual & Anime TTS
- **Sara (`.sara <msg>`)**: Natural human girl voice with authentic Pakistani Urdu and English pronunciation (`ur-PK-UzmaNeural`).
- **Gul (`.gul <msg>`)**: Soft, fluent Urdu voice (`ur-IN-GulNeural`).
- **Asad (`.asad <msg>`)**: Deep Pakistani Urdu male voice (`ur-PK-AsadNeural`).
- **Roman Urdu Transliterator**: Includes 320KB Roman Urdu dictionary for crystal-clear Urdu pronunciation.
- **Anya / Cute Anime Loli (`.loli <msg>`)**: High-pitched cute anime voice.
- **Iconic Anime Seiyuu**: Goku (`.goku`), Gojo (`.gojo`), Sukuna (`.sukuna`), Naruto (`.naruto`), Ben 10 (`.ben10`), and 20+ characters.

### 3. 🛡️ Group Moderation & Anti-Spam Auto-Kick
- **Message Spam Rules**:
  - **5th same message** = Formal Warning ⚠️ (`Warning 5/6: Stop repeating messages!`)
  - **6th same message** = Immediate Auto-Kick 🚫
- **Sticker Spam Rules**:
  - **5th rapid sticker** = Formal Warning ⚠️ (`Warning 5/6: Stop spamming stickers!`)
  - **6th rapid sticker** = Immediate Auto-Kick 🚫
- **Admin Immunity**: Group Admins and the Bot Owner are 100% immune from spam warnings and kicks.
- **Admin Protection**: No user or bot can kick an admin.
- **Spam Reset (`.resetspam` or `.reset spam`)**: Group Admins can instantly clear a user's spam counters and warnings.
- **Formal Warnings (`.warn @user [reason]`)**: Tracks official admin warnings (shows Admin Name, reason, count) and auto-kicks at threshold.

### 4. 👋 Auto Welcome & Auto Goodbye (No Ghost-Tags!)
- **Phone Number Guarantee**: Resolves WhatsApp anonymous LIDs (`@lid`) to clean international phone numbers (`+92300...` / `@92300...`).
- **Zero Mass Pings**: Tags **ONLY** the specific joining or leaving user. The bot **never** secretly tags `@everyone` or disturbs group members.
- **Kicker Attribution**: When someone is kicked, the goodbye card displays who kicked them.

### 5. 🔒 Separate Anti-Delete & Auto View-Once Delivery
- **Separate Controls**:
  - `.antidelgroup on` / `.antidelgroup off` - Independent toggle for group chats.
  - `.antidelete on` / `.antidelete off` - Independent toggle for private messages (DMs).
- **Stealth Delivery**: When a message is revoked/deleted in a group or DM, the bot recovers the message (text, photo, video, voice note, sticker) and delivers it directly to the **owner's private inbox** without alerting the chat.
- **Auto View-Once Capture**: Any View-Once photo, video, or voice note sent in groups or DMs is automatically intercepted and delivered unblurred to the owner's private inbox silently.
- **Manual Downloader**: Reply to any View-Once message with `.viewonce` (or `.vv`) to download it into your DM; the command automatically deletes itself from the chat.

### 6. 👥 Anyone Can Pair & Own Their Bot
- Dynamic owner recognition: Whoever pairs their phone via QR or pairing code automatically becomes the bot's authorized owner.
- All owner-only recoveries (anti-delete, view-once, dashboard controls) automatically route to the paired user's private chat.

---

## 🌐 Web Pairing & Free Hosting on HYEHOST

This bot comes with a built-in web dashboard designed for 1-click pairing on **HYEHOST**, Render, or local machines.

### Step 1: Deploy to HYEHOST
1. Upload this repository or clone `https://github.com/a4hamza/BOT69.git`.
2. Set Environment Variables:
   - `PORT`: `8080` (or leave default)
   - `PAIR_NUMBER`: Your WhatsApp number with country code (e.g. `923116469820` or optional)
3. Start the bot (`npm start`).

### Step 2: Link Your WhatsApp
1. Open the web dashboard in your browser (e.g. `http://localhost:8080` or your HYEHOST URL).
2. Enter your WhatsApp phone number with country code (e.g. `923116469820`).
3. Click **Get Code** to receive an 8-character pairing code.
4. On your phone: Open **WhatsApp** > **Settings** > **Linked Devices** > **Link a device** > **Link with phone number instead**.
5. Type the 8-character code. The bot will connect instantly!

---

## 📋 Commands List

Default prefix is `.` (also supports `,`, `!`, `#`, `/`).

### 🎮 Game Checker
| Command | Usage | Description |
| :--- | :--- | :--- |
| `.ml` | `.ml <id> <server>` | Check Mobile Legends player info, country flag, server & region |

### 🎙️ Voice & TTS
| Command | Usage | Description |
| :--- | :--- | :--- |
| `.sara` | `.sara <message>` | Speak in authentic Pakistani Urdu girl voice |
| `.gul` | `.gul <message>` | Speak in soft Urdu female voice |
| `.asad` | `.asad <message>` | Speak in deep Pakistani Urdu male voice |
| `.loli` | `.loli <message>` | Speak in cute anime girl / Anya voice |
| `.goku` | `.goku <message>` | Speak in Son Goku (Super Saiyan) voice |
| `.gojo` | `.gojo <message>` | Speak in Satoru Gojo voice |
| `.sukuna` | `.sukuna <message>` | Speak in Ryomen Sukuna voice |
| `.ben10` | `.ben10 <message>` | Classic Ben 10 hero voice |
| `.tts list` | `.tts list` | View all 20+ anime and multilingual voice styles |
| `.tts on/off` | `.tts [on/off]` | Enable or disable TTS in group (Admins only) |

### 🛡️ Group Moderation (Admins Only)
| Command | Usage | Description |
| :--- | :--- | :--- |
| `.warn` | `.warn @user [reason]` | Issue formal warning (auto-kicks at threshold) |
| `.warn reset` | `.warn reset @user` | Clear user's warning history |
| `.resetspam` | `.resetspam @user` | Reset sticker spam, message spam, and warning limits (or `.reset spam`) |
| `.kick` | `.kick @user` | Remove member from group (Admins protected) |
| `.add` | `.add <phone>` | Add a member to group |
| `.mute` | `.mute` | Close group chat (admins only can send messages) |
| `.unmute` | `.unmute` | Open group chat for all members |
| `.welcome` | `.welcome [on/off]` | Toggle auto-welcome and goodbye in group |
| `.groupinfo` | `.groupinfo` | View group status, active rules, and moderation thresholds |
| `.tagall` | `.tagall [msg]` | Broadcast announcement without background ghost-tags |
| `.hidetag` | `.hidetag <msg>` | Send admin announcement to members |

### 🔒 Anti-Delete & View-Once
| Command | Usage | Description |
| :--- | :--- | :--- |
| `.antidelgroup`| `.antidelgroup [on/off]` | Toggle group chat deleted message recovery to owner DM |
| `.antidelete` | `.antidelete [on/off]` | Toggle private chat deleted message recovery to owner DM |
| `.viewonce` | Reply with `.viewonce` | Intercept and download quoted View-Once media into your inbox |

### ℹ️ Bot Utilities
| Command | Usage | Description |
| :--- | :--- | :--- |
| `.menu` | `.menu` | View full command menu |
| `.info` | `.info` | Bot status, uptime, and host RAM usage |
| `.ping` | `.ping` | Check bot latency and response speed |
| `.bot` | `.bot [on/off]` | Toggle bot in current group (Admins only) |

---

## 🛡️ Anti-Ban & Stealth Security

1. **Human Pacing Simulation**: Every outgoing message has an intentional micro-delay (120–250ms) to emulate natural human typing.
2. **Anti-GhostTag Guard**: Hardcoded filter strips any mass mentions (`> 3` members) unless specifically initiated via an admin `.tagall` / `.hidetag`.
3. **Multi-Device Signal Retry Resolver**: Intercepts `CB:receipt` to re-encrypt dropped packets, permanently eliminating the *"Waiting for this message. This may take a while."* error.
4. **Memory Ring-Buffer**: Caps pre-cached media strictly at 30 items to guarantee zero memory leaks or out-of-memory crashes on free hosts.

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Web dashboard port | `8080` |
| `BOT_NAME` | Display name of the bot | `VIRUS` |
| `OWNER_NAME` | Display name of the owner | `BOT 69` |
| `OWNER_NUMBER`| Fallback primary owner phone number | Dynamic upon pairing |
| `PAIR_NUMBER` | Auto-pair phone number on startup | None (use web portal) |
| `APP_URL` | Self URL for 24/7 keep-alive pinging | None |

---

## 📄 License & Credits

Developed with ❤️ for **BOT 69**. Built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).
Licensed under ISC.
