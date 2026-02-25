import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';

const SettingsScreen = ({ navigation }) => {
  const { token } = useAuth();
  const [form, setForm] = useState({ displayName: '', bio: '', age: '' });
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const { displayName, bio, age, tags } = data.user;
          setForm({ displayName: displayName ?? '', bio: bio ?? '', age: String(age ?? '') });
          setTagsInput((tags ?? []).join(', '));
        }
      })
      .catch(() => Alert.alert('Error', 'Could not load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName,
          bio: form.bio,
          age: parseInt(form.age, 10),
          tags,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Saved', 'Profile updated successfully');
        navigation.goBack();
      } else {
        Alert.alert('Error', data.error ?? 'Could not save');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Edit Profile</Text>

        {[
          { label: 'Display Name', field: 'displayName', placeholder: 'Your name' },
          { label: 'Age', field: 'age', placeholder: '18+', keyboard: 'numeric' },
        ].map(({ label, field, placeholder, keyboard }) => (
          <View key={field} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor="#9ca3af"
              value={form[field]}
              onChangeText={v => setForm(prev => ({ ...prev, [field]: v }))}
              keyboardType={keyboard ?? 'default'}
            />
          </View>
        ))}

        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Tell people about yourself..."
            placeholderTextColor="#9ca3af"
            value={form.bio}
            onChangeText={v => setForm(prev => ({ ...prev, bio: v }))}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{form.bio.length}/500</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interests (comma-separated)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. coffee, hiking, music"
            placeholderTextColor="#9ca3af"
            value={tagsInput}
            onChangeText={setTagsInput}
          />
          <Text style={styles.hint}>Max 10 tags</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 16, color: '#1f2937' },
  inputMulti: { height: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 4 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default SettingsScreen;
