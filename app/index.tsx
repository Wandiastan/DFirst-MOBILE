import { useState, useEffect } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, Alert, Animated as RNAnimated } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, Easing, FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { loginWithEmail, resetPassword } from './firebase.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { Ionicons } from '@expo/vector-icons';

const SAVED_EMAIL_KEY = '@saved_email';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const rotation = useSharedValue(0);
  const emailPosition = useSharedValue(0);
  const emailScale = useSharedValue(1);
  const [isResetMode, setIsResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadSavedEmail();
    rotation.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 200, easing: Easing.ease }),
        withTiming(10, { duration: 200, easing: Easing.ease }),
        withTiming(0, { duration: 200, easing: Easing.ease })
      ),
      2
    );
  }, []);

  useEffect(() => {
    if (isResetMode && email) {
      setResetEmail(email);
    }
  }, [isResetMode]);

  const loadSavedEmail = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem(SAVED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setHasEmail(true);
        // Animate email input
        emailPosition.value = withSpring(-25);
        emailScale.value = withSpring(0.85);
      }
    } catch (error) {
      console.error('Error loading saved email:', error);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedEmailStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: emailPosition.value },
      { scale: emailScale.value }
    ],
  }));

  const handleLogin = async () => {
    if (loading) return;
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await loginWithEmail(email, password);
      await AsyncStorage.setItem(SAVED_EMAIL_KEY, email);
      console.log('User logged in:', userCredential.user.uid);
      router.replace('/(app)/home');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Error',
        error.code === 'auth/wrong-password' ? 'The password you entered is incorrect. Please try again.' :
        error.code === 'auth/user-not-found' ? 'No account found with this email. Please check your email or sign up.' :
        error.code === 'auth/invalid-email' ? 'The email address is not valid. Please enter a valid email.' :
        error.code === 'auth/too-many-requests' ? 'Too many unsuccessful login attempts. Please try again later.' :
        'Please check your email and password and try again.' // General error message
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (!hasEmail && text.length > 0) {
      emailPosition.value = withSpring(-25);
      emailScale.value = withSpring(0.85);
    } else if (!hasEmail && text.length === 0) {
      emailPosition.value = withSpring(0);
      emailScale.value = withSpring(1);
    }
  };

  const handleResetPassword = async () => {
    if (resetLoading) return;
    if (!resetEmail) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      Alert.alert(
        'Success',
        'Password reset instructions have been sent to your email',
        [{ text: 'OK', onPress: () => {
          setIsResetMode(false);
          setResetEmail('');
        }}]
      );
    } catch (error: any) {
      console.error('Password reset error:', error);
      Alert.alert(
        'Reset Error',
        error.message || 'An error occurred while sending reset instructions'
      );
    } finally {
      setResetLoading(false);
    }
  };

  const toggleResetMode = () => {
    if (isResetMode) {
      setIsResetMode(false);
      setResetEmail('');
    } else {
      setIsResetMode(true);
      if (email) setResetEmail(email);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <ThemedText style={styles.title}>
              {isResetMode ? 'Reset Password' : 'Welcome Back'}
            </ThemedText>
            {!isResetMode && (
              <Animated.Text style={[styles.waveEmoji, animatedStyle]}>👋</Animated.Text>
            )}
          </View>
          <ThemedText style={styles.subtitle}>
            {isResetMode 
              ? 'Enter your email to receive reset instructions' 
              : 'Sign in to continue'}
          </ThemedText>
        </View>

        {isResetMode ? (
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            style={styles.resetForm}
          >
            <View style={styles.modernInputContainer}>
              <TextInput
                style={styles.modernInput}
                placeholder="Email Address"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!resetLoading}
                autoFocus
              />
              <View style={styles.inputUnderline} />
            </View>
            
            <View style={styles.resetButtons}>
              <TouchableOpacity 
                style={[styles.modernButton, styles.resetButton, resetLoading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={resetLoading}
              >
                <ThemedText style={styles.modernButtonText}>
                  {resetLoading ? 'Sending...' : 'Reset Password'}
                </ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modernButton, styles.backButton]}
                onPress={toggleResetMode}
                disabled={resetLoading}
              >
                <ThemedText style={styles.backButtonText}>Back to Login</ThemedText>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View 
            entering={SlideInDown.duration(400)}
            style={styles.form}
          >
            <View style={styles.inputContainer}>
              <Animated.Text style={[styles.floatingLabel, animatedEmailStyle]}>
                Email
              </Animated.Text>
              <TextInput
                style={styles.input}
                placeholder={hasEmail ? '' : 'Email'}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>
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
            
            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]} 
              onPress={handleLogin}
              disabled={loading}
            >
              <ThemedText style={styles.buttonText}>
                {loading ? 'Signing in...' : 'Sign In'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.forgotPasswordButton}
              onPress={toggleResetMode}
            >
              <ThemedText style={styles.forgotPasswordText}>Forgot Password?</ThemedText>
            </TouchableOpacity>

            <View style={styles.footer}>
              <ThemedText style={styles.footerText}>Don't have an account? </ThemedText>
              <Link href="/explore" asChild>
                <TouchableOpacity>
                  <ThemedText style={styles.link}>Sign Up</ThemedText>
                </TouchableOpacity>
              </Link>
            </View>
          </Animated.View>
        )}

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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    paddingTop: 8,
  },
  waveEmoji: {
    fontSize: 32,
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
  inputContainer: {
    position: 'relative',
    height: 50,
  },
  floatingLabel: {
    position: 'absolute',
    left: 16,
    top: 12,
    fontSize: 16,
    color: '#666666',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 4,
    zIndex: 1,
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
  forgotPasswordButton: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  resetForm: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 100,
    gap: 24,
  },
  modernInputContainer: {
    marginBottom: 24,
  },
  modernInput: {
    height: 56,
    fontSize: 18,
    color: '#1a1a1a',
    paddingHorizontal: 0,
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
  },
  inputUnderline: {
    height: 2,
    backgroundColor: '#007AFF',
    width: '0%',
  },
  resetButtons: {
    gap: 16,
  },
  modernButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButton: {
    backgroundColor: '#007AFF',
  },
  backButton: {
    backgroundColor: '#F1F5F9',
  },
  modernButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  backButtonText: {
    color: '#64748B',
    fontSize: 16,
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

export default LoginScreen;
