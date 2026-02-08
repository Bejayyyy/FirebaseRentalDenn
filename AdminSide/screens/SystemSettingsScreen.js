"use strict";

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { systemSettingsService, getRoleSync } from "../services/firebaseService";
import ActionModal from "../components/AlertModal/ActionModal";

export default function SystemSettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fuelPrice, setFuelPrice] = useState("");
  const [delayFee, setDelayFee] = useState("");
  const [feedback, setFeedback] = useState({ visible: false, type: "success", message: "" });

  useEffect(() => {
    if (getRoleSync() !== "owner") {
      navigation.goBack();
      return;
    }
    systemSettingsService
      .get()
      .then((s) => {
        setFuelPrice(String(s.fuel_price_per_liter ?? ""));
        setDelayFee(String(s.delay_fee_per_hour ?? ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigation]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await systemSettingsService.upsert({
        fuel_price_per_liter: parseFloat(fuelPrice) || 0,
        delay_fee_per_hour: parseFloat(delayFee) || 0,
      });
      setFeedback({ visible: true, type: "success", message: "Settings saved." });
    } catch (e) {
      setFeedback({ visible: true, type: "error", message: e?.message || "Failed to save." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>Fuel price per liter (₱)</Text>
        <TextInput
          style={styles.input}
          value={fuelPrice}
          onChangeText={setFuelPrice}
          placeholder="e.g. 65"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Delay fee per hour (₱)</Text>
        <TextInput
          style={styles.input}
          value={delayFee}
          onChangeText={setDelayFee}
          placeholder="e.g. 100"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
        />
        <Text style={styles.hint}>Used to auto-calculate fuel shortage charges and late return fees for driver trips.</Text>
        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save settings"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  label: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 8, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 20 },
  hint: { fontSize: 13, color: "#6b7280", marginBottom: 24 },
  saveBtn: { backgroundColor: "#222", paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
