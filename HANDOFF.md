# DUST & DEAD — session handoff

**Written:** 2026-09-06 · **Game version at handoff:** v1.7.1 · **HEAD:** `4508069`

This is everything a fresh Claude Code session needs to pick this work up cold. It is written for
an assistant with **no memory of the previous session**. Nothing here is in the repo's git history,
so read it before touching code.

This file is **untracked on purpose** — it is a working note, not part of the game. Don't commit it
unless you want it public.

---

## 1. What the project is

| | |
|---|---|
| **Working file** | `C:\Users\anthony\Desktop\ZOMBIE POV\index.html` — the *entire* game, one file, ~5,250 lines, **~7.3MB** (most of that is embedded champion assets, see §6) |
| **Repo** | `https://github.com/anthonymancino2/zombie` (branch `main`) |
| **Name** | DUST & DEAD — desert-arena first-person zombie survival |
| **Stack** | Three.js **r128, loaded as a classic global `<script>` tag** (CDN, with fallback URLs) + one inline `<script>`. No build step, no bundler, no npm, **no ES modules, no import maps anywhere in this file**. |
| **Play target** | **iPhone 13 Pro, Safari/iOS WebKit, LANDSCAPE, 60fps floor.** Desktop is secondary. |

Single-file is a deliberate design constraint, not an accident. Do not propose splitting it into
modules. Modules are plain object literals: `R` (renderer), `World`, `Zombies`, `Bullets`,
`Pickups`, `Particles`, `Explosions`, `Floaties`, `Decals`, `Dust`, `FX` (2D canvas overlay),
`HUD`, `Player`, `Avatars` (champion GLB loader — new, see §6), `Bots` (AI teammates), `Director`
(AI pacing), `Game` (state machine + waves + main loop), `Net` (MQTT coop), `Mqtt`, `Board`
(leaderboard), `Layout` (movable touch controls), `Beacon`.

---

## 2. Operating rules — read before your first commit

These were learned the hard way. Skipping any of them costs a broken push or a false "it works."

1. **Bump `GAME_VERSION` (grep for it, currently ~line 602) on every single push.** No exceptions.
   Standing rule from the owner across his projects.
2. **The repo has no git identity configured.** First commit in a fresh clone/session fails with
   "Author identity unknown." Fix per-repo:
   ```bash
   git config user.name "Anthony Mancino"; git config user.email "anthony.mancino@moquinpress.com"
   ```
3. **A GitHub Action pushes to `main` on its own** (commits `data/leaderboard.json`, message
   "Snapshot global leaderboard"). Your push will likely be rejected as non-fast-forward. Always:
   ```bash
   git fetch origin; git rebase origin/main; git push origin main
   ```
   The bot only ever touches the leaderboard JSON, never `index.html`, so rebasing is safe.
4. **This machine has no node, no python, no gh CLI.** You cannot lint, bundle, or run `npm`.
5. **Never `Read` or `Grep -A/-B/-C` across the embedded-asset lines (~line 709-716, see §6).** Each
   is a single line of 300KB–2.3MB of base64 text. A ranged `Read` that spans one will hard-fail
   ("exceeds maximum allowed tokens"); a `Grep` with context flags on a pattern that matches inside
   one will dump megabytes into your context. Anchor `Read`/`Edit` calls strictly before line 709 or
   strictly after line 717, and keep `Grep` patterns specific enough that they can't match inside
   those 7 lines. Bulk changes to the asset block itself belong in `Bash`/`PowerShell` (`sed`/sub-
   string ops), never in `Read`+`Edit`, exactly like how this session built it in the first place.

### How to actually verify your work

