import React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Animated, Easing, Linking, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DIFFERbot from '../lib/bots/DIFFERbot';
import NoTouchBot from '../lib/bots/notouchbot';
import RiseFallBot from '../lib/bots/risefallbot';
import UnderBot from '../lib/bots/underbot';
import SafeOverBot from '../lib/bots/safeoverbot';
import SafeUnderBot from '../lib/bots/safeunderbot';
import OverBot from '../lib/bots/overbot';
import MetroDiffer from '../lib/bots/metrodiffer';
import AlienRiseFall from '../lib/bots/alienrisefall';
import SmartEven from '../lib/bots/smarteven';
import SmartVolatility from '../lib/bots/smartvolatility';
import RussianOdds from '../lib/bots/russianodds';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getCurrentUser } from '../../firebase.config';

interface BotConfig {
  initialStake: string;
  takeProfit: string;
  stopLoss: string;
  martingaleMultiplier: string;
}

interface TradeHistory {
  time: Date;
  stake: number;
  result: 'win' | 'loss';
  profit: number;
  type?: string;
}

interface BotStats {
  currentStake: number;
  totalProfit: number;
  totalTrades: number;
  winRate: string;
  consecutiveLosses: number;
  runningTime: string;
  progressToTarget: string;
  tradeHistory?: TradeHistory[];
}

