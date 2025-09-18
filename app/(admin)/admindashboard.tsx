// app/(admin)/admindashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  Dimensions,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import {
  BarChart as KitBarChart,
  LineChart as KitLineChart,
  PieChart as KitPieChart,
} from "react-native-chart-kit";
import { Picker } from "@react-native-picker/picker";

const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E9F0",
  text: "#0F172A",
  sub: "#64748B",
  primary: "#2563EB",
  brand: "#0F2547",
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 2 },
});

const { width } = Dimensions.get("window");
const SIDEBAR_W = 240;

const menu = [
  {
    label: "Dashboard",
    icon: "grid-outline" as const,
    href: "/admindashboard",
  },
  {
    label: "Requests",
    icon: "document-text-outline" as const,
    href: "/admindashboard",
  },
  {
    label: "Shops & Mechanics",
    icon: "build-outline" as const,
    href: "/admindashboard",
  },
  { label: "Users", icon: "people-outline" as const, href: "/admindashboard" },
  {
    label: "Customer Reviews",
    icon: "chatbubbles-outline" as const,
    href: "/admindashboard",
  },
  { label: "Payments", icon: "card-outline" as const, href: "/admindashboard" },
  { label: "Accounts", icon: "key-outline" as const, href: "/admindashboard" },
];

function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View
      className="rounded-2xl bg-white"
      style={[
        { borderWidth: 1, borderColor: COLORS.border },
        cardShadow as any,
      ]}
    >
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-[15px] font-semibold text-slate-900">
          {title}
        </Text>
        {right}
      </View>
      <View className="h-[1px] bg-slate-100" />
      <View className="p-4">{children}</View>
    </View>
  );
}

