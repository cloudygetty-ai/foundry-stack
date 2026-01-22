import React, { createContext, useState, useEffect, useContext } from 'react';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
};

export const LocationProvider = ({ children }) => {
  const { isAuthenticated, updateLocation } = useAuth();
  const [location, setLocation] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      requestLocationPermission();
    }
  }, [isAuthenticated]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setPermissionGranted(true);
        getCurrentLocation();
        startLocationTracking();
      } else {
        setPermissionGranted(false);
        setError('Location permission denied');
      }
    } catch (err) {
      console.error('Location permission error:', err);
      setError('Failed to get location permission');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setLocation(coords);

      // Update location on server
      if (isAuthenticated) {
        await updateLocation(coords.latitude, coords.longitude);
      }

      return coords;
    } catch (err) {
      console.error('Get location error:', err);
      setError('Failed to get current location');
      return null;
    }
  };

  const startLocationTracking = async () => {
    try {
      // Watch position changes (updates every ~100 meters or 5 minutes)
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5 * 60 * 1000, // 5 minutes
          distanceInterval: 100, // 100 meters
        },
        (newLocation) => {
          const coords = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          };

          setLocation(coords);

          // Update server
          if (isAuthenticated) {
            updateLocation(coords.latitude, coords.longitude);
          }
        }
      );
    } catch (err) {
      console.error('Location tracking error:', err);
    }
  };

  const refreshLocation = async () => {
    setLoading(true);
    const newLocation = await getCurrentLocation();
    setLoading(false);
    return newLocation;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    // Haversine formula to calculate distance between two points
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const formatDistance = (meters) => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    } else if (meters < 10000) {
      return `${(meters / 1000).toFixed(1)}km`;
    } else {
      return `${Math.round(meters / 1000)}km`;
    }
  };

  const value = {
    location,
    permissionGranted,
    loading,
    error,
    getCurrentLocation,
    refreshLocation,
    requestLocationPermission,
    calculateDistance,
    formatDistance,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
};