interface AccountInfo {
  account_id: string;
  balance: number;
  currency: string;
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

// Extend WebSocket type to include bot instance
interface BotWebSocket extends WebSocket {
  botInstance?: any;
}

const BOT_CLASSES = {
  'DIFFERbot': DIFFERbot,
  'notouchbot': NoTouchBot,
  'risefallbot': RiseFallBot,
  'underbot': UnderBot,
  'safeoverbot': SafeOverBot,
  'safeunderbot': SafeUnderBot,
  'overbot': OverBot,
  'metrodiffer': MetroDiffer,
  'alienrisefall': AlienRiseFall,
  'smarteven': SmartEven,
  'smartvolatility': SmartVolatility,
  'russianodds': RussianOdds
};

const BOT_NAMES = {
  'DIFFERbot': 'DIFFER Bot',
  'notouchbot': 'No Touch Bot',
  'risefallbot': 'Rise Fall Bot',
  'underbot': 'High Risk Under Bot',
  'safeoverbot': 'Safe Over Bot',
  'safeunderbot': 'Safe Under Bot',
  'overbot': 'High Risk Over Bot',
  'metrodiffer': 'Metro Differ Bot',
  'alienrisefall': 'Alien Rise Fall Bot',
  'smarteven': 'Smart Even Bot',
  'smartvolatility': 'Smart Volatility Bot',
  'russianodds': 'Russian Odds Bot'
};

const BOT_DESCRIPTIONS = {
  'DIFFERbot': 'Trades on digit difference patterns with advanced pattern recognition',
  'notouchbot': 'Advanced technical analysis with volatility-based trading',
  'risefallbot': 'Comprehensive technical analysis with multiple indicators',
  'underbot': 'High-risk trading on digits under 5-6 with higher payouts',
  'safeoverbot': 'Low-risk trading on digits over 0 with consecutive pattern analysis',
  'safeunderbot': 'Low-risk trading on digits under 9 with consecutive pattern analysis',
  'overbot': 'High-risk trading on digits over 4-5 with higher payouts',
  'metrodiffer': 'Smart digit differ trading with random and pattern-based strategies',
  'alienrisefall': 'Advanced rise/fall trading with smart trend confirmation and recovery',
  'smarteven': 'Advanced even/odd trading with smart pattern analysis and recovery',
  'smartvolatility': 'Advanced volatility trading with dynamic timeframes and smart risk adjustment',
  'russianodds': 'Fast-paced even/odd trading with 5-tick pattern analysis and relaxed recovery'
};

const BOT_SYMBOLS = {
  'DIFFERbot': 'R_25',
  'notouchbot': 'R_100',
  'risefallbot': 'R_10',
  'underbot': 'R_100',
  'safeoverbot': 'R_10',
  'safeunderbot': 'R_10',
  'overbot': 'R_10',
  'metrodiffer': 'R_25',
  'alienrisefall': 'R_10',
  'smarteven': 'R_50',
  'smartvolatility': 'R_75',
  'russianodds': 'R_50'
};

const BOT_COLORS = {
  'DIFFERbot': '#FF6B6B',
  'notouchbot': '#D4A5A5',
  'risefallbot': '#2A363B',
  'underbot': '#99B898',
  'safeoverbot': '#4CAF50',
  'safeunderbot': '#2196F3',
  'overbot': '#FFA726',
  'metrodiffer': '#9C27B0',
  'alienrisefall': '#00BCD4',
  'smarteven': '#673AB7',
  'smartvolatility': '#E91E63',
  'russianodds': '#FF4081'
};

const BOT_FEATURES = {
  'DIFFERbot': ['Pattern Recognition', 'Martingale Strategy', 'Real-time Stats'],
  'notouchbot': ['Technical Analysis', 'Volatility Trading', 'Risk Management'],
  'risefallbot': ['Multiple Indicators', 'Volume Analysis', 'Risk Management'],
  'underbot': ['High Risk', 'High Payout', 'Dynamic Barriers'],
  'safeoverbot': ['Low Risk', 'Zero Pattern Analysis', 'Conservative Trading'],
  'safeunderbot': ['Low Risk', 'Nine Pattern Analysis', 'Conservative Trading'],
  'overbot': ['High Risk', 'High Payout', 'Dynamic Barriers'],
  'metrodiffer': ['Random Strategy', 'Pattern Analysis', 'Smart Recovery'],
  'alienrisefall': ['Smart Recovery', 'Trend Analysis', 'Adaptive Trading'],
  'smarteven': ['Pattern Analysis', 'Smart Recovery', 'Streak Detection'],
  'smartvolatility': ['Volatility Measurement', 'Dynamic Timeframes', 'Smart Risk Adjustment'],
  'russianodds': ['5-Tick Analysis', 'Quick Recovery', 'Pattern Trading']
};

const BOT_RATINGS = {
  'DIFFERbot': 4.5,
  'notouchbot': 4.6,
  'risefallbot': 4.9,
  'underbot': 4.3,
  'safeoverbot': 4.7,
  'safeunderbot': 4.7,
  'overbot': 4.4,
  'metrodiffer': 4.6,
  'alienrisefall': 4.8,
  'smarteven': 4.8,
  'smartvolatility': 4.7,
  'russianodds': 4.6
};

const DERIV_API_KEY = '@deriv_api_key';
const DERIV_OAUTH_TOKENS = '@deriv_oauth_tokens';
const APP_ID = '67709';
const DERIV_WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const BOT_RUNNING_KEY = '@bot_running_state';
const DISCLAIMER_SHOWN_KEY = '@disclaimer_shown';

function BotScreen() {
  const { bot } = useLocalSearchParams();
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<BotConfig>({
    initialStake: bot === 'smartvolatility' ? '1' : '0.35',
    takeProfit: '0',  // Will be updated when balance is confirmed
    stopLoss: '1000',
    martingaleMultiplier: ['safeoverbot', 'safeunderbot', 'DIFFERbot', 'metrodiffer'].includes(bot as string) ? '15' : '2.1'
  });
  const [stats, setStats] = useState<BotStats>({
    currentStake: 0,
    totalProfit: 0,
    totalTrades: 0,
    winRate: '0',
    consecutiveLosses: 0,
    runningTime: '00:00:00',
    progressToTarget: '0'
  });
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
  const [ws, setWs] = useState<BotWebSocket | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetMessage, setTargetMessage] = useState({ type: '', message: '' });
  const [statusBadge, setStatusBadge] = useState<'running' | 'analyzing' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [skipDisclaimer, setSkipDisclaimer] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [cooldownInterval, setCooldownInterval] = useState<NodeJS.Timeout | null>(null);
  const [stopButtonDisabled, setStopButtonDisabled] = useState(false);
  const [oauthTokens, setOauthTokens] = useState<DerivOAuthTokens | null>(null);
  const [showMartingaleInfo, setShowMartingaleInfo] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cleanupVerified, setCleanupVerified] = useState(true);
  const [showedPopup, setShowedPopup] = useState(false);

  useEffect(() => {
    loadSavedConfig();
    loadRunningState();
  }, [bot]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isRunning) {
      setStatusBadge('running');
      intervalId = setInterval(() => {
        setStatusBadge(prev => prev === 'running' ? 'analyzing' : 'running');
      }, 1500); // Alternate every 1.5 seconds
    } else {
      setStatusBadge(null);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    
    if (isRunning && startTime) {
      timerInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const seconds = (diff % 60).toString().padStart(2, '0');
        setStats(prev => ({
          ...prev,
          runningTime: `${hours}:${minutes}:${seconds}`
        }));
      }, 1000);
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isRunning, startTime]);

  useEffect(() => {
    return () => {
      if (cooldownInterval) {
        clearInterval(cooldownInterval);
      }
    };
  }, [cooldownInterval]);

  const loadSavedConfig = async () => {
    try {
      const savedConfig = await AsyncStorage.getItem(`@bot_config_${bot}`);
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const saveConfig = async () => {
    try {
      await AsyncStorage.setItem(`@bot_config_${bot}`, JSON.stringify(config));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  const loadRunningState = async () => {
    try {
      const savedState = await AsyncStorage.getItem(BOT_RUNNING_KEY);
      if (savedState) {
        const { isRunning: wasRunning, botType } = JSON.parse(savedState);
        if (wasRunning && botType === bot) {
          setIsRunning(true);
          // Reconnect WebSocket if bot was running
          handleStartBot();
        }
      }
    } catch (error) {
      console.error('Error loading running state:', error);
    }
  };

  const saveRunningState = async (running: boolean) => {
    try {
      if (running) {
        await AsyncStorage.setItem(BOT_RUNNING_KEY, JSON.stringify({ isRunning: true, botType: bot }));
      } else {
        await AsyncStorage.removeItem(BOT_RUNNING_KEY);
      }
    } catch (error) {
      console.error('Error saving running state:', error);
    }
  };

  const checkDisclaimerPreference = async () => {
    try {
      const user = getCurrentUser();
      if (!user) return false;
      const userDisclaimerKey = `${DISCLAIMER_SHOWN_KEY}_${user.uid}`;
      const disclaimerShown = await AsyncStorage.getItem(userDisclaimerKey);
      return disclaimerShown === 'true';
    } catch (error) {
      console.error('Error checking disclaimer preference:', error);
      return false;
    }
  };

  const startCooldown = () => {
    setCooldownTime(10);
    const interval = setInterval(() => {
      setCooldownTime(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setCooldownInterval(interval);
  };

  const verifyCleanup = async () => {
    console.log('[Bot] Starting cleanup verification...');
    setIsRefreshing(true);
    try {
      // Ensure bot instance is stopped
      if (ws?.botInstance) {
        console.log('[Bot] Stopping bot instance...');
        ws.botInstance.stop();
        ws.botInstance = null;
      }
            
      // Close and cleanup WebSocket
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('[Bot] Cleaning up WebSocket subscriptions...');
          // Forget all subscriptions
          ws.send(JSON.stringify({ 
            forget_all: ['ticks', 'proposal', 'proposal_open_contract', 'balance'] 
          }));
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('[Bot] Closing WebSocket connection...');
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        setWs(null);
      }

      // Reset states
      console.log('[Bot] Resetting states...');
      setIsRunning(false);
      await saveRunningState(false);
      setStartTime(null);
      setStats({
        currentStake: 0,
        totalProfit: 0,
        totalTrades: 0,
        winRate: '0',
        consecutiveLosses: 0,
        runningTime: '00:00:00',
        progressToTarget: '0'
      });
      setTradeHistory([]);
      setCleanupVerified(true);
      console.log('[Bot] Cleanup verification completed successfully');
    } catch (error) {
      console.error('[Bot] Cleanup verification failed:', error);
      setCleanupVerified(false);
    } finally {
      setIsRefreshing(false);
      setStopButtonDisabled(false);
    }
  };

  const handleStartBot = async () => {
    if (isLoading || isRefreshing) return;

    if (isRunning && !stopButtonDisabled) {
      setIsLoading(true);
      console.log('[Bot] Stopping bot...');
      setCleanupVerified(false);
      setIsRunning(false);
      await saveRunningState(false);
      
      if (ws) {
        try {
          if (ws.botInstance) {
            ws.botInstance.stop();
            ws.botInstance = null;
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              forget_all: ['ticks', 'proposal', 'proposal_open_contract', 'balance'] 
            }));
            await new Promise(resolve => setTimeout(resolve, 1000));
            ws.close();
          }
        } catch (error) {
          console.error('[Bot] Error stopping bot:', error);
        }
      }
      setWs(null);
      startCooldown();
      setIsLoading(false);
      return;
    }

    if (!cleanupVerified) {
      console.log('[Bot] Attempt to start without cleanup verification');
      Alert.alert(
        'Refresh Required',
        'Please click the Refresh button to clean up the previous session before starting a new one.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check cooldown before starting
    if (cooldownTime > 0) return;

    // Check if user is logged in
    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Error', 'Please sign in to use the bot');
      router.push('/(app)/home');
      return;
    }

    // Always show disclaimer for first bot start in the session
    const shouldSkipDisclaimer = await checkDisclaimerPreference();
    if (!showedPopup || !shouldSkipDisclaimer) {
      setShowDisclaimer(true);
      setShowedPopup(true);
    } else {
      startBotAfterDisclaimer();
    }
  };

  const startBotAfterDisclaimer = async () => {
    setShowDisclaimer(false);
    if (skipDisclaimer) {
      try {
        const user = getCurrentUser();
        if (user) {
          const userDisclaimerKey = `${DISCLAIMER_SHOWN_KEY}_${user.uid}`;
          await AsyncStorage.setItem(userDisclaimerKey, 'true');
        }
      } catch (error) {
        console.error('[Bot] Error saving disclaimer preference:', error);
      }
    }
    setIsLoading(true);
    
    try {
      const user = getCurrentUser();
      if (!user) {
        Alert.alert('Error', 'Please sign in to use the bot');
        router.push('/(app)/home');
        return;
      }

      setStartTime(new Date());
      setIsRunning(true);
      setStopButtonDisabled(true);
      setTimeout(() => {
        setStopButtonDisabled(false);
      }, 10000);
      
      await saveRunningState(true);
      
      // Check for OAuth tokens first
      const savedTokens = await AsyncStorage.getItem(`${DERIV_OAUTH_TOKENS}_${user.uid}`);
      let authToken: string | null = null;
      let accountId: string | null = null;
      
      if (savedTokens) {
        const tokens = JSON.parse(savedTokens) as DerivOAuthTokens;
        setOauthTokens(tokens);
        if (tokens.selectedAccount) {
          console.log('[Bot] Using OAuth token for account:', tokens.selectedAccount.account);
          authToken = tokens.selectedAccount.token;
          accountId = tokens.selectedAccount.account;
        }
      }
      
      // Fallback to API key if no OAuth token
      if (!authToken) {
        const savedKey = await AsyncStorage.getItem(`${DERIV_API_KEY}_${user.uid}`);
        if (!savedKey) {
          setIsRunning(false);
          await saveRunningState(false);
          Alert.alert('Error', 'Please connect your Deriv account first');
          router.push('/(app)/home');
          return;
        }
        console.log('[Bot] Using API key authentication');
        authToken = savedKey;
      }

      const wsInstance = new WebSocket(DERIV_WS_URL) as BotWebSocket;
      console.log('[Bot] Initializing WebSocket connection...');
      setWs(wsInstance);

      wsInstance.onopen = () => {
        console.log('[Bot] WebSocket connected, authorizing...');
        wsInstance.send(JSON.stringify({ 
          authorize: authToken,
          req_id: Date.now()
        }));
      };

      wsInstance.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          console.log('[Bot] Received message type:', data.msg_type);
          
          if (data.error) {
            console.error('[Bot] WebSocket error:', data.error);
            Alert.alert('Error', `Failed to connect: ${data.error.message}`);
            wsInstance.close();
            setWs(null);
            return;
          }

          // Handle ping messages
          if (data.msg_type === 'ping') {
            wsInstance.send(JSON.stringify({ pong: 1 }));
            return;
          }

          if (data.msg_type === 'authorize' && data.authorize) {
            // Verify the account belongs to the user
            if (accountId && data.authorize.loginid !== accountId) {
              console.error('[Bot] Account mismatch:', data.authorize.loginid, 'expected:', accountId);
              Alert.alert('Error', 'Account verification failed. Please reconnect your Deriv account.');
              wsInstance.close();
              setWs(null);
              setIsRunning(false);
              saveRunningState(false);
              router.push('/(app)/home');
              return;
            }

            console.log('[Bot] Authorization successful, getting balance...');
            wsInstance.send(JSON.stringify({ 
              balance: 1,
              subscribe: 1
            }));
          }
          
          if (data.msg_type === 'balance') {
            console.log('[Bot] Balance received:', data.balance);
            const accountInfo = {
              account_id: data.balance?.loginid || 'Unknown',
              balance: parseFloat(data.balance?.balance || '0'),
              currency: data.balance?.currency || 'USD'
            };
            setAccountInfo(accountInfo);

            if (accountInfo.balance < parseFloat(config.initialStake)) {
              Alert.alert(
                'Insufficient Balance',
                `Account ID: ${accountInfo.account_id}\nCurrent Balance: ${accountInfo.balance.toFixed(2)} ${accountInfo.currency}\nRequired for Next Trade: ${stats.currentStake.toFixed(2)} ${accountInfo.currency}`,
                [
                  {
                    text: 'Deposit',
                    onPress: () => Linking.openURL('https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk'),
                    style: 'default'
                  },
                  { text: 'Close', style: 'cancel' }
                ]
              );
              wsInstance.close();
              setWs(null);
              return;
            }

            // Start bot if balance is sufficient
            const BotClass = BOT_CLASSES[bot as keyof typeof BOT_CLASSES];
            if (!BotClass) {
              console.error('[Bot] Bot class not found:', bot);
              Alert.alert('Error', 'Bot not found');
              wsInstance.close();
              setWs(null);
              return;
            }

            console.log('[Bot] Starting bot:', bot);
            const botInstance = new BotClass(wsInstance, {
              initialStake: parseFloat(config.initialStake),
              takeProfit: parseFloat(config.takeProfit),
              stopLoss: parseFloat(config.stopLoss),
              martingaleMultiplier: parseFloat(config.martingaleMultiplier)
            });

            // Store bot instance in WebSocket for cleanup
            wsInstance.botInstance = botInstance;

            botInstance.setUpdateCallback((stats: BotStats) => {
              console.log('[Bot] Stats update:', stats);
              const targetAmount = parseFloat(config.takeProfit);
              const stopLossAmount = parseFloat(config.stopLoss);
              let progressPercentage;
              
              if (stopLossAmount === 0) {
                progressPercentage = (stats.totalProfit / targetAmount * 100).toFixed(2);
              } else {
              const totalRange = targetAmount + stopLossAmount;
              const currentPosition = stats.totalProfit + stopLossAmount;
                progressPercentage = (currentPosition / totalRange * 100).toFixed(2);
              }
              
              progressPercentage = Math.min(Math.max(parseFloat(progressPercentage), 0), 100).toFixed(2);
              
              setStats({
                ...stats,
                progressToTarget: progressPercentage
              });
              
              if (stats.tradeHistory) {
                setTradeHistory(stats.tradeHistory);
              }

              // Check if next stake exceeds available balance
              if (stats.currentStake > accountInfo.balance) {
                console.log('[Bot] Insufficient balance for next trade, stopping bot...');
                setStartTime(null);
                setIsRunning(false);
                saveRunningState(false);
                setCleanupVerified(false);
                
                // Stop the bot instance first
                if (wsInstance.botInstance) {
                  wsInstance.botInstance.stop();
                  wsInstance.botInstance = null;
                }
                
                // Clean up WebSocket connection
                if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                  try {
                    wsInstance.send(JSON.stringify({ forget_all: ['ticks', 'proposal', 'proposal_open_contract', 'balance'] }));
                    setTimeout(() => {
                      if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                  wsInstance.close();
                }
                setWs(null);
                      // Show insufficient balance alert
                      Alert.alert(
                        'Insufficient Balance',
                        `Account ID: ${accountInfo.account_id}\nCurrent Balance: ${accountInfo.balance.toFixed(2)} ${accountInfo.currency}\nRequired for Next Trade: ${stats.currentStake.toFixed(2)} ${accountInfo.currency}`,
                        [
                          {
                            text: 'Deposit',
                            onPress: () => Linking.openURL('https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk'),
                            style: 'default'
                          },
                          { text: 'Close', style: 'cancel' }
                        ]
                      );
                    }, 500);
                  } catch (error) {
                    console.log('[Bot] Error during WebSocket cleanup:', error);
                    setWs(null);
                    Alert.alert(
                      'Insufficient Balance',
                      `Account ID: ${accountInfo.account_id}\nCurrent Balance: ${accountInfo.balance.toFixed(2)} ${accountInfo.currency}\nRequired for Next Trade: ${stats.currentStake.toFixed(2)} ${accountInfo.currency}`,
                      [
                        {
                          text: 'Deposit',
                          onPress: () => Linking.openURL('https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk'),
                          style: 'default'
                        },
                        { text: 'Close', style: 'cancel' }
                      ]
                    );
                  }
                } else {
                  setWs(null);
                  Alert.alert(
                    'Insufficient Balance',
                    `Account ID: ${accountInfo.account_id}\nCurrent Balance: ${accountInfo.balance.toFixed(2)} ${accountInfo.currency}\nRequired for Next Trade: ${stats.currentStake.toFixed(2)} ${accountInfo.currency}`,
                    [
                      {
                        text: 'Deposit',
                        onPress: () => Linking.openURL('https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk'),
                        style: 'default'
                      },
                      { text: 'Close', style: 'cancel' }
                    ]
                  );
                }
                return;
              }

              // Check for target reached - only check stop loss if it's not 0
              if (stats.totalProfit >= parseFloat(config.takeProfit) || 
                  (stopLossAmount > 0 && stats.totalProfit <= -stopLossAmount)) {
                console.log('[Bot] Target reached, initiating cleanup...');
                setStartTime(null);
                setIsRunning(false);
                saveRunningState(false);
                setCleanupVerified(false);
                
                // Stop the bot instance first
                if (wsInstance.botInstance) {
                  wsInstance.botInstance.stop();
                  wsInstance.botInstance = null;
                }
                
                // Clean up WebSocket connection
                if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                  try {
                    wsInstance.send(JSON.stringify({ forget_all: ['ticks', 'proposal', 'proposal_open_contract', 'balance'] }));
                    setTimeout(() => {
                      if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                        wsInstance.close();
                      }
                      setWs(null);
                      // Show the target reached popup after cleanup
                      showTargetReachedPopup(
                        stats.totalProfit >= parseFloat(config.takeProfit) ? 'profit' : 'loss',
                        Math.abs(stats.totalProfit)
                      );
                    }, 500);
                  } catch (error) {
                    console.log('[Bot] Error during WebSocket cleanup:', error);
                    setWs(null);
                showTargetReachedPopup(
                  stats.totalProfit >= parseFloat(config.takeProfit) ? 'profit' : 'loss',
                  Math.abs(stats.totalProfit)
                );
                  }
                } else {
                  setWs(null);
                  showTargetReachedPopup(
                    stats.totalProfit >= parseFloat(config.takeProfit) ? 'profit' : 'loss',
                    Math.abs(stats.totalProfit)
                  );
                }
              }
            });

            // Start the bot before setting up message handler
            botInstance.start();
            console.log('[Bot] Bot started successfully');

            // Set up message handler after bot is started
            wsInstance.onmessage = (msg) => {
              try {
                const data = JSON.parse(msg.data);
                
                // Handle ping messages
                if (data.msg_type === 'ping') {
                  wsInstance.send(JSON.stringify({ pong: 1 }));
                  return;
                }
                
                // Handle balance updates
                if (data.msg_type === 'balance' && data.balance) {
                  const updatedAccountInfo = {
                    account_id: data.balance.loginid || accountInfo?.account_id || 'Unknown',
                    balance: parseFloat(data.balance.balance || '0'),
                    currency: data.balance.currency || 'USD'
                  };
                  setAccountInfo(updatedAccountInfo);
                }

                // Forward messages to bot while running
                if (wsInstance.botInstance && wsInstance.botInstance.isRunning) {
                  wsInstance.botInstance.handleMessage(msg.data);
                }
              } catch (error) {
                console.error('[Bot] Error processing message:', error);
              }
            };
          }
        } catch (error) {
          console.error('[Bot] Error processing message:', error);
        }
      };

      wsInstance.onerror = async (error) => {
        console.error('[Bot] WebSocket error:', error);
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
          wsInstance.close();
        }
        setWs(null);
        setIsRunning(false);
        setIsLoading(false);
        await saveRunningState(false);
        Alert.alert('Connection Error', 'Failed to connect to trading server. Please try again.');
      };

      wsInstance.onclose = async (event) => {
        console.log('[Bot] WebSocket connection closed:', event.code);
        if (wsInstance && wsInstance.botInstance) {
          wsInstance.botInstance.stop();
        }
        setWs(null);
        setIsRunning(false);
        setIsLoading(false);
        await saveRunningState(false);
      };

    } catch (error) {
      console.error('[Bot] Error handling bot:', error);
      setIsRunning(false);
      await saveRunningState(false);
      if (ws) {
        ws.close();
        setWs(null);
      }
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const showTargetReachedPopup = async (type: 'profit' | 'loss', amount: number) => {
    setCleanupVerified(false);
    await verifyCleanup(); // Ensure cleanup before showing popup
    
    const message = type === 'profit' 
      ? `🎉 TARGET REACHED!\n\nCongratulations!\nYou've hit your take profit target.\n\nTotal Profit: $${amount.toFixed(2)}`
      : `⚠️ TRADING STOPPED!\n\nStop loss limit reached.\n\nTotal Loss: $${amount.toFixed(2)}`;
    
    setTargetMessage({ 
      type, 
      message 
    });
    setShowTargetModal(true);
  };

  const handleStakeChange = (value: string) => {
    if (bot === 'smartvolatility' && parseFloat(value) < 1) {
        setConfig({ ...config, initialStake: '1', takeProfit: '2' });
    } else {
        const stake = parseFloat(value);
        let recommendedTP = '0';
        
        // Calculate take profit as 1% of account balance if available
        if (accountInfo?.balance) {
            recommendedTP = (accountInfo.balance * 0.01).toFixed(2);
        }

        setConfig({ 
            ...config, 
            initialStake: value,
            takeProfit: recommendedTP
        });

        // Show popup after 5 seconds if not shown before
        if (!showedPopup && parseFloat(value) > 0) {
            setTimeout(() => {
                Alert.alert(
                    '💰 Profit Target Suggestion',
                    `I've set a recommended take profit of $${recommendedTP}\n\nRemember: Pigs get fat, hogs get slaughtered! 🐷\n\nYou can always adjust this value, but greed is not your friend in trading! 😉`,
                    [{ 
                        text: 'Got it!', 
                        style: 'default',
                        onPress: () => setShowedPopup(true)
                    }]
                );
            }, 5000);
        }
    }
  };

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isRunning) {
          Alert.alert(
            'Bot is Running',
            'Are you sure you want to exit? The bot will be stopped.',
            [
              {
                text: 'Cancel',
                style: 'cancel'
              },
              {
                text: 'Stop Bot & Exit',
                style: 'destructive',
                onPress: async () => {
                  console.log('[Bot] Stopping bot before exit...');
                  if (ws?.botInstance) {
                    ws.botInstance.stop();
                    ws.botInstance = null;
                    console.log('[Bot] Bot instance stopped successfully');
                  }
                  
                  if (ws?.readyState === WebSocket.OPEN) {
                    try {
                      console.log('[Bot] Cleaning up WebSocket subscriptions...');
                      ws.send(JSON.stringify({ 
                        forget_all: ['ticks', 'proposal', 'proposal_open_contract', 'balance'] 
                      }));
                      await new Promise(resolve => setTimeout(resolve, 500));
                      ws.close();
                      console.log('[Bot] WebSocket connection closed as expected - bot stopped');
                    } catch (error) {
                      console.error('[Bot] Error during WebSocket cleanup:', error);
                    }
                  }

                  setIsRunning(false);
                  await saveRunningState(false);
                  console.log('[Bot] Bot state saved and cleanup completed');
                  router.back();
                }
              }
            ]
          );
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [isRunning, ws])
  );

  // Add balance confirmation on mount
  useEffect(() => {
    const confirmBalance = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;
        
        const savedTokens = await AsyncStorage.getItem(`${DERIV_OAUTH_TOKENS}_${user.uid}`);
        const globalTokens = await AsyncStorage.getItem(DERIV_OAUTH_TOKENS);
        let authToken: string | null = null;
        
        if (savedTokens) {
          const tokens = JSON.parse(savedTokens) as DerivOAuthTokens;
          if (tokens.selectedAccount) {
            authToken = tokens.selectedAccount.token;
          }
        }
        
        if (!authToken) {
          const savedKey = await AsyncStorage.getItem(`${DERIV_API_KEY}_${user.uid}`);
          if (!savedKey) return;
          authToken = savedKey;
        }

        const tempWs = new WebSocket(DERIV_WS_URL);
        
        tempWs.onopen = () => {
          tempWs.send(JSON.stringify({ 
            authorize: authToken,
            req_id: Date.now()
          }));
        };

        tempWs.onmessage = (msg) => {
          const data = JSON.parse(msg.data);
          
          if (data.error) {
            console.error('Balance check error:', data.error);
            tempWs.close();
            return;
          }

          if (data.msg_type === 'authorize') {
            tempWs.send(JSON.stringify({ balance: 1 }));
          }
          
          if (data.msg_type === 'balance') {
            const balance = parseFloat(data.balance?.balance || '0');
            setAccountInfo({
              account_id: data.balance?.loginid || 'Unknown',
              balance: balance,
              currency: data.balance?.currency || 'USD'
            });
            // Set initial take profit to 1% of balance
            setConfig(prev => ({
              ...prev,
              takeProfit: (balance * 0.01).toFixed(2)
            }));
            tempWs.close();
          }
        };

        tempWs.onerror = (error) => {
          console.error('Balance check connection error:', error);
          tempWs.close();
        };

      } catch (error) {
        console.error('Balance confirmation error:', error);
      }
    };

    confirmBalance();
  }, []);

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {/* Configuration Card */}
          <View style={styles.card}>
            <View style={styles.configHeader}>
              <ThemedText style={styles.cardTitle}>Bot Configuration</ThemedText>
              <View style={styles.configBalanceBadge}>
                <ThemedText style={styles.configBalanceText}>
                  ${(accountInfo?.balance || 0).toFixed(2)}
                </ThemedText>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <ThemedText style={styles.label}>Initial Stake ($)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={config.initialStake}
                  onChangeText={handleStakeChange}
                  keyboardType="decimal-pad"
                  placeholder={bot === 'smartvolatility' ? "Min: 1.00" : "Min: 0.35"}
                />
              </View>
              <View style={styles.inputWrapper}>
                <ThemedText style={styles.label}>Take Profit ($)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={config.takeProfit}
                  onChangeText={(value) => setConfig({ ...config, takeProfit: value })}
                  keyboardType="decimal-pad"
                  placeholder="Recommended: 2× stake"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <ThemedText style={styles.label}>Stop Loss ($)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={config.stopLoss}
                  onChangeText={(value) => setConfig({ ...config, stopLoss: value })}
                  keyboardType="decimal-pad"
                  placeholder="1000.00"
                />
              </View>
              {bot !== 'smartvolatility' && (
                <View style={styles.inputWrapper}>
                  <View style={styles.labelContainer}>
                    <ThemedText style={styles.label}>Martingale</ThemedText>
                    <TouchableOpacity 
                      onPress={() => setShowMartingaleInfo(true)}
                      style={styles.infoButton}
                    >
                      <View style={styles.infoButtonInner}>
                        <ThemedText style={styles.infoButtonText}>?</ThemedText>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={config.martingaleMultiplier}
                    onChangeText={(value) => setConfig({ ...config, martingaleMultiplier: value })}
                    keyboardType="decimal-pad"
                    placeholder="2.10"
                  />
                </View>
              )}
            </View>
            <View style={styles.buttonContainer}>
              {!cleanupVerified && (
                <View style={styles.refreshContainer}>
                  <ThemedText style={styles.refreshNote}>
                    Please refresh to clean up the previous session before starting a new one
                  </ThemedText>
                  <TouchableOpacity 
                    style={[
                      styles.button,
                      styles.refreshButton,
                      isRefreshing && styles.disabledButton
                    ]}
                    onPress={verifyCleanup}
                    disabled={isRefreshing}
                  >
                    <ThemedText style={styles.buttonText}>
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}
              {cleanupVerified && (
            <TouchableOpacity 
              style={[
                styles.button,
                isRunning ? styles.stopButton : styles.startButton,
                    (isLoading || (!isRunning && cooldownTime > 0) || (isRunning && stopButtonDisabled)) && styles.disabledButton
              ]}
              onPress={handleStartBot}
                  disabled={isLoading || (!isRunning && cooldownTime > 0) || (isRunning && stopButtonDisabled)}
            >
              <ThemedText style={styles.buttonText}>
                    {isRunning ? `Stop Bot${stopButtonDisabled ? ` (${Math.ceil(10)}s)` : ''}` : 
                      `Start Bot${!isRunning && cooldownTime > 0 ? ` (${cooldownTime}s)` : ''}`}
              </ThemedText>
            </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Statistics Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>Live Statistics</ThemedText>
              {statusBadge && (
                <View style={[
                  styles.statusBadge,
                  statusBadge === 'running' ? styles.runningBadge : styles.analyzingBadge
                ]}>
                  <ThemedText style={styles.statusText}>
                    {statusBadge === 'running' ? 'RUNNING' : 'ANALYZING'}
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Current Stake</ThemedText>
                <ThemedText style={styles.statValue}>${stats.currentStake.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Total Profit</ThemedText>
                <ThemedText style={[styles.statValue, { color: stats.totalProfit >= 0 ? '#10B981' : '#EF4444' }]}>
                  ${stats.totalProfit.toFixed(2)}
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Total Trades</ThemedText>
                <ThemedText style={styles.statValue}>{stats.totalTrades}</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Win Rate</ThemedText>
                <ThemedText style={styles.statValue}>{stats.winRate}%</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Running Time</ThemedText>
                <ThemedText style={styles.statValue}>{stats.runningTime}</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={styles.statLabel}>Progress (Target: ${parseFloat(config.takeProfit).toFixed(2)})</ThemedText>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${Math.min((stats.totalProfit / parseFloat(config.takeProfit) * 100), 100)}%`,
                          backgroundColor: stats.totalProfit >= 0 ? '#10B981' : '#EF4444'
                        }
                      ]} 
                    />
                  </View>
                  <ThemedText style={[
                    styles.progressText,
                    { color: stats.totalProfit >= 0 ? '#10B981' : '#EF4444' }
                  ]}>
                    {(stats.totalProfit / parseFloat(config.takeProfit) * 100).toFixed(2)}%
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* Trade History Card */}
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>Trade History</ThemedText>
            {tradeHistory.map((trade, index) => (
              <View key={index} style={styles.tradeItem}>
                <View style={styles.tradeHeader}>
                  <ThemedText style={styles.tradeTime}>
                    {trade.time.toLocaleTimeString()}
                  </ThemedText>
                  <View style={[
                    styles.tradeResult,
                    trade.result === 'win' ? styles.winResult : styles.lossResult
                  ]}>
                    <ThemedText style={[
                      styles.tradeResultText,
                      trade.result === 'win' ? styles.winResultText : styles.lossResultText
                    ]}>
                      {trade.result.toUpperCase()}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.tradeDetails}>
                  <ThemedText style={styles.tradeDetail}>
                    Stake: ${trade.stake.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[
                    styles.tradeProfit,
                    { color: trade.profit >= 0 ? '#10B981' : '#EF4444' }
                  ]}>
                    {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        transparent
        visible={showTargetModal}
        animationType="fade"
        onRequestClose={() => setShowTargetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent,
            targetMessage.type === 'profit' ? styles.profitModal : styles.lossModal
          ]}>
            <ThemedText style={styles.modalTitle}>
              {targetMessage.message}
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowTargetModal(false)}
            >
              <ThemedText style={styles.modalButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Disclaimer Modal */}
      <Modal
        transparent
        visible={showDisclaimer}
        animationType="fade"
        onRequestClose={() => setShowDisclaimer(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.disclaimerModal]}>
            <ThemedText style={styles.disclaimerTitle}>⚠️ Risk Warning</ThemedText>
            <ThemedText style={styles.disclaimerText}>
              Trading involves significant risk and can result in the loss of your invested capital. Please ensure that you fully understand the risks involved before using this bot:
            </ThemedText>
            <View style={styles.disclaimerPoints}>
              <ThemedText style={styles.disclaimerPoint}>• Past performance is not indicative of future results</ThemedText>
              <ThemedText style={styles.disclaimerPoint}>• The bot's performance can vary based on market conditions</ThemedText>
              <ThemedText style={styles.disclaimerPoint}>• Never trade with money you cannot afford to lose</ThemedText>
              <ThemedText style={styles.disclaimerPoint}>• Always monitor the bot's activity</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.disclaimerLink}
              onPress={() => {
                Alert.alert(
                  'External Link',
                  'This will open Deriv\'s risk disclosure in your browser.',
                  [
                    {
                      text: 'Open',
                      onPress: () => router.push('https://deriv.com/tnc/risk-disclosure.pdf?t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk')
                    },
                    {
                      text: 'Cancel',
                      style: 'cancel'
                    }
                  ]
                );
              }}
            >
              <ThemedText style={styles.disclaimerLinkText}>Read Deriv's Full Risk Disclosure →</ThemedText>
            </TouchableOpacity>
            <View style={styles.disclaimerCheckbox}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setSkipDisclaimer(!skipDisclaimer)}
              >
                <View style={[styles.checkbox, skipDisclaimer && styles.checkboxChecked]}>
                  {skipDisclaimer && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                </View>
                <ThemedText style={styles.checkboxLabel}>Don't show this warning again</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.disclaimerButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.smallButton, styles.declineButton]}
                onPress={() => setShowDisclaimer(false)}
              >
                <ThemedText style={[styles.modalButtonText, styles.smallButtonText]}>Decline</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.smallButton, styles.acceptButton]}
                onPress={startBotAfterDisclaimer}
              >
                <ThemedText style={[styles.modalButtonText, styles.smallButtonText]}>I Understand</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Martingale Info Modal */}
      <Modal
        transparent
        visible={showMartingaleInfo}
        animationType="slide"
        onRequestClose={() => setShowMartingaleInfo(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContent, styles.martingaleModal]}>
            <View style={styles.martingaleModalHeader}>
              <ThemedText style={styles.martingaleModalTitle}>Understanding Martingale</ThemedText>
              <TouchableOpacity 
                onPress={() => setShowMartingaleInfo(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.martingaleContent}>
              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>What is Martingale?</ThemedText>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <ThemedText style={[styles.martingaleText, styles.fullWidth]}>
                    A recovery strategy that multiplies stakes{'\n'}
                    after each loss in trading sessions.{'\n'}
                    Aims to recover all previous losses{'\n'}
                    plus achieve a small profit equal{'\n'}
                    to your initial trading stake amount.
                  </ThemedText>
                </ScrollView>
              </View>

              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>Required Inputs</ThemedText>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={[styles.inputsList, styles.fullWidth]}>
                    <ThemedText style={styles.inputItem}>• Initial Stake:{'\n'}  Your starting bet amount for trading</ThemedText>
                    <ThemedText style={styles.inputItem}>• Payout %:{'\n'}  Return percentage on winning trades{'\n'}  (Check current payouts on{' '}
                      <ThemedText 
                        style={styles.linkText}
                        onPress={() => Linking.openURL('https://track.deriv.com/_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk/1/')}
                      >
                        Deriv
                      </ThemedText>
                      )
                    </ThemedText>
                    <ThemedText style={styles.inputItem}>• Multiplier:{'\n'}  Factor to increase stakes after losses</ThemedText>
                    <ThemedText style={styles.inputItem}>• Maximum Consecutive Losses:{'\n'}  For proper risk assessment planning strategy</ThemedText>
                  </View>
                </ScrollView>
              </View>

              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>Example Calculation</ThemedText>
                <View style={styles.calculationHeader}>
                  <ThemedText style={styles.calculationText}>Initial Stake: $0.35</ThemedText>
                  <ThemedText style={styles.calculationText}>Multiplier: 2.5</ThemedText>
                  <ThemedText style={styles.calculationText}>Payout: 95%</ThemedText>
                </View>
                
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={styles.calculationTable}>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableHeader}>Loss #</ThemedText>
                      <ThemedText style={styles.tableHeader}>Calculation</ThemedText>
                      <ThemedText style={styles.tableHeader}>Stake</ThemedText>
                      <ThemedText style={styles.tableHeader}>Total Invested</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>1</ThemedText>
                      <ThemedText style={styles.tableCell}>Initial</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.35</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.35</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>2</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.35 × 2.5</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.88</ThemedText>
                      <ThemedText style={styles.tableCell}>$1.23</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>3</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.88 × 2.5</ThemedText>
                      <ThemedText style={styles.tableCell}>$2.20</ThemedText>
                      <ThemedText style={styles.tableCell}>$3.43</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>4</ThemedText>
                      <ThemedText style={styles.tableCell}>$2.20 × 2.5</ThemedText>
                      <ThemedText style={styles.tableCell}>$5.50</ThemedText>
                      <ThemedText style={styles.tableCell}>$8.93</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>5</ThemedText>
                      <ThemedText style={styles.tableCell}>$5.50 × 2.5</ThemedText>
                      <ThemedText style={styles.tableCell}>$13.75</ThemedText>
                      <ThemedText style={styles.tableCell}>$22.68</ThemedText>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.resultBox}>
                  <ThemedText style={styles.resultTitle}>Recovery Calculation After 5 Losses:</ThemedText>
                  <ThemedText style={styles.resultText}>
                    Final Stake: $13.75{'\n'}
                    Win Amount = $13.75 × 1.95 = $26.81{'\n'}
                    Total Investment = $22.68{'\n'}
                    Net Profit = $26.81 - $22.68 = $4.13
                  </ThemedText>
                </View>
              </View>

              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>Recovery Example</ThemedText>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={styles.recoveryTable}>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableHeader}>Trade</ThemedText>
                      <ThemedText style={styles.tableHeader}>Stake</ThemedText>
                      <ThemedText style={styles.tableHeader}>Result</ThemedText>
                      <ThemedText style={styles.tableHeader}>Balance</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>1</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.35</ThemedText>
                      <ThemedText style={[styles.tableCell, styles.lossText]}>Loss</ThemedText>
                      <ThemedText style={styles.tableCell}>-$0.35</ThemedText>
                    </View>
                    <View style={styles.tableRow}>
                      <ThemedText style={styles.tableCell}>2</ThemedText>
                      <ThemedText style={styles.tableCell}>$0.88</ThemedText>
                      <ThemedText style={[styles.tableCell, styles.winText]}>Win</ThemedText>
                      <ThemedText style={styles.tableCell}>+$1.72</ThemedText>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.resultBox}>
                  <ThemedText style={styles.resultTitle}>Win After Single Loss:</ThemedText>
                  <ThemedText style={styles.resultText}>
                    Investment = $0.35 + $0.88 = $1.23{'\n'}
                    Win Amount = $0.88 × 1.95 = $1.72{'\n'}
                    Net Profit = $1.72 - $1.23 = $0.49
                  </ThemedText>
                </View>
              </View>

              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>Advantages</ThemedText>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={[styles.bulletPoints, styles.fullWidth]}>
                    <ThemedText style={styles.bulletPoint}>• Recovers all previous losses quickly{'\n'}  with just a single win</ThemedText>
                    <ThemedText style={styles.bulletPoint}>• Guarantees small profit on each{'\n'}  successful trade recovery attempt</ThemedText>
                    <ThemedText style={styles.bulletPoint}>• Uses simple mathematical steps to{'\n'}  calculate next trading position</ThemedText>
                  </View>
                </ScrollView>
              </View>

              <View style={styles.martingaleSection}>
                <ThemedText style={styles.martingaleSectionTitle}>Disadvantages</ThemedText>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={[styles.bulletPoints, styles.fullWidth]}>
                    <ThemedText style={styles.bulletPoint}>• Requires substantial capital reserves for{'\n'}  successful trading operations</ThemedText>
                    <ThemedText style={styles.bulletPoint}>• High risk during consecutive losing{'\n'}  streaks in trading sessions</ThemedText>
                    <ThemedText style={styles.bulletPoint}>• May reach platform trading limits{'\n'}  during recovery trading attempts</ThemedText>
                  </View>
                </ScrollView>
              </View>

              <View style={styles.martingaleSection}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.scrollContainer}
                >
                  <View style={[styles.warningBox, styles.fullWidth]}>
                    <ThemedText style={styles.warningTitle}>⚠️ Risk Warning</ThemedText>
                    <ThemedText style={styles.warningText}>
                      We are not liable for any{'\n'}
                      losses incurred during your trading sessions.{'\n'}
                      Martingale strategy can lead to substantial{'\n'}
                      losses in very short trading periods.{'\n'}
                      Never trade with money that you{'\n'}
                      cannot afford to lose in trading.{'\n'}
                      Past performance does not guarantee any{'\n'}
                      future results in trading markets.
                    </ThemedText>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  inputGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  inputWrapper: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#F8FAFC',
  },
  buttonContainer: {
    marginTop: 8,
  },
  refreshContainer: {
    marginBottom: 8,
  },
  refreshNote: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#10B981',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    width: '45%',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    minWidth: 45,
  },
  tradeItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tradeTime: {
    fontSize: 14,
    color: '#64748B',
  },
  tradeResult: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  winResult: {
    backgroundColor: '#D1FAE5',
  },
  lossResult: {
    backgroundColor: '#FEE2E2',
  },
  tradeResultText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#047857',
  },
  winResultText: {
    color: '#047857',
  },
  lossResultText: {
    color: '#DC2626',
  },
  tradeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tradeDetail: {
    fontSize: 14,
    color: '#1E293B',
  },
  tradeProfit: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 32,
    width: '95%',
    maxWidth: 400,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    transform: [{ scale: 1.1 }],
  },
  profitModal: {
    backgroundColor: '#ECFDF5',
    borderWidth: 4,
    borderColor: '#10B981',
    borderLeftWidth: 10,
    borderLeftColor: '#10B981',
  },
  lossModal: {
    backgroundColor: '#FEF2F2',
    borderWidth: 4,
    borderColor: '#EF4444',
    borderLeftWidth: 10,
    borderLeftColor: '#EF4444',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 32,
    color: '#1E293B',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  modalButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    width: '80%',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  runningBadge: {
    backgroundColor: '#10B981',
  },
  analyzingBadge: {
    backgroundColor: '#6366F1',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabledButton: {
    opacity: 0.7,
  },
  disclaimerModal: {
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  disclaimerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  disclaimerText: {
    fontSize: 16,
    color: '#1E293B',
    lineHeight: 24,
    marginBottom: 16,
    textAlign: 'left',
  },
  disclaimerPoints: {
    marginBottom: 20,
  },
  disclaimerPoint: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 8,
  },
  disclaimerLink: {
    marginBottom: 24,
  },
  disclaimerLinkText: {
    color: '#2563EB',
    fontSize: 14,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  disclaimerCheckbox: {
    marginBottom: 16,
    width: '100%',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#64748B',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#10B981',
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoButton: {
    padding: 4,
  },
  infoButtonInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  martingaleModal: {
    maxHeight: '90%',
    width: '95%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    padding: 0,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  martingaleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  martingaleModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  closeButton: {
    padding: 4,
  },
  martingaleContent: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
  },
  martingaleSection: {
    marginBottom: 24,
  },
  martingaleSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  martingaleText: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    flexShrink: 1,
    paddingRight: 10,
  },
  calculationTable: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeader: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F8FAFC',
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    minWidth: 85,
  },
  tableCell: {
    flex: 1,
    padding: 12,
    color: '#475569',
    textAlign: 'center',
    minWidth: 85,
  },
  resultBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  resultText: {
    color: '#065F46',
    fontSize: 14,
    lineHeight: 22,
  },
  bulletPoints: {
    marginTop: 8,
    width: '100%',
  },
  bulletPoint: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    marginBottom: 8,
  },
  warningBox: {
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    marginTop: 16,
    width: '100%',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#7F1D1D',
    lineHeight: 22,
  },
  calculationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  calculationText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  inputsList: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0EA5E9',
    width: '100%',
  },
  inputItem: {
    fontSize: 14,
    color: '#0C4A6E',
    lineHeight: 24,
    marginBottom: 8,
  },
  recoveryTable: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    width: '100%',
  },
  winText: {
    color: '#059669',
    fontWeight: '600',
  },
  lossText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 8,
  },
  linkText: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  scrollContainer: {
    paddingRight: 20,
    minWidth: '100%',
    width: 'auto',
  },
  fullWidth: {
    width: '100%',
    flexShrink: 1,
  },
  disclaimerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  smallButton: {
    width: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  smallButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  configBalanceBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0891B2',
  },
  configBalanceText: {
    color: '#0891B2',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BotScreen; 