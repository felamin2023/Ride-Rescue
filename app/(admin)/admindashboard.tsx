// app/(admin)/admindashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AdminSideDrawer from "../../components/adminSidedrawer";
import AdminTopHeader from "../../components/AdminTopHeader";
import { supabase } from "../../utils/supabase";

/* =============================== THEME =============================== */
const COLORS = {
  bg: "#F7F9FB",
  surface: "#FFFFFF",
  border: "#E5E9F0",
  text: "#0F172A",
  sub: "#64748B",
  primary: "#2563EB",
  brand: "#0F2547",
  positiveBlue: "#2563EB",
  negativeBlue: "#93C5FD",
  trackBlue: "#EEF2FF",

  // status colors
  wait: "#F59E0B",       // amber
  process: "#3B82F6",    // blue
  done: "#10B981",       // emerald
  cancel: "#EF4444",     // red

  // soft fills
  waitSoft: "#FEF3C7",
  processSoft: "#DBEAFE",
  doneSoft: "#D1FAE5",
  cancelSoft: "#FEE2E2",
};
const SIDEBAR_W = 240;
const NUDGE_PX = 240; // nudge donut on desktop
const PIE_COLORS = { morning: "#FDE68A", afternoon: "#93C5FD", evening: "#1E3A8A" };
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* ========================= reduce motion hook ========================= */
const usePrefersReducedMotion = () => {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefers(!!mq?.matches);
    onChange();
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);
  return prefers;
};

/* ============================= AutoWidth ============================= */
function AutoWidth({ children }: { children: (w: number) => React.ReactNode }) {
  const [w, setW] = useState(0);
  return (
    <View className="w-full" onLayout={(e) => setW(Math.max(0, e.nativeEvent.layout.width))}>
      {w > 0 ? children(w) : null}
    </View>
  );
}

/* ============================== DonutChart ============================== */
function DonutChart({
  data,
  size = 148,
  innerRatio = 0.64,
  sweepDuration = 900,
  centerOverride,
  canvasWidth,
  canvasHeight,
  cx,
  cy,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  innerRatio?: number;
  sweepDuration?: number;
  centerOverride?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  cx?: number;
  cy?: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const total = useMemo(() => data.reduce((s, d) => s + (Number(d.value) || 0), 0), [data]);

  const W = canvasWidth ?? size;
  const H = canvasHeight ?? size;
  const centerX = cx ?? W / 2;
  const centerY = cy ?? H / 2;

  const r = size / 2 - 6;
  const rInner = r * innerRatio;

  const describeArc = (cx0: number, cy0: number, rO: number, rI: number, a0: number, a1: number) => {
    const toRad = (a: number) => (Math.PI / 180) * a;
    const sx = cx0 + rO * Math.cos(toRad(a0));
    const sy = cy0 + rO * Math.sin(toRad(a0));
    const ex = cx0 + rO * Math.cos(toRad(a1));
    const ey = cy0 + rO * Math.sin(toRad(a1));
    const big = a1 - a0 > 180 ? 1 : 0;
    const sxi = cx0 + rI * Math.cos(toRad(a1));
    const syi = cy0 + rI * Math.sin(toRad(a1));
    const exi = cx0 + rI * Math.cos(toRad(a0));
    const eyi = cy0 + rI * Math.sin(toRad(a0));
    return `M ${sx} ${sy} A ${rO} ${rO} 0 ${big} 1 ${ex} ${ey} L ${sxi} ${syi} A ${rI} ${rI} 0 ${big} 0 ${exi} ${eyi} Z`;
  };

  const [progress, setProgress] = useState(prefersReducedMotion ? 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion) return setProgress(1);
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / sweepDuration);
      setProgress(easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [prefersReducedMotion, sweepDuration, data]);

  const maxAngle = -90 + 360 * progress;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {(() => {
        let acc = 0;
        return data.map((d, i) => {
          const seg = ((Number(d.value) || 0) / (total || 1)) * 360;
          const start = -90 + acc;
          const end = Math.min(-90 + acc + seg, maxAngle);
          acc += seg;
          if (end <= start) return null;
          const path = describeArc(centerX, centerY, r, rInner, start, end);
          const color = d.color ?? ["#2563EB", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"][i % 6];
          return <path key={d.label} d={path} fill={color} opacity={0.95} />;
        });
      })()}
      <circle cx={centerX} cy={centerY} r={rInner} fill="#fff" />
      <text x={centerX} y={centerY - 1} textAnchor="middle" fontSize="16" fontWeight="800" fill={COLORS.text}>
        {centerOverride ?? Math.round(data.reduce((s, d) => s + d.value, 0) * progress).toLocaleString()}
      </text>
      <text x={centerX} y={centerY + 12} textAnchor="middle" fontSize="10" fill={COLORS.sub}>Total</text>
    </svg>
  );
}

