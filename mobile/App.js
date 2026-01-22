import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { LocationProvider } from './src/context/LocationContext';
import AppNavigator from './src/navigation/AppNavigator';
import * as SplashScreen from 'expo-splash-screen';

// Keep splash screen visible while we check auth state
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make any API calls you need here
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <AuthProvider>
      <LocationProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <AppNavigator />
        </NavigationContainer>
      </LocationProvider>
    </AuthProvider>
  );
}
