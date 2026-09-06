/**
 * Snapshot the live leaderboard into data/leaderboard.json.
 *
 * Scores live as retained MQTT messages, one topic per player, on a free public broker.
 * That is fine for a live board but retained messages vanish whenever the broker restarts,
 * so this runs on a schedule, drains whatever is currently retained, and merges it into a
 * file in the repo. The game loads that file as its durable baseline and overlays the live
 * topics on top, which means the board survives the broker without needing one of our own.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import mqtt from 'mqtt';

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const FILTER = 'dnd/1/hs/+';
const FILE = 'data/leaderboard.json';
const DRAIN_MS = 25000;   // retained messages arrive in a burst; this is generous headroom
const KEEP = 200;

function readExisting() {
  if (!existsSync(FILE)) return [];
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    return Array.isArray(j.entries) ? j.entries : [];
  } catch {
    return [];
  }
}

function sane(pid, raw) {
  let e;
  try { e = JSON.parse(raw); } catch { return null; }
  if (!e || typeof e !== 'object') return null;
  const pts = Number(e.pts);
  if (!Number.isFinite(pts) || pts <= 0 || pts > 100_000_000) return null;
  const name = [...String(e.n ?? 'SURVIVOR')].filter((ch) => ch >= ' ' && ch !== '<' && ch !== '>' && ch !== '&').join('').trim().slice(0, 14);
  if (!name) return null;
  return {
    pid,
    n: name,
    pts: Math.round(pts),
    w: Math.max(0, Math.min(9999, Math.round(Number(e.w) || 0))),
    k: Math.max(0, Math.min(999999, Math.round(Number(e.k) || 0))),
    c: e.c ? 1 : 0,
    t: Number.isFinite(Number(e.t)) ? Number(e.t) : Date.now(),
  };
}

function drain(url) {
  return new Promise((resolve) => {
    const found = new Map();
    const client = mqtt.connect(url, {
      clientId: 'dnd-snap-' + Math.random().toString(36).slice(2, 10),
      connectTimeout: 10000,
      reconnectPeriod: 0,
    });
    const done = () => { try { client.end(true); } catch { } resolve(found); };
    const timer = setTimeout(done, DRAIN_MS);
    client.on('connect', () => client.subscribe(FILTER, { qos: 0 }));
    client.on('message', (topic, payload) => {
      const pid = topic.slice(topic.lastIndexOf('/') + 1);
      const e = sane(pid, payload.toString());
      if (!e) return;
      const prev = found.get(pid);
      if (!prev || e.pts > prev.pts) found.set(pid, e);
    });
    client.on('error', () => { clearTimeout(timer); done(); });
  });
}

const baseline = readExisting();
let live = new Map();
for (const url of BROKERS) {
  console.log('draining ' + url);
  const got = await drain(url);
  console.log('  ' + got.size + ' retained scores');
  for (const [pid, e] of got) {
    const prev = live.get(pid);
    if (!prev || e.pts > prev.pts) live.set(pid, e);
  }
}

const merged = new Map();
for (const e of baseline) if (e && e.pid) merged.set(e.pid, e);
for (const [pid, e] of live) {
  const prev = merged.get(pid);
  if (!prev || e.pts > prev.pts) merged.set(pid, e);
}

const entries = [...merged.values()].sort((a, b) => b.pts - a.pts).slice(0, KEEP);
const out = { updated: new Date().toISOString(), count: entries.length, entries };

const before = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
const body = JSON.stringify(out, null, 2) + '\n';
// the timestamp alone changing every run would commit noise forever, so compare the entries
const sameEntries = (() => {
  try { return JSON.stringify(JSON.parse(before).entries) === JSON.stringify(entries); } catch { return false; }
})();

if (sameEntries) {
  console.log('no change (' + entries.length + ' entries)');
} else {
  writeFileSync(FILE, body);
  console.log('wrote ' + entries.length + ' entries');
}
