# Life Tracker

A 2-player life counter and round timer for the table, controlled from a tablet/phone,
with a live overlay for your stream.

## How it works

- A small server runs on your **PC** and holds the shared state (life totals, timer).
- Your **tablet/phone** connects to it over WiFi and opens the *controller* page —
  the players tap to change life and start/pause the timer themselves.
- **OBS** (on the same PC) adds the *overlay* page as a Browser Source — it updates
  live, in real time, with a transparent background so it sits on top of your camera feed.

No accounts, no cloud, no app install — everything runs over your local WiFi.

## Setup

1. Install [Node.js](https://nodejs.org) on the PC (v18 or newer) if you don't have it.
2. Unzip this project, open a terminal in the folder, and run:
   ```
   npm install
   npm start
   ```
3. The terminal will print three addresses, e.g.:
   ```
   On this PC:      http://localhost:3000
   On the tablet:   http://192.168.1.42:3000/controller.html
   OBS browser src: http://192.168.1.42:3000/overlay.html
   ```
   (You can also just open `http://localhost:3000` on the PC — it shows these
   links and lets you click straight through.)
4. **On the tablet:** connect it to the *same WiFi network* as the PC, open a browser,
   and type in the "controller" address.
5. **In OBS:** add a **Browser Source**, paste in the "overlay" address, and set the
   width/height to match your canvas (e.g. 1920×1080). Leave the background transparent —
   it's built to sit on top of your scene.

## Setting up the overlay layout

Open the **Overlay layout editor** link from the setup page (`/editor.html`) in a normal
browser tab on the PC — not inside OBS.

- **Resolution:** pick a preset (1080p, 1440p, 4K, 720p) or enter a custom size. This should
  match the size of your OBS canvas / the Browser Source you'll add.
- **Move:** click and drag a badge or the timer anywhere on the canvas.
- **Resize:** drag the small brass square at the bottom-right corner of each element — text
  scales with it automatically.
- Changes save instantly and persist even if you restart the server (stored in `layout.json`
  in the project folder).

Once you're happy with the layout, add the **overlay** address (not the editor) as your OBS
Browser Source, with its width/height set to match the resolution you chose above.

## Using the controller

- Tap **+ / −** on either side to adjust that player's life by 1. **Hold** either button
  to change it by 5 at a time, repeating while held.
- Tap a player's name to rename them (e.g. "Alex", "Sam") — updates the overlay too.
  You can also rename players from **⚙ Settings**.
- The bottom bar controls the shared round timer: **▶ Start / ⏸ Pause**, and **⟲** to reset
  it back to the configured length.
- Tap **⚙** to open settings: switch between **Countdown** (set a round length) and
  **Stopwatch** (counts up from zero), or reset both life totals back to 20.

## Setting up heroes (Flesh and Blood)

Because life totals in Flesh and Blood vary per hero (and the hero pool keeps growing with
new sets), this app doesn't ship with a built-in hero database — you enter each hero once
in **⚙ Settings → Manage heroes**, and it's remembered for every future match:

- **Hero name**
- **CC life** — life total when played as an adult hero in Classic Constructed
- **SAGE life** — life total when played as a young hero in Silver Age

Leave a life field blank if that hero doesn't exist in that format (e.g. a hero that's
Blitz/Silver-Age-only, or CC-only).

**Starting a match:** tap **⚙ Settings → 🗡 Start new match**, choose the format (**Classic
Constructed** or **Silver Age**), then each player picks their hero from the list. Confirming
sets both players' life totals automatically from the saved hero data, and shows the hero name
under each player's name on the main screen.

You can still play without heroes at all — the **Reset life totals to 20** button in Settings
works as before for a quick non-FaB game.

## Using the controller

## Notes

- State lives in the PC's memory while the server is running — if you restart the server,
  life totals reset to 20 and the timer resets. Keep the terminal window open during play.
  (Your saved heroes and overlay layout persist across restarts — those are the only two
  things written to disk, in `heroes.json` and `layout.json`.)
- Multiple tablets/phones can connect to the controller at once if needed — they all stay
  in sync since the PC is the single source of truth.
- Starting life defaults to 20 (Magic: The Gathering-style); change it in `server.js`
  (`startingLife`) if your game uses a different default.
- Port defaults to `3000`. To use another port: `PORT=4000 npm start`.
