// app/(admin)/adminusers.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  Alert,
  Modal,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import AdminSideDrawer from "../../components/adminSidedrawer";
import AdminTopHeader from "../../components/AdminTopHeader";

// reusable popups
import ConfirmModal from "../../components/ConfirmModal";
import SuccessModal from "../../components/SuccessModal";

/* ============================== THEME ============================== */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E9F0",
  text: "#0F172A",
  sub: "#64748B",
  brand: "#0F2547",
  primary: "#2563EB",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  blueSoftBG: "#E8F1FF",
  blueSoftBorder: "#C7D7FE",
  blueText: "#1D4ED8",
};
const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 1 },
  default: {},
});

/* ============================== TYPES ============================== */
type UserStatus = "active" | "pending" | "suspended";
type UserRole = "driver";
type UserRow = {
  id: string;
  avatar_url?: string | null;
  full_name: string;
  email: string; // masked for table
  username?: string | null;
  role: UserRole;
  status: UserStatus;
  joined_at: string; // ISO
  last_active_at: string; // ISO
};

/* ============================== SAMPLE ============================== */
const SAMPLE: UserRow[] = [
  {
    id: "u1",
    avatar_url: null,
    full_name: "John Smith",
    email: "j***@gmail.com",
    username: "jonny77",
    role: "driver",
    status: "active",
    joined_at: "2023-03-12T09:00:00Z",
    last_active_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: "u3",
    avatar_url: null,
    full_name: "Daniel Warren",
    email: "d*****@gmail.com",
    username: "dwarren3",
    role: "driver",
    status: "suspended",
    joined_at: "2024-01-08T09:00:00Z",
    last_active_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "u2",
    avatar_url: null,
    full_name: "Olivia Bennett",
    email: "o****@gmail.com",
    username: "olly659",
    role: "driver",
    status: "pending",
    joined_at: "2022-06-27T09:00:00Z",
    last_active_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/* ============================== SHARED ============================== */
const CELL_PX = 10;
const TABLE_BODY_MAX_H = 520;

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

function TableHeaderCell({ label, widthPx }: { label: string; widthPx: number }) {
  return (
    <View style={{ width: widthPx, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function StatusPill({ s }: { s: UserStatus }) {
  const bg  = s === "active" ? "#ECFDF5" : s === "pending" ? "#FFFBEB" : "#FEF2F2";
  const txt = s === "active" ? "#047857" : s === "pending" ? "#B45309" : "#B91C1C";
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: txt, fontSize: 11, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

type BtnKind = "view" | "neutral";
function ActionBtn({
  icon, label, onPress, kind = "neutral", ghost = false,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; kind?: BtnKind; ghost?: boolean; }) {
  const base = {
    borderRadius: 999 as const,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  };
  const viewStyle = { backgroundColor: COLORS.blueSoftBG, borderColor: COLORS.blueSoftBorder };
  const neutralStyle = { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1" };
  const color = kind === "view" ? COLORS.blueText : "#475569";
  return (
    <Pressable
      onPress={onPress}
      pointerEvents={ghost ? "none" : "auto"}
      style={{ ...base, ...(kind === "view" ? viewStyle : neutralStyle), opacity: ghost ? 0 : 1 }}
    >
      <Ionicons name={icon} size={14} color={ghost ? "transparent" : color} />
      <Text style={{ color: ghost ? "transparent" : color, marginLeft: 6, fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ============================== COLUMN LAYOUT ============================== */
const COLW = {
  name: 180,
  email: 220,
  username: 120,
  status: 110,
  joined: 130,
  actions: 240,
};

/* ============================== BADGE BUTTON ============================== */
const PrimaryAddBtn = ({ label, onPress }: { label: string; onPress?: () => void }) => (
  <Pressable onPress={onPress} className="flex-row items-center gap-2 px-4 py-2" style={{ backgroundColor: COLORS.primary, borderRadius: 9999 }}>
    <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
    <Text className="text-[12px] font-medium" style={{ color: "#FFFFFF" }}>{label}</Text>
  </Pressable>
);

/* ============================== SMALL PARTS ============================== */
const Avatar = ({ uri, name, size = 28 }: { uri?: string | null; name: string; size?: number }) => {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size }} />;
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#E0E7FF" }} className="items-center justify-center">
      <Text style={{ color: "#3730A3", fontWeight: "700", fontSize: size * 0.42 }}>{initials}</Text>
    </View>
  );
};

const LabeledInput = ({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: any;
}) => (
  <View className="w-full">
    <Text className="text-[12px] mb-1" style={{ color: COLORS.sub }}>{label}</Text>
    <View className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.border, backgroundColor: "white" }}>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={{ padding: 0, color: COLORS.text, outlineStyle: "none" as any }} />
    </View>
  </View>
);

/* ============================== VIEW MODAL HELPERS (match shop modal) ============================== */
const VIEW_MAX_W = 600;
const VIEW_IMG = { w: 260, h: 200 };

/** Prefer provided uri, else seed picsum by name (same pattern as shops page) */
function getUserImage(name: string, uri?: string | null) {
  if (uri && String(uri).trim()) return uri;
  return `https://picsum.photos/seed/${encodeURIComponent(name)}/320/320`;
}

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
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 9000,
  },
});

/* ============================== MAIN ============================== */
export default function AdminUsersPage() {
  const router = useRouter();

  const [rows, setRows] = useState<UserRow[]>(SAMPLE);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [dateSort, setDateSort] = useState<"joined_desc" | "joined_asc">("joined_desc");
  const [searchFocused, setSearchFocused] = useState(false);

  // Add modal
  const [openAdd, setOpenAdd] = useState(false);
  const [addFullName, setAddFullName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addUsername, setAddUsername] = useState("");

  // Dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSpec, setConfirmSpec] = useState<{
    title: string;
    message: string;
    confirmText: string;
    tone: "warning" | "danger" | "info" | "success";
    onConfirm: () => void;
  } | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<{ title?: string; message?: string } | null>(null);

  // View modal state
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // wire Supabase here later
        setRows((prev) => prev);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.full_name.toLowerCase().includes(t) ||
          (r.username ?? "").toLowerCase().includes(t) ||
          r.email.toLowerCase().includes(t)
      );
    }
    if (status !== "all") list = list.filter((r) => r.status === status);

    switch (dateSort) {
      case "joined_desc":
        list.sort((a, b) => +new Date(b.joined_at) - +new Date(a.joined_at));
        break;
      case "joined_asc":
        list.sort((a, b) => +new Date(a.joined_at) - +new Date(b.joined_at));
        break;
    }
    return list;
  }, [rows, q, status, dateSort]);

  const confirmAction = (spec: typeof confirmSpec) => {
    setConfirmSpec(spec!);
    setConfirmOpen(true);
  };
  const toast = (title?: string, message?: string) => {
    setSuccessMsg({ title, message });
    setSuccessOpen(true);
  };

  const askSuspendOrReinstate = (user: UserRow) => {
    if (user.status === "suspended") {
      confirmAction({
        title: "Reinstate user?",
        message: `${user.full_name} will become Active.`,
        confirmText: "Reinstate",
        tone: "info",
        onConfirm: () => {
          setConfirmOpen(false);
          setRows((prev) => prev.map((r) => (r.id === user.id ? { ...r, status: "active" } : r)));
          toast("Reinstated", `${user.full_name} is now Active.`);
        },
      });
    } else {
      confirmAction({
        title: "Suspend user?",
        message: `${user.full_name} will be suspended.`,
        confirmText: "Suspend",
        tone: "danger",
        onConfirm: () => {
          setConfirmOpen(false);
          setRows((prev) => prev.map((r) => (r.id === user.id ? { ...r, status: "suspended" } : r)));
          toast("Suspended", `${user.full_name} is now Suspended.`);
        },
      });
    }
  };

  const askDelete = (u: UserRow) => {
    confirmAction({
      title: "Delete (soft) user?",
      message: "This will mark the account as deleted and anonymize PII.",
      confirmText: "Delete",
      tone: "danger",
      onConfirm: () => {
        setConfirmOpen(false);
        setRows((prev) => prev.filter((r) => r.id !== u.id));
        toast("Deleted", `${u.full_name} has been removed.`);
      },
    });
  };

  const maskEmail = (e: string) => {
    const [u, d] = e.split("@");
    if (!u || !d) return e;
    const head = u.slice(0, 1);
    return `${head}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
  };

  const onAddSave = () => {
    if (!addFullName.trim() || !addEmail.trim()) {
      Alert.alert("Missing info", "Full name and email are required.");
      return;
    }
    const newRow: UserRow = {
      id: "local_" + Math.random().toString(36).slice(2),
      avatar_url: null,
      full_name: addFullName.trim(),
      email: maskEmail(addEmail.trim()),
      username: addUsername.trim() || undefined,
      role: "driver",
      status: "active",
      joined_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    setRows((prev) => [newRow, ...prev]);
    setOpenAdd(false);
    setAddFullName("");
    setAddEmail("");
    setAddUsername("");
    setSuccessMsg({ title: "Added", message: "New driver has been created." });
    setSuccessOpen(true);
  };

  const openView = (u: UserRow) => {
    setSelectedUser(u);
    setViewOpen(true);
  };

  /* ============================== RENDER ============================== */
  return (
    <View className="flex-1 bg-[#F4F6F8] flex-row">
      <AdminSideDrawer />

      <View className="flex-1">
        <AdminTopHeader title="Users Management" />

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="px-4 md:px-6 lg:px-8 pt-4 pb-2" />

          {/* Controls */}
          <View className="px-4 md:px-6 lg:px-8">
            <View
              className="flex-row items-center justify-between gap-2 rounded-xl border px-3 py-3"
              style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface, ...cardShadow }}
            >
              <View className="flex-1 flex-row items-center gap-2">
                {/* Search */}
                <View
                  className="flex-row items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: searchFocused ? "transparent" : COLORS.border, backgroundColor: "white" }}
                >
                  <Ionicons name="search-outline" size={16} color={COLORS.sub} />
                  <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder="Search"
                    placeholderTextColor={COLORS.sub}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    className="min-w-[160px] md:min-w-[220px] text-[13px]"
                    style={{ color: COLORS.text, padding: 0, outlineStyle: "none" as any }}
                  />
                </View>

                {/* Status cycle filter */}
                <Pressable
                  onPress={() => {
                    const opts: (UserStatus | "all")[] = ["all", "active", "pending", "suspended"];
                    const idx = opts.indexOf(status);
                    setStatus(opts[(idx + 1) % opts.length] as any);
                  }}
                  className="flex-row items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.text} />
                  <Text className="text-[12px]" style={{ color: COLORS.text }}>
                    {status === "all" ? "Status" : `Status: ${status}`}
                  </Text>
                </Pressable>

                {/* Date sort toggle */}
                <Pressable
                  onPress={() => setDateSort(dateSort === "joined_desc" ? "joined_asc" : "joined_desc")}
                  className="flex-row items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}
                >
                  <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
                  <Text className="text-[12px]" style={{ color: COLORS.text }}>
                    {dateSort === "joined_desc" ? "Date: Joined ↓" : "Date: Joined ↑"}
                  </Text>
                </Pressable>
              </View>

              {/* Right: Export + Add */}
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => {
                    const headers = ["Full Name", "Email (masked)", "Username", "Status", "Joined"];
                    const lines = filtered.map((r) =>
                      [r.full_name, r.email, r.username ?? "", r.status, r.joined_at]
                        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
                        .join(",")
                    );
                    const csv = [headers.join(","), ...lines].join("\n");
                    if (Platform.OS === "web") {
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "users.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                      setSuccessMsg({ title: "Exported", message: "users.csv downloaded." });
                      setSuccessOpen(true);
                    } else {
                      Alert.alert("Export", "CSV export is available on web.");
                    }
                  }}
                  className="flex-row items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: COLORS.border, backgroundColor: COLORS.surface }}
                >
                  <Ionicons name="download-outline" size={16} color={COLORS.text} />
                  <Text className="text-[12px]" style={{ color: COLORS.text }}>Export</Text>
                </Pressable>

                <PrimaryAddBtn label="Add" onPress={() => setOpenAdd(true)} />
              </View>
            </View>
          </View>

          {/* ====== TABLE ====== */}
          <View className="px-4 md:px-6 lg:px-8 mt-4">
            <SectionCard title="Drivers">
              {/* header */}
              <View className="flex-row items-center justify-center px-2 pb-2">
                <TableHeaderCell label="Full Name"   widthPx={COLW.name} />
                <TableHeaderCell label="Email"       widthPx={COLW.email} />
                <TableHeaderCell label="Username"    widthPx={COLW.username} />
                <TableHeaderCell label="Status"      widthPx={COLW.status} />
                <TableHeaderCell label="Joined Date" widthPx={COLW.joined} />
                <TableHeaderCell label="Actions"     widthPx={COLW.actions} />
              </View>
              <View className="mb-2 h-[1px] bg-slate-100" />

              {/* body */}
              <ScrollView style={{ maxHeight: TABLE_BODY_MAX_H }} nestedScrollEnabled showsVerticalScrollIndicator>
                {loading ? (
                  <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>
                    Loading users…
                  </Text>
                ) : filtered.length === 0 ? (
                  <Text className="px-2 text-[13px] text-slate-600" style={{ textAlign: "center" }}>
                    No users match your filters.
                  </Text>
                ) : (
                  filtered.map((u) => (
                    <View
                      key={u.id}
                      className="flex-row items-center rounded-xl px-2 py-2 hover:bg-slate-50"
                      style={{ flexWrap: "nowrap" as any, justifyContent: "center" }}
                    >
                      {/* name */}
                      <View style={{ width: COLW.name, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <View className="flex-row items-center gap-3 justify-center" style={{ maxWidth: COLW.name - CELL_PX * 2 }}>
                          <Avatar uri={u.avatar_url} name={u.full_name} />
                          <Text className="text-[13px]" style={{ color: COLORS.text, textAlign: "center" }} numberOfLines={1}>
                            {u.full_name}
                          </Text>
                        </View>
                      </View>

                      {/* email */}
                      <View style={{ width: COLW.email, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <Text className="text-[13px]" style={{ color: COLORS.text, textAlign: "center", maxWidth: COLW.email - CELL_PX * 2 }} numberOfLines={1}>
                          {u.email}
                        </Text>
                      </View>

                      {/* username */}
                      <View style={{ width: COLW.username, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <Text className="text-[13px]" style={{ color: COLORS.text, textAlign: "center", maxWidth: COLW.username - CELL_PX * 2 }} numberOfLines={1}>
                          {u.username ?? "—"}
                        </Text>
                      </View>

                      {/* status */}
                      <View style={{ width: COLW.status, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <StatusPill s={u.status} />
                      </View>

                      {/* joined */}
                      <View style={{ width: COLW.joined, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <Text className="text-[13px]" style={{ color: COLORS.text, textAlign: "center" }}>
                          {new Date(u.joined_at).toLocaleDateString()}
                        </Text>
                      </View>

                      {/* actions */}
                      <View style={{ width: COLW.actions, paddingHorizontal: CELL_PX, alignItems: "center", justifyContent: "center" }}>
                        <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
                          <ActionBtn icon="eye-outline" kind="view" label="View" onPress={() => openView(u)} />
                          {u.status === "suspended" ? (
                            <ActionBtn icon="refresh-circle-outline" label="Reinstate" onPress={() => askSuspendOrReinstate(u)} />
                          ) : (
                            <ActionBtn icon="ban-outline" label="Suspend" onPress={() => askSuspendOrReinstate(u)} />
                          )}
                          <ActionBtn icon="trash-outline" label="Delete" onPress={() => askDelete(u)} />
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </SectionCard>
          </View>
        </ScrollView>
      </View>

      {/* Add modal */}
      <Modal visible={openAdd} transparent animationType="fade" onRequestClose={() => setOpenAdd(false)}>
        <Pressable className="flex-1 bg-black/30 items-center justify-center" onPress={() => setOpenAdd(false)}>
          <Pressable onPress={() => {}} className="w-[92%] sm:w-[520px] rounded-xl bg-white p-4" style={cardShadow}>
            <Text className="text-[16px] font-bold" style={{ color: COLORS.text }}>Add Driver</Text>

            <View className="mt-4 gap-3">
              <LabeledInput label="Full name" value={addFullName} onChangeText={setAddFullName} />
              <LabeledInput label="Email" value={addEmail} onChangeText={setAddEmail} keyboardType="email-address" />
              <LabeledInput label="Username (optional)" value={addUsername} onChangeText={setAddUsername} />
            </View>

            <View className="mt-6 flex-row items-center justify-end gap-2">
              <Pressable onPress={() => setOpenAdd(false)} className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onAddSave}
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: COLORS.blueSoftBG, borderColor: COLORS.blueSoftBorder, borderWidth: 1 }}
              >
                <Text style={{ color: COLORS.blueText }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== View Summary Modal (shop-style card) ===== */}
      <Modal visible={viewOpen} animationType="fade" transparent onRequestClose={() => setViewOpen(false)}>
        <View style={styles.backdrop}>
          <View className="w-full rounded-2xl bg-white" style={[{ maxWidth: VIEW_MAX_W }, cardShadow as any]}>
            {/* Header with status pill + close */}
            <View className="flex-row items-center justify-between px-3 py-3">
              <Text className="text-[15px] font-semibold text-slate-900">User Summary</Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {selectedUser ? <StatusPill s={selectedUser.status} /> : null}
                <Pressable onPress={() => setViewOpen(false)} className="rounded-full p-1">
                  <Ionicons name="close" size={20} color="#334155" />
                </Pressable>
              </View>
            </View>
            <View className="h-[1px] bg-slate-100" />

            {/* Content */}
            <ScrollView contentContainerStyle={{ padding: 14, rowGap: 12, maxHeight: 580 }}>
              {/* Top row: big image + key info */}
              <View style={{ flexDirection: "row", columnGap: 14, rowGap: 12, alignItems: "flex-start", flexWrap: "wrap" as any }}>
                <Image
                  source={{ uri: getUserImage(selectedUser?.full_name ?? "User", selectedUser?.avatar_url ?? undefined) }}
                  style={{
                    width: VIEW_IMG.w,
                    height: VIEW_IMG.h,
                    borderRadius: 18,
                    backgroundColor: "#F1F5F9",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                />
                <View style={{ flex: 1, minWidth: 280, paddingTop: 2 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
                    {selectedUser?.full_name ?? "—"}
                  </Text>
                  <View style={{ height: 10 }} />
                  <View style={{ rowGap: 8 }}>
                    <Field label="Email (masked)" value={selectedUser?.email} style={{ width: "100%", minWidth: 0 }} />
                    <Field label="Username" value={selectedUser?.username ?? "—"} style={{ width: "100%", minWidth: 0 }} />
                    <Field label="Role" value={selectedUser?.role ?? "—"} style={{ width: "100%", minWidth: 0 }} />
                  </View>
                </View>
              </View>

              <Divider />

              {/* Quick stats */}
              <View style={{ flexDirection: "row", columnGap: 8 }}>
                <StatPill
                  label="Status"
                  value={selectedUser?.status ? selectedUser.status.charAt(0).toUpperCase() + selectedUser.status.slice(1) : "—"}
                />
                <StatPill
                  label="Joined"
                  value={selectedUser?.joined_at ? new Date(selectedUser.joined_at).toLocaleDateString() : "—"}
                />
                <StatPill
                  label="Last Active"
                  value={selectedUser?.last_active_at ? new Date(selectedUser.last_active_at).toLocaleString() : "—"}
                />
              </View>
            </ScrollView>

            <View className="h-[1px] bg-slate-100" />
            <View className="flex-row justify-center px-4 py-3">
              <ActionBtn icon="close" kind="neutral" label="Close" onPress={() => setViewOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Popups */}
      <ConfirmModal
        visible={confirmOpen && !!confirmSpec}
        title={confirmSpec?.title}
        message={confirmSpec?.message}
        confirmText={confirmSpec?.confirmText}
        tone={confirmSpec?.tone}
        showIcon={false}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmSpec?.onConfirm?.();
        }}
      />
      <SuccessModal
        visible={successOpen && !!successMsg}
        title={successMsg?.title}
        message={successMsg?.message}
        onClose={() => setSuccessOpen(false)}
      />
    </View>
  );
}