`file://` has no working console in the in-app browser ("local file, not a web page"), but a tiny
PowerShell static server works and is much faster than push-then-check:
```powershell
$root = 'C:\Users\anthony\Desktop\ZOMBIE POV'
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add('http://localhost:8777/')
$l.Start()
while ($l.IsListening) {
  try {
    $ctx = $l.GetContext()
    $p = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
    if ([string]::IsNullOrEmpty($p)) { $p = 'index.html' }
    $f = Join-Path $root $p
    if (Test-Path -LiteralPath $f -PathType Leaf) {
      $b = [System.IO.File]::ReadAllBytes($f)
      $ctx.Response.ContentType = 'text/html; charset=utf-8'
      $ctx.Response.Headers.Add('Cache-Control','no-store')
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  } catch { }
}
```
Save it, run in the background, then navigate the Browser pane to `http://localhost:8777/`. Gives a
real http origin, a working console, and live `requestAnimationFrame`. Still do one raw.githack
check on the pushed SHA before telling the owner it works:
```
https://raw.githack.com/anthonymancino2/zombie/<commit-sha>/index.html
```
Click through the **"Open the page"** interstitial once (only needed the first time per session).

- `window.DND` exposes everything: `Game, Player, Zombies, World, Bullets, Pickups, Audio, Input,
  R, Explosions, Particles, Floaties, Decals, Dust, FX, HUD, CFG, WEAPONS, Net, Board, Mqtt,
  Director, Bots, ZTYPES, Avatars, AVATARS, version`. Check `DND.version` to confirm the build.
- **Don't test input by setting `Input.keys`.** The window `blur` handler replaces the whole keys
  object, and the preview pane blurs constantly, so your key gets wiped between statements. Call
  the methods directly instead (`Player.updateSprint(0.5, 1.0)`).
- The console always shows `WrongDocumentError ... pointer lock` in the in-app browser sandbox.
  Pre-existing and harmless — ignore it, but don't let it mask real errors.
- To force-load and inspect a champion body directly (useful for checking mesh/weapon issues
  without a full match): `await DND.Avatars.spawn('cloud')` returns `{g, mixer, actions, ...}` —
  `body.g.traverse(o => ...)` walks every node.
- **Overlap scan** — paste after resizing the viewport, to check no control or HUD text collides:
  ```js
  const ids=['btnFire','btnReload','btnSwitch','btnAuto','btnSprint','btnPause','joyHint','hpBar','hpNum','waveNum','zLeft','points','kills','ammoMag','wpnName','reloadHint','ammoRes','boss','pinned','coop','revive'];
  const rect=id=>{const e=document.getElementById(id);if(!e)return null;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return null;const r=e.getBoundingClientRect();if(!r.width&&!r.height)return null;return {id,l:r.left,t:r.top,r:r.right,b:r.bottom}};
  const all=ids.map(rect).filter(Boolean);const hits=[];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];
    if(a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b)hits.push(a.id+' x '+b.id);}
  hits;   // must be []
  ```
  Test at **844×390** (landscape, primary) and **390×844** (portrait). Aim for ≥14px between any two
  tappable controls.

---

## 3. What shipped, most recent first

| Version | SHA | What |
|---|---|---|
| v1.7.1 | `4508069` | Fix: Cloud's sword is a separate mesh (`Object_58`), not fused — now hidden too |
| v1.7.0 | `a574808` | **Imported 7 Family Arena champions as playable avatars** — see §6 |
| v1.6.0 | `e3fe06a` | Three AI teammates (BOONE / KESS / JUNE) |
| v1.5.0 | `9ec565b` | AI Director + Hunter + Tank, plus a real app icon |
| v1.4.2–v1.3.0 | — | Third-person camera, coop pause beacon, sprint, movable touch controls (see git log) |

### Decisions in there worth NOT re-litigating

- **Every playable body is now one of 7 imported champions — no more generic Hank/Vega box
  bodies for the player.** See §6 for the full system. Bots (BOONE/KESS/JUNE) still use the old
  procedural `buildSurvivor()`/`poseSurvivor()` box body on purpose — they're fixed NPCs, not
  player-selectable avatars, and touching them wasn't part of this task.
- **Coop pause deliberately does not freeze the world.** `Game.pause()` branches on `Net.on()`: in
  coop it only opens the menu overlay. A paused coop player raises a pulsing light **beacon**
  (`Beacon` module) so teammates can find and cover them.
