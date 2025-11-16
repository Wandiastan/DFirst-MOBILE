import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, Modal, TextInput, Linking, Alert, ScrollView } from 'react-native';
import { router, useSegments, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logout, getCurrentUser } from '../firebase.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

import { ThemedText } from '@/components/ThemedText';

interface DerivAccount {
  account_id: string;
  balance: number;
  currency: string;
  mt5_account?: {
    login: string;
    balance: number;
    currency: string;
  };
}

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

const DERIV_API_KEY = '@deriv_api_key';
const DERIV_OAUTH_TOKENS = '@deriv_oauth_tokens';
const DERIV_WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=67709';
const APP_ID = '67709';
const CREATE_API_KEY_URL = 'https://app.deriv.com/account/api-token?t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk';
const CREATE_MT5_URL = 'https://app.deriv.com/mt5?t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk';
const DEFAULT_P2P_DEPOSIT = "https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk";
const DEFAULT_P2P_WITHDRAW = "https://p2p.deriv.com/advertiser/426826?advert_id=3202284&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk";
const DEFAULT_PA_DEPOSIT = "";
const DEFAULT_PA_WITHDRAW = "";
const BOTS_URL = 'https://app.deriv.com/bot?t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk';
// Set markup percentage to 2% to earn commissions on all trades
// You can adjust this between 1-3% based on your preference
const APP_MARKUP_PERCENTAGE = 2;
const OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=en&brand=deriv&app_markup_percentage=${APP_MARKUP_PERCENTAGE}&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk&redirect_uri=dfirsttrader://oauth2/callback`;

