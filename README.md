# FAB Life Tracker

A local two-player life tracker and stream overlay for a tabletop production. Run the
server on the streaming PC, use the host panel there, and open the table controller on a
tablet beside the players.

## How it works

- The **streaming PC** runs the Node.js server and owns the shared match state.
- The **host panel** controls player information, match details, and the timer.
- The **table tablet** lets players adjust life and pause or resume the timer.
- The **OBS overlay** updates live through WebSockets and has a transparent background.
- The **overlay editor** controls the position, size, visibility, style, and hero crop for
  each overlay element.

No cloud service or account is required. All devices communicate over the local network.

## Setup

1. Install [Node.js](https://nodejs.org) 18 or newer on the streaming PC.
2. Open a terminal in the project folder and run:

   ```powershell
   npm install
   npm start
   ```

3. Open the pages you need:

   | Page | Address on the streaming PC | Address from another device |
   | --- | --- | --- |
   | Setup | `http://localhost:3000` | `http://<PC-IP>:3000` |
   | Host controls | `http://localhost:3000/host.html` | `http://<PC-IP>:3000/host.html` |
   | Table controller | `http://localhost:3000/controller.html` | `http://<PC-IP>:3000/controller.html` |
   | OBS overlay | `http://localhost:3000/overlay.html` | `http://<PC-IP>:3000/overlay.html` |
   | Overlay editor | `http://localhost:3000/editor.html` | `http://<PC-IP>:3000/editor.html` |

   The server prints the PC's local IP address when it starts. For example, if it prints
   `192.168.1.42`, the tablet URL is
   `http://192.168.1.42:3000/controller.html`.

4. Connect the tablet to the same WiFi network as the streaming PC and open the table
   controller URL.
5. In OBS, add a **Browser Source** using the overlay URL. Set its width and height to
   match the selected overlay resolution, such as `1920 x 1080`.

Keep the terminal running during the production. Closing it stops the server.

## Host control panel

Open `/host.html` on the streaming PC. The host panel controls:

- Player names, current life, selected heroes, portraits, and scorelines
- Format, active player, and turn number
- A free-text round label, including `Round 1`, `Top 8`, `Top 4`, `Semi Finals`, or
  `Finals`
- Timer mode, start/pause, reset, and countdown duration
- Full game restart

The timer supports two modes:

- **Countdown:** starts from the configured duration and counts down.
- **Stopwatch:** starts at zero and counts upward.

Countdown duration controls are hidden while stopwatch mode is selected.

## Table tablet

Open `/controller.html` on the table-side tablet.

- Tap anywhere on the left or right side of your player area to decrease or increase life.
  Hold that side to repeat the change.
- Double-tap the center timer to pause or resume it.
- The tablet is designed to sit beside the play area, to Player 1's left and Player 2's
  right. Player 1's area is rotated 180 degrees so both players see their own health in the
  correct orientation.

Player setup, timer reset, timer mode, and match metadata remain host-only controls.

## Overlay editor

Open `/editor.html` in a normal browser tab on the streaming PC, not inside OBS.

- Select a preset resolution or enter a custom canvas size matching OBS.
- Drag elements to position them.
- Drag the square resize handle to change an element's size.
- Select an element and use the inspector for exact X, Y, width, and height values.
- Toggle **Enabled** to show or hide an element in the live overlay. Disabled elements
  remain dimmed and selectable in the editor.
- Text elements support font selection, text color, and an optional drop shadow.
- The timer has an optional background toggle.
- Import a PNG as an editor-only reference layer for aligning elements to stream artwork.
  The reference can be shown or hidden, faded with the opacity control, and cleared when
  it is no longer needed. It is local to the editor tab and never appears in the OBS overlay.

Inspector number fields use normal numeric inputs. Values can be typed manually or
adjusted with the browser's up and down arrows.

### Hero art crop

Hero art is displayed in a rectangular crop with square corners. Select either player's
hero art in the editor to adjust:

- **Crop X %:** moves the visible art left or right.
- **Crop Y %:** moves the visible art up or down.
- **Zoom %:** zooms into the image from `100%` to `300%`.

These crop settings are independent for Player 1 and Player 2.

### Bundled fonts

Place `.ttf`, `.otf`, `.woff`, or `.woff2` files in:

```text
public/fonts/
```

The server scans this folder automatically. Restart the server after adding a font, then
refresh the editor and select the bundled font from the inspector's font list. The overlay
loads the same font automatically. `BebasNeue-Regular.ttf` is currently included in this
folder.

Layout changes save automatically to `layout.json` and are used by the OBS overlay.

## Hero setup

Heroes are stored locally in `heroes.json`. Each hero can include:

- Hero name
- **CC life** for Classic Constructed
- **SAGE life** for Silver Age
- A portrait used by the setup screens and overlay

Leave a format's life field blank when that hero is not available in that format. Selecting
a format and hero during setup applies the saved starting life automatically.

Uploaded source images are stored under `public/hero-images/`, and generated overlay art is
stored under `public/hero-art/`.

## WiFi and firewall troubleshooting

### 1. Confirm the streaming PC's IP address

On the streaming PC, run:

```bat
ipconfig
```

Use the **IPv4 Address** listed for the active WiFi adapter. Do not use an address belonging
to a VPN, virtual adapter, or disconnected Ethernet adapter.

### 2. Confirm both devices are on the same network

The streaming PC and tablet/laptop should be connected to the same WiFi and usually have
similar addresses, such as `192.168.68.x`. Guest WiFi networks may block devices from
communicating with each other through a setting called client or AP isolation.

Set the Windows WiFi network profile to **Private** under **Settings > Network & internet >
Wi-Fi > your connected network**. This allows Windows to treat the local network as trusted.

### 3. Confirm the server is listening

With `npm start` running, open another terminal on the streaming PC and run:

```bat
netstat -ano | findstr :3000
```

You should see `LISTENING` on `0.0.0.0:3000`, `[::]:3000`, or both. This means the server is
accepting connections beyond `localhost`.

### 4. Allow port 3000 through Windows Firewall

Open **Command Prompt or PowerShell as Administrator** on the streaming PC and run:

```bat
netsh advfirewall firewall add rule name="FAB Life Tracker 3000" dir=in action=allow protocol=TCP localport=3000
```

Then restart the server and try the tablet URL again. This inbound rule is the most direct
fix when the server works on the streaming PC but other devices cannot open it.

To remove that rule later, run as Administrator:

```bat
netsh advfirewall firewall delete rule name="FAB Life Tracker 3000"
```

### 5. Test the connection from the other Windows computer

Replace the example IP with the streaming PC's IPv4 address:

```powershell
Test-NetConnection 192.168.68.142 -Port 3000
```

`TcpTestSucceeded : True` confirms that the app's port is reachable. You can also browse
directly to `http://192.168.68.142:3000`.

A failed `ping` does not always mean the web app is blocked because Windows can block ICMP
ping separately. The port test and browser test are more useful for this app.

### 6. If port 3000 is already in use

The error `EADDRINUSE: address already in use :::3000` means another process, often an
existing copy of this server, is already using the port. Find its PID with:

```bat
netstat -ano | findstr :3000
```

If it is an old server process that should be stopped, use the PID from the final column:

```bat
taskkill /PID <PID> /F
```

Then run `npm start` again.

## Data and persistence

- Live match state is held in memory and resets when the server restarts.
- Heroes, uploaded hero images, generated hero art, and overlay layout settings persist on
  disk.
- Multiple controllers can connect at the same time and remain synchronized.
- The default port is `3000`. In PowerShell, start on another port with:

  ```powershell
  $env:PORT=4000; npm start
  ```