- **Sprint is tap-to-engage, not hold** (`Player.updateSprint`/`toggleSprint`) — a thumb steering
  the joystick can't also hold a second button.
- **Third person uses a parallel camera axis, not a converging one** — keeps the body clear of the
  crosshair; the reticle is projected onto whatever the ray actually hits (`Player.aimPoint`).
- **Layout positions are stored as viewport fractions** (`dnd_layout_v1` in localStorage).

---

## 4. Architecture anchors (grep the symbol, don't trust the line number — it drifts)

```
GAME_VERSION   CFG (tuning constants)   CHARS (male/female STAT/VOICE templates only — see §6)
AVATARS (7-champion registry)   AVATAR_GLB_GZ_B64 (embedded assets)   Avatars (loader/pose module)
Audio   Input   Layout (movable touch buttons)
R (renderer/cameras)   World (arena, collision, flow field, segHit)
ZTYPES (walker/runner/brute/hunter/tank)      boxesGeo (procedural merged-box mesh builder — zombies only now)
Zombies (pool)          PICKUP_DEFS               WEAPONS (pistol/shotgun/rifle stat defs)
buildSurvivor / poseSurvivor   ← Bots-only now, player body no longer uses these
Player            Bots (BOONE/KESS/JUNE)   Director (AI pacing)
FX (2D overlay)         HUD                       Game (state machine, waves, main loop)
Mqtt / NET / Net / Beacon                          Board (leaderboard)
ZSTATE = ['emerge','chase','attack','dead','crouch','pounce','pin']   ← wire format, append-only
ZTYPE_LIST = ['walker','runner','brute','hunter','tank']              ← wire format, append-only
PU_LIST = ['health','ammo','insta','double']
```

### What already exists — do NOT rebuild these

- **The 7-champion avatar system** (§6) — full roster, weapon hiding, gender-based stats, async
  loading, third-person + coop-peer rendering, animation crossfade. Fully shipped and verified.
- **Downed / revive / bleed-out** — coop (`Net`, real humans) and solo (`Bots`, a bot can revive
  you and vice versa).
- **Strict object pooling** everywhere — zombies, bullets, particles, decals, floaties, explosions.
- Three weapons (pistol/shotgun/rifle) — `WEAPONS`/`buildGun(def)`, held by the viewmodel
  (`Player.vm`) — this is independent of body/avatar and was not touched.
- Wave scaling, points/multiplier economy, barrel chain explosions, character voice lines.
- AI Director (pacing/specials), Hunter (pin mechanic), Tank (boss), three AI teammate bots.

---

## 5. Longer-term roadmap (unchanged, still pending)

1. **L4D item set.** First aid kit (4s channel, 80% heal), pain pills (instant decaying temp
   health), fixed ammo piles, pipe bomb that pulls the horde; plus large tap zones for heal/throw.
   Bots should use kits and pills too — `Bots.think` already has a clean priority ladder to hang
   that off.
2. Dual-virtual-joystick controls (right stick = aim) — the owner asked for this in the original
   L4D brief. The right side is currently swipe-to-look with a draggable FIRE button, tuned and
   working — confirm he actually wants a true right stick before replacing it.

Two things intentionally NOT done, so nobody "fixes" them by accident:
- **Bots are immune to barrel blasts** (not in the peer loop in `Game.explodeBarrel`).
- **Difficulty was not rebalanced for having a squad.**

---

## 6. DONE this session — champion avatar import (v1.7.0 / v1.7.1)

The task: import Family Arena's champion roster (`C:\Users\anthony\Desktop\family arena\index.html`,
a separate, much larger single-file game with real rigged 3D combat characters) as Dust & Dead's
playable avatars, replacing the old procedural Hank/Vega pair. Gender-based stats: any male-group
champion uses the same stat/voice block Hank used, any female-group champion uses Vega's. Weapons
visible on the source models should be hidden where possible. **This is done and verified**, not a
plan — read this section only if you need to touch the system, add an 8th champion, or debug it.

