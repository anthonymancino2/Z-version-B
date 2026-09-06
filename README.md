# Dust &amp; Dead

A first-person zombie wave-survival shooter set in a sun-baked desert arena.
Touch-first, single HTML file, no build step, no downloads.

**Play:** https://anthonymancino2.github.io/zombie/

## What it is

The whole game is one file — [`index.html`](index.html). Everything is generated at
runtime: textures, geometry, audio, the arena layout, the zombies, and the network
protocol. The only external dependency is Three.js r128, loaded from a CDN with two
fallbacks.

- Procedural desert arena, regenerated from a seed every match
- Flow-field zombie AI with three types (walker, runner, brute)
- Six weapons unlocked by wave milestone or bought with points
- Explosive barrels, chain reactions, pickups, power-ups
- **Coop for 2–4 players** in a shared arena, with downs and revives
- **Global leaderboard** that survives its own backend
- Virtual joystick + swipe-look on touch, WASD + mouse on desktop
- Dynamic resolution scaling to hold framerate on phones

## Coop

Pick **PLAY WITH FRIENDS**, then either host a run or join one — open runs show up in
the browser automatically, or you can type a host's 4-character code.

Everyone fights in the same arena from the same seed, shares the wave counter and the
score, and can see each other's survivors. Take too much damage and you go **down**
rather than dying: you keep your head and can look around for 45 seconds while a
teammate stands over you for 3.5 seconds to bring you back at 40% health. The run ends
when nobody is left standing.

There is no pause in coop — the menu opens over a running game, and you stay exposed
while it is up.

### How it works, and why

Coop runs over **MQTT on free public brokers**, using a hand-rolled MQTT 3.1.1 client
written directly into the game file (see the `Mqtt` object). Three brokers are tried in
order and the client rotates on failure.

The obvious choice would have been WebRTC peer-to-peer, and it was deliberately rejected:
free STUN servers are everywhere but free TURN servers are not, so peers behind symmetric
NAT — which describes a lot of mobile carriers — would simply fail to connect at all. A
broker relay costs some latency and connects everybody.

The topology is host-authoritative:

- The **host** owns the horde, waves, pickups, barrels, and the shared score, and streams
  a snapshot at 12Hz.
- **Clients** own their own avatar — position, aim, firing, their own hit points — and
  report bullet hits upward at 15Hz. The host resolves damage and credits kills.
- Zombie **pool indices double as network ids**, so neither side needs an id map, and a
  generation counter rejects a hit that lands on a slot which was recycled in flight.
- Kills and headshots only ever flow *downward*. A client never resolves its own kill, so
  its self-reported count would always be zero.

**Known limitation:** browsers throttle `requestAnimationFrame` to a stop in background
tabs. Beacons and keepalives also ride a 1-second timer so nobody gets kicked for tabbing
away briefly, but a host who backgrounds their tab stalls the simulation for the whole
squad until they come back.

## Leaderboard

Scores are published as **retained MQTT messages, one topic per player**, so nobody can
overwrite anybody else's entry by accident. Retained messages do not survive a broker
restart, so [`.github/workflows/leaderboard.yml`](.github/workflows/leaderboard.yml) drains
them every half hour and commits the result to
[`data/leaderboard.json`](data/leaderboard.json). The game loads that file as its durable
baseline and overlays whatever is live on top.

Scores are self-reported and unverified. It is a friendly wall, not a record book. In a
coop run the pooled squad score is submitted for each player, flagged `COOP`.

## Running locally

Open `index.html` in a browser. That works for solo play. Coop and the leaderboard need a
real origin, so serve the folder over HTTP rather than opening it as a `file://` URL.

## Deployment

Every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml),
which publishes the repo root to GitHub Pages.

### One-time repository settings

The workflow tries to enable Pages by itself, but a repository's default token usually is
not allowed to create a Pages site. Two settings need to be set once by hand:

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`**
   Without this the deploy fails with `Resource not accessible by integration`.
2. **Settings → Actions → General → Workflow permissions: `Read and write permissions`**
   The leaderboard snapshot needs this to commit `data/leaderboard.json`.

Re-run the failed **Deploy to GitHub Pages** job afterwards, or just push again.