/* --------------------------- Dashboard --------------------------- */
export default function AdminDashboard() {
  const router = useRouter();

  if (Platform.OS !== "web") {
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: COLORS.bg }}
      >
        <View
          className="items-center rounded-2xl bg-white p-6"
          style={cardShadow as any}
        >
          <Ionicons name="laptop-outline" size={42} color={COLORS.brand} />
          <Text className="mt-3 text-lg font-semibold text-slate-900">
            Admin Dashboard is web-only
          </Text>
          <Text className="mt-1 text-center text-[13px] text-slate-600">
            Please open this on a desktop browser. For mobile, continue using
            the RideRescue app.
          </Text>
          <Pressable
            onPress={() => router.replace("/driver/driverLandingpage")}
            className="mt-4 rounded-xl bg-[#2563EB] px-4 py-2"
          >
            <Text className="font-semibold text-white">Go to mobile home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ---------------- Mock analytics ---------------- */
  const BAR_LABELS_BASE = [
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
  ];
  const BAR_VALUES_BASE = [28, 24, 26, 32, 20, 30, 34, 22, 26, 24, 29, 35];

  const LINE_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const LINE_NOW = [8, 6, 10, 14, 12, 9, 16];
  const LINE_LAST = [6, 7, 8, 12, 9, 11, 10];

  const PIE_DATA = [
    {
      name: "Morning",
      value: 28,
      color: "#A7C5FF",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
    {
      name: "Afternoon",
      value: 40,
      color: "#5B8DEF",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
    {
      name: "Evening",
      value: 32,
      color: "#243B80",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
  ];

  /* ---------------- Sorting (reliable) ---------------- */
  type SortBy = "timeline" | "value_desc" | "value_asc";
  const [sortBy, setSortBy] = useState<SortBy>("timeline");
  const [barLabels, setBarLabels] = useState<string[]>(BAR_LABELS_BASE);
  const [barValues, setBarValues] = useState<number[]>(BAR_VALUES_BASE);

  useEffect(() => {
    const pairs = BAR_LABELS_BASE.map((label, i) => ({
      label,
      value: BAR_VALUES_BASE[i],
    }));
    if (sortBy === "value_desc") pairs.sort((a, b) => b.value - a.value);
    if (sortBy === "value_asc") pairs.sort((a, b) => a.value - b.value);
    setBarLabels(pairs.map((p) => p.label));
    setBarValues(pairs.map((p) => p.value));
  }, [sortBy]);

  const revenueNow = useMemo(
    () => barValues.reduce((a, b) => a + b, 0) * 10000, // mock peso scale
    [barValues]
  );

  const contentWidth = Math.min(720, width - SIDEBAR_W - 80);
  const smallCardWidth = 320;

  const formatPHP = (n: number) => `₱ ${n.toLocaleString()}`;

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(15, 37, 71, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    propsForBackgroundLines: { strokeDasharray: "4 8", stroke: "#E5E9F0" },
    fillShadowGradient: COLORS.primary,
    fillShadowGradientOpacity: 0.2,
    barPercentage: 0.6,
  } as const;

  // inner width of the small right card (360px card - 32px padding)
  const smallInnerWidth = 360 - 32;

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: COLORS.bg }}>
      {/* Sidebar */}
      <View
        style={{ width: SIDEBAR_W }}
        className="border-r border-slate-200 bg-white"
      >
        {/* Brand (bigger) */}
        <View className="border-b border-slate-200 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Image
              source={require("../../assets/images/logo2.png")}
              style={{ width: 40, height: 40, borderRadius: 8 }}
              resizeMode="contain"
            />
            <Text
              className="text-[16px] font-extrabold tracking-wide"
              style={{ color: COLORS.brand }}
            >
              RIDERESCUE
            </Text>
          </View>
        </View>

        {/* Menu */}
        <ScrollView>
          <Text className="px-5 pt-4 pb-2 text-[11px] uppercase tracking-wider text-slate-400">
            Menu
          </Text>
          {menu.slice(0, 5).map((m) => (
            <Link key={m.label} href={m.href} asChild>
              <Pressable
                className="mx-2 mb-1 flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:opacity-90"
                android_ripple={{ color: "#e5e7eb" }}
                style={{
                  backgroundColor:
                    m.label === "Dashboard" ? "#EEF2FF" : "transparent",
                }}
              >
                <Ionicons
                  name={m.icon}
                  size={18}
                  color={m.label === "Dashboard" ? COLORS.primary : "#475569"}
                />
                <Text
                  className={`text-[13px] ${
                    m.label === "Dashboard"
                      ? "text-[#1e3a8a] font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  {m.label}
                </Text>
              </Pressable>
            </Link>
          ))}
          <Text className="px-5 pt-4 pb-2 text-[11px] uppercase tracking-wider text-slate-400">
            Others
          </Text>
          {menu.slice(5).map((m) => (
            <Link key={m.label} href={m.href} asChild>
              <Pressable
                className="mx-2 mb-1 flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:opacity-90"
                android_ripple={{ color: "#e5e7eb" }}
              >
                <Ionicons name={m.icon} size={18} color="#475569" />
                <Text className="text-[13px] text-slate-700">{m.label}</Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </View>

      {/* Main */}
      <View style={{ width: width - SIDEBAR_W }} className="flex-1">
        {/* Top bar */}
        <View className="h-14 flex-row items-center justify-between border-b border-slate-200 bg-white px-4">
          <Text className="text-[18px] font-bold text-slate-900">
            Dashboard
          </Text>
          <Pressable className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
            <Ionicons
              name="person-circle-outline"
              size={20}
              color={COLORS.brand}
            />
            <Text className="text-[12px] text-slate-800">Admin</Text>
            <Ionicons name="chevron-down" size={16} color="#64748B" />
          </Pressable>
        </View>

        {/* Filter Row — Sort by (native Picker) */}
        <View className="border-b border-slate-200 bg-white px-4 py-3">
          <View className="flex-row items-center">
            <View style={{ width: 220 }}>
              <Text className="mb-1 text-[12px] font-semibold text-slate-700">
                Sort by
              </Text>
              <View
                className="rounded-xl border border-slate-200 bg-white"
                style={cardShadow as any}
              >
                <Picker
                  selectedValue={sortBy}
                  onValueChange={(v) => setSortBy(v as SortBy)}
                  mode="dropdown"
                  dropdownIconColor="#64748B"
                  style={{ height: 40 }}
                >
                  <Picker.Item label="Timeline order" value="timeline" />
                  <Picker.Item label="Value (High → Low)" value="value_desc" />
                  <Picker.Item label="Value (Low → High)" value="value_asc" />
                </Picker>
              </View>
            </View>
            <View style={{ flex: 1 }} />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Top row */}
          <View className="flex-row" style={{ gap: 16 }}>
            {/* Revenue */}
            <View className="flex-1">
              <SectionCard
                title="Revenue"
                right={
                  <Pressable className="rounded-lg border border-slate-200 px-3 py-1.5 active:opacity-90">
                    <Text className="text-[12px] text-slate-700">Export</Text>
                  </Pressable>
                }
              >
                <Text className="text-[20px] font-extrabold text-slate-900">
                  {formatPHP(revenueNow)}
                </Text>
                <View className="mt-1 flex-row items-center gap-1">
                  <Ionicons
                    name="trending-up-outline"
                    size={14}
                    color="#16A34A"
                  />
                  <Text className="text-[12px] font-semibold text-green-600">
                    +2.1%
                  </Text>
                  <Text className="text-[12px] text-slate-500">
                    vs previous
                  </Text>
                </View>

                <View className="mt-4">
                  <KitBarChart
                    key={`bar-${barLabels.join("")}`} // 🔒 force re-render when order changes
                    data={{
                      labels: barLabels,
                      datasets: [{ data: barValues }],
                    }}
                    width={contentWidth}
                    height={180}
                    fromZero
                    // withInnerLines
                    showValuesOnTopOfBars={false}
                    chartConfig={chartConfig}
                    style={{ borderRadius: 12, alignSelf: "center" }}
                  />
                </View>
              </SectionCard>
            </View>

            {/* Request Time (pie) */}
            <View style={{ width: 360 }}>
              <SectionCard
                title="Request Time"
                right={
                  <Pressable className="rounded-lg border border-slate-200 px-3 py-1.5 active:opacity-90">
                    <Text className="text-[12px] text-slate-700">Export</Text>
                  </Pressable>
                }
              >
                <Text className="text-[12px] text-slate-500">
                  Distribution by time of day
                </Text>
                <View className="mt-2 items-center justify-center">
                  <KitPieChart
                    data={PIE_DATA.map((p) => ({
                      name: p.name,
                      population: p.value,
                      color: p.color,
                      legendFontColor: p.legendFontColor,
                      legendFontSize: p.legendFontSize,
                    }))}
                    accessor="population"
                    width={smallInnerWidth} // 360 card - 32 padding = 328
                    height={200}
                    chartConfig={chartConfig}
                    backgroundColor="transparent"
                    hasLegend={false} // ✅ no built-in legend
                    paddingLeft="0"
                    center={[0, 0]}
                    style={{ alignSelf: "center" }} // ✅ truly centered
                  />
                  {/* custom legend only */}
                  <View className="mt-3 gap-1">
                    {PIE_DATA.map((p) => (
                      <LegendDot
                        key={p.name}
                        color={p.color}
                        label={`${p.name} ${p.value}%`}
                      />
                    ))}
                  </View>
                </View>
              </SectionCard>
            </View>
          </View>

          {/* Bottom row */}
          <View className="mt-4 flex-row" style={{ gap: 16 }}>
            {/* Ratings */}
            <View className="flex-1">
              <SectionCard title="Your Rating">
                <Text className="text-[12px] text-slate-500">
                  Summary from recent customer reviews
                </Text>
                <View
                  className="mt-4 flex-row items-end"
                  style={{ columnGap: 24 }}
                >
                  <Bubble percent={92} label="Response Time" color="#22D3EE" />
                  <Bubble
                    percent={85}
                    label="Service Quality"
                    color="#F59E0B"
                    large
                  />
                  <Bubble
                    percent={85}
                    label="Resolution Rate"
                    color="#A78BFA"
                  />
                </View>
              </SectionCard>
            </View>

            {/* Top services */}
            <View className="flex-1">
              <SectionCard title="Top Requested Services">
                <TopServiceRow name="Tire Vulcanizing" price={formatPHP(450)} />
                <TopServiceRow
                  name="Battery Jumpstart"
                  price={formatPHP(750)}
                />
                <TopServiceRow
                  name="Engine Diagnostics"
                  price={formatPHP(450)}
                />
                <TopServiceRow
                  name="Towing (short distance)"
                  price={formatPHP(1200)}
                />
              </SectionCard>
            </View>

            {/* Requests trend */}
            <View className="w-[360px]">
              <SectionCard
                title="Requests"
                right={
                  <Pressable className="rounded-lg border border-slate-200 px-3 py-1.5 active:opacity-90">
                    <Text className="text-[12px] text-slate-700">Export</Text>
                  </Pressable>
                }
              >
                <Text className="text-[22px] font-extrabold text-slate-900">
                  {LINE_NOW.reduce((a, b) => a + b, 0).toLocaleString()}
                </Text>
                <View className="mt-1 flex-row items-center gap-1">
                  <Ionicons
                    name="trending-down-outline"
                    size={14}
                    color="#DC2626"
                  />
                  <Text className="text-[12px] font-semibold text-red-600">
                    2.1%
                  </Text>
                  <Text className="text-[12px] text-slate-500">
                    vs previous
                  </Text>
                </View>

                <View className="mt-3">
                  <KitLineChart
                    data={{
                      labels: LINE_LABELS,
                      datasets: [
                        {
                          data: LINE_NOW,
                          color: (o = 1) => `rgba(37,99,235, ${o})`,
                          strokeWidth: 2,
                        },
                        {
                          data: LINE_LAST,
                          color: (o = 1) => `rgba(203,213,225, ${o})`,
                          strokeWidth: 2,
                        },
                      ],
                      // legend intentionally omitted (no in-chart labels)
                    }}
                    width={smallInnerWidth}
                    height={160}
                    withDots
                    withShadow
                    withInnerLines={false}
                    fromZero
                    chartConfig={{
                      ...chartConfig,
                      fillShadowGradient: COLORS.primary,
                      fillShadowGradientOpacity: 0.16,
                    }}
                    bezier
                    style={{ borderRadius: 12, alignSelf: "center" }}
                  />
                  {/* custom minimal legend */}
                  <View className="mt-3 flex-row items-center justify-center">
                    <LegendDot color={COLORS.primary} label="Current" />
                    <View style={{ width: 16 }} />
                    <LegendDot color="#CBD5E1" label="Previous" />
                  </View>
                </View>
              </SectionCard>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/* ------------------------- helpers ------------------------- */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center">
      <View
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="ml-2 text-[12px] text-slate-600">{label}</Text>
    </View>
  );
}

function Bubble({
  percent,
  label,
  color,
  large,
}: {
  percent: number;
  label: string;
  color: string;
  large?: boolean;
}) {
  const size = large ? 124 : 96;
  return (
    <View className="items-center">
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: "#fff",
          borderWidth: 8,
          borderColor: color,
        }}
      >
        <Text className="text-[20px] font-bold text-slate-800">{percent}%</Text>
      </View>
      <Text className="mt-2 text-[12px] text-slate-600">{label}</Text>
    </View>
  );
}

function TopServiceRow({ name, price }: { name: string; price: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-row items-center gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
          <Ionicons name="construct-outline" size={16} color={COLORS.brand} />
        </View>
        <Text className="text-[13px] text-slate-700">{name}</Text>
      </View>
      <Text className="text-[12px] text-slate-500">{price}</Text>
    </View>
  );
}
