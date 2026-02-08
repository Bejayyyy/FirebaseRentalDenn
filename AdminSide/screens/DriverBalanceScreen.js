"use strict";

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { bookingsService } from "../services/firebaseService";

export default function DriverBalanceScreen() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await bookingsService.list();
        setBookings(list || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const completed = bookings.filter((b) => b.status === "completed");
  const payments = completed.reduce((sum, b) => sum + (Number(b.payment_at_start) || 0) + (Number(b.payment_at_end) || 0), 0);
  const deductions = completed.reduce((sum, b) => sum + (Number(b.fuel_charge) || 0) + (Number(b.delay_fee) || 0), 0);
  const netBalance = payments - deductions;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Balance</Text>
        <Text style={styles.subtitle}>Earnings and deductions from your assigned trips</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Net Balance</Text>
          <Text style={[styles.cardValue, netBalance >= 0 ? styles.positive : styles.negative]}>
            ₱{netBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Ionicons name="cash" size={24} color="#059669" />
            <Text style={styles.cardLabel}>Total payments received</Text>
            <Text style={styles.positive}>₱{payments.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Ionicons name="remove-circle" size={24} color="#dc2626" />
            <Text style={styles.cardLabel}>Deductions (fuel + delay)</Text>
            <Text style={styles.negative}>₱{deductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Completed trips ({completed.length})</Text>
        {completed.length === 0 ? (
          <Text style={styles.empty}>No completed trips yet.</Text>
        ) : (
          completed.slice(0, 20).map((b) => (
            <View key={b.id} style={styles.tripCard}>
              <Text style={styles.tripDate}>
                {b.rental_start_date ? new Date(b.rental_start_date).toLocaleDateString() : "—"}
              </Text>
              <Text style={styles.tripPay}>+ ₱{((Number(b.payment_at_start) || 0) + (Number(b.payment_at_end) || 0)).toFixed(2)}</Text>
              <Text style={styles.tripDed}>− ₱{((Number(b.fuel_charge) || 0) + (Number(b.delay_fee) || 0)).toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fcfcfc" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: 20, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  half: { flex: 1, marginHorizontal: 4 },
  row: { flexDirection: "row", marginBottom: 12 },
  cardLabel: { fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 8 },
  cardValue: { fontSize: 28, fontWeight: "800", marginTop: 4 },
  positive: { color: "#059669" },
  negative: { color: "#dc2626" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111", marginTop: 8, marginBottom: 8 },
  empty: { color: "#9ca3af", padding: 16 },
  tripCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 12, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: "#eee" },
  tripDate: { flex: 1, fontSize: 14, color: "#374151" },
  tripPay: { fontSize: 13, color: "#059669", marginRight: 12 },
  tripDed: { fontSize: 13, color: "#dc2626" },
});
