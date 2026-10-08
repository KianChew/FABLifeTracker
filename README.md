# Life Tracker

A 2-player life counter and round timer for the table, controlled from a tablet/phone,
with a live overlay for your stream.

## How it works

- A small server runs on your **PC** and holds the shared state (life totals, timer).
- Your **tablet/phone** connects to it over WiFi and opens the *table* page —
  players change life there and double-tap the timer to pause or resume it.
- The **host PC** opens the *host control panel* to edit names, heroes, portraits,
  scores, round, format, turn state, and timer settings.
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
   Host control:    http://192.168.1.42:3000/host.html
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

## Host control panel

Open `/host.html` on the OBS PC. The host panel controls all broadcast and match metadata:

- Player names, current life, hero selection, and hero portraits
- Scoreline for each player in `wins-losses-draws` format, such as `1-0-1`
- Format, round number, turn number, and active player
- Timer duration, start/pause, reset, and full game restart

The tablet intentionally does not expose these settings. It only changes life totals and
pauses/resumes the timer.

## Setting up the overlay layout

Open the **Overlay layout editor** link from the setup page (`/editor.html`) in a normal
browser tab on the PC — not inside OBS.

- **Resolution:** pick a preset (1080p, 1440p, 4K, 720p) or enter a custom size. This should
  match the size of your OBS canvas / the Browser Source you'll add.
- **Move:** click and drag any overlay element anywhere on the canvas. Player life,
  player names, hero names, hero portraits, scores, format, round, turn number, timer,
  and active-turn arrows are all independent elements.
- **Resize:** drag the small brass square at the bottom-right corner of each element — text
  and active-turn arrows scale with it automatically.
- Changes save instantly and persist even if you restart the server (stored in `layout.json`
  in the project folder).

### Layout inspector

Click an element to open its inspector panel. You can directly edit its X/Y position, width,
and height. Text-capable elements also support:

- Font selection from fonts detected on the host PC
- Text color
- Drop shadow toggle, disabled by default

The timer has an additional **Timer background** toggle. The blinking timer dot has been
removed. For fully consistent OBS output, bundled fonts can be added under `public/fonts/`
and loaded with CSS `@font-face` definitions in both `editor.html` and `overlay.html`.

Once you're happy with the layout, add the **overlay** address (not the editor) as your OBS
Browser Source, with its width/height set to match the resolution you chose above.

## Using the table tablet

- Tap the **− / +** buttons to adjust life. Hold a button to repeat changes.
- Double-tap the center timer to pause or resume it. Timer reset and duration changes are
  host-only.

The host panel and OBS overlay update immediately through the shared WebSocket state.

## Setting up heroes (Flesh and Blood)

Because life totals in Flesh and Blood vary per hero (and the hero pool keeps growing with
new sets), this app keeps a local hero database in `heroes.json`. Heroes can be maintained
from the existing setup/hero management controls and are remembered for future matches:

- **Hero name**
- **CC life** — life total when played as an adult hero in Classic Constructed
- **SAGE life** — life total when played as a young hero in Silver Age

Leave a life field blank if that hero doesn't exist in that format (e.g. a hero that's
Blitz/Silver-Age-only, or CC-only).

**Starting a match:** choose the format (**Classic Constructed** or **Silver Age**), then each
player picks their hero from the host/setup controls. Confirming
sets both players' life totals automatically from the saved hero data, and shows the hero name
under each player's name on the main screen.

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
