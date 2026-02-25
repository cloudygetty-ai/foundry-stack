import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';

const UserProfileScreen = ({ route, navigation }) => {
  const { userId } = route.params;
  const { token } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.success) setUser(data.user); })
      .catch(() => Alert.alert('Error', 'Could not load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleMessage = () => navigation.navigate('Chat', { userId, userName: user?.displayName });

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  if (!user) return <View style={styles.center}><Text>User not found</Text></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        {user.photoUrl ? (
          <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{user.displayName?.[0] ?? '?'}</Text>
          </View>
        )}
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.displayName}</Text>
          {user.isVerified && <Ionicons name="checkmark-circle" size={22} color="#6366f1" />}
        </View>
        <Text style={styles.age}>Age {user.age}</Text>
        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      </View>

      {user.tags?.length > 0 && (
        <View style={styles.tagsSection}>
          <Text style={styles.sectionLabel}>Interests</Text>
          <View style={styles.tags}>
            {user.tags.map((tag, i) => (
              <View key={i} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.msgBtn} onPress={handleMessage}>
          <Ionicons name="chatbubble" size={20} color="#fff" />
          <Text style={styles.msgBtnText}>Send Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportBtn} onPress={() => Alert.alert('Report', 'Report submitted')}>
          <Ionicons name="flag-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { backgroundColor: '#fff', padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  avatarFallback: { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 48, fontWeight: 'bold', color: '#6b7280' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 26, fontWeight: 'bold', color: '#1f2937' },
  age: { fontSize: 15, color: '#9ca3af', marginBottom: 12 },
  bio: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  tagsSection: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 13, color: '#6366f1' },
  actions: { flexDirection: 'row', padding: 16, gap: 12 },
  msgBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366f1', padding: 14, borderRadius: 12 },
  msgBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  reportBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
});

export default UserProfileScreen;
