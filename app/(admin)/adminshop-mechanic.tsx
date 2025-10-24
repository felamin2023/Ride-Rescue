// app/(admin)/adminshop-mechanic.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  Dimensions,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  Image,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

// shared UI
import AdminSideDrawer from "../../components/adminSidedrawer";
import AdminTopHeader from "../../components/AdminTopHeader";

// reusable popups
import ConfirmModal from "../../components/ConfirmModal";
import SuccessModal from "../../components/SuccessModal";

// ⬇️ Supabase
import { supabase } from "../../utils/supabase";

/* ---------------------- theme & helpers ---------------------- */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E9F0",
  text: "#0F172A",
  sub: "#64748B",
  primary: "#2563EB",
  brand: "#0F2547",
  blueSoftBG: "#E8F1FF",
  blueSoftBorder: "#C7D7FE",
  blueText: "#1D4ED8",
  neutralBorder: "#CBD5E1",
  neutralText: "#475569",
};
const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 2 },
});
const { width } = Dimensions.get("window");
const SIDEBAR_W = 240;

/* --------------------------- data types --------------------------- */
type BroadService = "Vulcanize" | "Repair" | "Battery";

type Shop = {
  id: string;                 // shop_id if present, else user_id fallback
  userId: string;             // app_user.user_id (for fallback updates)
  name: string;               // place.name if present, else "—"
  owner: string;              // app_user.full_name
  email?: string;
  avatarUrl?: string;
  services: BroadService[];   // derived from servicesOffered
  servicesOffered?: string[]; // parsed from shop_details.services
  area: string;               // places.address or app_user.address or "—"
  rating: number;             // placeholder (0 for now)
  jobs: number;               // placeholder (0 for now)
  status: "Active" | "Pending" | "Suspended"; // from is_verified (Active/Pending)
  submittedAt?: string;       // shop_details.created_at
  docs?: number;              // count of proofs/certificate files if parseable
  operatingDays?: string[];   // parsed from shop_details.days
  opensAt?: string;           // shop_details.time_open
  closesAt?: string;          // shop_details.time_close
  proofs?: string[];          // parsed from certificate_url (paths or urls)
};

/* --------------------------- helpers --------------------------- */
const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sat", "Sun"] as const;

// ✅ Set this to your real Storage bucket for shop proofs
const SHOP_CERT_BUCKET = "certificates";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i;
function isImageUrl(u: string) {
  const clean = (u || "").split("?")[0];      // ignore query string
  return IMAGE_EXT_RE.test(clean);
}
function fileNameFromUrl(u: string) {
  const clean = (u || "").split("?")[0];
  return clean.substring(clean.lastIndexOf("/") + 1) || "file";
}

