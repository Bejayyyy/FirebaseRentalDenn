"use strict";

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appUsersService, firebaseAuth } from "../services/firebaseService";
import ActionModal from "../components/AlertModal/ActionModal";


const ROLES = [
  { label: "Admin", value: "admin" },
  { label: "Driver", value: "driver" },
];
const STATUSES = [
  { label: "Active", value: "active" },
  { label: "Disabled", value: "disabled" },
];

export default function UserManagementScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    contact_number: "",
    password: "",
    role: "admin",
    status: "active",
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [feedback, setFeedback] = useState({ visible: false, type: "success", message: "" });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const list = await appUsersService.listByOwner();
      setUsers(list || []);
    } catch (e) {
      console.error(e);
      setFeedback({ visible: true, type: "error", message: e?.message || "Failed to load users" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);
  

  const openAdd = () => {
    setEditingUser(null);
    setForm({
      full_name: "",
      email: "",
      contact_number: "",
      password: "",
      role: "admin",
      status: "active",
    });
    setModalVisible(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      full_name: u.full_name || "",
      email: u.email || "",
      contact_number: u.contact_number || "",
      password: "",
      role: u.role || "admin",
      status: u.status || "active",
    });
    setModalVisible(true);
  };

  
const handleSave = async () => {
  if (!form.full_name?.trim() || !form.email?.trim()) {
    Alert.alert("Error", "Full name and email are required.");
    return;
  }
  if (!editingUser && !form.password?.trim()) {
    Alert.alert("Error", "Password is required for new users.");
    return;
  }

  setSubmitLoading(true);

  try {
    if (editingUser) {
      // Update existing user
      await appUsersService.update(editingUser.id, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        contact_number: form.contact_number?.trim() || null,
        status: form.status,
      });
      setFeedback({ visible: true, type: "success", message: "User updated." });
    } else {
      // Create user via Firestore + Firebase Auth (no Cloud Function)
      await appUsersService.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        contact_number: form.contact_number?.trim() || null,
        password: form.password,
        role: form.role,
        status: form.status,
      });
      setFeedback({ visible: true, type: "success", message: "User created successfully." });
    }

    setModalVisible(false);
    loadUsers();
  } catch (e) {
    setFeedback({ visible: true, type: "error", message: e?.message || "Failed to save" });
  } finally {
    setSubmitLoading(false);
  }
};


  const handleResetPassword = (u) => {
    Alert.alert(
      "Reset Password",
      `Send password reset email to ${u.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            try {
              await firebaseAuth.resetPasswordForEmail(u.email);
              setFeedback({ visible: true, type: "success", message: "Reset email sent." });
            } catch (e) {
              setFeedback({ visible: true, type: "error", message: e?.message || "Failed to send" });
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardName}>{item.full_name || item.email}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, item.role === "admin" ? styles.badgeAdmin : styles.badgeDriver]}>
            <Text style={styles.badgeText}>{item.role}</Text>
          </View>
          <View style={[styles.badge, item.status === "active" ? styles.badgeActive : styles.badgeDisabled]}>
            <Text style={styles.badgeText}>{item.status}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.cardEmail}>{item.email}</Text>
      {item.contact_number ? <Text style={styles.cardContact}>{item.contact_number}</Text> : null}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardBtn} onPress={() => openEdit(item)}>
          <Ionicons name="pencil" size={18} color="#222" />
          <Text style={styles.cardBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardBtn} onPress={() => handleResetPassword(item)}>
          <Ionicons name="key" size={18} color="#222" />
          <Text style={styles.cardBtnText}>Reset password</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <Text style={styles.subtitle}>Add or edit Admin & Driver accounts (Owner only)</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add User</Text>
        </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#374151" }]} onPress={() => navigation.navigate("SystemSettings")}>
            <Ionicons name="settings" size={20} color="#fff" />
            <Text style={styles.addBtnText}>System settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={users.filter((u) => u.role !== "owner")}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No Admin/Driver users yet. Add one above.</Text>}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingUser ? "Edit User" : "Add User"}</Text>
            <ScrollView style={styles.form}>
              <Text style={styles.label}>Full name *</Text>
              <TextInput
                style={styles.input}
                value={form.full_name}
                onChangeText={(t) => setForm({ ...form, full_name: t })}
                placeholder="Full name"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={[styles.input, editingUser && styles.inputDisabled]}
                value={form.email}
                onChangeText={(t) => setForm({ ...form, email: t })}
                placeholder="email@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                editable={!editingUser}
              />
              <Text style={styles.label}>Contact number</Text>
              <TextInput
                style={styles.input}
                value={form.contact_number}
                onChangeText={(t) => setForm({ ...form, contact_number: t })}
                placeholder="+63..."
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
              {!editingUser && (
                <>
                  <Text style={styles.label}>Password *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.password}
                    onChangeText={(t) => setForm({ ...form, password: t })}
                    placeholder="Min 6 characters"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                  />
                </>
              )}
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.roleBtn, form.role === r.value && styles.roleBtnActive]}
                    onPress={() => setForm({ ...form, role: r.value })}
                  >
                    <Text style={[styles.roleBtnText, form.role === r.value && styles.roleBtnTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Status</Text>
              <View style={styles.roleRow}>
                {STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.roleBtn, form.status === s.value && styles.roleBtnActive]}
                    onPress={() => setForm({ ...form, status: s.value })}
                  >
                    <Text style={[styles.roleBtnText, form.status === s.value && styles.roleBtnTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={submitLoading}>
                <Text style={styles.saveBtnText}>{submitLoading ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ActionModal
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.type === "success" ? "Success" : "Error"}
        message={feedback.message}
        confirmText="OK"
        onClose={() => setFeedback({ ...feedback, visible: false })}
        onConfirm={() => setFeedback({ ...feedback, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fcfcfc" },
  header: { padding: 20, paddingTop: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#222", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, marginTop: 16, alignSelf: "flex-start" },
  addBtnText: { color: "#fff", fontWeight: "600", marginLeft: 8 },
  loader: { marginTop: 40 },
  list: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 16, fontWeight: "700", color: "#111" },
  badges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeAdmin: { backgroundColor: "#dbeafe" },
  badgeDriver: { backgroundColor: "#d1fae5" },
  badgeActive: { backgroundColor: "#dcfce7" },
  badgeDisabled: { backgroundColor: "#fee2e2" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#374151", textTransform: "uppercase" },
  cardEmail: { fontSize: 14, color: "#6b7280", marginTop: 6 },
  cardContact: { fontSize: 13, color: "#9ca3af", marginTop: 2 },
  cardActions: { flexDirection: "row", marginTop: 12, gap: 12 },
  cardBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#f3f4f6", borderRadius: 6 },
  cardBtnText: { fontSize: 13, fontWeight: "600", color: "#222", marginLeft: 4 },
  empty: { textAlign: "center", color: "#9ca3af", padding: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "700", padding: 20, borderBottomWidth: 1, borderBottomColor: "#eee" },
  form: { padding: 20, maxHeight: 400 },
  label: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 6, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  inputDisabled: { backgroundColor: "#f3f4f6", color: "#6b7280" },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  roleBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#f3f4f6" },
  roleBtnActive: { backgroundColor: "#222" },
  roleBtnText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  roleBtnTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center" },
  cancelBtnText: { fontWeight: "600", color: "#374151" },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: "#222", alignItems: "center" },
  saveBtnText: { fontWeight: "600", color: "#fff" },
});
