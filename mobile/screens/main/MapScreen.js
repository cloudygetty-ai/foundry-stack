import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';

const MapScreen = ({ navigation }) => {
  const mapRef = useRef(null);
  const { location, requestLocation } = useLocation();
  const { token } = useAuth();
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [beacons, setBeacons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (location) fetchNearbyData();
  }, [location]);

  const fetchNearbyData = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const { latitude, longitude } = location.coords;
      const [usersRes, beaconsRes] = await Promise.all([
        fetch(`${API_URL}/api/profiles?lat=${latitude}&lng=${longitude}&filter=nearby`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/beacons?lat=${latitude}&lng=${longitude}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const usersData = await usersRes.json();
      const beaconsData = await beaconsRes.json();
      if (usersData.success) setNearbyUsers(usersData.profiles ?? []);
      if (beaconsData.success) setBeacons(beaconsData.beacons ?? []);
    } catch (err) {
      console.warn('Error fetching map data:', err);
    } finally {
      setLoading(false);
    }
  };

  const centerOnUser = () => {
    if (!location || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  };

  if (!location) {
    return (
      <View style={styles.center}>
        <Ionicons name="location-outline" size={48} color="#9ca3af" />
        <Text style={styles.noLocationText}>Location access needed</Text>
        <TouchableOpacity style={styles.enableBtn} onPress={requestLocation}>
          <Text style={styles.enableBtnText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={darkMapStyle}
      >
        {/* Discovery radius */}
        <Circle
          center={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
          radius={1000}
          fillColor="rgba(99, 102, 241, 0.08)"
          strokeColor="rgba(99, 102, 241, 0.3)"
          strokeWidth={1}
        />

        {/* Nearby users */}
        {nearbyUsers.map(user => user.lat && user.lng ? (
          <Marker
            key={user.id}
            coordinate={{ latitude: user.lat, longitude: user.lng }}
            onPress={() => navigation.navigate('UserProfile', { userId: user.id, userName: user.displayName })}
          >
            <View style={styles.userMarker}>
              <Text style={styles.userMarkerText}>{user.displayName?.[0] ?? '?'}</Text>
            </View>
          </Marker>
        ) : null)}

        {/* Beacons */}
        {beacons.map(beacon => (
          <Marker
            key={beacon.id}
            coordinate={{ latitude: beacon.lat, longitude: beacon.lng }}
            title={beacon.title}
            description={beacon.description}
          >
            <View style={styles.beaconMarker}>
              <Ionicons name="radio" size={18} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={centerOnUser}>
          <Ionicons name="locate" size={22} color="#6366f1" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={fetchNearbyData}>
          <Ionicons name={loading ? 'hourglass' : 'refresh'} size={22} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {/* Create beacon FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateBeacon')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Stats */}
      <View style={styles.stats}>
        <Text style={styles.statsText}>{nearbyUsers.length} nearby · {beacons.length} beacons</Text>
      </View>
    </View>
  );
};

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  noLocationText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  enableBtn: { marginTop: 16, backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  enableBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  userMarker: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  userMarkerText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  beaconMarker: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#f59e0b',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  controls: {
    position: 'absolute', right: 16, top: 60,
    gap: 8,
  },
  controlBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  fab: {
    position: 'absolute', bottom: 32, right: 16,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  stats: {
    position: 'absolute', bottom: 32, left: 16,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  statsText: { color: '#fff', fontSize: 12 },
});

export default MapScreen;
