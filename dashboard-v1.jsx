import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from "recharts";

// ── Sample Data ──────────────────────────────────────────────────────────────
const USER = {
  name: "Sedhu",
  handle: "@sedhu",
  avatar: "S",
  tier: "Platinum",
  xp: 14750,
  nextTierXP: 20000,
  rank: 42,
  totalUsers: 12847,
  streak: 23,
  longestStreak: 45,
  joinDate: "Nov 2024",
  totalConversations: 1284,
  totalTokens: "4.2M",
  codeAcceptRate: 87,
  topModel: "Claude Sonnet 4",
  claudeCodeHours: 312,
  claudeChatHours: 148,
};

const BADGES = [
  { id: 1, name: "Early Adopter", icon: "🚀", desc: "Used Claude within first 30 days of launch", earned: true, tier: "gold", date: "Nov 2024" },
  { id: 2, name: "Token Titan", icon: "⚡", desc: "Used over 1M tokens total", earned: true, tier: "gold", date: "Feb 2025" },
  { id: 3, name: "Streak Master", icon: "🔥", desc: "Maintained a 30+ day streak", earned: true, tier: "silver", date: "Mar 2025" },
  { id: 4, name: "Model Explorer", icon: "🧪", desc: "Used all available Claude models", earned: true, tier: "gold", date: "Jan 2025" },
  { id: 5, name: "Code Wizard", icon: "🧙", desc: "Accepted 500+ code suggestions", earned: true, tier: "silver", date: "Apr 2025" },
  { id: 6, name: "Night Owl", icon: "🦉", desc: "Coded with Claude after midnight 50+ times", earned: true, tier: "bronze", date: "May 2025" },
  { id: 7, name: "Prompt Artisan", icon: "🎨", desc: "Average prompt efficiency score > 90%", earned: true, tier: "gold", date: "Jun 2025" },
  { id: 8, name: "Bug Slayer", icon: "🐛", desc: "Used Claude to fix 100+ bugs", earned: false, tier: "silver", progress: 78 },
  { id: 9, name: "Marathon Coder", icon: "🏃", desc: "Logged 500+ hours with Claude Code", earned: false, tier: "gold", progress: 62 },
  { id: 10, name: "Feature Hunter", icon: "🎯", desc: "Explored all Claude features & tools", earned: false, tier: "platinum", progress: 85 },
  { id: 11, name: "Community Star", icon: "⭐", desc: "Shared profile badge 10+ times", earned: false, tier: "bronze", progress: 40 },
  { id: 12, name: "Opus Master", icon: "👑", desc: "Completed 100+ Opus conversations", earned: false, tier: "platinum", progress: 55 },
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

const WEEKLY_TOKENS = Array.from({ length: 12 }, (_, i) => ({
  week: `W${i + 1}`,
  input: Math.floor(Math.random() * 300000 + 100000),
  output: Math.floor(Math.random() * 200000 + 50000),
}));

const MODEL_USAGE = [
  { name: "Sonnet 4", value: 45, color: "#8b5cf6" },
  { name: "Opus 4", value: 25, color: "#f59e0b" },
  { name: "Haiku 4", value: 20, color: "#10b981" },
  { name: "Sonnet 3.5", value: 10, color: "#6366f1" },
];

const EFFICIENCY_DATA = [
  { metric: "Prompt Quality", value: 92, fullMark: 100 },
  { metric: "Code Accept", value: 87, fullMark: 100 },
  { metric: "Context Usage", value: 78, fullMark: 100 },
  { metric: "Token Efficiency", value: 85, fullMark: 100 },
  { metric: "Feature Breadth", value: 71, fullMark: 100 },
  { metric: "Streak Score", value: 88, fullMark: 100 },
];

const LEADERBOARD = [
  { rank: 1, name: "alex_dev", xp: 22400, tier: "Diamond", streak: 67, badge: "💎" },
  { rank: 2, name: "mira_codes", xp: 21100, tier: "Diamond", streak: 54, badge: "💎" },
  { rank: 3, name: "tensor_jay", xp: 19800, tier: "Platinum", streak: 41, badge: "🏆" },
  { rank: "...", name: "", xp: "", tier: "", streak: "", badge: "" },
  { rank: 41, name: "cloud_nina", xp: 14900, tier: "Platinum", streak: 28, badge: "🏆" },
  { rank: 42, name: "sedhu", xp: 14750, tier: "Platinum", streak: 23, badge: "🏆", isUser: true },
  { rank: 43, name: "byte_wolf", xp: 14600, tier: "Platinum", streak: 19, badge: "🏆" },
  { rank: "...", name: "", xp: "", tier: "", streak: "", badge: "" },
  { rank: 100, name: "neo_smith", xp: 9200, tier: "Gold", streak: 12, badge: "🥇" },
];

const HOURLY_ACTIVITY = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  claude: Math.floor(Math.random() * 40 + (i > 8 && i < 22 ? 30 : 5)),
  claudeCode: Math.floor(Math.random() * 50 + (i > 9 && i < 20 ? 40 : 3)),
}));

