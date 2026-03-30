import {
  THRESHOLD_COMMON,
  THRESHOLD_MODERATE,
  THRESHOLD_RARE,
  TIER_ICONS,
  TIER_LABELS,
  TIER_NAMES,
  generateDynamicBadges,
  getCurrentTier,
  getNextBadges,
  getNextTierProgress,
  selectThresholds,
} from "../scripts/dynamic-badges.js";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("TIER_NAMES", () => {
  test("has exactly 5 elements", () => {
    expect(TIER_NAMES).toHaveLength(5);
  });

  test("elements are in correct order", () => {
    expect(TIER_NAMES).toEqual(["bronze", "silver", "gold", "platinum", "diamond"]);
  });
});

describe("TIER_LABELS", () => {
  test("has exactly 5 elements", () => {
    expect(TIER_LABELS).toHaveLength(5);
  });

  test("elements are in correct order", () => {
    expect(TIER_LABELS).toEqual(["Novice", "Adept", "Master", "Virtuoso", "Legend"]);
  });
});

describe("TIER_ICONS", () => {
  test("has an entry for every tier name", () => {
    for (const tier of TIER_NAMES) {
      expect(TIER_ICONS).toHaveProperty(tier);
      expect(typeof TIER_ICONS[tier]).toBe("string");
    }
  });
});

describe("Threshold arrays", () => {
  const tables = { THRESHOLD_COMMON, THRESHOLD_MODERATE, THRESHOLD_RARE };

  for (const [name, table] of Object.entries(tables)) {
    describe(name, () => {
      test("has exactly 5 elements", () => {
        expect(table).toHaveLength(5);
      });

      test("is monotonically increasing", () => {
        for (let i = 1; i < table.length; i++) {
          expect(table[i]).toBeGreaterThan(table[i - 1]);
        }
      });
    });
  }

  test("THRESHOLD_COMMON > THRESHOLD_MODERATE at every index", () => {
    for (let i = 0; i < 5; i++) {
      expect(THRESHOLD_COMMON[i]).toBeGreaterThan(THRESHOLD_MODERATE[i]);
    }
  });

  test("THRESHOLD_MODERATE > THRESHOLD_RARE at every index", () => {
    for (let i = 0; i < 5; i++) {
      expect(THRESHOLD_MODERATE[i]).toBeGreaterThan(THRESHOLD_RARE[i]);
    }
  });
});

// ── selectThresholds ──────────────────────────────────────────────────────────

describe("selectThresholds", () => {
  test("returns THRESHOLD_RARE when totalCount is 0", () => {
    expect(selectThresholds(0, 0)).toBe(THRESHOLD_RARE);
    expect(selectThresholds(100, 0)).toBe(THRESHOLD_RARE);
  });

  test("returns THRESHOLD_COMMON when share > 10% (200/1000 = 20%)", () => {
    expect(selectThresholds(200, 1000)).toBe(THRESHOLD_COMMON);
  });

  test("returns THRESHOLD_MODERATE when share is 5% (50/1000)", () => {
    expect(selectThresholds(50, 1000)).toBe(THRESHOLD_MODERATE);
  });

  test("returns THRESHOLD_RARE when share < 1% (5/1000 = 0.5%)", () => {
    expect(selectThresholds(5, 1000)).toBe(THRESHOLD_RARE);
  });

  test("boundary: exactly 10% returns MODERATE (>10, not >=10)", () => {
    // 100/1000 = exactly 10%, which is NOT >10, so MODERATE
    expect(selectThresholds(100, 1000)).toBe(THRESHOLD_MODERATE);
  });

  test("boundary: exactly 1% returns MODERATE (>=1)", () => {
    // 10/1000 = exactly 1%, which satisfies >=1, so MODERATE
    expect(selectThresholds(10, 1000)).toBe(THRESHOLD_MODERATE);
  });

  test("returns THRESHOLD_COMMON when share is just above 10%", () => {
    // 101/1000 = 10.1% -> COMMON
    expect(selectThresholds(101, 1000)).toBe(THRESHOLD_COMMON);
  });

  test("returns THRESHOLD_RARE when share is just below 1%", () => {
    // 9/1000 = 0.9% -> RARE
    expect(selectThresholds(9, 1000)).toBe(THRESHOLD_RARE);
  });
});

// ── getCurrentTier ────────────────────────────────────────────────────────────

