import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';

const StatBox = ({ label, value }) => (
  <View style={styles.statBox}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const ProfileScreen = ({ navigation }) => {
  const { token, logout } = useAuth();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [userRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/users/me/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const userData = await userRes.json();
      const statsData = await statsRes.json();
      if (userData.success) setUser(userData.user);
      if (statsData.success) setStats(statsData.stats);
    } catch (err) {
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{user?.displayName?.[0] ?? '?'}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.editAvatar}>
            <Ionicons name="camera" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.heroInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.displayName}</Text>
            {user?.isVerified && <Ionicons name="checkmark-circle" size={20} color="#6366f1" />}
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
        </View>
      </View>

      {/* Tags */}
      {user?.tags?.length > 0 && (
        <View style={styles.tags}>
          {user.tags.map((tag, i) => (
            <View key={i} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
          ))}
        </View>
      )}

      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <StatBox label="Sent" value={stats.messagesSent} />
          <StatBox label="Received" value={stats.messagesReceived} />
          <StatBox label="Beacons" value={stats.beaconsCreated} />
          <StatBox label="Spots" value={stats.spotsCreated} />
        </View>
      )}

      {/* Menu */}
      <View style={styles.menu}>
        {[
          { icon: 'pencil-outline', label: 'Edit Profile', onPress: () => navigation.navigate('Settings') },
          { icon: 'shield-checkmark-outline', label: 'Privacy Settings', onPress: () => {} },
          { icon: 'card-outline', label: 'Subscription', onPress: () => {} },
          { icon: 'notifications-outline', label: 'Notifications', onPress: () => {} },
          { icon: 'help-circle-outline', label: 'Help & Support', onPress: () => {} },
        ].map(({ icon, label, onPress }) => (
          <TouchableOpacity key={label} style={styles.menuItem} onPress={onPress}>
            <Ionicons name={icon} size={22} color="#6366f1" />
            <Text style={styles.menuLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#ef4444" />
          <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { backgroundColor: '#fff', padding: 24, paddingTop: 60, alignItems: 'center' },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 40, fontWeight: 'bold', color: '#6b7280' },
  editAvatar: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  heroInfo: { alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  email: { fontSize: 14, color: '#9ca3af', marginBottom: 8 },
  bio: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  tag: { backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 13, color: '#6366f1' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', marginTop: 12, paddingVertical: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#1f2937' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  menu: { backgroundColor: '#fff', marginTop: 12, marginHorizontal: 0 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  menuItemDanger: { marginTop: 8 },
  menuLabel: { flex: 1, fontSize: 16, color: '#374151' },
  menuLabelDanger: { color: '#ef4444' },
});

export default ProfileScreen;