function categorize(option: string): BroadService {
  if (/battery/i.test(option)) return "Battery";
  if (/vulcan|tire|wheel/i.test(option)) return "Vulcanize";
  return "Repair";
}
function hashColor(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = input.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 90%)`;
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? "").join("") || "S";
}
function ShopAvatar({ name, uri }: { name: string; uri?: string }) {
  if (uri) return <View style={{ width: 28, height: 28, borderRadius: 14, overflow: "hidden", backgroundColor: "#e5e7eb" }} />;
  const bg = hashColor(name);
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>{initials(name)}</Text>
    </View>
  );
}
function getShopImage(name: string, uri?: string) {
  if (uri && uri.trim()) return uri;
  return `https://picsum.photos/seed/${encodeURIComponent(name)}/320/320`;
}
function tryParseJSON<T = any>(raw?: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
function parseServices(raw?: string | null): string[] {
  if (!raw) return [];
  const asJSON = tryParseJSON<string[]>(raw);
  if (Array.isArray(asJSON)) return asJSON.filter(Boolean);
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function parseDays(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  return parts;
}
function parseProofs(raw?: string | null): string[] {
  if (!raw) return [];
  const asJSON = tryParseJSON<string[] | string>(raw);
  if (Array.isArray(asJSON)) return asJSON.filter(Boolean);
  if (typeof asJSON === "string" && asJSON) return [asJSON];
  return [raw];
}
function toPublicUrl(maybePath: string): string {
  const s = String(maybePath || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;                             // already a full URL
  if (s.includes("/storage/v1/object/public/")) return s;             // already a public storage URL
  const { data } = supabase.storage.from(SHOP_CERT_BUCKET).getPublicUrl(s);
  return data?.publicUrl || s;                                        // fallback: return original
}

// 🔔 Send the custom verified message via your Edge Function (uses Resend/Gmail/etc.)
async function sendVerifiedNotice(to?: string, name?: string, shopName?: string) {
  try {
    if (!to) return;
    await supabase.functions.invoke("notify-verified", {
      body: {
        to,
        name: name || "there",
        shopName: shopName || "your shop",
      },
    });
  } catch (err) {
    console.warn("[notify-verified] failed:", err);
  }
}

// 🔑 Also trigger a brand-new OTP email from Supabase so the owner can log in
// (uses your project's global Email OTP template; does not include shopName)
async function sendLoginOtp(to?: string) {
  try {
    if (!to) return;
    await supabase.auth.signInWithOtp({
      email: to,
      options: {
        shouldCreateUser: false, // don't create if it somehow doesn't exist
      },
    });
  } catch (err) {
    console.warn("[sendLoginOtp] failed:", err);
  }
}

// Fetch { owner(shop_id) -> { name, address } }
async function fetchPlaceMapByOwner(shopIds: string[]) {
  const map: Record<string, { name?: string; address?: string }> = {};
  if (!shopIds.length) return map;

  const { data, error } = await supabase
    .from("places")
    .select("owner, name, address")
    .in("owner", shopIds);

  if (error) {
    console.error("[places] fetch error:", error);
    return map;
  }
  for (const row of data || []) {
    if (row?.owner) map[row.owner] = { name: row?.name || undefined, address: row?.address || undefined };
  }
  return map;
}


/* ------------------------ small UI bits ------------------------ */
function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="rounded-2xl bg-white" style={[{ borderWidth: 1, borderColor: COLORS.border }, cardShadow as any]}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-[15px] font-semibold text-slate-900">{title}</Text>
        {right}
      </View>
      <View className="h-[1px] bg-slate-100" />
      <View className="p-4">{children}</View>
    </View>
  );
}
function StatusPill({ s }: { s: Shop["status"] }) {
  const bg  = s === "Active" ? "#ECFDF5" : s === "Pending" ? "#FFFBEB" : "#FEF2F2";
  const txt = s === "Active" ? "#047857" : s === "Pending" ? "#B45309" : "#B91C1C";
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: txt, fontSize: 11, textAlign: "center" }}>{s}</Text>
    </View>
  );
}
function TableHeaderCell({
  label, flex, widthPx, align = "center",
}: { label: string; flex?: number; widthPx?: number; align?: "left"|"right"|"center"; }) {
  return (
    <View style={{ flex: widthPx ? undefined : (flex ?? 1), width: widthPx, paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", textAlign: align }}>{label}</Text>
    </View>
  );
}
type BtnKind = "view" | "neutral";
function ActionBtn({
  icon, label, onPress, kind = "neutral", ghost = false,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; kind?: BtnKind; ghost?: boolean; }) {
  const base = {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };
  const viewStyle = { backgroundColor: COLORS.blueSoftBG, borderColor: COLORS.blueSoftBorder };
  const neutralStyle = { backgroundColor: "#FFFFFF", borderColor: COLORS.neutralBorder };
  const color = kind === "view" ? COLORS.blueText : COLORS.neutralText;
  return (
    <Pressable onPress={onPress} pointerEvents={ghost ? "none" : "auto"} style={{ ...base, ...(kind === "view" ? viewStyle : neutralStyle), opacity: ghost ? 0 : 1 }}>
      <Ionicons name={icon} size={14} color={ghost ? "transparent" : color} />
      <Text style={{ color: ghost ? "transparent" : color, marginLeft: 6, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
function ChipToggle({ selected, label, onToggle }: { selected: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className={`rounded-full border px-3 py-1 ${selected ? "bg-blue-50 border-blue-300" : "bg-white border-slate-300"}`}>
      <Text className={`text-[12px] ${selected ? "text-blue-700" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}
function ChipTag({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-slate-300 bg-white px-3 py-1">
      <Text className="text-[12px] text-slate-700">{label}</Text>
    </View>
  );
}

/* ----------------------- View modal helpers ----------------------- */
const VIEW_MAX_W = 600;
const VIEW_IMG_W = 260;
const VIEW_IMG_H = 200;
function HLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 13, color: "#475569", fontWeight: "700", letterSpacing: 0.2, marginBottom: 6 }}>{children}</Text>;
}
function Divider() {
  return <View style={{ height: 1, backgroundColor: "#EEF2F6", marginVertical: 10 }} />;
}
function Field({ label, value, style }: { label: string; value?: string | number; style?: any }) {
  return (
    <View style={{ width: "48%", minWidth: 220, ...style }}>
      <Text style={{ fontSize: 13, color: "#0F172A", fontWeight: "700" }}>{label}</Text>
      <Text style={{ fontSize: 13, color: "#0F172A", marginTop: 2 }}>{value ?? "—"}</Text>
    </View>
  );
}
function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center rounded-xl border border-slate-200 px-3 py-2">
      <Text className="text-[11px] text-slate-500">{label}</Text>
      <Text className="text-[14px] font-semibold text-slate-900">{value}</Text>
    </View>
  );
}

/* ------------------------------ Page ------------------------------ */
export default function AdminShopMechanicPage() {
  const router = useRouter();

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: COLORS.bg }}>
        <View className="items-center rounded-2xl bg-white p-6" style={cardShadow as any}>
          <Ionicons name="laptop-outline" size={42} color={COLORS.brand} />
          <Text className="mt-3 text-lg font-semibold text-slate-900">Web-only page</Text>
          <Text className="mt-1 text-center text-[13px] text-slate-600">Open this on a desktop browser.</Text>
        </View>
      </View>
    );
  }

  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<Shop["status"] | "All">("All");
  const [serviceFilter, setServiceFilter] = useState<"All" | BroadService>("All");
  const [sortBy, setSortBy] = useState<"jobs" | "rating" | "name" | "status">("jobs");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: any) => e?.key === "Escape" && setOpenMenu(null);
    // @ts-ignore
    window.addEventListener("keydown", onKey);
    // @ts-ignore
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ⬇️ fetch Shop Owners + their shop_details, then attach places via places.owner = shop_id
useEffect(() => {
  (async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("app_user")
        .select(`
          user_id, full_name, email, address, role, photo_url, created_at,
          shop_details:shop_details!left(
            shop_id, services, time_open, time_close, days, is_verified, created_at, certificate_url
          )
        `)
        .eq("role", "Shop owner")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // gather all shp*** ids we have
      const shopIds: string[] = [];
      for (const au of data || []) {
        const sd = Array.isArray(au.shop_details) ? au.shop_details[0] : au.shop_details;
        const sid = sd?.shop_id;
        if (sid && /^shp\d{3,}$/i.test(sid)) shopIds.push(sid);
      }

      // map owner(shop_id) -> { name, address }
      const placeMap = await fetchPlaceMapByOwner(shopIds);

      const mapped: Shop[] = (data ?? []).map((au: any) => {
        const sd = Array.isArray(au.shop_details) ? au.shop_details[0] : au.shop_details;

        const offered = parseServices(sd?.services);
        const broad = Array.from(new Set(offered.map(categorize))) as BroadService[];
        const days = parseDays(sd?.days);
        const proofs = parseProofs(sd?.certificate_url);
        const docsCount = proofs.length || undefined;

        const sid = sd?.shop_id || ""; // might be missing for some owners
        const place = sid ? placeMap[sid] : undefined;

        return {
          id: sid || au.user_id,
          userId: au.user_id,
          // 👇 Prefer places.name when present
          name: place?.name || "—",
          owner: au.full_name,
          email: au.email,
          avatarUrl: au.photo_url || undefined,
          services: broad,
          servicesOffered: offered,
          // 👇 Prefer places.address, else fallback to app_user.address
          area: place?.address || au.address || "—",
          rating: 0,
          jobs: 0,
          status: sd ? (sd.is_verified ? "Active" : "Pending") : "Pending",
          submittedAt: sd?.created_at ? String(sd.created_at).slice(0, 16).replace("T", " ") : undefined,
          docs: docsCount,
          operatingDays: days,
          opensAt: sd?.time_open || undefined,
          closesAt: sd?.time_close || undefined,
          proofs,
        } as Shop;
      });

      setShops(mapped);
    } catch (e: any) {
      console.error("[adminshop-mechanic] fetch error", e);
      Alert.alert("Load failed", e?.message ?? "Unable to load shops.");
    } finally {
      setLoading(false);
    }
  })();
}, []);


  const filtered = useMemo(() => {
    let data = [...shops];
    if (statusFilter !== "All") data = data.filter((d) => d.status === statusFilter);
    if (serviceFilter !== "All") data = data.filter((d) => d.services.includes(serviceFilter));
    data.sort((a, b) => {
      const mul = sortDir === "desc" ? -1 : 1;
      if (sortBy === "jobs") return mul * (a.jobs - b.jobs);
      if (sortBy === "rating") return mul * (a.rating - b.rating);
      if (sortBy === "status") return mul * a.status.localeCompare(b.status);
      return mul * a.name.localeCompare(b.name);
    });
    return data;
  }, [shops, statusFilter, serviceFilter, sortBy, sortDir]);

  // main table excludes Pending
  const mainList = useMemo(() => filtered.filter((s) => s.status !== "Pending"), [filtered]);

  /* ---------------------------- Add modal (kept mock for now) ---------------------------- */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addOwner, setAddOwner] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addArea, setAddArea] = useState("");
  const [offered, setOffered] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [opensAt, setOpensAt] = useState("08:00");
  const [closesAt, setClosesAt] = useState("22:00");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [proofs, setProofs] = useState<any[]>([]);
  const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const toggleOffered = (s: string) => setOffered((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleDay = (d: string) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const pickProofs = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,application/pdf";
      input.multiple = true;
      input.onchange = () => setProofs(Array.from(input.files || []).slice(0, 10));
      input.click();
    } else Alert.alert("Not supported", "File selection is available on web for now.");
  };
  const clearAddForm = () => {
    setAddName(""); setAddOwner(""); setAddEmail(""); setAddArea("");
    setOffered([]); setDays([]); setOpensAt("08:00"); setClosesAt("22:00");
    setPwd(""); setPwd2(""); setProofs([]);
  };

  // success modal state (used after adding and after status actions)
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCfg, setSuccessCfg] = useState<{ title: string; message?: string } | null>(null);

  const submitAdd = () => {
    // Still local-only; wire to your backend when ready.
    if (!addName.trim() || !addOwner.trim() || !addArea.trim()) return Alert.alert("Missing info","Please fill Shop name, Contact person, and Address/Area.");
    if (addEmail && !/^\S+@\S+\.\S+$/.test(addEmail))   return Alert.alert("Invalid email","Please enter a valid email address.");
    if (!offered.length)                                  return Alert.alert("Select services","Pick at least one service offered.");
    if (!days.length)                                     return Alert.alert("Operating days","Pick at least one operating day.");
    if (!timeOk(opensAt) || !timeOk(closesAt))            return Alert.alert("Time format","Use 24h HH:MM, e.g., 08:00 and 22:00.");
    if (pwd.length < 6)                                   return Alert.alert("Weak password","Password must be at least 6 characters.");
    if (pwd !== pwd2)                                     return Alert.alert("Passwords don't match","Please re-check your password.");
    if (!proofs.length)                                   return Alert.alert("Business proof","Upload at least one image or PDF.");

    const broad = Array.from(new Set(offered.map(categorize))) as BroadService[];
    const now = new Date();
    const newShop: Shop = {
      id: `local_${Date.now()}`,
      userId: "local",
      name: addName.trim(),
      owner: addOwner.trim(),
      email: addEmail.trim() || undefined,
      area: addArea.trim(),
      services: broad,
      servicesOffered: offered,
      rating: 0, jobs: 0, status: "Pending",
      submittedAt: now.toISOString().slice(0,16).replace("T"," "),
      docs: proofs.length,
      operatingDays: [...days],
      opensAt,
      closesAt,
      proofs: proofs.map((f: any) => f?.name || "proof"),
      avatarUrl: undefined,
    };
    setShops((prev) => [newShop, ...prev]);
    setAddOpen(false); clearAddForm();
    setSuccessCfg({ title: "Added", message: "Shop/mechanic has been added (Pending)." });
    setSuccessOpen(true);
  };

  /* ------------------------- View modal (summary) ------------------------- */
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState<Shop | null>(null);
  const openView = (s: Shop) => { setSelected(s); setViewOpen(true); };

  /* ---------------------------- Layout ---------------------------- */
  const COLW = {
    nameFlex: 2.8,
    contactFlex: 1.8,
    area: 200,
    rating: 90,
    jobs: 130,
    status: 120,
    actions: 260,
  };
  const VQ_COLW = {
    shop: 64,
    area: 220,
    submitted: 180,
    actions: 280,
  };

  // confirm modal state + helper
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<{
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    icon?: string;
    onConfirm: () => void;
  } | null>(null);
  const ask = (cfg: typeof confirmCfg) => {
    setConfirmCfg(cfg || null);
    setConfirmOpen(!!cfg);
  };

  /* ----------------------------- Approve / Reject ----------------------------- */
  const canUpdateByShopId = (id: string) => /^shp\d{3,}$/i.test(id);

  const updateVerification = async (target: Shop, value: boolean) => {
    // Require an existing shop_details row
    if (!canUpdateByShopId(target.id)) {
      Alert.alert("No application found", "This shop has no shop_details record to update yet.");
      return false;
    }
    const { data, error } = await supabase
      .from("shop_details")
      .update({ is_verified: value })
      .eq("shop_id", target.id)
      .select("shop_id, is_verified")
      .maybeSingle();

    if (error) {
      console.error("[verify] update error:", error);
      Alert.alert("Update failed", error.message || "Could not update verification.");
      return false;
    }
    return true;
  };

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: COLORS.bg }}>
      <AdminSideDrawer width={SIDEBAR_W} />
      <View style={{ width: width - SIDEBAR_W }} className="flex-1">
        <AdminTopHeader title="Shops And Mechanics" />

        {/* Header bar */}
        <View className="border-b border-slate-200 bg-white px-4 py-3" style={{ position: "relative", zIndex: 3000, overflow: "visible" }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Dropdown id="status" openId={openMenu} setOpenId={setOpenMenu} label={statusFilter === "All" ? "All statuses" : statusFilter}
              options={["All","Active","Pending","Suspended"]} onSelect={(v) => setStatusFilter(v as any)} />
            <Dropdown id="service" openId={openMenu} setOpenId={setOpenMenu} label={serviceFilter === "All" ? "All services" : serviceFilter}
              options={["All","Vulcanize","Repair","Battery"]} onSelect={(v) => setServiceFilter(v as any)} />
            <Dropdown id="sort" openId={openMenu} setOpenId={setOpenMenu} icon="swap-vertical-outline"
              label={`Sort: ${sortBy} ${sortDir === "desc" ? "↓" : "↑"}`}
              options={["jobs","rating","name","status","toggle direction"]}
              onSelect={(v) => { if (v === "toggle direction") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(v as any); setSortDir("desc"); }}} />
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => { setOpenMenu(null); setAddOpen(true); }} className="flex-row items-center rounded-full bg-blue-600 px-3 py-2">
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text className="ml-1 text-[12px] font-medium text-white">Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={{ padding: 16 }} onScrollBeginDrag={() => setOpenMenu(null)} style={{ zIndex: 0 }}>
          <SectionCard title="Shops & Mechanics">
            {/* header */}
            <View className="flex-row items-center px-2 pb-2" style={{ justifyContent: "center" }}>
              <TableHeaderCell label="Shop Name" flex={COLW.nameFlex} />
              <TableHeaderCell label="Contact person" flex={COLW.contactFlex} />
              <TableHeaderCell label="Area" widthPx={COLW.area} />
              <TableHeaderCell label="Rating" widthPx={COLW.rating} />
              <TableHeaderCell label="Jobs completed" widthPx={COLW.jobs} />
              <TableHeaderCell label="Status" widthPx={COLW.status} />
              <TableHeaderCell label="Actions" widthPx={COLW.actions} />
            </View>
            <View className="mb-2 h-[1px] bg-slate-100" />

            {loading ? (
              <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>Loading shops…</Text>
            ) : filtered.filter((s) => s.status !== "Pending").length === 0 ? (
              <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>
                No active/suspended shops to display.
              </Text>
            ) : (
              mainList.map((s) => (
                <View key={s.id} className="flex-row items-center rounded-xl px-2 py-2 hover:bg-slate-50" style={{ flexWrap: "nowrap" as any, justifyContent: "center" }}>
                  <View style={{ flex: COLW.nameFlex, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <Text className="text-[13px] text-slate-800" style={{ textAlign: "center" }}>{s.name}</Text>
                  </View>
                  <View style={{ flex: COLW.contactFlex, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>{s.owner}</Text>
                  </View>
                  <View style={{ width: COLW.area, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>{s.area}</Text>
                  </View>
                  <View style={{ width: COLW.rating, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <Text className="text-[13px] text-slate-800" style={{ textAlign: "center" }}>{s.rating.toFixed(1)} ★</Text>
                  </View>
                  <View style={{ width: COLW.jobs, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <Text className="text-[13px] text-slate-800" style={{ textAlign: "center" }}>{s.jobs}</Text>
                  </View>
                  <View style={{ width: COLW.status, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                    <StatusPill s={s.status} />
                  </View>
                  <View style={{ width: COLW.actions, paddingHorizontal: 6 }}>
                    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
                      <ActionBtn icon="eye-outline" kind="view" label="View" onPress={() => openView(s)} />
                      {s.status === "Active" && (
                        <ActionBtn
                          icon="ban-outline"
                          label="Suspend"
                          onPress={() =>
                            ask({
                              title: "Suspend shop?",
                              message: `${s.name || s.owner}'s listing will be hidden until reinstated.`,
                              confirmText: "Suspend",
                              cancelText: "Cancel",
                              icon: "alert-circle-outline",
                              onConfirm: async () => {
                                setConfirmOpen(false);
                                // local-only status change; you can wire a column later if needed
                                setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Suspended" } : x));
                                setSuccessCfg({ title: "Shop suspended", message: `${s.name || "Shop"} is now suspended.` });
                                setSuccessOpen(true);
                              },
                            })
                          }
                        />
                      )}
                      {s.status === "Suspended" && (
                        <ActionBtn
                          icon="refresh-circle-outline"
                          label="Reinstate"
                          onPress={() =>
                            ask({
                              title: "Reinstate shop?",
                              message: `Restore ${s.name || "shop"} to Active status.`,
                              confirmText: "Reinstate",
                              cancelText: "Cancel",
                              icon: "checkmark-circle-outline",
                              onConfirm: async () => {
                                setConfirmOpen(false);
                                setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Active" } : x));
                                setSuccessCfg({ title: "Shop reinstated", message: `${s.name || "Shop"} is now active.` });
                                setSuccessOpen(true);
                              },
                            })
                          }
                        />
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </SectionCard>

          <View className="mt-4" />

          {/* Verification Queue (Pending only) */}
          <SectionCard title="Verification Queue">
            <View className="flex-row items-center px-2 pb-2" style={{ justifyContent: "center" }}>
              <TableHeaderCell label="Shop" widthPx={VQ_COLW.shop} />
              <TableHeaderCell label="Area" widthPx={VQ_COLW.area} />
              <TableHeaderCell label="Submitted" widthPx={VQ_COLW.submitted} />
              <TableHeaderCell label="Actions" widthPx={VQ_COLW.actions} />
            </View>
            <View className="mb-2 h-[1px] bg-slate-100" />

            {loading ? (
              <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>Loading shops…</Text>
            ) : filtered.filter((s) => s.status === "Pending").length === 0 ? (
              <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>No pending shops.</Text>
            ) : (
              filtered
                .filter((s) => s.status === "Pending")
                .map((s) => (
                  <View key={s.id} className="flex-row items-center rounded-xl px-2 py-2 hover:bg-slate-50" style={{ flexWrap: "nowrap" as any, justifyContent: "center" }}>
                    <View style={{ width: VQ_COLW.shop, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <ShopAvatar name={s.name || s.owner} uri={s.avatarUrl} />
                    </View>
                    <View style={{ width: VQ_COLW.area, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>{s.area}</Text>
                    </View>
                    <View style={{ width: VQ_COLW.submitted, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>{s.submittedAt ?? "-"}</Text>
                    </View>
                    <View style={{ width: VQ_COLW.actions, paddingHorizontal: 6 }}>
                      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
                        <ActionBtn icon="eye-outline" kind="view" label="View" onPress={() => openView(s)} />

                        {/* ✅ APPROVE */}
                        <ActionBtn
                          icon="checkmark-circle-outline"
                          label="Approve"
                          onPress={() =>
                            ask({
                              title: "Approve application?",
                              message: `Mark ${s.name || s.owner}'s shop as Active.`,
                              confirmText: "Approve",
                              cancelText: "Cancel",
                              icon: "checkmark-circle-outline",
                              onConfirm: async () => {
                              setConfirmOpen(false);
                              const ok = await updateVerification(s, true);
                              if (ok) {
                                // update UI
                                setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Active" } : x));

                                // ✅ send the custom message that includes the shop name
                                //    (we already have the shop name as s.name from the places map)
                                await sendVerifiedNotice(s.email, s.owner, s.name);

                                // ✅ also send a new OTP so they can log in right away
                                await sendLoginOtp(s.email);

                                setSuccessCfg({ title: "Approved", message: `${s.name || "Shop"} is now active.` });
                                setSuccessOpen(true);
                              }
                            }

                            })
                          }
                        />

                        {/* ❌ REJECT */}
                        <ActionBtn
                          icon="close-circle-outline"
                          label="Reject"
                          onPress={() =>
                            ask({
                              title: "Reject application?",
                              message: `Set ${s.name || "shop"} to Suspended (rejected).`,
                              confirmText: "Reject",
                              cancelText: "Cancel",
                              icon: "alert-circle-outline",
                              onConfirm: async () => {
                                setConfirmOpen(false);
                                const ok = await updateVerification(s, false);
                                if (ok) {
                                  setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Suspended" } : x));
                                  setSuccessCfg({ title: "Rejected", message: `${s.name || "Shop"} was rejected.` });
                                  setSuccessOpen(true);
                                }
                              },
                            })
                          }
                        />
                      </View>
                    </View>
                  </View>
                ))
            )}
          </SectionCard>
        </ScrollView>
      </View>

      {/* ------------------------ View Summary Modal ------------------------ */}
      <Modal visible={viewOpen} animationType="fade" transparent onRequestClose={() => setViewOpen(false)}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16, zIndex: 9000 }]}>
          <View className="w-full rounded-2xl bg-white" style={[{ maxWidth: VIEW_MAX_W }, cardShadow as any]}>
            {/* Header with status pill top-right */}
            <View className="flex-row items-center justify-between px-3 py-3">
              <Text className="text-[15px] font-semibold text-slate-900">Shop Summary</Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {selected ? <StatusPill s={selected.status} /> : null}
                <Pressable onPress={() => setViewOpen(false)} className="rounded-full p-1">
                  <Ionicons name="close" size={20} color="#334155" />
                </Pressable>
              </View>
            </View>
            <View className="h-[1px] bg-slate-100" />

            {/* Content */}
            <ScrollView contentContainerStyle={{ padding: 14, rowGap: 12, maxHeight: 580 }}>
              {/* Top row: image left, important info right */}
              <View style={{ flexDirection: "row", columnGap: 14, rowGap: 12, alignItems: "flex-start", flexWrap: "wrap" as any }}>
                <Image
                  source={{ uri: selected ? getShopImage(selected.name || selected.owner, selected.avatarUrl) : undefined }}
                  style={{ width: VIEW_IMG_W, height: VIEW_IMG_H, borderRadius: 18, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" }}
                />
                <View style={{ flex: 1, minWidth: 280, paddingTop: 2 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
                    {selected?.name || "—"}
                  </Text>
                  <View style={{ height: 10 }} />
                  <View style={{ rowGap: 8 }}>
                    <Field label="Address" value={selected?.area} style={{ width: "100%", minWidth: 0 }} />
                    <Field label="Contact person" value={selected?.owner} style={{ width: "100%", minWidth: 0 }} />
                    <Field label="Email" value={selected?.email} style={{ width: "100%", minWidth: 0 }} />
                  </View>
                </View>
              </View>

              <Divider />

              {/* Quick stats */}
              <View style={{ flexDirection: "row", columnGap: 8 }}>
                <StatPill label="Rating" value={`${selected?.rating?.toFixed(1) ?? "0.0"} ★`} />
                <StatPill label="Jobs" value={String(selected?.jobs ?? 0)} />
                <StatPill label="Status" value={selected?.status ?? "—"} />
              </View>

              {/* Operating schedule */}
              <View>
                <HLabel>Operating schedule</HLabel>
                {selected?.operatingDays?.length ? (
                  <View className="flex-row flex-wrap" style={{ gap: 6, marginBottom: 6 }}>
                    {selected.operatingDays.map((d) => (
                      <View key={d} className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1">
                        <Text className="text-[12px] text-blue-700">{d}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-[13px] text-slate-700">—</Text>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap" as any, columnGap: 10, rowGap: 6 }}>
                  <Field label="Opens (12hr)" value={selected?.opensAt} style={{ width: "auto", minWidth: 140 }} />
                  <Field label="Closes (12hr)" value={selected?.closesAt} style={{ width: "auto", minWidth: 140 }} />
                </View>
              </View>

              {/* Services offered */}
              <View>
                <HLabel>Services offered</HLabel>
                {selected?.servicesOffered?.length ? (
                  <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {selected.servicesOffered.map((svc) => <ChipTag key={svc} label={svc} />)}
                  </View>
                ) : (
                  <Text className="text-[13px] text-slate-700">—</Text>
                )}
                <Text style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>
                  Broad categories: {selected?.services?.length ? selected.services.join(", ") : "—"}
                </Text>
              </View>

              {/* ✅ Business proofs — supports both full URLs and storage paths; images & PDFs */}
              <View>
                <HLabel>Business proofs</HLabel>
                {selected?.proofs?.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap" as any, gap: 10 }}>
                    {selected.proofs.map((p, idx) => {
                      const url = toPublicUrl(p);
                      const isImg = isImageUrl(url);
                      const name  = fileNameFromUrl(url);

                      const open = () => {
                        if (Platform.OS === "web") window.open(url, "_blank");
                        else Linking.openURL(url).catch(() => {});
                      };

                      return (
                        <Pressable
                          key={`${p}-${idx}`}
                          onPress={open}
                          style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, overflow: "hidden" }}
                        >
                          {isImg ? (
                            <Image
                              source={{ uri: url }}
                              style={{ width: 160, height: 120, backgroundColor: "#F1F5F9" }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 160, height: 120, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", padding: 10 }}>
                              <Ionicons name="document-text-outline" size={28} color="#334155" />
                              <Text numberOfLines={2} style={{ fontSize: 11, color: "#334155", marginTop: 6, textAlign: "center" }}>
                                {name}
                              </Text>
                              <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Tap to open</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : typeof selected?.docs === "number" ? (
                  <Text className="text-[13px] text-slate-700">{selected.docs} file(s) on record</Text>
                ) : (
                  <Text className="text-[13px] text-slate-700">—</Text>
                )}
              </View>

            </ScrollView>

            <View className="h-[1px] bg-slate-100" />
            <View className="flex-row justify-center px-4 py-3">
              <ActionBtn icon="close" kind="neutral" label="Close" onPress={() => setViewOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Reusable Confirm / Success Popups ===== */}
      <ConfirmModal
        visible={confirmOpen}
        title={confirmCfg?.title ?? ""}
        message={confirmCfg?.message ?? ""}
        confirmText={confirmCfg?.confirmText ?? "Confirm"}
        cancelText={confirmCfg?.cancelText ?? "Cancel"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { confirmCfg?.onConfirm?.(); }}
      />
      <SuccessModal
        visible={successOpen}
        title={successCfg?.title ?? "Success"}
        message={successCfg?.message ?? ""}
        onClose={() => setSuccessOpen(false)}
      />
    </View>
  );
}

/* --------------------------- Dropdown --------------------------- */
function Dropdown({
  id, openId, setOpenId, icon = "funnel-outline", label, options, onSelect, widthPx = 176,
}: {
  id: string; openId: string | null; setOpenId: (v: string | null) => void;
  icon?: keyof typeof Ionicons.glyphMap; label: string; options: string[]; onSelect: (v: string) => void; widthPx?: number;
}) {
  const open = openId === id;
  return (
    <View style={{ position: "relative", zIndex: open ? 5000 : 10 }}>
      <Pressable onPress={() => setOpenId(open ? null : id)} className="flex-row items-center rounded-full border border-slate-300 bg-white px-3 py-1.5">
        <Ionicons name={icon} size={16} color={COLORS.sub} />
        <Text className="ml-2 mr-1 text-[13px] text-slate-700">{label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={COLORS.sub} />
      </Pressable>

      {open && <Pressable onPress={() => setOpenId(null)} style={[StyleSheet.absoluteFillObject, { zIndex: 4000 }]} />}

      {open && (
        <View className="rounded-lg border border-slate-200 bg-white shadow-lg" style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: widthPx, maxHeight: 280, zIndex: 5001, overflow: "scroll" }}>
          {options.map((opt) => (
            <Pressable key={opt} onPress={() => { onSelect(opt); setOpenId(null); }} className="px-4 py-2 hover:bg-slate-100">
              <Text className="text-[13px] text-slate-700">{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