// ── Tier Colors ──────────────────────────────────────────────────────────────
const TIER_COLORS = {
  bronze: { bg: "bg-amber-900/30", text: "text-amber-400", border: "border-amber-700" },
  silver: { bg: "bg-gray-500/20", text: "text-gray-300", border: "border-gray-500" },
  gold: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-600" },
  platinum: { bg: "bg-purple-500/20", text: "text-purple-300", border: "border-purple-500" },
  diamond: { bg: "bg-cyan-500/20", text: "text-cyan-300", border: "border-cyan-500" },
};

const TIER_THRESHOLDS = [
  { name: "Bronze", min: 0, color: "#cd7f32" },
  { name: "Silver", min: 2000, color: "#9ca3af" },
  { name: "Gold", min: 5000, color: "#eab308" },
  { name: "Platinum", min: 10000, color: "#a78bfa" },
  { name: "Diamond", min: 20000, color: "#22d3ee" },
];

// ── Components ───────────────────────────────────────────────────────────────

function ContributionGraph() {
  const getColor = (count) => {
    if (count === 0) return "bg-gray-800";
    if (count <= 1) return "bg-emerald-900";
    if (count <= 3) return "bg-emerald-700";
    if (count <= 5) return "bg-emerald-500";
    return "bg-emerald-400";
  };

  const weeks = [];
  for (let w = 0; w <= 51; w++) {
    weeks.push(CONTRIBUTION_DATA.filter((d) => d.week === w));
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-2.5 h-2.5 rounded-sm ${getColor(day.count)} hover:ring-1 hover:ring-white/40 cursor-pointer transition-all`}
                title={`${day.date}: ${day.count} sessions`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
        <span>Less</span>
        <div className="w-2.5 h-2.5 rounded-sm bg-gray-800" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-900" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-700" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  );
}

function BadgeCard({ badge }) {
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.bronze;
  return (
    <div className={`relative p-3 rounded-xl border ${tier.border} ${tier.bg} ${!badge.earned ? "opacity-60" : ""} hover:scale-105 transition-transform cursor-pointer`}>
      <div className="text-2xl mb-1">{badge.icon}</div>
      <div className={`text-xs font-bold ${tier.text}`}>{badge.name}</div>
      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{badge.desc}</div>
      {badge.earned ? (
        <div className="text-xs text-gray-500 mt-1">{badge.date}</div>
      ) : (
        <div className="mt-1.5">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" style={{ width: `${badge.progress}%` }} />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{badge.progress}%</div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 hover:border-purple-500/40 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs uppercase tracking-wider">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function XPProgressBar() {
  const pct = (USER.xp / USER.nextTierXP) * 100;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-purple-400 font-semibold">{USER.tier}</span>
        <span className="text-gray-400">{USER.xp.toLocaleString()} / {USER.nextTierXP.toLocaleString()} XP</span>
        <span className="text-cyan-400 font-semibold">Diamond</span>
      </div>
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-gradient-to-r from-purple-600 via-purple-400 to-cyan-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
        {TIER_THRESHOLDS.map((t) => {
          const pos = (t.min / USER.nextTierXP) * 100;
          if (pos <= 0 || pos >= 100) return null;
          return <div key={t.name} className="absolute top-0 h-full w-px bg-gray-600" style={{ left: `${pos}%` }} />;
        })}
      </div>
      <div className="flex justify-between mt-1">
        {TIER_THRESHOLDS.map((t) => (
          <span key={t.name} className="text-xs" style={{ color: t.color }}>{t.name}</span>
        ))}
      </div>
    </div>
  );
}

function ShareBadge() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-gradient-to-br from-gray-900 via-purple-950/30 to-gray-900 border border-purple-500/30 rounded-2xl p-5">
      <div className="text-xs text-purple-400 uppercase tracking-wider mb-3 font-semibold">Shareable Profile Badge</div>
      <div className="bg-gray-950/80 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-xl font-bold text-white shrink-0">
          {USER.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{USER.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              🏆 {USER.tier}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              ✓ Verified
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Rank #{USER.rank} · {USER.xp.toLocaleString()} XP · 🔥 {USER.streak}-day streak
          </div>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {BADGES.filter((b) => b.earned).slice(0, 5).map((b) => (
              <span key={b.id} className="text-sm" title={b.name}>{b.icon}</span>
            ))}
            <span className="text-xs text-gray-500">+{BADGES.filter((b) => b.earned).length - 5} more</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 text-xs bg-purple-600 hover:bg-purple-500 text-white py-2 px-3 rounded-lg transition-colors font-medium"
          onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        >
          {copied ? "✓ Link Copied!" : "Copy Share Link"}
        </button>
        <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg transition-colors">
          Embed Badge
        </button>
        <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg transition-colors">
          Download SVG
        </button>
      </div>
      <div className="mt-2 text-xs text-gray-600 font-mono bg-gray-900/50 rounded-lg px-3 py-1.5 truncate">
        orank.me/u/sedhu · Embed: &lt;img src="orank.me/badge/sedhu.svg" /&gt;
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function orankDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "badges", label: "Badges", icon: "🏅" },
    { id: "leaderboard", label: "Leaderboard", icon: "🏆" },
    { id: "share", label: "Share Profile", icon: "🔗" },
    { id: "privacy", label: "Your Data", icon: "🔒" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-950/60 via-gray-900 to-cyan-950/40 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-black bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                orank
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                BETA
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-800/60 rounded-full px-3 py-1.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-xs font-bold">
                  {USER.avatar}
                </div>
                <span className="text-sm font-medium">{USER.name}</span>
                <span className="text-xs text-purple-400">#{USER.rank}</span>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-purple-600/30 text-purple-300 border border-purple-500/30"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Overview Tab ─────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* XP Bar */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <XPProgressBar />
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total XP" value={USER.xp.toLocaleString()} sub="Platinum Tier" icon="⚡" />
              <StatCard label="Global Rank" value={`#${USER.rank}`} sub={`of ${USER.totalUsers.toLocaleString()}`} icon="🌍" />
              <StatCard label="Current Streak" value={`${USER.streak} days`} sub={`Best: ${USER.longestStreak} days`} icon="🔥" />
              <StatCard label="Total Tokens" value={USER.totalTokens} sub="Across all models" icon="💬" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Conversations" value={USER.totalConversations.toLocaleString()} icon="📝" />
              <StatCard label="Code Accept Rate" value={`${USER.codeAcceptRate}%`} icon="✅" />
              <StatCard label="Claude Code Hours" value={USER.claudeCodeHours} sub="Since joining" icon="💻" />
              <StatCard label="Top Model" value={USER.topModel} icon="🧠" />
            </div>

            {/* Contribution Graph */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">Claude Activity — Last 52 Weeks</div>
              <ContributionGraph />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Token Usage */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-300 mb-3">Weekly Token Usage</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={WEEKLY_TOKENS}>
                    <defs>
                      <linearGradient id="gInput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="input" stroke="#8b5cf6" fill="url(#gInput)" name="Input Tokens" />
                    <Area type="monotone" dataKey="output" stroke="#22d3ee" fill="url(#gOutput)" name="Output Tokens" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Efficiency Radar */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-300 mb-3">Efficiency Score Breakdown</div>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={EFFICIENCY_DATA}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} domain={[0, 100]} axisLine={false} />
                    <Radar name="Score" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Charts */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Model Distribution */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-300 mb-3">Model Usage Distribution</div>
                <div className="flex items-center">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie data={MODEL_USAGE} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                        {MODEL_USAGE.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2">
                    {MODEL_USAGE.map((m) => (
                      <div key={m.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-gray-300">{m.name}</span>
                        <span className="text-gray-500">{m.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity by Hour */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                <div className="text-sm font-semibold text-gray-300 mb-3">Activity by Hour (Claude vs Claude Code)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={HOURLY_ACTIVITY} barGap={0}>
                    <XAxis dataKey="hour" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="claude" fill="#8b5cf6" radius={[2, 2, 0, 0]} name="Claude" />
                    <Bar dataKey="claudeCode" fill="#22d3ee" radius={[2, 2, 0, 0]} name="Claude Code" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── Badges Tab ──────────────────────────────────────── */}
        {activeTab === "badges" && (
          <div className="space-y-6">
            <div>
              <div className="text-sm font-semibold text-gray-300 mb-1">Earned Badges ({BADGES.filter((b) => b.earned).length}/{BADGES.length})</div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full"
                  style={{ width: `${(BADGES.filter((b) => b.earned).length / BADGES.length) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {BADGES.filter((b) => b.earned).map((b) => (
                  <BadgeCard key={b.id} badge={b} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-400 mb-3">In Progress</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {BADGES.filter((b) => !b.earned).map((b) => (
                  <BadgeCard key={b.id} badge={b} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Leaderboard Tab ─────────────────────────────────── */}
        {activeTab === "leaderboard" && (
          <div className="space-y-4">
            <div className="flex gap-2 text-xs">
              {["Global", "Claude Code", "Claude Chat", "This Week"].map((f, i) => (
                <button
                  key={f}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    i === 0 ? "bg-purple-600/30 text-purple-300 border border-purple-500/30" : "text-gray-400 bg-gray-800/40 hover:bg-gray-700/40"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                    <th className="text-left px-4 py-3">Rank</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Tier</th>
                    <th className="text-right px-4 py-3">XP</th>
                    <th className="text-right px-4 py-3">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERBOARD.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-gray-800/50 ${
                        row.isUser ? "bg-purple-500/10 border-l-2 border-l-purple-500" : ""
                      } ${row.rank === "..." ? "text-gray-600" : "hover:bg-gray-800/30"}`}
                    >
                      <td className="px-4 py-3 font-mono">
                        {row.rank === 1 && "🥇"}
                        {row.rank === 2 && "🥈"}
                        {row.rank === 3 && "🥉"}
                        {typeof row.rank === "number" && row.rank > 3 && `#${row.rank}`}
                        {row.rank === "..." && "···"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={row.isUser ? "text-purple-300 font-semibold" : "text-gray-300"}>
                          {row.name}
                          {row.isUser && " (You)"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.badge} <span className="text-gray-400">{row.tier}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        {typeof row.xp === "number" ? row.xp.toLocaleString() : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.streak ? `🔥 ${row.streak}d` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Share Profile Tab ───────────────────────────────── */}
        {activeTab === "share" && (
          <div className="max-w-xl mx-auto space-y-6">
            <ShareBadge />

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">Embed Options</div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Markdown (GitHub README)</div>
                  <div className="font-mono text-xs bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-green-400">
                    [![orank](https://orank.me/badge/sedhu.svg)](https://orank.me/u/sedhu)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">HTML</div>
                  <div className="font-mono text-xs bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-green-400">
                    {'<a href="https://orank.me/u/sedhu"><img src="https://orank.me/badge/sedhu.svg" alt="orank" /></a>'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">LinkedIn / X Bio</div>
                  <div className="font-mono text-xs bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-green-400">
                    🏆 orank Platinum #42 | orank.me/u/sedhu
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">Profile Visibility</div>
              <div className="space-y-2">
                {["Show on public leaderboard", "Display badges on profile", "Show token usage stats", "Show activity heatmap"].map((opt, i) => (
                  <label key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-400">{opt}</span>
                    <div className={`w-9 h-5 rounded-full ${i < 3 ? "bg-purple-600" : "bg-gray-700"} relative cursor-pointer transition-colors`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${i < 3 ? "right-1" : "left-1"}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Your Data / Privacy Tab ────────────────────────── */}
        {activeTab === "privacy" && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Status Banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="text-2xl">🟢</div>
              <div>
                <div className="text-sm font-semibold text-emerald-400">All data is local — nothing leaves your machine</div>
                <div className="text-xs text-gray-400">Remote sync is disabled. Enable it in settings to use leaderboards.</div>
              </div>
            </div>

            {/* What We Collect */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">What orank collects</div>
              <div className="space-y-2">
                {[
                  { icon: "✅", label: "Session timestamps", desc: "When you start and stop a Claude Code session" },
                  { icon: "✅", label: "Tool names", desc: "Which tools Claude used (Read, Edit, Bash, etc.)" },
                  { icon: "✅", label: "Tool success/failure", desc: "Whether each tool call succeeded or failed" },
                  { icon: "✅", label: "Conversation turns", desc: "Number of back-and-forth exchanges per session" },
                  { icon: "✅", label: "Project path", desc: "Which folder you were working in" },
                  { icon: "✅", label: "Git branch", desc: "Which branch was active during the session" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="text-sm shrink-0">{item.icon}</span>
                    <div>
                      <span className="text-sm text-gray-200">{item.label}</span>
                      <span className="text-xs text-gray-500 ml-2">— {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What We NEVER Collect */}
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
              <div className="text-sm font-semibold text-red-400 mb-3">What orank NEVER collects</div>
              <div className="space-y-2">
                {[
                  { icon: "❌", label: "Your prompts or messages", desc: "We never read what you type to Claude" },
                  { icon: "❌", label: "Claude's responses", desc: "We never read what Claude says back to you" },
                  { icon: "❌", label: "File contents or source code", desc: "We log file paths only, never contents" },
                  { icon: "❌", label: "API keys or secrets", desc: "We never access your credentials" },
                  { icon: "❌", label: "Personal information", desc: "No name, email, or IP unless you explicitly opt in" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="text-sm shrink-0">{item.icon}</span>
                    <div>
                      <span className="text-sm text-gray-200">{item.label}</span>
                      <span className="text-xs text-gray-500 ml-2">— {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Storage Info */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">Where your data lives</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">Database</span>
                  <span className="font-mono text-xs text-gray-300">~/.claude/plugins/data/orank/orank.db</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">Size</span>
                  <span className="text-gray-300">142.3 KB</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">Sessions recorded</span>
                  <span className="text-gray-300">1,284</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">Tool events logged</span>
                  <span className="text-gray-300">23,471</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">Tracking since</span>
                  <span className="text-gray-300">Nov 2024</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">Network status</span>
                  <span className="text-emerald-400 font-medium">Offline only (sync disabled)</span>
                </div>
              </div>
            </div>

            {/* Your Rights / Actions */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm font-semibold text-gray-300 mb-3">Your data rights</div>
              <div className="grid grid-cols-2 gap-2">
                <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2.5 px-3 rounded-lg transition-colors text-left">
                  <span className="block font-medium">Export all data</span>
                  <span className="text-gray-400">/orank export — full JSON dump</span>
                </button>
                <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2.5 px-3 rounded-lg transition-colors text-left">
                  <span className="block font-medium">Pause tracking</span>
                  <span className="text-gray-400">/orank pause — stop recording</span>
                </button>
                <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2.5 px-3 rounded-lg transition-colors text-left">
                  <span className="block font-medium">Resume tracking</span>
                  <span className="text-gray-400">/orank resume — start again</span>
                </button>
                <button className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-300 py-2.5 px-3 rounded-lg transition-colors text-left border border-red-500/20">
                  <span className="block font-medium">Delete all data</span>
                  <span className="text-red-400/60">/orank purge — permanent wipe</span>
                </button>
              </div>
            </div>

            <div className="text-center text-xs text-gray-600 py-2">
              orank is open source · <span className="text-purple-400">github.com/sedhuait/orank</span> · Privacy policy at <span className="text-purple-400">orank.me/privacy</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 mt-8 pb-4">
          orank v0.1 Beta · Built as a Claude Code Plugin + Web Dashboard · Data captured locally via Claude Code hooks · Sync to orank.me coming soon
        </div>
      </div>
    </div>
  );
}