describe("getCurrentTier", () => {
  const thresholds = [10, 100, 500, 1000, 5000];

  test("returns null when count is 0", () => {
    expect(getCurrentTier(0, thresholds)).toBeNull();
  });

  test("returns null when count is below first threshold", () => {
    expect(getCurrentTier(9, thresholds)).toBeNull();
  });

  test("returns 'bronze' when count equals first threshold (10)", () => {
    expect(getCurrentTier(10, thresholds)).toBe("bronze");
  });

  test("returns 'bronze' for a count between bronze and silver", () => {
    expect(getCurrentTier(50, thresholds)).toBe("bronze");
  });

  test("returns 'silver' when count equals second threshold (100)", () => {
    expect(getCurrentTier(100, thresholds)).toBe("silver");
  });

  test("returns 'silver' for count=150 (between silver and gold)", () => {
    expect(getCurrentTier(150, thresholds)).toBe("silver");
  });

  test("returns 'gold' when count equals third threshold (500)", () => {
    expect(getCurrentTier(500, thresholds)).toBe("gold");
  });

  test("returns 'platinum' when count equals fourth threshold (1000)", () => {
    expect(getCurrentTier(1000, thresholds)).toBe("platinum");
  });

  test("returns 'diamond' when count equals fifth threshold (5000)", () => {
    expect(getCurrentTier(5000, thresholds)).toBe("diamond");
  });

  test("returns 'diamond' when count exceeds all thresholds", () => {
    expect(getCurrentTier(99999, thresholds)).toBe("diamond");
  });
});

// ── getNextTierProgress ───────────────────────────────────────────────────────

describe("getNextTierProgress", () => {
  const thresholds = [10, 100, 500, 1000, 5000];

  test("at count=0: next tier is 'bronze', progress=0, needed=10", () => {
    const result = getNextTierProgress(0, thresholds);
    expect(result.nextTier).toBe("bronze");
    expect(result.progress).toBe(0);
    expect(result.needed).toBe(10);
  });

  test("at count=5: progress toward bronze is 50%, needed=5", () => {
    const result = getNextTierProgress(5, thresholds);
    expect(result.nextTier).toBe("bronze");
    expect(result.progress).toBe(50);
    expect(result.needed).toBe(5);
  });

  test("between bronze and silver: returns 'silver' as next tier", () => {
    // count=10 meets bronze; next is silver (thresholds[1]=100)
    // range = 100-10=90, count-prev=10-10=0, progress=0
    const result = getNextTierProgress(10, thresholds);
    expect(result.nextTier).toBe("silver");
    expect(result.needed).toBe(90);
  });

  test("midway between bronze and silver: correct progress percentage", () => {
    // count=55; range bronze→silver = 100-10=90; progress=(55-10)/90 = 50%
    const result = getNextTierProgress(55, thresholds);
    expect(result.nextTier).toBe("silver");
    expect(result.progress).toBe(50);
    expect(result.needed).toBe(45);
  });

  test("at count=100: next is 'gold', needed=400", () => {
    const result = getNextTierProgress(100, thresholds);
    expect(result.nextTier).toBe("gold");
    expect(result.needed).toBe(400);
  });

  test("all tiers earned: nextTier=null, progress=100, needed=0", () => {
    const result = getNextTierProgress(5000, thresholds);
    expect(result.nextTier).toBeNull();
    expect(result.progress).toBe(100);
    expect(result.needed).toBe(0);
  });

  test("count exceeds all thresholds: nextTier=null", () => {
    const result = getNextTierProgress(99999, thresholds);
    expect(result.nextTier).toBeNull();
    expect(result.progress).toBe(100);
    expect(result.needed).toBe(0);
  });

  test("progress is capped at 100", () => {
    // Just below second threshold with count at first threshold exactly
    // count=10 toward silver: progress=0, but verify Math.min(100, ...) is in play
    // Use a case where rounding might exceed: count=99 toward silver (threshold=100)
    // range=90, progress=(99-10)/90 * 100 = 98.89 -> rounds to 99
    const result = getNextTierProgress(99, thresholds);
    expect(result.progress).toBeLessThanOrEqual(100);
  });
});

// ── generateDynamicBadges ─────────────────────────────────────────────────────

