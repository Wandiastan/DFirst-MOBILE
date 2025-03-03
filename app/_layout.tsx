import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { onAuthChanged } from './firebase.config';

import { useColorScheme } from '@/hooks/useColorScheme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    const unsubscribe = onAuthChanged((user) => {
      if (user) {
        console.log('Auth state changed: User is signed in');
      } else {
        console.log('Auth state changed: User is signed out');
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack 
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFFFFF' },
            animation: 'fade',
            fullScreenGestureEnabled: true,
          }}>
          <Stack.Screen 
            name="index" 
            options={{
              contentStyle: { backgroundColor: '#FFFFFF' }
            }}
          />
          <Stack.Screen 
            name="explore" 
            options={{
              contentStyle: { backgroundColor: '#FFFFFF' }
            }}
          />
          <Stack.Screen 
            name="(app)" 
            options={{
              contentStyle: { backgroundColor: '#FFFFFF' }
            }}
          />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
