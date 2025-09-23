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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

// shared UI
import AdminSideDrawer from "../../components/adminSidedrawer";
import AdminTopHeader from "../../components/AdminTopHeader";

// 🆕 reusable popups
import ConfirmModal from "../../components/ConfirmModal";
import SuccessModal from "../../components/SuccessModal";

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
  id: string;
  name: string;
  owner: string;
  email?: string;
  avatarUrl?: string;
  services: BroadService[];
  servicesOffered?: string[];
  area: string;
  rating: number;
  jobs: number;
  status: "Active" | "Pending" | "Suspended";
  submittedAt?: string;
  docs?: number;
  operatingDays?: string[];
  opensAt?: string;
  closesAt?: string;
  proofs?: string[];
};

/* --------------------------- services list --------------------------- */
const SERVICE_OPTIONS = [
  "Oil Change","Engine Tune-up","Brake Repair","Transmission Service","Wheel Alignment","Tire Rotation",
  "Battery Replacement","Electrical System Repair","Suspension Repair","Air Conditioning Service",
  "Exhaust System Repair","Diagnostic Services","Wheel Balancing","Radiator Flush","Fuel System Cleaning",
  "Belt and Hose Replacement","Headlight Restoration","Windshield Wiper Replacement","Wheel Repair",
  "Vulcanizing/Tire Patching",
] as const;

const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sat", "Sun"] as const;

function categorize(option: string): BroadService {
  if (/battery/i.test(option)) return "Battery";
  if (/vulcan|tire|wheel/i.test(option)) return "Vulcanize";
  return "Repair";
}

/* --------------------------- mock data --------------------------- */
const INITIAL_SHOPS: Shop[] = [
  {
    id:"s1", name:"TireCare PH", owner:"K. Ramos", email:"tirecare@example.com",
    services:["Vulcanize"], servicesOffered:["Wheel Repair","Vulcanizing/Tire Patching","Wheel Balancing"],
    area:"Taguig", rating:4.9, jobs:302, status:"Active",
    operatingDays:["M","T","W","Th","F","Sat"], opensAt:"08:00", closesAt:"20:00",
    proofs:["DTI.pdf","MayorPermit.jpg"]
  },
  {
    id:"s2", name:"QuickFix Tires", owner:"J. Santos", email:"quickfix@example.com",
    services:["Vulcanize","Repair"], servicesOffered:["Wheel Alignment","Tire Rotation","Oil Change"],
    area:"Quezon City", rating:4.7, jobs:214, status:"Active",
    operatingDays:["M","T","W","Th","F"], opensAt:"09:00", closesAt:"18:00",
  },
  {
    id:"s3", name:"Battery Bros", owner:"M. Cruz", email:"batterybros@example.com",
    services:["Battery"], servicesOffered:["Battery Replacement","Diagnostic Services"],
    area:"Makati", rating:4.5, jobs:168, status:"Active",
    operatingDays:["M","T","W","Th","F","Sat"], opensAt:"07:30", closesAt:"19:30",
  },
  {
    id:"s4", name:"Ride Rescue Hub", owner:"A. Dela Cruz", email:"rrhub@example.com",
    services:["Repair","Battery"], servicesOffered:["Engine Tune-up","Suspension Repair"],
    area:"Pasig", rating:4.2, jobs:132, status:"Pending",
    submittedAt:"2025-09-18 14:22", docs:2, operatingDays:["M","T","W","Th","F"], opensAt:"08:00", closesAt:"17:00",
    proofs:["DTI_cert.pdf","Barangay_Clearance.jpg"]
  },
  {
    id:"s5", name:"Moto Clinic", owner:"P. Lim", email:"motoclinic@example.com",
    services:["Repair"], servicesOffered:["Air Conditioning Service","Exhaust System Repair"],
    area:"Manila", rating:3.8, jobs:59, status:"Suspended",
    operatingDays:["M","T","W","Th","F"], opensAt:"10:00", closesAt:"19:00"
  },
];

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

/* Avatars kept for Verification Queue */
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

/* Buttons */
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
    <Pressable
      onPress={onPress}
      pointerEvents={ghost ? "none" : "auto"}
      style={{ ...base, ...(kind === "view" ? viewStyle : neutralStyle), opacity: ghost ? 0 : 1 }}
    >
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

/* --------------------------- Dropdowns --------------------------- */
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

/* ----------------------- View modal helpers ----------------------- */
function getShopImage(name: string, uri?: string) {
  if (uri && uri.trim()) return uri;
  return `https://picsum.photos/seed/${encodeURIComponent(name)}/320/320`;
}

/* Modal sizing */
const VIEW_MAX_W = 600;
const VIEW_IMG_W = 260;
const VIEW_IMG_H = 200;

function HLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 13, color: "#475569", fontWeight: "700", letterSpacing: 0.2, marginBottom: 6 }}>
      {children}
    </Text>
  );
}
function Divider() {
  return <View style={{ height: 1, backgroundColor: "#EEF2F6", marginVertical: 10 }} />;
}
function Field({
  label,
  value,
  style,
}: {
  label: string;
  value?: string | number;
  style?: any;
}) {
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

  const [shops, setShops] = useState<Shop[]>(INITIAL_SHOPS);

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

  /* ---------------------------- Add modal ---------------------------- */
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
      id: `s${Date.now()}`,
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
    };
    setShops((prev) => [newShop, ...prev]);
    setAddOpen(false); clearAddForm();

    // show success popup instead of alert
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
          {/* Shops & Mechanics (services column removed) */}
          <SectionCard title="Shops & Mechanics">
            {/* header */}
            <View className="flex-row items-center px-2 pb-2" style={{ justifyContent: "center" }}>
              {/* 🔹 changed from "Shop" to "Shop Name" */}
              <TableHeaderCell label="Shop Name" flex={COLW.nameFlex} />
              <TableHeaderCell label="Contact person" flex={COLW.contactFlex} />
              <TableHeaderCell label="Area" widthPx={COLW.area} />
              <TableHeaderCell label="Rating" widthPx={COLW.rating} />
              <TableHeaderCell label="Jobs completed" widthPx={COLW.jobs} />
              <TableHeaderCell label="Status" widthPx={COLW.status} />
              <TableHeaderCell label="Actions" widthPx={COLW.actions} />
            </View>
            <View className="mb-2 h-[1px] bg-slate-100" />

            {mainList.map((s) => (
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

                {/* status perfectly centered */}
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
                            message: `${s.name} will be hidden from drivers until reinstated.`,
                            confirmText: "Suspend",
                            cancelText: "Cancel",
                            icon: "alert-circle-outline",
                            onConfirm: () => {
                              setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Suspended" } : x));
                              setConfirmOpen(false);
                              setSuccessCfg({ title: "Shop suspended", message: `${s.name} is now suspended.` });
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
                            message: `Restore ${s.name} to Active status.`,
                            confirmText: "Reinstate",
                            cancelText: "Cancel",
                            icon: "checkmark-circle-outline",
                            onConfirm: () => {
                              setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Active" } : x));
                              setConfirmOpen(false);
                              setSuccessCfg({ title: "Shop reinstated", message: `${s.name} is now active.` });
                              setSuccessOpen(true);
                            },
                          })
                        }
                      />
                    )}
                  </View>
                </View>
              </View>
            ))}
          </SectionCard>

          <View className="mt-4" />

          {/* Verification Queue (Pending only, services column removed) */}
          <SectionCard title="Verification Queue">
            <View className="flex-row items-center px-2 pb-2" style={{ justifyContent: "center" }}>
              <TableHeaderCell label="Shop" widthPx={VQ_COLW.shop} />
              <TableHeaderCell label="Area" widthPx={VQ_COLW.area} />
              <TableHeaderCell label="Submitted" widthPx={VQ_COLW.submitted} />
              <TableHeaderCell label="Actions" widthPx={VQ_COLW.actions} />
            </View>
            <View className="mb-2 h-[1px] bg-slate-100" />

            {filtered.filter((s) => s.status === "Pending").length === 0 ? (
              <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>
                No pending shops.
              </Text>
            ) : (
              filtered
                .filter((s) => s.status === "Pending")
                .map((s) => (
                  <View key={s.id} className="flex-row items-center rounded-xl px-2 py-2 hover:bg-slate-50" style={{ flexWrap: "nowrap" as any, justifyContent: "center" }}>
                    <View style={{ width: VQ_COLW.shop, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <ShopAvatar name={s.name} uri={s.avatarUrl} />
                    </View>

                    <View style={{ width: VQ_COLW.area, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>
                        {s.area}
                      </Text>
                    </View>

                    <View style={{ width: VQ_COLW.submitted, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                      <Text className="text-[13px] text-slate-700" style={{ textAlign: "center" }}>
                        {s.submittedAt ?? "-"}
                      </Text>
                    </View>

                    <View style={{ width: VQ_COLW.actions, paddingHorizontal: 6 }}>
                      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
                        <ActionBtn icon="eye-outline" kind="view" label="View" onPress={() => openView(s)} />
                        <ActionBtn
                          icon="checkmark-circle-outline"
                          label="Approve"
                          onPress={() =>
                            ask({
                              title: "Approve application?",
                              message: `Mark ${s.name} as Active.`,
                              confirmText: "Approve",
                              cancelText: "Cancel",
                              icon: "checkmark-circle-outline",
                              onConfirm: () => {
                                setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Active" } : x));
                                setConfirmOpen(false);
                                setSuccessCfg({ title: "Approved", message: `${s.name} is now active.` });
                                setSuccessOpen(true);
                              },
                            })
                          }
                        />
                        <ActionBtn
                          icon="close-circle-outline"
                          label="Reject"
                          onPress={() =>
                            ask({
                              title: "Reject application?",
                              message: `Set ${s.name} to Suspended (rejected).`,
                              confirmText: "Reject",
                              cancelText: "Cancel",
                              icon: "alert-circle-outline",
                              onConfirm: () => {
                                setShops(prev => prev.map(x => x.id === s.id ? { ...x, status: "Suspended" } : x));
                                setConfirmOpen(false);
                                setSuccessCfg({ title: "Rejected", message: `${s.name} was rejected.` });
                                setSuccessOpen(true);
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

      {/* ------------------------ Add Modal ------------------------ */}
      <Modal visible={addOpen} animationType="fade" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16, zIndex: 9000 }]}>
          <View className="w-full rounded-2xl bg-white" style={[{ maxWidth: 900 }, cardShadow as any]}>
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text className="text-[15px] font-semibold text-slate-900">Add Shop / Mechanic</Text>
              <Pressable onPress={() => setAddOpen(false)} className="rounded-full p-1">
                <Ionicons name="close" size={20} color="#334155" />
              </Pressable>
            </View>
            <View className="h-[1px] bg-slate-100" />

            <ScrollView contentContainerStyle={{ padding: 16, rowGap: 12, maxHeight: 640 }}>
              <View className="flex-row" style={{ gap: 10 }}>
                <View className="flex-1">
                  <Text className="mb-1 text-[12px] text-slate-600">Shop name</Text>
                  <TextInput value={addName} onChangeText={setAddName} placeholder="e.g., Rapid Rescue Works" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-[12px] text-slate-600">Contact person</Text>
                  <TextInput value={addOwner} onChangeText={setAddOwner} placeholder="Full name" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-[12px] text-slate-600">Email</Text>
                  <TextInput keyboardType="email-address" value={addEmail} onChangeText={setAddEmail} placeholder="name@example.com" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" autoCapitalize="none" />
                </View>
              </View>

              <View>
                <Text className="mb-1 text-[12px] text-slate-600">Contact address / Area</Text>
                <TextInput value={addArea} onChangeText={setAddArea} placeholder="Street, Barangay, City" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" />
              </View>

              <View>
                <Text className="mb-2 text-[12px] text-slate-600">Services offered</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {SERVICE_OPTIONS.map((svc) => (
                    <ChipToggle key={svc} selected={offered.includes(svc)} label={svc} onToggle={() => toggleOffered(svc)} />
                  ))}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-[12px] text-slate-600">Operating days</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {DAY_LABELS.map((d) => (
                    <ChipToggle key={d} selected={days.includes(d)} label={d} onToggle={() => toggleDay(d)} />
                  ))}
                </View>
                <Text className="mt-1 text-[11px] text-slate-500">Pick at least one day.</Text>
              </View>

              <View className="flex-row" style={{ gap: 10 }}>
                <View className="flex-1">
                  <Text className="mb-1 text-[12px] text-slate-600">Opens (24h)</Text>
                  <TextInput value={opensAt} onChangeText={setOpensAt} placeholder="08:00" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-[12px] text-slate-600">Closes (24h)</Text>
                  <TextInput value={closesAt} onChangeText={setClosesAt} placeholder="22:00" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800" placeholderTextColor="#94A3B8" />
                </View>
              </View>

              <View>
                <Text className="mb-2 text-[12px] text-slate-600">Business proof / certificates</Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <ActionBtn icon="cloud-upload-outline" label="Upload files" onPress={pickProofs} kind="view" />
                  <Text className="text-[12px] text-slate-600">{proofs.length ? `${proofs.length} file(s) selected` : "Upload image(s) or PDF(s)."}</Text>
                </View>
              </View>
            </ScrollView>

            <View className="flex-row justify-end px-4 py-3" style={{ gap: 8 }}>
              <ActionBtn icon="refresh-outline" label="Clear" onPress={clearAddForm} />
              <Pressable onPress={submitAdd} className="flex-row items-center rounded-full bg-blue-600 px-3 py-2">
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text className="ml-1 text-[12px] font-medium text-white">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------ View Summary Modal ------------------------ */}
      <Modal visible={viewOpen} animationType="fade" transparent onRequestClose={() => setViewOpen(false)}>
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16, zIndex: 9000 },
          ]}
        >
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
                  source={{ uri: selected ? getShopImage(selected.name, selected.avatarUrl) : undefined }}
                  style={{ width: VIEW_IMG_W, height: VIEW_IMG_H, borderRadius: 18, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" }}
                />
                <View style={{ flex: 1, minWidth: 280, paddingTop: 2 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
                    {selected?.name ?? "—"}
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
                  <Field label="Opens (24h)" value={selected?.opensAt} style={{ width: "auto", minWidth: 140 }} />
                  <Field label="Closes (24h)" value={selected?.closesAt} style={{ width: "auto", minWidth: 140 }} />
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

              {/* Business proofs */}
              <View>
                <HLabel>Business proofs</HLabel>
                {selected?.proofs?.length ? (
                  <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {selected.proofs.map((p, idx) => <ChipTag key={`${p}-${idx}`} label={p} />)}
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

      {/* ===== Reusable Confirm / Success Popups (keep inside the big container) ===== */}
     
        <ConfirmModal
          visible={confirmOpen}
          title={confirmCfg?.title ?? ""}
          message={confirmCfg?.message ?? ""}
          confirmText={confirmCfg?.confirmText ?? "Confirm"}
          cancelText={confirmCfg?.cancelText ?? "Cancel"}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {                            // ✅ ensure return type is void
            confirmCfg?.onConfirm?.();
          }}
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