### 6.1 The roster

| id | gender | Family Arena source | Weapon hidden? |
|---|---|---|---|
| `cloud` | male | `cloud` (Sketchfab-sourced rig) | Yes — `Object_58`, a separate mesh (confirmed by its bind-pose bounding box: 12.9×4.2×0.9, a flat blade shape among otherwise boxy body parts) |
| `rhino` | male | `rhino` (Green Rhino Ranger) | Yes — `boomerang_l_gr`/`boomerang_r_gr`, separate static mesh nodes |
| `chopper` | male | `chopper` | **No** — ships as ONE fused `SkinnedMesh`, one material, no material groups. Cutlass is welded into the body geometry; cannot be removed without vertex surgery. |
| `corsair` | male | `corsair` (Dudu the Penguin) | N/A — never had a weapon (306 tris, bare) |
| `mage` | female | `mage` (Nine-Tailed Fox, KayKit rig) | Yes — `1H_Wand`, `2H_Staff`, `Spellbook`, `Spellbook_open`, all separate mesh nodes |
| `dragonlord` | female | `dragonlord` (Nyxara) | **No** — has 4 separate meshes, but none is identifiably *just* a weapon (one, `Skinned_Mesh_2`, is almost certainly her wings — its bind-pose bbox is a wildly different scale, ~49×33×65 vs the others' ~1×1×0.5). Left everything visible rather than guess and hide the wrong part. If you ever get a clean mesh-name dump from Family Arena's own source for this rig, revisit. |
| `barbarian` | female | `barbarian` (Aesir) | **No** — same as Chopper: one fused `SkinnedMesh`, one material, no groups. Axe is welded in. |

**Owner already confirmed** (this session, via AskUserQuestion): ship all 7 with the weapon visible
where it can't be cleanly hidden, rather than drop those champions from the roster. Don't re-ask
this — it's settled.

**If you find yourself wanting to hide a weapon on chopper/barbarian anyway:** the only path is
actual geometry editing (slicing the index buffer by a vertex/UV region, or re-exporting the source
asset without the weapon in a 3D tool) — there is no scene-graph or material-based shortcut, this
was checked directly (single material, zero `geometry.groups`, confirmed via a live diagnostic
harness against the real decoded meshes, not guessed).

### 6.2 How the models get from Family Arena into this file

Family Arena embeds each custom champion as a **gzip+base64 GLB or GLTF blob** directly in its own
`index.html` (e.g. `CHOPPER_GLB_GZ_B64`, `CLOUD_WOFF_GLTF_GZ_B64`) and decodes it at runtime via
`DecompressionStream('gzip')` + `GLTFLoader`. Family Arena itself loads three.js as an **ES module**
(import map, `import('three/addons/loaders/GLTFLoader.js')`) — Dust & Dead does **not** do this and
should not start; see §6.3.

Extraction method used (repeatable if a champion needs re-extraction, e.g. after a fix in Family
Arena's own file): `grep -n` for the `*_GLB_GZ_B64 = "..."` line, then `sed -n '<line>p' file | sed`
to strip the `const NAME = "` prefix and trailing `";` into a standalone `.b64` text file — **never**
`Read` these lines, they're 300KB–2.3MB each (see §2 rule 5). `mage` was originally fetched live from
a KayKit GitHub URL in Family Arena; it's been re-downloaded and re-encoded the same way here so Dust
& Dead has **zero new network dependencies** — everything is embedded, works offline.

The 7 blobs live in `AVATAR_GLB_GZ_B64` (grep for it — a small block of `const` + 7 lines, each one
giant; anchor edits strictly outside lines 709-717 per §2 rule 5). `AVATAR_TEXT_FORMAT = {cloud:
true}` flags that `cloud` decodes to GLTF **text** (JSON), not a binary GLB, unlike the other six.

### 6.3 Why this does NOT use ES modules / import maps (rejected approach)

The first attempt added a `<script type="importmap">` + `import('three')` / `import('three/addons/
loaders/GLTFLoader.js')`, matching Family Arena's own approach. **This was reverted.** It would have
created a second, separate THREE module instance alongside the existing r128 classic-script global,
which is exactly the kind of thing that can silently break `instanceof`-based internals across the
boundary (skinning, animation). It also doesn't match this file's whole-file architecture (§1: no ES
modules anywhere).

**What's actually used instead**, confirmed working via a live test harness before committing to it:
the classic (non-module, UMD-style) r128 builds of the two extra loaders, appended as plain
`<script>` tags right after three.min.js itself loads, attaching straight onto the existing global
`THREE`:
```
https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js
https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js
```
(with cdnjs/unpkg fallbacks, same pattern as the existing three.js loader chain — grep "3D library
loader"). This gives `THREE.GLTFLoader` and `THREE.SkeletonUtils` as ordinary globals. **One THREE
instance for the whole game, always.** If a CDN fails to deliver these two files, the game still
boots — champion bodies just never appear (cosmetic-only degradation, see `Avatars._template`'s
guard on `!THREE.GLTFLoader`), it does not block first-person play.

### 6.4 The `Avatars` module (grep for it, sits right after the asset block)

- `AVATARS` — the 7-entry registry: `id, gender, key, short, label, cls, desc, accent, hide[]`.
- `AVATAR_ORDER` — `{male: [...], female: [...]}`, drives both the menu card order and validates ids.
- `Avatars._template(id)` — loads + caches ONE parsed/normalized template per champion (gunzip →
  `GLTFLoader.parse` → hide configured weapon nodes by name → **normalize wildly inconsistent export
  scales onto a common ~1.82m standing height** via a `Box3` measurement, since e.g. Cloud's raw
  GLTF is ~250× too big and Rhino's is a totally different scale again → classify animation clips
  into `{idle, walk}` roles by name pattern). Cached forever per id — cloning happens per-spawn.
- `Avatars.spawn(id)` — one **live** body for one player/peer slot: `SkeletonUtils.clone` off the
  template (required for skinned meshes — a plain `Object3D.clone()` breaks bone bindings), its own
  `AnimationMixer`, a muzzle-flash sprite. Returns `{kind:'gltf', g, mixer, actions, current, flash}`.
- `Avatars.pose(m, dt, gait, downed)` — the GLTF-body equivalent of the old `poseSurvivor`: no
  individual limb rotation (there are no separate limb objects on a fused skinned mesh) — instead
  crossfades between the idle/walk `AnimationAction`s based on `gait`, and on `downed` just tilts
  the whole wrapper group (same trick the old box body used), since not every rig has a clean death
  pose to rely on.

### 6.5 Integration points if you need to touch this again

- **`Player.buildBody()`** — async now (`Avatars.spawn` returns a Promise). Uses a generation
  counter (`this._bodyGen`) so rapid avatar switching can't let a stale load clobber a newer one.
  First-person play is unaffected while a body is loading — the body is cosmetic (third-person +
  how peers see you), gunplay uses the separate always-present viewmodel (`Player.vm`).
- **`Player.char`** is now a *merged* object built by `Game.charFor(id)`:
  `CHARS[avatar.gender]` (stats + voice lines) with `id/short/name/accent` overridden from the
  chosen `AVATARS` entry. `Player.updateBody` branches on `b.kind === 'gltf'` to call `Avatars.pose`
  instead of `poseSurvivor`.
- **`Net.ensureAvatar(peer)`** — same async pattern for remote coop peers: an empty wrapper group +
  shadow + nametag + flash go up immediately (so position/shadow/label work from frame one even
  before the model lands), and `Avatars.spawn(peer.char)` fills in `m.g`'s child + mixer + actions
  when it resolves. `peer.char` now carries the avatar id string (e.g. `'rhino'`), not the old
  `'male'/'female'` — this is a plain JSON string field over MQTT, not an indexed wire format, so
  widening its value space was a non-breaking change (unlike `ZTYPE_LIST`/`ZSTATE`, which ARE
  indexed and must stay append-only).
- **Menu** (`Game.buildCharCards()`) — the old 2 hardcoded `<div class="card">`s are gone; cards for
  all 7 champions are generated into `#cardsMale`/`#cardsFemale` containers, grouped by
  `AVATAR_ORDER`. No live 3D portrait — a flat colored `.cportrait` swatch with the champion's
  initial, styled to match the old canvas-portrait's box footprint.
- **`GENDER_BARS`** on `Game` — the GRIT/VITALS/SPEED/RELOAD bar percentages shown on every card are
  per-gender (2 sets total), not per-champion, since stats genuinely are shared by gender per the
  brief. This is intentional, not a shortcut.
- **Known, accepted simplification:** voice lines are still literally Hank's or Vega's original
  dialogue text (`CHARS[gender].lines`), just displayed under whichever champion's name is chosen
  (e.g. picking Mage shows "FOX: Vega on site. Engaging on contact."). Writing 7 distinct voice-line
  sets was not requested and would be a large separate content task — flag before doing it, don't
  assume it's wanted.

### 6.6 If you add an 8th champion later

1. Get its gzip+base64 blob the same way (§6.2) — from Family Arena's source or a fresh asset.
2. Add one entry to `AVATAR_GLB_GZ_B64` (via shell splice, not Read/Edit — §2 rule 5) and one to
   `AVATARS` + the right array in `AVATAR_ORDER`.
3. **Actually inspect the model before deciding `hide: []`.** Don't assume mesh count tells you
   anything — Cloud looked "fused" until this session actually loaded it and checked. The reliable
   test used here: force-load via `Avatars.spawn(id)` in a live console, `traverse` every
   `isSkinnedMesh`, compute each one's **local bounding box** (`geometry.computeBoundingBox()`) — a
   weapon reliably shows up as a flat/thin/elongated outlier next to otherwise boxy body-part
   meshes. A shared material name or a bone that merely *exists* in a shared skeleton (checked via
   `skeleton.bones.find(...)`) is **not** reliable evidence — every mesh in a rig shares one
   skeleton array regardless of which mesh a bone actually deforms.
4. If nothing is a clean outlier (like Dragonlord), don't guess — leave it visible.

---

## 7. How the owner works

- **Ship it, don't ask** — for anything actually unambiguous. Commit, push, verify, then report.
- **Real ambiguity gets a real question.** This session asked once, up front, about the
  real-3D-model-vs-procedural-recreation tradeoff (network dependency, file size, engineering scope)
  before writing any code — that was the right call, not overcaution.
- **Verify for real, in the actual running game.** This session caught its own mistake (Cloud's
  sword not actually hidden in v1.7.0) by force-loading the model and measuring bounding boxes, not
  by trusting a first-pass visual scan — do the same before claiming something is fixed.
- He plays on his **iPhone 13 Pro** and reports genuine ergonomic bugs from it. Take them literally.
- He reads feedback precisely — treat that precision as real signal about scope.
- Keep the comment style: terse, explains **why** not what, occasionally dry. Match what's there.

---

## 8. Kickoff prompt for a new session

Only needed if picking up mid-task or debugging the avatar system. For ordinary "what's next" work,
§5's roadmap is the actual backlog. If you do need one:

> Read `C:\Users\anthony\Desktop\ZOMBIE POV\HANDOFF.md` first — §6 covers the champion avatar system
> (shipped, v1.7.1) in full: the roster, why it uses classic-script GLTFLoader instead of ES modules,
> where the `Avatars` module hooks into `Player`/`Net`/the menu, and how to safely add an 8th
> champion later. Bump `GAME_VERSION`, `git fetch && git rebase origin/main` before pushing, and
> verify in the actual running game (§2 has the local-server trick and the `Avatars.spawn()` console
> trick) before telling me it works — don't trust a first screenshot, this session found its own bug
> that way (Cloud's sword).
