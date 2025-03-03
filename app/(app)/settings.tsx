import { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { logout } from '../firebase.config';
import { Linking } from 'react-native';
import { getCurrentUser } from '../firebase.config';

const DERIV_API_KEY = '@deriv_api_key';
const DERIV_OAUTH_TOKENS = '@deriv_oauth_tokens';
const APP_ID = '67709';
const DERIV_WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const CREATE_API_KEY_URL = 'https://app.deriv.com/account/api-token';

interface DerivOAuthTokens {
  accounts: Array<{
    account: string;
    token: string;
    currency: string;
  }>;
  selectedAccount?: {
    account: string;
    token: string;
    currency: string;
  };
}

interface DerivAccountDetails {
  fullName: string;
  email: string;
  phone: string;
  company: string;
}

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthTokens, setOauthTokens] = useState<DerivOAuthTokens | null>(null);
  const [isOAuthConnected, setIsOAuthConnected] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [accountDetails, setAccountDetails] = useState<DerivAccountDetails | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const getUserSpecificKey = (baseKey: string) => {
    const user = getCurrentUser();
    return user ? `${baseKey}_${user.uid}` : baseKey;
  };

  const loadConnections = async () => {
    try {
      // Load API Key
      const savedKey = await AsyncStorage.getItem(getUserSpecificKey(DERIV_API_KEY));
      if (savedKey) {
        setApiKey(savedKey);
        setIsConnected(true);
      }

      // Load OAuth tokens and fetch account details
      const savedTokens = await AsyncStorage.getItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
      if (savedTokens) {
        const tokens = JSON.parse(savedTokens) as DerivOAuthTokens;
        setOauthTokens(tokens);
        setIsOAuthConnected(true);
        if (tokens.selectedAccount) {
          await fetchAccountDetails(tokens.selectedAccount.token);
        }
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const connectWithKey = async (key: string) => {
    setLoading(true);
    try {
      const formattedKey = key.trim();
      let ws: WebSocket | null = null;
      let authorized = false;
      let connectionTimeout: NodeJS.Timeout;

      const cleanup = () => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        if (ws) {
          console.log('[Settings] Closing connection as expected - API key verification complete');
          ws.onclose = null;
          ws.onerror = null;
          ws.close();
        }
      };

      return new Promise<boolean>((resolve) => {
        ws = new WebSocket(DERIV_WS_URL);

        ws.onopen = () => {
          console.log('[Settings] WebSocket connection established for API key verification');
          
          const authRequest = {
            authorize: formattedKey,
            req_id: Date.now()
          };
          
          ws.send(JSON.stringify(authRequest));

          connectionTimeout = setTimeout(() => {
            if (!authorized) {
              console.log('[Settings] API key verification timeout - closing connection');
              cleanup();
              resolve(false);
            }
          }, 10000);
        };

        ws.onmessage = (msg) => {
          try {
            const response = JSON.parse(msg.data);

            if (response.error) {
              console.log('[Settings] API Error during verification:', response.error.message);
              cleanup();
              resolve(false);
              return;
            }

            if (response.msg_type === 'authorize') {
              authorized = true;
              clearTimeout(connectionTimeout);
              console.log('[Settings] API key verification successful');
              cleanup();
              resolve(true);
            }
          } catch (error) {
            console.log('[Settings] Error processing message during verification:', error);
            resolve(false);
          }
        };

        ws.onerror = () => {
          console.log('[Settings] WebSocket error during API key verification');
          resolve(false);
        };

        ws.onclose = () => {
          console.log('[Settings] WebSocket connection closed after API key verification');
          cleanup();
          setLoading(false);
          resolve(false);
        };
      });
    } catch (error) {
      console.log('[Settings] Connection error during API key verification:', error);
      setLoading(false);
      return false;
    }
  };

  const handleApiKeyChange = (text: string) => {
    // Remove any whitespace and special characters
    const cleanedKey = text.trim().replace(/[^\w\-]/g, '');
    setApiKey(cleanedKey);
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter your API key');
      return;
    }

    // Validate API key format
    if (!/^[\w\-]{1,128}$/.test(apiKey)) {
      Alert.alert('Error', 'Invalid API key format');
      return;
    }

    try {
      const connected = await connectWithKey(apiKey);
      if (connected) {
        await AsyncStorage.setItem(getUserSpecificKey(DERIV_API_KEY), apiKey);
        setIsConnected(true);
        setShowApiKeyModal(false);
        Alert.alert('Success', 'API key connected successfully', [
          { 
            text: 'OK',
            onPress: () => router.replace('/(app)/home')
          }
        ]);
      } else {
        Alert.alert('Error', 'Failed to connect with API key');
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      Alert.alert('Error', 'Failed to save API key');
    }
  };

  const disconnectAccount = async () => {
    try {
      await AsyncStorage.removeItem(getUserSpecificKey(DERIV_API_KEY));
      setApiKey('');
      setIsConnected(false);
      Alert.alert('Success', 'Account disconnected successfully', [
        { 
          text: 'OK',
          onPress: () => router.replace('/(app)/home')
        }
      ]);
    } catch (error) {
      console.error('Error disconnecting account:', error);
      Alert.alert('Error', 'Failed to disconnect account');
    }
  };

  const disconnectOAuth = async () => {
    try {
      await AsyncStorage.removeItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
      setOauthTokens(null);
      setIsOAuthConnected(false);
      Alert.alert('Success', 'OAuth connection removed successfully');
    } catch (error) {
      console.error('Error disconnecting OAuth:', error);
      Alert.alert('Error', 'Failed to disconnect OAuth');
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return 'Not connected';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}${'•'.repeat(key.length - 8)}${key.slice(-4)}`;
  };

  const handleLogout = async () => {
    try {
      await logout();
      await AsyncStorage.removeItem(getUserSpecificKey(DERIV_API_KEY));
      await AsyncStorage.removeItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const fetchAccountDetails = async (token: string) => {
    let ws: WebSocket | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    const connectWebSocket = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          ws = new WebSocket(DERIV_WS_URL);
          let isResolved = false;

          const cleanup = () => {
            if (ws) {
              console.log('[Settings] Closing connection as expected - account details fetched');
              ws.onclose = null;
              ws.onerror = null;
              ws.onmessage = null;
              ws.close();
              ws = null;
            }
          };

          const handleError = () => {
            if (!isResolved) {
              cleanup();
              if (retryCount < MAX_RETRIES) {
                retryCount++;
                console.log(`[Settings] Retrying connection (${retryCount}/${MAX_RETRIES})`);
                resolve(connectWebSocket());
              } else {
                reject(new Error('Max retries reached'));
              }
            }
          };

          ws.onopen = () => {
            console.log('[Settings] WebSocket connection established for account details');
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                authorize: token,
                req_id: Date.now()
              }));
            }
          };

          ws.onmessage = (msg) => {
            try {
              const response = JSON.parse(msg.data);

              if (response.error) {
                console.log('[Settings] API Error during account details fetch:', response.error.message);
                handleError();
                return;
              }

              if (response.msg_type === 'authorize' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  get_settings: 1,
                  req_id: Date.now()
                }));
              }

              if (response.msg_type === 'get_settings') {
                setAccountDetails({
                  fullName: `${response.get_settings.first_name} ${response.get_settings.last_name}`,
                  email: response.get_settings.email,
                  phone: response.get_settings.phone || 'Not provided',
                  company: 'Deriv Limited'
                });
                isResolved = true;
                resolve();
                cleanup();
              }
            } catch (error) {
              console.log('[Settings] Error processing message during account details fetch:', error);
              handleError();
            }
          };

          ws.onerror = () => {
            console.log('[Settings] WebSocket error during account details fetch');
            handleError();
          };

          ws.onclose = () => {
            console.log('[Settings] WebSocket connection closed after account details fetch');
            if (!isResolved) {
              handleError();
            }
          };

          setTimeout(() => {
            if (!isResolved) {
              console.log('[Settings] Account details fetch timeout');
              handleError();
            }
          }, 10000);
        } catch (error) {
          console.log('[Settings] Connection error during account details fetch:', error);
          reject(error);
        }
      });
    };

    try {
      await connectWebSocket();
    } catch (error) {
      console.log('[Settings] Failed to fetch account details:', error);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Settings</ThemedText>
        </View>
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={() => setShowLogoutModal(true)}
        >
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>OAuth Connection</ThemedText>
            {isOAuthConnected && (
              <View style={styles.connectedBadge}>
                <ThemedText style={styles.connectedText}>Connected</ThemedText>
              </View>
            )}
          </View>
          
          <View style={styles.apiKeyContainer}>
            {isOAuthConnected && accountDetails ? (
              <>
                <View style={styles.accountDetailRow}>
                  <ThemedText style={styles.accountDetailLabel}>Name</ThemedText>
                  <ThemedText style={styles.accountDetailValue}>{accountDetails.fullName}</ThemedText>
                </View>
                <View style={styles.accountDetailRow}>
                  <ThemedText style={styles.accountDetailLabel}>Email</ThemedText>
                  <ThemedText style={styles.accountDetailValue}>{accountDetails.email}</ThemedText>
                </View>
                <View style={styles.accountDetailRow}>
                  <ThemedText style={styles.accountDetailLabel}>Phone</ThemedText>
                  <ThemedText style={styles.accountDetailValue}>{accountDetails.phone}</ThemedText>
                </View>
                <View style={styles.accountDetailRow}>
                  <ThemedText style={styles.accountDetailLabel}>Company</ThemedText>
                  <ThemedText style={styles.accountDetailValue}>{accountDetails.company}</ThemedText>
                </View>
              </>
            ) : (
              <ThemedText style={styles.apiKeyText}>Not connected</ThemedText>
            )}
            <ThemedText style={styles.apiKeyLabel}>Deriv OAuth</ThemedText>
          </View>
        </View>

        {!isOAuthConnected && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>API Key Backup</ThemedText>
              {isConnected && (
                <View style={[styles.connectedBadge, styles.backupBadge]}>
                  <ThemedText style={[styles.connectedText, styles.backupText]}>Backup</ThemedText>
                </View>
              )}
            </View>
            
            <View style={styles.apiKeyContainer}>
              <ThemedText style={styles.apiKeyText}>{maskApiKey(apiKey)}</ThemedText>
              <ThemedText style={styles.apiKeyLabel}>Deriv API Key</ThemedText>
            </View>

            {!isConnected ? (
              <TouchableOpacity 
                style={[styles.button, styles.connectApiButton]}
                onPress={() => setShowApiKeyModal(true)}
              >
                <ThemedText style={styles.buttonText}>Connect API Key</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.button, styles.disconnectButton]}
                onPress={disconnectAccount}
              >
                <ThemedText style={[styles.buttonText, styles.disconnectText]}>
                  Disconnect API Key
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <Modal
        visible={showApiKeyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowApiKeyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Connect with API Key</ThemedText>
              <TouchableOpacity 
                onPress={() => setShowApiKeyModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.createKeyButton}
              onPress={() => Linking.openURL(CREATE_API_KEY_URL)}
            >
              <ThemedText style={styles.createKeyText}>Create New API Key</ThemedText>
            </TouchableOpacity>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter your API key"
                value={apiKey}
                onChangeText={handleApiKeyChange}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={128}
              />
              <TouchableOpacity 
                style={[
                  styles.button,
                  styles.saveButton,
                  (!apiKey.trim() || loading) && styles.buttonDisabled
                ]}
                onPress={saveApiKey}
                disabled={!apiKey.trim() || loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading ? 'Connecting...' : 'Connect'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Logout</ThemedText>
              <TouchableOpacity 
                onPress={() => setShowLogoutModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={[styles.warningIcon, { marginBottom: 16 }]}>
                <Ionicons name="log-out" size={48} color="#EF4444" />
              </View>
              <ThemedText style={styles.disconnectWarning}>
                Are you sure you want to logout? You'll need to sign in again to access your account.
              </ThemedText>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowLogoutModal(false)}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.disconnectModalButton]}
                onPress={handleLogout}
              >
                <ThemedText style={styles.disconnectModalButtonText}>Logout</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  connectedBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectedText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  apiKeyContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  apiKeyText: {
    fontSize: 16,
    color: '#1E293B',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  apiKeyLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#10B981',
  },
  disconnectButton: {
    backgroundColor: '#FEE2E2',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectText: {
    color: '#EF4444',
  },
  buttonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  logoutButton: {
    padding: 8,
    borderRadius: 8,
  },
  connectApiButton: {
    backgroundColor: '#0097B8',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  closeButton: {
    padding: 8,
  },
  createKeyButton: {
    backgroundColor: '#0097B8',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createKeyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    gap: 12,
  },
  input: {
    height: 44,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backupBadge: {
    backgroundColor: '#FEF3C7',
  },
  backupText: {
    color: '#D97706',
  },
  warningIcon: {
    alignItems: 'center',
  },
  disconnectWarning: {
    color: '#64748B',
    fontSize: 16,
    textAlign: 'center',
  },
  modalBody: {
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  modalButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#FEE2E2',
  },
  cancelButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectModalButton: {
    backgroundColor: '#EF4444',
  },
  disconnectModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  accountDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  accountDetailLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  accountDetailValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
}); 