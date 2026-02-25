import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { API_URL } from '../../config/api';

const UserCard = ({ user, onPress }) => (
  <TouchableOpacity style={styles.card} onPress={() => onPress(user)}>
    <View style={styles.avatarContainer}>
      {user.photoUrl ? (
        <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{user.displayName?.[0] ?? '?'}</Text>
        </View>
      )}
      <View style={[styles.onlineBadge, user.isOnline && styles.onlineBadgeActive]} />
    </View>
    <View style={styles.cardBody}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{user.displayName}</Text>
        {user.isVerified && <Ionicons name="checkmark-circle" size={16} color="#6366f1" />}
        <Text style={styles.age}>{user.age}</Text>
      </View>
      {user.bio ? <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text> : null}
      {user.tags?.length > 0 && (
        <View style={styles.tags}>
          {user.tags.slice(0, 3).map((tag, i) => (
            <View key={i} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
          ))}
        </View>
      )}
      {user.distance !== undefined && (
        <Text style={styles.distance}>
          <Ionicons name="location-outline" size={12} color="#9ca3af" />
          {' '}{user.distance < 1 ? `${Math.round(user.distance * 1000)}m away` : `${user.distance.toFixed(1)}km away`}
        </Text>
      )}
    </View>
    <TouchableOpacity style={styles.messageBtn} onPress={() => onPress(user)}>
      <Ionicons name="chatbubble-outline" size={20} color="#6366f1" />
    </TouchableOpacity>
  </TouchableOpacity>
);

const DiscoverScreen = ({ navigation }) => {
  const { token } = useAuth();
  const { location } = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('nearby'); // nearby | new | online

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter });
      if (location) {
        params.append('lat', location.coords.latitude);
        params.append('lng', location.coords.longitude);
      }
      const res = await fetch(`${API_URL}/api/profiles?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.profiles ?? []);
    } catch (err) {
      Alert.alert('Error', 'Could not load users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, location, filter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const onRefresh = () => { setRefreshing(true); fetchUsers(); };

  const goToProfile = (user) => navigation.navigate('UserProfile', { userId: user.id, userName: user.displayName });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.filters}>
          {['nearby', 'new', 'online'].map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <UserCard user={item} onPress={goToProfile} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No users found nearby</Text>
            <Text style={styles.emptySubtext}>Try changing filters or expanding your radius</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
  filters: { flexDirection: 'row', gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  filterBtnActive: { backgroundColor: '#6366f1' },
  filterText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  avatarContainer: { position: 'relative', marginRight: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 24, fontWeight: 'bold', color: '#6b7280' },
  onlineBadge: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#d1d5db', borderWidth: 2, borderColor: '#fff' },
  onlineBadgeActive: { backgroundColor: '#22c55e' },
  cardBody: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  age: { fontSize: 14, color: '#9ca3af', marginLeft: 4 },
  bio: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 6 },
  tags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 4 },
  tag: { backgroundColor: '#ede9fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tagText: { fontSize: 12, color: '#6366f1' },
  distance: { fontSize: 12, color: '#9ca3af' },
  messageBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 8, textAlign: 'center' },
});

export default DiscoverScreen;
