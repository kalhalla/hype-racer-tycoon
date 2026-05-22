// Vercel serverless function — leaderboard read/write backed by Supabase (Postgres).
//
// SETUP (optional — the game runs with a mock leaderboard until this is configured)
//   1. Create a Supabase project and run supabase.sql in its SQL editor.
//   2. In Vercel -> Project -> Settings -> Environment Variables, add:
//        SUPABASE_URL              = https://<your-project>.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY = the service_role key (server-side ONLY; never ship to the browser)
//   3. The root package.json already lists "@supabase/supabase-js".
//
// Why the service role key here, server-side: it bypasses Row Level Security, so
// this function is the only thing that can write a score. The browser holds no
// database credentials and cannot insert directly. We validate the time and
// rate-limit before the write, which is the part RLS alone could never enforce.

import { createClient } from '@supabase/supabase-js';

// Lazy init so a missing/unconfigured database returns a clean 503 instead of
// crashing the function. The client falls back to its mock board on any failure.
let _sb = null;
function db() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

const TERRITORIES = ['Global', 'UK & Ireland', 'London', 'Manchester', 'Scotland'];
const MIN_TIME = 20;   // no clean lap of this circuit is faster than this — reject the impossible
const MAX_TIME = 600;

// Best-effort in-memory throttle. A warm instance shares this map; cold/parallel
// instances do not, so it slows a single abuser, not the fleet. For real
// protection move the counter into Postgres or a dedicated limiter (see README).
const hits = new Map();
function rateLimited(key, max = 12, windowMs = 60000) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  rec.n++;
  return rec.n > max;
}

export default async function handler(req, res) {
  try {
    const sb = db();
    if (!sb) return res.status(503).json({ error: 'leaderboard not configured' });

    if (req.method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      if (rateLimited(ip)) return res.status(429).json({ error: 'slow down' });

      const { id, name, time, territory, level, flavour } = req.body || {};
      if (typeof id !== 'string' || id.length < 8 || id.length > 64)
        return res.status(400).json({ error: 'bad id' });
      if (typeof time !== 'number' || !isFinite(time) || time < MIN_TIME || time > MAX_TIME)
        return res.status(400).json({ error: 'implausible time' });

      const terr = TERRITORIES.includes(territory) ? territory : 'Global';
      const cleanName = String(name || 'RACER').replace(/[^\w .\-]/g, '').slice(0, 16) || 'RACER';

      const { error } = await sb.rpc('submit_score', {
        p_id: id,
        p_name: cleanName,
        p_time: time,
        p_terr: terr,
        p_level: level | 0,
        p_flavour: String(flavour || '').slice(0, 24)
      });
      if (error) return res.status(500).json({ error: 'db' });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const terr = TERRITORIES.includes(req.query.territory) ? req.query.territory : 'Global';
      // Each player has one row tagged with their territory, so the Global board is
      // simply the same query with the territory filter dropped — no double-write.
      let q = sb.from('scores')
        .select('player_id, name, best_time')
        .order('best_time', { ascending: true })
        .limit(20);
      if (terr !== 'Global') q = q.eq('territory', terr);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: 'db' });
      const entries = (data || []).map(r => ({ id: r.player_id, name: r.name, time: r.best_time }));
      return res.status(200).json({ territory: terr, entries });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
}
