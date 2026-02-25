import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { API_URL } from '../../config/api';

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '2 hrs', value: 120 },
  { label: '4 hrs', value: 240 },
];

const CreateBeaconScreen = ({ navigation }) => {
  const { token } = useAuth();
  const { location } = useLocation();
  const [form, setForm] = useState({ title: '', description: '', duration: 60, maxAttendees: '' });
  const [loading, setLoading] = useState(false);

  const update = (field) => (value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleCreate = async () => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    if (!location) {
      Alert.alert('Error', 'Location access is needed to create a beacon');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/beacons`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          durationMinutes: form.duration,
          maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Beacon Created!', 'Your beacon is now live.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', data.error ?? 'Could not create beacon');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="radio" size={32} color="#f59e0b" />
          </View>
          <Text style={styles.heading}>Create a Beacon</Text>
          <Text style={styles.subheading}>Let people nearby know what you're doing</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Coffee at Central Park"
            placeholderTextColor="#9ca3af"
            value={form.title}
            onChangeText={update('title')}
            maxLength={80}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Tell people what this is about..."
            placeholderTextColor="#9ca3af"
            value={form.description}
            onChangeText={update('description')}
            multiline
            numberOfLines={3}
            maxLength={300}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Duration</Text>
          <View style={styles.durationRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d.value}
                style={[styles.durationBtn, form.duration === d.value && styles.durationBtnActive]}
                onPress={() => setForm(prev => ({ ...prev, duration: d.value }))}
              >
                <Text style={[styles.durationText, form.duration === d.value && styles.durationTextActive]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Max Attendees (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Leave blank for unlimited"
            placeholderTextColor="#9ca3af"
            value={form.maxAttendees}
            onChangeText={update('maxAttendees')}
            keyboardType="numeric"
            maxLength={4}
          />
        </View>

        {!location && (
          <View style={styles.locationWarning}>
            <Ionicons name="warning-outline" size={16} color="#f59e0b" />
            <Text style={styles.locationWarningText}>Location access needed to place beacon</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Beacon</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  iconRow: { alignItems: 'center', marginBottom: 32 },
  iconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  heading: { fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 4 },
  subheading: { fontSize: 15, color: '#9ca3af', textAlign: 'center' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 16, color: '#1f2937' },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  durationBtnActive: { backgroundColor: '#6366f1' },
  durationText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  durationTextActive: { color: '#fff' },
  locationWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fffbeb', padding: 12, borderRadius: 10, marginBottom: 16 },
  locationWarningText: { fontSize: 13, color: '#92400e' },
  createBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CreateBeaconScreen;