function HomeScreen() {
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<DerivAccount | null>(null);
  const [previousApiKey, setPreviousApiKey] = useState('');
  const [oauthTokens, setOauthTokens] = useState<DerivOAuthTokens | null>(null);
  const [isOAuthConnected, setIsOAuthConnected] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(true);
  const [p2pDepositLink, setP2pDepositLink] = useState(DEFAULT_P2P_DEPOSIT);
  const [p2pWithdrawLink, setP2pWithdrawLink] = useState(DEFAULT_P2P_WITHDRAW);
  const [paDepositLink, setPaDepositLink] = useState(DEFAULT_PA_DEPOSIT);
  const [paWithdrawLink, setPaWithdrawLink] = useState(DEFAULT_PA_WITHDRAW);
  const [usePaymentAgent, setUsePaymentAgent] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkExistingConnections();
      loadP2PLinks();
      checkAdminStatus();
    }, [])
  );

  const getUserSpecificKey = (baseKey: string) => {
    const user = getCurrentUser();
    return user ? `${baseKey}_${user.uid}` : baseKey;
  };

  const checkExistingConnections = async () => {
    try {
      const savedTokens = await AsyncStorage.getItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
      // API Key functionality disabled - OAuth only
      // const savedKey = await AsyncStorage.getItem(getUserSpecificKey(DERIV_API_KEY));
      const firstLoginFlag = await AsyncStorage.getItem('@first_login');
      
      setIsFirstLogin(!firstLoginFlag);
      
      if (savedTokens) {
        const tokens = JSON.parse(savedTokens) as DerivOAuthTokens;
        setOauthTokens(tokens);
        setIsOAuthConnected(true);
        if (tokens.selectedAccount) {
          connectWithOAuth(tokens.selectedAccount.token);
        }
      }
      // API Key fallback disabled - OAuth only
      // else if (savedKey) {
      //   setApiKey(savedKey);
      //   const connected = await connectWithKey(savedKey);
      //   if (!connected) {
      //     setAccount(null);
      //   }
      // }
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  const loadP2PLinks = async () => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      const db = getFirestore();
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        if (userData.referredBy) {
          const referrerDoc = await getDoc(doc(db, 'users', userData.referredBy));
          
          if (referrerDoc.exists()) {
            const referrerData = referrerDoc.data();
            setP2pDepositLink(referrerData.p2pDepositLink || DEFAULT_P2P_DEPOSIT);
            setP2pWithdrawLink(referrerData.p2pWithdrawLink || DEFAULT_P2P_WITHDRAW);
            setPaDepositLink(referrerData.paDepositLink || DEFAULT_PA_DEPOSIT);
            setPaWithdrawLink(referrerData.paWithdrawLink || DEFAULT_PA_WITHDRAW);
            setUsePaymentAgent(!!referrerData.paDepositLink && !!referrerData.paWithdrawLink);
            return;
          }
        }
        
        setP2pDepositLink(DEFAULT_P2P_DEPOSIT);
        setP2pWithdrawLink(DEFAULT_P2P_WITHDRAW);
        setPaDepositLink(DEFAULT_PA_DEPOSIT);
        setPaWithdrawLink(DEFAULT_PA_WITHDRAW);
        setUsePaymentAgent(false);
      }
    } catch (error) {
      console.error('Error loading P2P links:', error);
      setP2pDepositLink(DEFAULT_P2P_DEPOSIT);
      setP2pWithdrawLink(DEFAULT_P2P_WITHDRAW);
      setPaDepositLink(DEFAULT_PA_DEPOSIT);
      setPaWithdrawLink(DEFAULT_PA_WITHDRAW);
      setUsePaymentAgent(false);
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
          console.log('[Home] Closing connection as expected - balance check complete');
          ws.onclose = null;
          ws.onerror = null;
          ws.close();
        }
      };

      return new Promise<boolean>((resolve) => {
        ws = new WebSocket(DERIV_WS_URL);

        ws.onopen = () => {
          console.log('[Home] WebSocket connection established for balance check');
          
          if (ws) {
          const authRequest = {
            authorize: formattedKey,
            req_id: Date.now()
          };
          
          ws.send(JSON.stringify(authRequest));
          }

          connectionTimeout = setTimeout(() => {
            if (!authorized) {
              console.log('[Home] Balance check timeout - closing connection');
              cleanup();
              resolve(false);
            }
          }, 10000);
        };

        ws.onmessage = (msg) => {
          try {
            const response = JSON.parse(msg.data);

            if (response.error) {
              console.log('[Home] API Error during balance check:', response.error.message);
                cleanup();
                resolve(false);
              return;
            }

            if (response.msg_type === 'authorize') {
              authorized = true;
              clearTimeout(connectionTimeout);

              if (response.authorize) {
                setAccount({
                  account_id: response.authorize.loginid,
                  balance: Number(response.authorize.balance),
                  currency: response.authorize.currency
                });

                if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  mt5_login_list: 1,
                  req_id: Date.now()
                }));
                  }
              }
            }

            if (response.msg_type === 'mt5_login_list') {
              if (response.mt5_login_list?.length > 0) {
                const mt5Account = response.mt5_login_list[0];
                if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  mt5_get_settings: 1,
                  login: mt5Account.login,
                  req_id: Date.now()
                }));
                }
              } else {
                cleanup();
                resolve(true);
              }
            }

            if (response.msg_type === 'mt5_get_settings') {
              if (response.mt5_get_settings) {
                const mt5Settings = response.mt5_get_settings;
                setAccount(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    mt5_account: {
                      login: mt5Settings.login,
                      balance: Number(mt5Settings.balance),
                      currency: mt5Settings.currency
                    }
                  };
                });
              }
              cleanup();
              resolve(true);
            }
          } catch (error) {
            console.log('[Home] Error processing message during balance check:', error);
            resolve(false);
          }
        };

        ws.onerror = () => {
          console.log('[Home] WebSocket error during balance check');
          resolve(false);
        };

        ws.onclose = () => {
          console.log('[Home] WebSocket connection closed after balance check');
          cleanup();
          setLoading(false);
          resolve(false);
        };
      });
    } catch (error) {
      console.log('[Home] Connection error during balance check:', error);
      setLoading(false);
      return false;
    }
  };

  const handleDisconnect = async () => {
    try {
      if (isOAuthConnected) {
        await AsyncStorage.removeItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
        setOauthTokens(null);
        setIsOAuthConnected(false);
      }
      // API Key disconnect disabled - OAuth only
      // else {
      //   await AsyncStorage.removeItem(getUserSpecificKey(DERIV_API_KEY));
      // }
      setAccount(null);
      setLoading(false);
      setShowDisconnectModal(false);
    } catch (error) {
      console.error('Error disconnecting:', error);
      setLoading(false);
    }
  };

  const handleApiKeyChange = (text: string) => {
    setApiKey(text);
  };

  const handleReconnect = async () => {
    if (previousApiKey) {
      setApiKey(previousApiKey);
      handleApiKeySubmit(previousApiKey);
    }
  };

  const handleApiKeySubmit = async (keyToUse = apiKey) => {
    if (!keyToUse.trim()) {
      Alert.alert('Error', 'Please enter your API key');
      return;
    }

    setLoading(true);
    try {
      const connected = await connectWithKey(keyToUse.trim());
      if (connected) {
        await AsyncStorage.setItem(getUserSpecificKey(DERIV_API_KEY), keyToUse.trim());
        setPreviousApiKey('');
      } else {
        Alert.alert('Error', 'Failed to connect with API key');
        await AsyncStorage.removeItem(getUserSpecificKey(DERIV_API_KEY));
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      Alert.alert('Error', 'Failed to connect with API key');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      // API Key removal disabled - OAuth only
      // await AsyncStorage.removeItem(getUserSpecificKey(DERIV_API_KEY));
      await AsyncStorage.removeItem(getUserSpecificKey(DERIV_OAUTH_TOKENS));
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleOAuthLogin = async () => {
    try {
      await AsyncStorage.setItem('@first_login', 'true');
      setIsFirstLogin(false);
      await Linking.openURL(OAUTH_URL);
    } catch (error) {
      console.error('Error opening OAuth URL:', error);
      Alert.alert('Error', 'Failed to open OAuth login');
    }
  };

  const parseOAuthCallback = (url: string): DerivOAuthTokens => {
    const params = new URLSearchParams(url.split('?')[1]);
    const accounts = [];
    let i = 1;
    
    while (params.has(`acct${i}`) && params.has(`token${i}`) && params.has(`cur${i}`)) {
      accounts.push({
        account: params.get(`acct${i}`)!,
        token: params.get(`token${i}`)!,
        currency: params.get(`cur${i}`)!.toUpperCase()
      });
      i++;
    }

    return {
      accounts,
      selectedAccount: accounts[0] // Default to first account
    };
  };

  const handleOAuthCallback = async (url: string) => {
    try {
      const tokens = parseOAuthCallback(url);
      await AsyncStorage.setItem(getUserSpecificKey(DERIV_OAUTH_TOKENS), JSON.stringify(tokens));
      setOauthTokens(tokens);
      setIsOAuthConnected(true);
      
      if (tokens.selectedAccount) {
        connectWithOAuth(tokens.selectedAccount.token);
      }
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      Alert.alert('Error', 'Failed to process OAuth login');
    }
  };

  const connectWithOAuth = async (token: string) => {
    setLoading(true);
    try {
      let ws: WebSocket | null = null;
      let authorized = false;
      let connectionTimeout: NodeJS.Timeout;

      const cleanup = () => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        if (ws) {
          console.log('[Home] Closing OAuth connection as expected - balance check complete');
          ws.onclose = null;
          ws.onerror = null;
          ws.close();
        }
      };

      return new Promise<boolean>((resolve) => {
        ws = new WebSocket(DERIV_WS_URL);

        ws.onopen = () => {
          console.log('[Home] OAuth WebSocket connection established for balance check');
          
          if (ws) {
            const authRequest = {
              authorize: token,
              req_id: Date.now()
            };
            
            ws.send(JSON.stringify(authRequest));
          }

          connectionTimeout = setTimeout(() => {
            if (!authorized) {
              console.log('[Home] OAuth balance check timeout - closing connection');
              cleanup();
              resolve(false);
            }
          }, 10000);
        };

        ws.onmessage = (msg) => {
          try {
            const response = JSON.parse(msg.data);

            if (response.error) {
              console.log('[Home] API Error during balance check:', response.error.message);
              cleanup();
              resolve(false);
              return;
            }

            if (response.msg_type === 'authorize') {
              authorized = true;
              clearTimeout(connectionTimeout);

              if (response.authorize) {
                setAccount({
                  account_id: response.authorize.loginid,
                  balance: Number(response.authorize.balance),
                  currency: response.authorize.currency
                });

                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    mt5_login_list: 1,
                    req_id: Date.now()
                  }));
                }
              }
            }

            if (response.msg_type === 'mt5_login_list') {
              if (response.mt5_login_list?.length > 0) {
                const mt5Account = response.mt5_login_list[0];
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    mt5_get_settings: 1,
                    login: mt5Account.login,
                    req_id: Date.now()
                  }));
                }
              } else {
                cleanup();
                resolve(true);
              }
            }

            if (response.msg_type === 'mt5_get_settings') {
              if (response.mt5_get_settings) {
                const mt5Settings = response.mt5_get_settings;
                setAccount(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    mt5_account: {
                      login: mt5Settings.login,
                      balance: Number(mt5Settings.balance),
                      currency: mt5Settings.currency
                    }
                  };
                });
              }
              cleanup();
              resolve(true);
            }
          } catch (error) {
            console.log('[Home] Error processing message during balance check:', error);
            resolve(false);
          }
        };

        ws.onerror = () => {
          console.log('[Home] WebSocket error during balance check');
          resolve(false);
        };

        ws.onclose = () => {
          console.log('[Home] WebSocket connection closed after balance check');
          cleanup();
          setLoading(false);
          resolve(false);
        };
      });
    } catch (error) {
      console.log('[Home] OAuth connection error during balance check:', error);
      setLoading(false);
      return false;
    }
  };

  const handleDeposit = () => {
    if (paDepositLink && p2pDepositLink) {
      setPendingAction('deposit');
      setShowPaymentMethodModal(true);
    } else {
      const depositLink = usePaymentAgent && paDepositLink ? paDepositLink : p2pDepositLink;
      Linking.openURL(depositLink);
    }
  };

  const handleWithdraw = () => {
    if (paWithdrawLink && p2pWithdrawLink) {
      setPendingAction('withdraw');
      setShowPaymentMethodModal(true);
    } else {
      const withdrawLink = usePaymentAgent && paWithdrawLink ? paWithdrawLink : p2pWithdrawLink;
      Linking.openURL(withdrawLink);
    }
  };

  const handlePaymentMethodSelect = (usePA: boolean) => {
    setUsePaymentAgent(usePA);
    if (pendingAction === 'deposit') {
      Linking.openURL(usePA ? paDepositLink : p2pDepositLink);
    } else if (pendingAction === 'withdraw') {
      Linking.openURL(usePA ? paWithdrawLink : p2pWithdrawLink);
    }
    setShowPaymentMethodModal(false);
    setPendingAction(null);
  };

  const checkAdminStatus = async () => {
    try {
      const user = getCurrentUser();
      if (!user) return;

      const db = getFirestore();
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setIsAdmin(userDoc.data().isAdmin === true);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url.includes('dfirsttrader://oauth2/callback')) {
        handleOAuthCallback(event.url);
        // Ensure we're on the home screen after OAuth callback
        router.replace('/(app)/home');
      }
    });

    // Check for initial URL (app opened via OAuth callback)
    Linking.getInitialURL().then(url => {
      if (url && url.includes('dfirsttrader://oauth2/callback')) {
        handleOAuthCallback(url);
        // Ensure we're on the home screen for initial URL
        router.replace('/(app)/home');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>DFirst Trader</ThemedText>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={() => setShowLogoutModal(true)}
          >
            <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
          <Link href="/(app)/settings" asChild>
            <TouchableOpacity style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={24} color="#1E293B" />
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      
      <View style={styles.container}>
        <View style={styles.accountContainer}>
          {!account && !isOAuthConnected ? (
            <View style={styles.welcomeCardContainer}>
              <View style={styles.welcomeCard}>
                <ThemedText style={styles.welcomeDescription}>
                  Connect to deposit, withdraw, and trade on Deriv
                </ThemedText>
                <View style={styles.oauthCard}>
                  <ThemedText style={styles.oauthTitle}>Connect with Deriv</ThemedText>
                  <ThemedText style={styles.oauthDescription}>
                    Sign in with your Deriv account to start trading
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.oauthButton}
                    onPress={handleOAuthLogin}
                  >
                    <ThemedText style={styles.oauthButtonText}>Connect Account</ThemedText>
                  </TouchableOpacity>
                  
                  <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <ThemedText style={styles.dividerText}>Don't have an account yet?</ThemedText>
                    <View style={styles.divider} />
                  </View>

                  <TouchableOpacity
                    style={[styles.oauthButton, styles.joinButton]}
                    onPress={() => Linking.openURL('https://track.deriv.com/_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk/1/')}
                  >
                    <ThemedText style={styles.oauthButtonText}>Create Deriv Account</ThemedText>
                  </TouchableOpacity>
                </View>
                {/* API Key link disabled - OAuth only */}
                {/* <TouchableOpacity 
                  onPress={() => router.push('/(app)/settings')}
                  style={styles.apiKeyLink}
                >
                  <ThemedText style={styles.apiKeyLinkText}>Use API Key Instead</ThemedText>
                </TouchableOpacity> */}
                <View style={styles.poweredByContainer}>
                  <ThemedText style={styles.poweredByText}>Powered by</ThemedText>
                  <ThemedText style={styles.derivText}>deriv</ThemedText>
                </View>
              </View>
            </View>
          ) : account ? (
            <View style={styles.accountCard}>
              <View style={styles.accountHeader}>
                <ThemedText style={styles.accountTitle}>Deriv Trading Account</ThemedText>
                <TouchableOpacity onPress={() => setShowDisconnectModal(true)}>
                  <ThemedText style={styles.disconnectText}>Disconnect</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.accountInfo}>
                <View style={styles.accountRow}>
                  <ThemedText style={styles.accountLabel}>Account ID</ThemedText>
                  <ThemedText style={styles.accountValue}>{account.account_id}</ThemedText>
                </View>
                <View style={styles.balanceRow}>
                  <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
                  <ThemedText style={styles.balanceValue}>
                    {account.balance.toFixed(2)} <ThemedText style={styles.currencyText}>{account.currency}</ThemedText>
                  </ThemedText>
                </View>
                
                {/* MT5 Account Section */}
                <View style={styles.mt5Header}>
                  <ThemedText style={styles.mt5Title}>MT5 Account</ThemedText>
                  {!account.mt5_account && (
                    <TouchableOpacity 
                      onPress={() => Linking.openURL(CREATE_MT5_URL)}
                      style={styles.createMt5Button}
                    >
                      <ThemedText style={styles.createMt5Text}>Create MT5 Account</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.accountRow}>
                  <ThemedText style={styles.accountLabel}>MT5 Login</ThemedText>
                  <ThemedText style={[styles.accountValue, !account.mt5_account && styles.naText]}>
                    {account.mt5_account?.login || 'N/A'}
                  </ThemedText>
                </View>
                <View style={styles.balanceRow}>
                  <ThemedText style={styles.balanceLabel}>MT5 Balance</ThemedText>
                  <ThemedText style={[styles.balanceValue, !account.mt5_account && styles.naText]}>
                    {account.mt5_account ? (
                      `${account.mt5_account.balance.toFixed(2)} ${account.mt5_account.currency}`
                    ) : (
                      'N/A'
                    )}
                  </ThemedText>
                </View>

                {/* Transaction Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.depositButton]}
                    onPress={handleDeposit}
                  >
                    <ThemedText style={styles.actionButtonText}>Deposit</ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.withdrawButton]}
                    onPress={handleWithdraw}
                  >
                    <ThemedText style={styles.actionButtonText}>Withdraw</ThemedText>
                  </TouchableOpacity>
                </View>

                {/* Bots Button */}
                <TouchableOpacity 
                  style={[styles.botsButton]}
                  onPress={() => router.push('/(app)/bots/trading')}
                >
                  <ThemedText style={styles.botsButtonText}>Trading Bots</ThemedText>
                </TouchableOpacity>

                {/* Admin Button - Only visible for admins */}
                {isAdmin && (
                  <Link href="/admin" asChild>
                    <TouchableOpacity style={[styles.adminButton]}>
                      <ThemedText style={styles.adminButtonText}>Admin Panel</ThemedText>
                    </TouchableOpacity>
                  </Link>
                )}
              </View>
            </View>
          ) : null}
        </View>

        <Modal
          visible={showDisconnectModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowDisconnectModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Disconnect Account</ThemedText>
                <TouchableOpacity 
                  onPress={() => setShowDisconnectModal(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.warningIcon}>
                  <Ionicons name="warning" size={48} color="#F59E0B" />
                  </View>
                <ThemedText style={styles.disconnectWarning}>
                  Are you sure you want to disconnect your Deriv account? You'll need to reconnect to access your trading features.
                </ThemedText>
                </View>
                
              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowDisconnectModal(false)}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.disconnectModalButton]}
                  onPress={handleDisconnect}
                >
                  <ThemedText style={styles.disconnectModalButtonText}>Disconnect</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Payment Method Selection Modal */}
        <Modal
          visible={showPaymentMethodModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowPaymentMethodModal(false);
            setPendingAction(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Select Payment Method</ThemedText>
                <TouchableOpacity 
                  onPress={() => {
                    setShowPaymentMethodModal(false);
                    setPendingAction(null);
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <TouchableOpacity 
                  style={styles.paymentMethodButton}
                  onPress={() => handlePaymentMethodSelect(false)}
                >
                  <ThemedText style={styles.paymentMethodTitle}>P2P Transfer</ThemedText>
                  <ThemedText style={styles.paymentMethodDescription}>
                    Fast and secure peer-to-peer transfers
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.paymentMethodButton}
                  onPress={() => handlePaymentMethodSelect(true)}
                >
                  <ThemedText style={styles.paymentMethodTitle}>Payment Agent</ThemedText>
                  <ThemedText style={styles.paymentMethodDescription}>
                    Process through a verified Deriv payment agent
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>

      {/* Logout Modal */}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    zIndex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 8,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 8,
  },
  accountContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  modalBody: {
    alignItems: 'center',
  },
  warningIcon: {
    alignItems: 'center',
  },
  disconnectWarning: {
    color: '#64748B',
    fontSize: 16,
    textAlign: 'center',
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
    flex: 1,
    marginHorizontal: 6,
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
  welcomeCardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  welcomeDescription: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
    maxWidth: 300,
  },
  oauthCard: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  oauthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  oauthDescription: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 16,
  },
  oauthButton: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF444F',
  },
  oauthButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    width: '100%',
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    color: '#64748B',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  joinButton: {
    backgroundColor: '#0891B2',
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  disconnectText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  accountInfo: {
    gap: 12,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  accountValue: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
  },
  currencyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  mt5Header: {
    marginTop: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mt5Title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  createMt5Button: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  createMt5Text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  naText: {
    color: '#94A3B8',
    fontSize: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  depositButton: {
    backgroundColor: '#10B981',
  },
  withdrawButton: {
    backgroundColor: '#6366F1',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  botsButton: {
    height: 44,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  botsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  apiKeyLink: {
    marginTop: 16,
    padding: 8,
  },
  apiKeyLinkText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  poweredByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  poweredByText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  derivText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF444F',
  },
  partnerButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  partnerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  partnerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  partnerButtonIcon: {
    fontSize: 16,
  },
  paymentMethodButton: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  paymentMethodDescription: {
    fontSize: 14,
    color: '#64748B',
  },
  adminButton: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  adminButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
} as const);

export default HomeScreen; 