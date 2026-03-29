import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// ── Data ────────────────────────────────────────────────────────────────────

const USER = {
  name: "Sedhu",
  handle: "sedhu",
  tier: "Platinum",
  xp: 14750,
  nextTier: { name: "Diamond", xp: 20000 },
  currentTier: { name: "Platinum", xp: 10000 },
  rank: 42,
  totalUsers: 12847,
  streak: 23,
  longestStreak: 45,
  sessions: 1284,
  toolUses: 23471,
  hoursActive: 312,
  joinDate: "Nov 2024",
};

const BADGES = [
  { id: 1, name: "Early Adopter", desc: "Joined within first 30 days", earned: true, date: "Nov 2024", tier: "gold" },
  { id: 2, name: "1M Tokens", desc: "Used over 1M tokens total", earned: true, date: "Feb 2025", tier: "gold" },
  { id: 3, name: "30-Day Streak", desc: "30 consecutive active days", earned: true, date: "Mar 2025", tier: "silver" },
  { id: 4, name: "Model Explorer", desc: "Used every Claude model", earned: true, date: "Jan 2025", tier: "gold" },
  { id: 5, name: "Tool Master", desc: "Used 10+ different tools", earned: true, date: "Apr 2025", tier: "silver" },
  { id: 6, name: "Night Owl", desc: "50+ sessions after midnight", earned: true, date: "May 2025", tier: "bronze" },
  { id: 7, name: "Efficiency Pro", desc: "Avg efficiency score > 90%", earned: true, date: "Jun 2025", tier: "gold" },
  { id: 8, name: "500 Sessions", desc: "Complete 500 sessions", earned: false, tier: "silver", progress: 78 },
  { id: 9, name: "500 Hours", desc: "Log 500+ hours in Claude Code", earned: false, tier: "gold", progress: 62 },
  { id: 10, name: "Diamond Rank", desc: "Reach Diamond tier", earned: false, tier: "platinum", progress: 74 },
  { id: 11, name: "Sharer", desc: "Share profile badge 10+ times", earned: false, tier: "bronze", progress: 40 },
  { id: 12, name: "Opus Veteran", desc: "100+ Opus conversations", earned: false, tier: "platinum", progress: 55 },
];

const CONTRIBUTION_DATA = (() => {
  const data = [];
  const now = new Date(2026, 2, 29);
  for (let w = 51; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - (w * 7 + (6 - d)));
      const isWeekend = d === 0 || d === 6;
      const base = isWeekend ? 1 : 3;
      const count = Math.max(0, Math.floor(Math.random() * (base + 4) - 1));
      data.push({ date: date.toISOString().slice(0, 10), count, week: 51 - w, day: d });
    }
  }
  return data;
})();

const WEEKLY_ACTIVITY = Array.from({ length: 24 }, (_, i) => ({
  week: `W${i + 1}`,
  sessions: Math.floor(Math.random() * 12 + 3),
  tools: Math.floor(Math.random() * 80 + 20),
}));

const TOOL_BREAKDOWN = [
  { name: "Edit", count: 8420, pct: 36 },
  { name: "Read", count: 5870, pct: 25 },
  { name: "Bash", count: 4230, pct: 18 },
  { name: "Write", count: 2810, pct: 12 },
  { name: "Grep", count: 1420, pct: 6 },
  { name: "Glob", count: 721, pct: 3 },
];

const LEADERBOARD = [
  { rank: 1, handle: "alex_dev", xp: 22400, tier: "Diamond", streak: 67 },
  { rank: 2, handle: "mira_codes", xp: 21100, tier: "Diamond", streak: 54 },
  { rank: 3, handle: "tensor_jay", xp: 19800, tier: "Platinum", streak: 41 },
  { rank: "gap" },
  { rank: 41, handle: "cloud_nina", xp: 14900, tier: "Platinum", streak: 28 },
  { rank: 42, handle: "sedhu", xp: 14750, tier: "Platinum", streak: 23, isUser: true },
  { rank: 43, handle: "byte_wolf", xp: 14600, tier: "Platinum", streak: 19 },
  { rank: "gap" },
  { rank: 100, handle: "neo_smith", xp: 9200, tier: "Gold", streak: 12 },
];

