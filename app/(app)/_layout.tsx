import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { onAuthChanged } from '../firebase.config';

function AppLayout() {
  useEffect(() => {
    const unsubscribe = onAuthChanged((user) => {
      if (!user) {
        // If not authenticated, redirect to login
        router.replace('/');
      }
    });

    return unsubscribe;
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}>
      <Stack.Screen name="home" />
      <Stack.Screen 
        name="bots/trading" 
        options={{
          contentStyle: { backgroundColor: '#FFFFFF' }
        }}
      />
    </Stack>
  );
}

export default AppLayout; 