/* ============================= DualLineAreaChart ============================= */
function DualLineAreaChart({
  labels,
  current,
  previous,
  width = 900,
  height = 240,
  padding = { top: 22, right: 16, bottom: 34, left: 42 },
}: {
  labels: string[];
  current: number[];
  previous?: number[];
  width?: number; height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const { maxValue, ptsCur, ptsPrev, yTicks } = useMemo(() => {
    const max = Math.max(0, ...current, ...(previous ?? []));
    const pow10 = Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1));
    const niceMax = Math.ceil(max / pow10) * pow10 || 10;
    const n = Math.max(current.length, labels.length, previous?.length || 0);
    const xStep = n > 1 ? chartW / (n - 1) : 0;
    const yScale = (v: number) => chartH - (v / niceMax) * chartH;
    const mk = (arr?: number[]) => (arr ?? []).map((v, i) => [padding.left + i * xStep, padding.top + yScale(v)] as const);
    const ticks = Array.from({ length: 5 }, (_, i) => Math.round((niceMax / 4) * i));
    return { maxValue: niceMax, ptsCur: mk(current), ptsPrev: mk(previous), yTicks: ticks };
  }, [current, previous, labels, chartW, chartH, padding.left, padding.top]);

  const areaPath = useMemo(() => {
    if (!ptsCur.length) return "";
    const top = ptsCur.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    const base = `L ${ptsCur[ptsCur.length - 1][0]} ${padding.top + chartH} L ${ptsCur[0][0]} ${padding.top + chartH} Z`;
    return `${top} ${base}`;
  }, [ptsCur, padding.top, chartH]);

  const lineCur = useMemo(() => (ptsCur.length ? ptsCur.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") : ""), [ptsCur]);
  const linePrev = useMemo(() => (ptsPrev?.length ? ptsPrev.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") : ""), [ptsPrev]);

  const pathRef = useRef<SVGPathElement | null>(null);
  const [lineLen, setLineLen] = useState(0);
  const [progress, setProgress] = useState(prefersReducedMotion ? 1 : 0);

  useEffect(() => {
    const L = pathRef.current?.getTotalLength?.() ?? 0;
    setLineLen(L);
    if (prefersReducedMotion) return setProgress(1);
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setProgress(easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lineCur, prefersReducedMotion]);

  const xFromIdx = (i: number) => ptsCur[i]?.[0] ?? (ptsPrev?.[i]?.[0] ?? 0);

  return (
    <View style={{ width, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopOpacity="0.26" stopColor={COLORS.primary} />
            <stop offset="100%" stopOpacity="0" stopColor={COLORS.primary} />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const y = padding.top + (chartH - (t / maxValue) * chartH);
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#E2E8F0" />
              <text x={padding.left - 8} y={y} textAnchor="end" alignmentBaseline="middle" fontSize="10" fill="#334155">
                {t}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#areaGradient)" />
        {linePrev ? <path d={linePrev} stroke="#475569" strokeWidth={2} fill="none" strokeDasharray="4 4" /> : null}
        <path
          ref={pathRef}
          d={lineCur}
          stroke={COLORS.primary}
          strokeWidth={2.4}
          fill="none"
          style={{ strokeDasharray: lineLen || 1, strokeDashoffset: lineLen > 0 ? (1 - progress) * lineLen : 0 }}
        />

        {labels.map((lbl, i) => {
          const x = xFromIdx(i);
          return (
            <text key={lbl} x={x} y={height - padding.bottom + 16} textAnchor="middle" fontSize="10" fill="#64748B">
              {lbl}
            </text>
          );
        })}
      </svg>
    </View>
  );
}

/* ========================= Animated Service Donut ========================= */
function ServiceDonut({
  name,
  positive,
  size = 92,
  stroke = 10,
  duration = 900,
}: {
  name: string;
  positive: number;
  size?: number;
  stroke?: number;
  duration?: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const radius = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * radius;

  const target = Math.max(0, Math.min(100, positive)) / 100;
  const [p, setP] = useState(prefersReducedMotion ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion) return setP(target);
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setP(easeOutCubic(t) * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, prefersReducedMotion, duration]);

  const posLen = p * circ;
  const negLen = circ - posLen;

  return (
    <View className="items-center py-0.5 min-w-[96px]">
      <svg width={size} height={size} style={{ display: "block" }}>
        <defs>
          <linearGradient id="donut-pos" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={COLORS.positiveBlue} />
            <stop offset="100%" stopColor={COLORS.brand} />
          </linearGradient>
          <linearGradient id="donut-neg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C7D2FE" />
            <stop offset="100%" stopColor={COLORS.negativeBlue} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={radius} stroke={COLORS.trackBlue} strokeWidth={stroke} fill="none" />
        <circle cx={cx} cy={cy} r={radius} stroke="url(#donut-pos)" strokeWidth={stroke} strokeDasharray={`${posLen} ${circ}`} strokeLinecap="round" fill="none" transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={radius} stroke="url(#donut-neg)" strokeWidth={stroke} strokeDasharray={`${negLen} ${circ}`} strokeLinecap="round" fill="none" transform={`rotate(${(-90 + p * 360).toFixed(3)} ${cx} ${cy})`} opacity={0.9} />
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize="13" fontWeight="800" fill={COLORS.text}>{Math.round(p*100)}%</text>
      </svg>
      <Text className="mt-1.5 font-semibold text-[12px] text-slate-900">{name}</Text>
    </View>
  );
}

/* ========================= DATA (demo for charts) ========================= */
type RangeKey = "all" | "30d" | "7d";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "30d", label: "Last 30 days" },
  { key: "7d", label: "Last 7 days" },
];

function useDashboardData(range: RangeKey) {
  const factor = range === "all" ? 1 : range === "30d" ? 0.35 : 0.18;
  const composition = { active: 0.61, inactive: 0.26, returning: 0.13 };
  const requestTime = [
    { name: "Morning", value: 28, color: PIE_COLORS.morning },
    { name: "Afternoon", value: 40, color: PIE_COLORS.afternoon },
    { name: "Evening", value: 32, color: PIE_COLORS.evening },
  ];
  const trendLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trendNow = [8, 6, 10, 14, 12, 9, 16].map((n) => Math.round(n * (0.6 + factor)));
  const trendPrev = [6, 7, 8, 12, 9, 11, 10].map((n) => Math.round(n * (0.55 + factor)));

  const [totals, setTotals] = useState({ totalUsers: 0, totalDrivers: 0, totalShops: 0 });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_counts");
      if (error) {
        console.warn("[dashboard] counts rpc error:", error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && row) {
        setTotals({
          totalUsers: Number(row.total_users ?? 0),
          totalDrivers: Number(row.total_drivers ?? 0),
          totalShops: Number(row.total_shops ?? 0),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  return { totalUsers: totals.totalUsers, composition, totalDrivers: totals.totalDrivers, totalShops: totals.totalShops, requestTime, trendLabels, trendNow, trendPrev };
}

/* ======== Emergency counts (waiting | in_process | completed | canceled) ======== */
function useEmergencyCounts() {
  const [state, setState] = useState({ loading: true, total: 0, waiting: 0, in_process: 0, completed: 0, canceled: 0 });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statuses = ["waiting", "in_process", "completed", "canceled"] as const;
        const results = await Promise.all(
          statuses.map((s) =>
            supabase.from("emergency").select("*", { count: "exact", head: true }).eq("emergency_status", s)
          )
        );
        const byStatus: Record<string, number> = {};
        statuses.forEach((s, i) => {
          const { error, count } = results[i];
          if (error) console.warn(`[emergency] count error for ${s}:`, error.message);
          byStatus[s] = Number(count ?? 0);
        });
        const total = statuses.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);
        if (!cancelled) {
          setState({
            loading: false,
            total,
            waiting: byStatus.waiting ?? 0,
            in_process: byStatus.in_process ?? 0,
            completed: byStatus.completed ?? 0,
            canceled: byStatus.canceled ?? 0,
          });
        }
      } catch (e: any) {
        console.warn("[emergency] unexpected error:", e?.message ?? e);
        if (!cancelled) setState((v) => ({ ...v, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}

/* ============================== SMALL UI HELPERS ============================== */
function SectionCard({
  title,
  children,
  right,
  className,
  subtle = false,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  subtle?: boolean;
}) {
  return (
    <View
      className={[
        "rounded-2xl mb-4 border shadow-md",
        subtle ? "bg-white/90 backdrop-blur-sm border-slate-200/60" : "bg-white border-slate-200",
        className ?? "",
      ].join(" ")}
      style={{ overflow: "hidden" }}
    >
      <View className="px-3 py-2 bg-gradient-to-r from-white to-slate-50">
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] font-extrabold text-slate-900">{title}</Text>
          {right}
        </View>
      </View>
      <View className="h-[1px] bg-slate-200/60" />
      <View className="p-2.5">{children}</View>
    </View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={[
        "px-2.5 py-1.5 rounded-full ml-1.5 border transition-all",
        active ? "bg-blue-600 border-transparent shadow-sm" : "bg-slate-100/80 border-slate-200 hover:bg-slate-100",
      ].join(" ")}
    >
      <Text className={active ? "text-white text-[11px] font-bold" : "text-slate-900 text-[11px] font-bold"}>{label}</Text>
    </Pressable>
  );
}

function LegendItemRow({ color, label, valueText }: { color: string; label: string; valueText?: string }) {
  return (
    <View className="w-full flex-row items-center">
      <View className="flex-row items-center min-w-0 shrink">
        <View style={{ backgroundColor: color }} className="w-[10px] h-[10px] rounded-full" />
        <Text numberOfLines={1} className="ml-2 text-[12px] text-slate-700">{label}</Text>
        {valueText ? <Text className="ml-2 text-[12px] font-bold text-slate-900">{valueText}</Text> : null}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center">
      <View style={{ backgroundColor: color }} className="w-[10px] h-[10px] rounded-full" />
      <Text className="ml-2 text-[12px] text-slate-700">{label}</Text>
    </View>
  );
}

function InlineStat({ title, value, className, icon, tint }: { title: string; value: number; className?: string; icon?: keyof typeof Ionicons.glyphMap; tint?: string }) {
  return (
    <View className={["", className ?? ""].join(" ")}>
      <View className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <View className="p-3">
          <View className="flex-row items-center justify-center">
            {icon ? <Ionicons name={icon} size={16} color={tint ?? COLORS.primary} /> : null}
            <Text className="ml-1 text-[12px] font-bold text-slate-600 text-center">{title}</Text>
          </View>
          <Text className="mt-1.5 text-[24px] font-extrabold text-slate-900 text-center">{value.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

function StatChip({
  color,
  soft,
  label,
  count,
  icon,
  pct,
}: {
  color: string;
  soft: string;
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  pct?: number; // 0..1
}) {
  const pctSafe = Math.max(0, Math.min(1, pct ?? 0));
  return (
    <View className="flex-1 min-w-[220px] px-1.5">
      <View className="rounded-xl border shadow-sm" style={{ backgroundColor: soft, borderColor: `${color}33` }}>
        <View className="px-3 pt-2 pb-2.5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="w-[22px] h-[22px] rounded-full items-center justify-center" style={{ backgroundColor: color }}>
                <Ionicons name={icon} size={14} color="#fff" />
              </View>
              <Text className="ml-2 text-[12px] font-bold" style={{ color }}>{label}</Text>
            </View>
            <Text className="text-[18px] font-extrabold text-slate-900">{count.toLocaleString()}</Text>
          </View>
          {/* tiny progress bar */}
          <View className="mt-2 h-[7px] rounded-full overflow-hidden" style={{ backgroundColor: "#ffffff66" }}>
            <View className="h-full" style={{ width: `${pctSafe * 100}%`, backgroundColor: color, borderRadius: 999 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Shimmer({ height = 90, rounded = 16 }: { height?: number; rounded?: number }) {
  // simple skeleton shimmer using animated gradient substitute
  return (
    <View
      className="w-full bg-slate-200/60 overflow-hidden"
      style={{ height, borderRadius: rounded }}
    />
  );
}

/* ================================ PAGE ================================ */
export default function AdminDashboard() {
  const router = useRouter();
  const { width: viewportW } = useWindowDimensions();

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: COLORS.bg }}>
        <View className="items-center rounded-2xl bg-white p-5 shadow-md">
          <Ionicons name="laptop-outline" size={38} color={COLORS.brand} />
          <Text className="mt-2 text-[15px] font-semibold text-slate-900">Admin Dashboard is web-only</Text>
          <Text className="mt-1 text-[12px] text-slate-500 text-center">Open on desktop. For mobile, use the app.</Text>
        </View>
      </View>
    );
  }

  const isNarrow = viewportW <= 1366;
  const contentAreaW = Math.max(320, viewportW - SIDEBAR_W);

  const [range, setRange] = useState<RangeKey>("all");
  const data = useDashboardData(range);
  const RT_TOTAL = data.requestTime.reduce((s, d) => s + d.value, 0);

  const em = useEmergencyCounts();
  const total = em.total || 1; // for % calc

  // compose donut for emergencies
  const emDonut = [
    { label: "Waiting", value: em.waiting, color: COLORS.wait },
    { label: "In Process", value: em.in_process, color: COLORS.process },
    { label: "Completed", value: em.completed, color: COLORS.done },
    { label: "Canceled", value: em.canceled, color: COLORS.cancel },
  ];

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: COLORS.bg }}>
      <AdminSideDrawer width={SIDEBAR_W} />
      <View style={{ width: contentAreaW }} className="flex-1">
        <AdminTopHeader />
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View className="w-full max-w-[1280px] mx-auto">

            {/* ===== Row A: Total Users (clean + airy) ===== */}
            <View className="-mx-2">
              <View className="w-full px-2">
                <SectionCard
                  title="Total Users"
                  right={
                    <View className="flex-row">
                      {RANGE_OPTIONS.map((opt) => (
                        <FilterPill key={opt.key} label={opt.label} active={range === opt.key} onPress={() => setRange(opt.key)} />
                      ))}
                    </View>
                  }
                >
                  <View className="flex-row flex-wrap items-center -mx-2 justify-between">
                    <View className={isNarrow ? "px-2 w-full flex-row items-center justify-center mb-3" : "px-2 basis-[58%] flex-row items-center justify-start"}>
                      <View className="w-[152px] h-[152px] items-center justify-center mr-2" style={{ marginLeft: isNarrow ? 0 : NUDGE_PX }}>
                        <DonutChart
                          data={[
                            { label: "Active", value: data.composition.active * 100, color: "#3B82F6" },
                            { label: "Inactive", value: data.composition.inactive * 100, color: "#9CA3AF" },
                            { label: "Returning", value: data.composition.returning * 100, color: "#C7D2FE" },
                          ]}
                          size={140}
                          centerOverride={data.totalUsers.toLocaleString()}
                        />
                      </View>
                      <View className="space-y-2 min-w-[160px]">
                        <LegendItemRow color="#3B82F6" label="Active" valueText={`${Math.round(data.composition.active * 100)}%`} />
                        <LegendItemRow color="#9CA3AF" label="Inactive" valueText={`${Math.round(data.composition.inactive * 100)}%`} />
                        <LegendItemRow color="#C7D2FE" label="Returning" valueText={`${Math.round(data.composition.returning * 100)}%`} />
                      </View>
                    </View>
                    <View className={isNarrow ? "px-2 w-full" : "px-2 basis-[42%]"}>
                      <View className="flex-row flex-wrap -mx-1.5 justify-start">
                        <InlineStat title="Total Drivers" value={data.totalDrivers} icon="car-outline" tint={COLORS.brand} className="px-1.5 basis-1/3 min-w-[160px]" />
                        <InlineStat title="Mechanics & Shops" value={data.totalShops} icon="construct-outline" tint={COLORS.primary} className="px-1.5 basis-1/3 min-w-[160px]" />
                      </View>
                    </View>
                  </View>
                </SectionCard>
              </View>
            </View>

            {/* ===== Row A.2: Total Emergencies — elevated design ===== */}
            <View className="-mx-2">
              <View className="w-full px-2">
                <SectionCard title="Total Emergencies" subtle>
                  {/* Loading skeleton */}
                  {em.loading ? (
                    <View>
                      <Shimmer height={160} />
                      <View className="mt-3 flex-row -mx-1.5">
                        <View className="flex-1 px-1.5"><Shimmer height={72} rounded={12} /></View>
                        <View className="flex-1 px-1.5"><Shimmer height={72} rounded={12} /></View>
                        <View className="flex-1 px-1.5"><Shimmer height={72} rounded={12} /></View>
                        <View className="flex-1 px-1.5"><Shimmer height={72} rounded={12} /></View>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View className="flex-row flex-wrap items-center justify-between">
                        {/* Left: donut + legend */}
                        <View className="flex-row items-center">
                          <View className="w-[156px] h-[156px] items-center justify-center mr-4">
                            <DonutChart
                              data={emDonut}
                              size={152}
                              centerOverride={em.total.toLocaleString()}
                            />
                          </View>
                          <View className="space-y-2 min-w-[180px]">
                            <LegendItemRow color={COLORS.wait} label="Waiting" valueText={`${Math.round((em.waiting / total) * 100)}%`} />
                            <LegendItemRow color={COLORS.process} label="In Process" valueText={`${Math.round((em.in_process / total) * 100)}%`} />
                            <LegendItemRow color={COLORS.done} label="Completed" valueText={`${Math.round((em.completed / total) * 100)}%`} />
                            <LegendItemRow color={COLORS.cancel} label="Canceled" valueText={`${Math.round((em.canceled / total) * 100)}%`} />
                          </View>
                        </View>

                        {/* Right: chips with tiny progress */}
                        <View className="flex-1">
                          <View className="flex-row flex-wrap -mx-1.5">
                            <StatChip color={COLORS.wait} soft={COLORS.waitSoft} label="Waiting" count={em.waiting} icon="time-outline" pct={em.waiting / total} />
                            <StatChip color={COLORS.process} soft={COLORS.processSoft} label="In Process" count={em.in_process} icon="cog-outline" pct={em.in_process / total} />
                            <StatChip color={COLORS.done} soft={COLORS.doneSoft} label="Completed" count={em.completed} icon="checkmark-done-outline" pct={em.completed / total} />
                            <StatChip color={COLORS.cancel} soft={COLORS.cancelSoft} label="Canceled" count={em.canceled} icon="close-outline" pct={em.canceled / total} />
                          </View>
                        </View>
                      </View>
                    </>
                  )}
                </SectionCard>
              </View>
            </View>

            {/* ===== Row B: Requests Trend ===== */}
            <View className="-mx-2">
              <View className="w-full px-2">
                <SectionCard title="Requests Trend">
                  <AutoWidth>{(w) => <DualLineAreaChart labels={data.trendLabels} current={data.trendNow} previous={data.trendPrev} width={w} />}</AutoWidth>
                  <View className="mt-1.5 items-center">
                    <View className="flex-row space-x-2">
                      <LegendDot color={COLORS.primary} label="Current" />
                      <LegendDot color="#475569" label="Previous" />
                    </View>
                  </View>
                </SectionCard>
              </View>
            </View>

            {/* ===== Row C: Request Time + Service Ratings ===== */}
            <View className="flex-row flex-wrap -mx-2">
              <View className={isNarrow ? "w-full px-2" : "flex-1 px-2"}>
                <SectionCard title="Request Time">
                  <View className="w-full flex-row items-center justify-center">
                    <View style={{ width: 148 + Math.round(148 * (isNarrow ? 0.12 : 0.1)), height: 148 }} className="items-center justify-center mr-4">
                      <DonutChart
                        data={data.requestTime.map((s) => ({ label: s.name, value: s.value, color: s.color }))}
                        size={148}
                        centerOverride={`${RT_TOTAL}`}
                      />
                    </View>
                    <View className="space-y-2 min-w-[160px]">
                      {data.requestTime.map((p) => (
                        <LegendItemRow key={p.name} color={p.color!} label={p.name} valueText={`${p.value}%`} />
                      ))}
                    </View>
                  </View>
                </SectionCard>
              </View>

              <View className={isNarrow ? "w-full px-2" : "flex-1 px-2"}>
                <SectionCard title="Service Ratings" right={<Text className="text-[12px] text-slate-500">Based on recent feedback</Text>}>
                  <View className="mt-0.5 flex-row flex-wrap items-center justify-evenly">
                    <ServiceDonut name="Vulcanize" positive={90} />
                    <ServiceDonut name="Repair Shop" positive={80} />
                  </View>
                  <View className="mt-1.5 items-center">
                    <View className="flex-row space-x-2">
                      <LegendDot color={COLORS.positiveBlue} label="Positive" />
                      <LegendDot color={COLORS.negativeBlue} label="Negative" />
                    </View>
                  </View>
                </SectionCard>
              </View>
            </View>

          </View>
        </ScrollView>
      </View>
    </View>
  );
}