// ── Tier system ─────────────────────────────────────────────────────────────

const TIERS = [
  { name: "Bronze", min: 0, dot: "#92400e" },
  { name: "Silver", min: 2000, dot: "#9ca3af" },
  { name: "Gold", min: 5000, dot: "#ca8a04" },
  { name: "Platinum", min: 10000, dot: "#7c3aed" },
  { name: "Diamond", min: 20000, dot: "#0891b2" },
];

const TIER_DOT = { Bronze: "#92400e", Silver: "#9ca3af", Gold: "#ca8a04", Platinum: "#7c3aed", Diamond: "#0891b2" };

// ── Utility ─────────────────────────────────────────────────────────────────

const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : n);

// ── Contribution Graph ──────────────────────────────────────────────────────

function ContributionGraph() {
  const levels = ["bg-zinc-800", "bg-emerald-900/80", "bg-emerald-700/80", "bg-emerald-500/80", "bg-emerald-400"];
  const getLevel = (c) => (c === 0 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : c <= 5 ? 3 : 4);

  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i <= 51; i++) w.push(CONTRIBUTION_DATA.filter((d) => d.week === i));
    return w;
  }, []);

  const months = useMemo(() => {
    const m = [];
    let last = "";
    weeks.forEach((week, i) => {
      if (week[0]) {
        const mo = new Date(week[0].date).toLocaleString("en", { month: "short" });
        if (mo !== last) { m.push({ label: mo, index: i }); last = mo; }
      }
    });
    return m;
  }, [weeks]);

  return (
    <div>
      {/* Month labels */}
      <div className="flex mb-1" style={{ paddingLeft: 0 }}>
        {months.map((m, i) => (
          <span
            key={i}
            className="text-xs text-zinc-500"
            style={{ position: "relative", left: `${(m.index / 52) * 100}%`, width: 0, whiteSpace: "nowrap" }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="flex gap-px">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-px">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-2.5 h-2.5 rounded-sm ${levels[getLevel(day.count)]}`}
                title={`${day.date}: ${day.count} sessions`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-zinc-600">
        <span>Less</span>
        {levels.map((l, i) => (
          <div key={i} className={`w-2.5 h-2.5 rounded-sm ${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ── XP Progress ─────────────────────────────────────────────────────────────

function XPBar() {
  const range = USER.nextTier.xp - USER.currentTier.xp;
  const progress = USER.xp - USER.currentTier.xp;
  const pct = Math.min((progress / range) * 100, 100);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{USER.currentTier.name}</span>
          <span className="text-xs text-zinc-600">→</span>
          <span className="text-sm text-zinc-500">{USER.nextTier.name}</span>
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">
          {fmt(USER.xp)} / {fmt(USER.nextTier.xp)} XP
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: TIER_DOT[USER.tier] }}
        />
      </div>
    </div>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────────────

function Stat({ label, value, detail }) {
  return (
    <div className="py-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-zinc-100 tabular-nums">{value}</div>
      {detail && <div className="text-xs text-zinc-600 mt-0.5">{detail}</div>}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

function Badge({ badge }) {
  const dotColor = TIER_DOT[badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)] || TIER_DOT.Bronze;
  return (
    <div className={`p-3 rounded-lg border border-zinc-800 ${!badge.earned ? "opacity-50" : ""} hover:border-zinc-700 transition-colors`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-sm font-medium text-zinc-200">{badge.name}</span>
      </div>
      <div className="text-xs text-zinc-500 leading-relaxed">{badge.desc}</div>
      {badge.earned ? (
        <div className="text-xs text-zinc-600 mt-2">{badge.date}</div>
      ) : (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
            <span>Progress</span>
            <span className="tabular-nums">{badge.progress}%</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${badge.progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-zinc-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-zinc-200">
          {p.name}: <span className="font-medium tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function OrankDashboard() {
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "badges", label: "Badges" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "share", label: "Share" },
    { id: "data", label: "Your Data" },
  ];

  const earnedCount = BADGES.filter((b) => b.earned).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="border-b border-zinc-800/80">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold tracking-tight text-zinc-100">orank</span>
              <span className="text-xs text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">beta</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ backgroundColor: TIER_DOT[USER.tier] }}>
                {USER.name[0]}
              </div>
              <span className="text-zinc-300">{USER.name}</span>
              <span className="text-zinc-600 text-xs">#{USER.rank}</span>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-6 mt-4 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-sm pb-3 border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-zinc-100 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* ── Overview ────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-8">
            {/* XP */}
            <section className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg p-5">
              <XPBar />
            </section>

            {/* Key stats — a clean 4-column row */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800/40 rounded-lg overflow-hidden border border-zinc-800/60">
              <div className="bg-zinc-950 px-5">
                <Stat label="Total XP" value={fmt(USER.xp)} detail={USER.tier} />
              </div>
              <div className="bg-zinc-950 px-5">
                <Stat label="Rank" value={`#${USER.rank}`} detail={`of ${fmt(USER.totalUsers)}`} />
              </div>
              <div className="bg-zinc-950 px-5">
                <Stat label="Streak" value={`${USER.streak}d`} detail={`Best: ${USER.longestStreak}d`} />
              </div>
              <div className="bg-zinc-950 px-5">
                <Stat label="Sessions" value={fmt(USER.sessions)} detail={`${fmt(USER.hoursActive)}h active`} />
              </div>
            </section>

            {/* Activity graph */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-300">Activity</h2>
                <span className="text-xs text-zinc-600">Last 52 weeks</span>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg p-5 overflow-x-auto">
                <ContributionGraph />
              </div>
            </section>

            {/* Sessions trend + Tool breakdown side by side */}
            <div className="grid md:grid-cols-5 gap-6">
              {/* Weekly sessions chart — 3 cols */}
              <section className="md:col-span-3">
                <h2 className="text-sm font-medium text-zinc-300 mb-3">Weekly Sessions</h2>
                <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg p-5">
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={WEEKLY_ACTIVITY}>
                      <defs>
                        <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="week"
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={3}
                      />
                      <YAxis
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        stroke="#7c3aed"
                        strokeWidth={1.5}
                        fill="url(#gSess)"
                        name="Sessions"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Tool breakdown — 2 cols */}
              <section className="md:col-span-2">
                <h2 className="text-sm font-medium text-zinc-300 mb-3">Top Tools</h2>
                <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-lg p-5 space-y-3">
                  {TOOL_BREAKDOWN.map((t) => (
                    <div key={t.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-300 font-mono">{t.name}</span>
                        <span className="text-zinc-600 tabular-nums">{fmt(t.count)}</span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${t.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Recent badges (quick peek) */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-300">Recent Badges</h2>
                <button onClick={() => setTab("badges")} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  View all {BADGES.length} →
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {BADGES.filter((b) => b.earned).slice(-4).map((b) => (
                  <Badge key={b.id} badge={b} />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Badges ──────────────────────────────────────────── */}
        {tab === "badges" && (
          <div className="space-y-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-zinc-300">
                {earnedCount} of {BADGES.length} earned
              </h2>
              <span className="text-xs text-zinc-600 tabular-nums">
                {Math.round((earnedCount / BADGES.length) * 100)}% complete
              </span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden -mt-4">
              <div
                className="h-full bg-zinc-500 rounded-full transition-all"
                style={{ width: `${(earnedCount / BADGES.length) * 100}%` }}
              />
            </div>

            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Earned</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {BADGES.filter((b) => b.earned).map((b) => (
                  <Badge key={b.id} badge={b} />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">In Progress</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {BADGES.filter((b) => !b.earned).map((b) => (
                  <Badge key={b.id} badge={b} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Leaderboard ─────────────────────────────────────── */}
        {tab === "leaderboard" && (
          <div className="space-y-4">
            <div className="flex gap-3 text-xs">
              {["Global", "This Week", "This Month"].map((f, i) => (
                <button
                  key={f}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    i === 0
                      ? "bg-zinc-800 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="border border-zinc-800/60 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-600 uppercase tracking-wider border-b border-zinc-800/60 bg-zinc-900/30">
                    <th className="text-left px-5 py-3 font-medium w-16">Rank</th>
                    <th className="text-left px-5 py-3 font-medium">User</th>
                    <th className="text-left px-5 py-3 font-medium">Tier</th>
                    <th className="text-right px-5 py-3 font-medium">XP</th>
                    <th className="text-right px-5 py-3 font-medium">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERBOARD.map((row, i) =>
                    row.rank === "gap" ? (
                      <tr key={`gap-${i}`} className="text-zinc-700">
                        <td colSpan={5} className="text-center py-1 text-xs">···</td>
                      </tr>
                    ) : (
                      <tr
                        key={i}
                        className={`border-b border-zinc-800/40 transition-colors ${
                          row.isUser ? "bg-violet-500/5" : "hover:bg-zinc-900/50"
                        }`}
                      >
                        <td className="px-5 py-3 tabular-nums text-zinc-500">
                          {row.rank <= 3 ? (
                            <span className="font-medium text-zinc-300">{row.rank}</span>
                          ) : (
                            row.rank
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`font-medium ${row.isUser ? "text-violet-400" : "text-zinc-200"}`}>
                            {row.handle}
                          </span>
                          {row.isUser && <span className="text-xs text-zinc-600 ml-2">you</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TIER_DOT[row.tier] }} />
                            <span className="text-zinc-400 text-xs">{row.tier}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-zinc-400">{fmt(row.xp)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-zinc-500">{row.streak}d</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Share ────────────────────────────────────────────── */}
        {tab === "share" && (
          <div className="max-w-lg mx-auto space-y-8">
            {/* Profile card preview */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">Profile Card</h2>
              <div className="border border-zinc-800/60 rounded-lg p-5 bg-zinc-900/50">
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white shrink-0"
                    style={{ backgroundColor: TIER_DOT[USER.tier] }}
                  >
                    {USER.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100">{USER.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400">{USER.tier}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      #{USER.rank} · {fmt(USER.xp)} XP · {USER.streak}d streak
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {BADGES.filter((b) => b.earned).slice(0, 4).map((b) => (
                        <span
                          key={b.id}
                          className="w-5 h-5 rounded flex items-center justify-center text-xs bg-zinc-800 border border-zinc-700"
                          title={b.name}
                          style={{ color: TIER_DOT[b.tier.charAt(0).toUpperCase() + b.tier.slice(1)] }}
                        >
                          ●
                        </span>
                      ))}
                      {earnedCount > 4 && (
                        <span className="text-xs text-zinc-600">+{earnedCount - 4}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Embed codes */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">Embed</h2>
              <div className="space-y-4">
                {[
                  { label: "Markdown (GitHub README)", code: `[![orank](https://orank.me/badge/${USER.handle}.svg)](https://orank.me/u/${USER.handle})` },
                  { label: "HTML", code: `<a href="https://orank.me/u/${USER.handle}"><img src="https://orank.me/badge/${USER.handle}.svg" alt="orank" /></a>` },
                  { label: "Plain text (LinkedIn / X bio)", code: `orank.me/u/${USER.handle}` },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs text-zinc-500 mb-1.5">{item.label}</div>
                    <div className="font-mono text-xs bg-zinc-900 border border-zinc-800/60 rounded-lg px-4 py-2.5 text-zinc-400 break-all">
                      {item.code}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                className="flex-1 text-sm bg-zinc-100 text-zinc-900 py-2.5 rounded-lg font-medium hover:bg-white transition-colors"
                onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              >
                {copied ? "Copied!" : "Copy Profile Link"}
              </button>
              <button className="text-sm text-zinc-400 border border-zinc-800 py-2.5 px-4 rounded-lg hover:border-zinc-700 transition-colors">
                Download SVG
              </button>
            </div>

            {/* Visibility toggles */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">Visibility</h2>
              <div className="border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/60">
                {[
                  { label: "Public profile", desc: "orank.me/u/" + USER.handle, on: true },
                  { label: "Show on leaderboard", desc: "Appear in global rankings", on: true },
                  { label: "Display badges", desc: "Show earned badges on profile", on: true },
                  { label: "Activity heatmap", desc: "Show contribution graph publicly", on: false },
                ].map((opt, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-sm text-zinc-300">{opt.label}</div>
                      <div className="text-xs text-zinc-600">{opt.desc}</div>
                    </div>
                    <div
                      className={`w-8 h-5 rounded-full relative cursor-pointer transition-colors ${opt.on ? "bg-violet-600" : "bg-zinc-700"}`}
                    >
                      <div
                        className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${opt.on ? "right-0.5" : "left-0.5"}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Your Data ───────────────────────────────────────── */}
        {tab === "data" && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3 border border-emerald-900/40 bg-emerald-950/20 rounded-lg px-5 py-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-sm text-zinc-200">All data stays on your machine</div>
                <div className="text-xs text-zinc-500">Sync is disabled. Enable it to use the leaderboard and public profile.</div>
              </div>
            </div>

            {/* What's collected */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">What orank collects</h2>
              <div className="border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/40">
                {[
                  { label: "Session timestamps", desc: "When sessions start and end" },
                  { label: "Tool names & outcomes", desc: "Which tools ran, success or failure" },
                  { label: "Conversation turns", desc: "Number of exchanges per session" },
                  { label: "Working directory", desc: "Project folder path" },
                  { label: "Git branch", desc: "Active branch during session" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <div>
                      <span className="text-sm text-zinc-300">{item.label}</span>
                      <span className="text-xs text-zinc-600 ml-2">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Never collected */}
            <section>
              <h2 className="text-sm font-medium text-red-400/80 mb-3">Never collected</h2>
              <div className="border border-red-900/20 rounded-lg divide-y divide-red-900/10 bg-red-950/5">
                {[
                  { label: "Prompts or messages", desc: "What you type to Claude" },
                  { label: "Claude's responses", desc: "What Claude says back" },
                  { label: "File contents", desc: "Source code, documents, secrets" },
                  { label: "API keys or credentials", desc: "Anything auth-related" },
                  { label: "Personal information", desc: "Unless you explicitly opt in" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-800/60 shrink-0" />
                    <div>
                      <span className="text-sm text-zinc-300">{item.label}</span>
                      <span className="text-xs text-zinc-600 ml-2">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Storage */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">Storage</h2>
              <div className="border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/40">
                {[
                  { label: "Database", value: "~/.claude/plugins/data/orank/orank.db" },
                  { label: "Size", value: "142.3 KB" },
                  { label: "Sessions", value: fmt(USER.sessions) },
                  { label: "Tool events", value: fmt(USER.toolUses) },
                  { label: "Tracking since", value: USER.joinDate },
                  { label: "Network", value: "Offline only" },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between px-5 py-2.5 text-sm">
                    <span className="text-zinc-500">{item.label}</span>
                    <span className="text-zinc-300 font-mono text-xs">{item.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Actions */}
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-3">Data controls</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Export", desc: "/orank export", danger: false },
                  { label: "Pause", desc: "/orank pause", danger: false },
                  { label: "Resume", desc: "/orank resume", danger: false },
                  { label: "Delete all", desc: "/orank purge", danger: true },
                ].map((a) => (
                  <button
                    key={a.label}
                    className={`text-left px-4 py-3 rounded-lg border transition-colors text-sm ${
                      a.danger
                        ? "border-red-900/30 text-red-400 hover:bg-red-950/20"
                        : "border-zinc-800/60 text-zinc-300 hover:bg-zinc-900/50"
                    }`}
                  >
                    <div className="font-medium">{a.label}</div>
                    <div className={`text-xs mt-0.5 font-mono ${a.danger ? "text-red-800" : "text-zinc-600"}`}>{a.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            <div className="text-center text-xs text-zinc-700 py-2">
              orank is open source · github.com/sedhuait/orank
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-zinc-700">
          orank v0.1 · Data captured locally via Claude Code hooks · Sync coming soon
        </div>
      </footer>
    </div>
  );
}
