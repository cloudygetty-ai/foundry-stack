import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { API_URL } from '../../config/api';

const BeaconCard = ({ beacon, onPress, onJoin }) => (
  <TouchableOpacity style={styles.card} onPress={() => onPress(beacon)}>
    <View style={styles.cardHeader}>
      <View style={styles.iconWrap}>
        <Ionicons name="radio" size={22} color="#f59e0b" />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{beacon.title}</Text>
        <Text style={styles.cardMeta}>
          by {beacon.user?.displayName ?? 'Unknown'} · {beacon.attendeeCount ?? 0} joined
        </Text>
      </View>
      <View style={[styles.statusBadge, beacon.isActive ? styles.statusActive : styles.statusExpired]}>
        <Text style={styles.statusText}>{beacon.isActive ? 'Live' : 'Ended'}</Text>
      </View>
    </View>
    {beacon.description ? <Text style={styles.description} numberOfLines={2}>{beacon.description}</Text> : null}
    <View style={styles.footer}>
      {beacon.distance !== undefined && (
        <Text style={styles.distance}>
          <Ionicons name="location-outline" size={12} color="#9ca3af" />
          {' '}{beacon.distance < 1 ? `${Math.round(beacon.distance * 1000)}m` : `${beacon.distance.toFixed(1)}km`}
        </Text>
      )}
      {beacon.expiresAt && (
        <Text style={styles.expires}>
          Expires {new Date(beacon.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
      {beacon.isActive && (
        <TouchableOpacity style={styles.joinBtn} onPress={() => onJoin(beacon)}>
          <Text style={styles.joinBtnText}>Join</Text>
        </TouchableOpacity>
      )}
    </View>
  </TouchableOpacity>
);

const BeaconsScreen = ({ navigation }) => {
  const { token } = useAuth();
  const { location } = useLocation();
  const [beacons, setBeacons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('nearby'); // nearby | mine

  const fetchBeacons = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tab });
      if (location) {
        params.append('lat', location.coords.latitude);
        params.append('lng', location.coords.longitude);
      }
      const res = await fetch(`${API_URL}/api/beacons?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setBeacons(data.beacons ?? []);
    } catch (err) {
      console.warn('Error fetching beacons:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, location, tab]);

  useEffect(() => { fetchBeacons(); }, [fetchBeacons]);

  const handleJoin = async (beacon) => {
    try {
      const res = await fetch(`${API_URL}/api/beacons/${beacon.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) Alert.alert('Joined!', `You joined "${beacon.title}"`);
      else Alert.alert('Error', data.error ?? 'Could not join beacon');
    } catch {
      Alert.alert('Error', 'Network error');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Beacons</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreateBeacon')}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {['nearby', 'mine'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'nearby' ? 'Nearby' : 'My Beacons'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={beacons}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <BeaconCard beacon={item} onPress={() => {}} onJoin={handleJoin} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBeacons(); }} tintColor="#6366f1" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="radio-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No beacons found</Text>
            <TouchableOpacity style={styles.createEmptyBtn} onPress={() => navigation.navigate('CreateBeacon')}>
              <Text style={styles.createEmptyBtnText}>Create a Beacon</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937' },
  createBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6' },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 2 },
  cardMeta: { fontSize: 13, color: '#9ca3af' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusActive: { backgroundColor: '#dcfce7' },
  statusExpired: { backgroundColor: '#f3f4f6' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
  description: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  distance: { fontSize: 12, color: '#9ca3af' },
  expires: { fontSize: 12, color: '#9ca3af', flex: 1 },
  joinBtn: { backgroundColor: '#6366f1', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10 },
  joinBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 24 },
  createEmptyBtn: { backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  createEmptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

export default BeaconsScreen;
