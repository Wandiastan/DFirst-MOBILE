import { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Alert, Linking } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { createAccount } from './firebase.config';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkInitialLink();
  }, []);

  const checkInitialLink = async () => {
    try {
      const url = await Linking.getInitialURL();
      if (url) {
        const params = new URLSearchParams(url.split('?')[1]);
        const ref = params.get('ref');
        if (ref) {
          setReferralCode(ref);
        }
      }
    } catch (error) {
      console.error('Error checking initial link:', error);
    }
  };

  const handleSignUp = async () => {
    if (loading) return;
    if (!email || !password || !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      console.log('[Signup] Creating account with email:', email);
      const userCredential = await createAccount(email, password, name);
      console.log('[Signup] Account created successfully:', userCredential.user.uid);
      
      const userId = userCredential.user.uid;
      const db = getFirestore();

      // Enhanced user document structure
      const userData = {
        displayName: name,
        email,
        createdAt: new Date(),
        purchases: [], // Initialize empty purchases array
        referredBy: null // Will be updated if referral code exists
      };

      // Verify referral code if provided
      if (referralCode) {
        console.log('[Signup] Verifying referral code:', referralCode);
        const referrerDoc = await getDoc(doc(db, 'users', referralCode));
        if (referrerDoc.exists()) {
          console.log('[Signup] Valid referral code found');
          userData.referredBy = referralCode;
        } else {
          console.log('[Signup] Invalid referral code');
        }
      }

      console.log('[Signup] Creating user document');
      await setDoc(doc(db, 'users', userId), userData);
      await AsyncStorage.setItem('@saved_email', email);
      
      console.log('[Signup] Signup process completed successfully');
      router.replace('/(app)/home');
    } catch (error: any) {
      console.error('[Signup] Error during signup:', error);
      console.error('[Signup] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      Alert.alert(
        'Signup Error',
        error.code === 'auth/email-already-in-use' ? 'This email is already in use. Please use a different email or log in.' :
        error.code === 'auth/invalid-email' ? 'The email address is not valid. Please enter a valid email.' :
        error.message || 'An error occurred during signup. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Create Account</ThemedText>
          <ThemedText style={styles.subtitle}>
            Join DFirst to start your trading journey
          </ThemedText>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity 
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color="#64748B"
              />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Partner Code (Optional)"
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="none"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>Already have an account? </ThemedText>
            <Link href="/" asChild>
              <TouchableOpacity>
                <ThemedText style={styles.link}>Sign In</ThemedText>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View style={styles.poweredByContainer}>
          <ThemedText style={styles.poweredByText}>Powered by</ThemedText>
          <View style={styles.derivLogo}>
            <ThemedText style={styles.derivText}>deriv</ThemedText>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  header: {
    marginTop: 0,
    marginBottom: 50,
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  form: {
    gap: 16,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
  button: {
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666666',
  },
  link: {
    color: '#007AFF',
    fontWeight: '600',
  },
  poweredByContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  poweredByText: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  derivLogo: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  derivText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF444F',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SignUpScreen;
