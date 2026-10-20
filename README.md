# Interactive Experience

A lightweight browser-based interactive application with real-time session connectivity.

**Leap Buddies** is a small two-player co-op platform game that runs
entirely in the browser. No accounts, no downloads, no installs — one
player creates a room, shares the code or invite link, and both play
together in the same level at the same time.

## Play

Open `index.html` (or the deployed page) and choose:

- **Solo** — play alone. The whole level is completable solo.
- **Local 2P** — two players, one keyboard.
- **Create Room / Join Room** — online co-op. The host gets a 5-letter
  room code and a copyable invite link (`?room=CODE`). The guest opens
  the link, picks a character, readies up, and the host starts.

### Controls

| | Move | Jump | Run (hold) |
|---|---|---|---|
| Player 1 | Arrow keys | ↑ or X | Z |
| Player 2 | A / D | W or G | F |

A gamepad also works for Player 1. **M** mutes. Stomp critters, bump the
star blocks, ride moving platforms, stand on your partner's head for a
boost jump, and pop their bubble when they're knocked out to bring them
back. Both players standing on the two floor switches opens the gate.

## How it works

- Vanilla JavaScript + Canvas, fixed-timestep 60 fps simulation
  (`js/engine.js`, no build step, no dependencies besides the PeerJS
  client loaded from CDN).
- Online play is host-authoritative: the host runs the simulation and
  streams compact state snapshots (~20/s); the guest sends inputs and
  renders the host's state with interpolation. Signaling uses the
  public PeerJS cloud broker; game traffic is a direct encrypted
  WebRTC data connection between the two browsers. No server, no
  database, nothing is collected or stored.
- All art is original and drawn in code (`js/sprites.js`); all sound is
  synthesized with WebAudio (`js/audio.js`). There are no image or
  audio asset files.

## Files

```
index.html        page shell, lobby + game views
style.css         retro lobby/HUD styling
js/engine.js      game simulation (also runs headless in Node)
js/sprites.js     original pixel art + procedural tiles/scenery
js/audio.js       WebAudio synth SFX + a small original music loop
js/net.js         PeerJS wrapper (host/join, room codes)
js/main.js        UI, game loop, rendering, netplay glue
```

## Deployment

Copy this folder to any static host. All paths are relative, so it
works from a subpath (e.g. `/ux-session/`) unchanged. HTTPS is required
in practice for WebRTC on public origins.