describe("generateDynamicBadges", () => {
  test("returns empty array for empty tracks", () => {
    expect(generateDynamicBadges({}, 1000, 500)).toEqual([]);
  });

  test("single tool track generates exactly 5 badges", () => {
    const tracks = { "tool:Edit": { count: 0 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    expect(badges).toHaveLength(5);
  });

  test("badge IDs follow format 'dynamic:tool:Edit:bronze' etc.", () => {
    const tracks = { "tool:Edit": { count: 0 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const ids = badges.map((b) => b.id);
    expect(ids).toEqual([
      "dynamic:tool:Edit:bronze",
      "dynamic:tool:Edit:silver",
      "dynamic:tool:Edit:gold",
      "dynamic:tool:Edit:platinum",
      "dynamic:tool:Edit:diamond",
    ]);
  });

  test("tool names do NOT have '/' prefix", () => {
    const tracks = { "tool:Bash": { count: 5 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    for (const badge of badges) {
      expect(badge.name).not.toMatch(/^\//);
    }
  });

  test("command names DO have '/' prefix", () => {
    const tracks = { "cmd:commit": { count: 5 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    for (const badge of badges) {
      expect(badge.name).toMatch(/^\/commit /);
    }
  });

  test("command badge name is '/commit Novice' for bronze tier", () => {
    const tracks = { "cmd:commit": { count: 5 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const bronze = badges.find((b) => b.tier === "bronze");
    expect(bronze.name).toBe("/commit Novice");
  });

  test("tool badge name is 'Edit Novice' for bronze tier", () => {
    const tracks = { "tool:Edit": { count: 50 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const bronze = badges.find((b) => b.tier === "bronze");
    expect(bronze.name).toBe("Edit Novice");
  });

  test("earned=true when count >= threshold", () => {
    // count=200 with totalToolCount=1000 -> share=20% -> COMMON thresholds [10,100,500,...]
    // bronze threshold=10, silver=100 -> both earned
    const tracks = { "tool:Edit": { count: 200 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const bronze = badges.find((b) => b.tier === "bronze");
    const silver = badges.find((b) => b.tier === "silver");
    const gold = badges.find((b) => b.tier === "gold");
    expect(bronze.earned).toBe(true);
    expect(silver.earned).toBe(true);
    expect(gold.earned).toBe(false);
  });

  test("needed=0 for earned badges", () => {
    const tracks = { "tool:Edit": { count: 200 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const bronze = badges.find((b) => b.tier === "bronze");
    expect(bronze.needed).toBe(0);
  });

  test("needed=threshold-count for unearned badges", () => {
    // count=200 with COMMON thresholds -> gold threshold=500, needed=300
    const tracks = { "tool:Edit": { count: 200 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const gold = badges.find((b) => b.tier === "gold");
    expect(gold.needed).toBe(300);
  });

  test("progress=100 for earned badges", () => {
    const tracks = { "tool:Edit": { count: 200 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const silver = badges.find((b) => b.tier === "silver");
    expect(silver.progress).toBe(100);
  });

  test("progress>0 for unearned badge when count > prevThreshold", () => {
    // count=200, COMMON: gold threshold=500, prev=100; progress=(200-100)/(500-100)*100=25
    const tracks = { "tool:Edit": { count: 200 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    const gold = badges.find((b) => b.tier === "gold");
    expect(gold.progress).toBe(25);
  });

  test("bronze progress uses count/threshold*100 when count<bronze threshold", () => {
    // count=50, totalToolCount=1000 -> share=5% -> MODERATE thresholds [5,50,200,500,2000]
    // bronze threshold=5 (earned), silver threshold=50 (earned at 50)
    // Use count=3 with COMMON thresholds: need share>10% -> count/total > 10%
    // count=300/1000 = 30% -> COMMON, bronze threshold=10; 3 < 10 -> progress=3/10*100=30
    const tracks = { "tool:Edit": { count: 3 } };
    const badges = generateDynamicBadges(tracks, 10, 500);
    // share = 3/10 = 30% -> COMMON, bronze threshold=10
    const bronze = badges.find((b) => b.tier === "bronze");
    expect(bronze.threshold).toBe(10); // verify COMMON was selected
    expect(bronze.progress).toBe(30);
    expect(bronze.earned).toBe(false);
  });

  test("uses totalToolCount (not totalCommandCount) for tool tracks", () => {
    // count=200, totalToolCount=1000 -> share=20% -> COMMON
    // count=200, totalCommandCount=100 -> if wrongly used, share=200% (still COMMON here)
    // Use a case that distinguishes: count=10, totalToolCount=500 (2% -> MODERATE), totalCommandCount=50 (20% -> COMMON)
    const tracks = { "tool:Read": { count: 10 } };
    const badgesWithToolTotal = generateDynamicBadges(tracks, 500, 50);
    // share with totalToolCount=500 -> 2% -> MODERATE thresholds [5,50,200,500,2000]
    // bronze threshold=5, earned; silver threshold=50, needed=40
    const silver = badgesWithToolTotal.find((b) => b.tier === "silver");
    expect(silver.threshold).toBe(50); // MODERATE
    expect(silver.needed).toBe(40);
  });

  test("uses totalCommandCount (not totalToolCount) for cmd tracks", () => {
    // count=10, totalCommandCount=500 (2% -> MODERATE), totalToolCount=50 (20% -> COMMON)
    const tracks = { "cmd:commit": { count: 10 } };
    const badges = generateDynamicBadges(tracks, 50, 500);
    // share with totalCommandCount=500 -> 2% -> MODERATE thresholds [5,50,200,500,2000]
    const silver = badges.find((b) => b.tier === "silver");
    expect(silver.threshold).toBe(50); // MODERATE
  });

  test("multiple tracks generate 5 badges each", () => {
    const tracks = {
      "tool:Edit": { count: 10 },
      "tool:Bash": { count: 20 },
      "cmd:commit": { count: 5 },
    };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    expect(badges).toHaveLength(15);
  });

  test("badge objects have required properties", () => {
    const tracks = { "tool:Edit": { count: 50 } };
    const badges = generateDynamicBadges(tracks, 1000, 500);
    for (const badge of badges) {
      expect(badge).toHaveProperty("id");
      expect(badge).toHaveProperty("name");
      expect(badge).toHaveProperty("description");
      expect(badge).toHaveProperty("icon");
      expect(badge).toHaveProperty("tier");
      expect(badge).toHaveProperty("isDynamic", true);
      expect(badge).toHaveProperty("trackKey");
      expect(badge).toHaveProperty("count");
      expect(badge).toHaveProperty("threshold");
      expect(badge).toHaveProperty("progress");
      expect(badge).toHaveProperty("earned");
      expect(badge).toHaveProperty("needed");
    }
  });

  test("description references display name and threshold", () => {
    // count=50/100 = 50% share -> COMMON thresholds; bronze threshold=10
    const tracks = { "tool:Edit": { count: 50 } };
    const badges = generateDynamicBadges(tracks, 100, 500);
    const bronze = badges.find((b) => b.tier === "bronze");
    expect(bronze.description).toContain("Edit");
    expect(bronze.description).toContain("10");
  });
});

// ── getNextBadges ─────────────────────────────────────────────────────────────

describe("getNextBadges", () => {
  function makeBadge(id, earned, progress) {
    return { id, earned, progress };
  }

  test("returns empty array when all badges are earned", () => {
    const badges = [makeBadge("a", true, 100), makeBadge("b", true, 100)];
    expect(getNextBadges(badges)).toEqual([]);
  });

  test("returns empty array when all unearned badges have progress=0", () => {
    const badges = [makeBadge("a", false, 0), makeBadge("b", false, 0)];
    expect(getNextBadges(badges)).toEqual([]);
  });

  test("returns up to n badges (default 5)", () => {
    const badges = Array.from({ length: 10 }, (_, i) => makeBadge(`badge-${i}`, false, i + 1));
    const result = getNextBadges(badges);
    expect(result).toHaveLength(5);
  });

  test("respects custom n parameter", () => {
    const badges = Array.from({ length: 10 }, (_, i) => makeBadge(`badge-${i}`, false, i + 1));
    expect(getNextBadges(badges, 3)).toHaveLength(3);
    expect(getNextBadges(badges, 1)).toHaveLength(1);
  });

  test("sorts by progress descending", () => {
    const badges = [makeBadge("low", false, 20), makeBadge("high", false, 80), makeBadge("mid", false, 50)];
    const result = getNextBadges(badges, 3);
    expect(result[0].id).toBe("high");
    expect(result[1].id).toBe("mid");
    expect(result[2].id).toBe("low");
  });

  test("filters out earned badges", () => {
    const badges = [makeBadge("earned", true, 100), makeBadge("unearned", false, 75)];
    const result = getNextBadges(badges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("unearned");
  });

  test("filters out badges with progress=0", () => {
    const badges = [makeBadge("zero", false, 0), makeBadge("some", false, 30)];
    const result = getNextBadges(badges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("some");
  });

  test("returns fewer than n when not enough eligible badges", () => {
    const badges = [makeBadge("a", false, 40), makeBadge("b", true, 100), makeBadge("c", false, 0)];
    const result = getNextBadges(badges, 5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});
