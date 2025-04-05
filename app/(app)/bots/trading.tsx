import { StyleSheet, View, ScrollView, TouchableOpacity, Modal, Linking, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { getCurrentUser } from '../../firebase.config';
import { 
  initializePayment, 
  checkSubscriptionStatus, 
  getBotTier, 
  isBotFree, 
  handlePaymentCallback,
  Subscription,
  getSubscriptionTimeRemaining,
  initializeMPesaPayment
} from './bots_payments/bots_subscriptions';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BotCard {
  name: string;
  description: string;
  symbol: string;
  features: string[];
  file: string;
  color: string;
  rating: number;
  locked: boolean;
}

const bots: BotCard[] = [
  {
    name: 'Metro Differ Bot',
    description: 'Smart digit differ trading with random and pattern-based strategies',
    symbol: 'R_25',
    features: ['Random Strategy', 'Pattern Analysis', 'Smart Recovery'],
    file: 'metrodiffer',
    color: '#9C27B0',
    rating: 4.6,
    locked: false
  },
  {
    name: 'Safe Over Bot',
    description: 'Low-risk trading on digits over 0 with consecutive pattern analysis',
    symbol: 'R_10',
    features: ['Low Risk', 'Zero Pattern Analysis', 'Conservative Trading'],
    file: 'safeoverbot',
    color: '#4CAF50',
    rating: 4.7,
    locked: false
  },
  {
    name: 'Safe Under Bot',
    description: 'Low-risk trading on digits under 9 with consecutive pattern analysis',
    symbol: 'R_10',
    features: ['Low Risk', 'Nine Pattern Analysis', 'Conservative Trading'],
    file: 'safeunderbot',
    color: '#2196F3',
    rating: 4.7,
    locked: false
  },
  {
    name: 'Russian Odds Bot',
    description: 'Fast-paced even/odd trading with 5-tick pattern analysis and relaxed recovery',
    symbol: 'R_50',
    features: ['5-Tick Analysis', 'Quick Recovery', 'Pattern Trading'],
    file: 'russianodds',
    color: '#FF4081',
    rating: 4.6,
    locked: false
  },
  {
    name: 'Smart Volatility Bot',
    description: 'Advanced volatility trading with dynamic timeframes and smart risk adjustment',
    symbol: 'R_75',
    features: ['Volatility Measurement', 'Dynamic Timeframes', 'Smart Risk Adjustment'],
    file: 'smartvolatility',
    color: '#E91E63',
    rating: 4.7,
    locked: false
  },
  {
    name: 'Smart Even Bot',
    description: 'Advanced even/odd trading with smart pattern analysis and recovery',
    symbol: 'R_50',
    features: ['Pattern Analysis', 'Smart Recovery', 'Streak Detection'],
    file: 'smarteven',
    color: '#673AB7',
    rating: 4.8,
    locked: false
  },
  {
    name: 'Alien Rise Fall Bot',
    description: 'Advanced rise/fall trading with smart trend confirmation and recovery',
    symbol: 'R_10',
    features: ['Smart Recovery', 'Trend Analysis', 'Adaptive Trading'],
    file: 'alienrisefall',
    color: '#00BCD4',
    rating: 4.8,
    locked: false
  },
  {
    name: 'DIFFER Bot',
    description: 'Trades on digit difference patterns with advanced pattern recognition',
    symbol: 'R_25',
    features: ['Pattern Recognition', 'Martingale Strategy', 'Real-time Stats'],
    file: 'DIFFERbot',
    color: '#FF6B6B',
    rating: 4.5,
    locked: false
  },
  {
    name: 'No Touch Bot',
    description: 'Advanced technical analysis with volatility-based trading',
    symbol: 'R_100',
    features: ['Technical Analysis', 'Volatility Trading', 'Risk Management'],
    file: 'notouchbot',
    color: '#D4A5A5',
    rating: 4.6,
    locked: false
  },
  {
    name: 'Rise Fall Bot',
    description: 'Comprehensive technical analysis with multiple indicators',
    symbol: 'R_10',
    features: ['Multiple Indicators', 'Volume Analysis', 'Risk Management'],
    file: 'risefallbot',
    color: '#2A363B',
    rating: 4.9,
    locked: false
  },
  {
    name: 'High Risk Over Bot',
    description: 'High-risk trading on digits over 4-5 with higher payouts',
    symbol: 'R_10',
    features: ['High Risk', 'High Payout', 'Dynamic Barriers'],
    file: 'overbot',
    color: '#FFA726',
    rating: 4.4,
    locked: false
  },
  {
    name: 'High Risk Under Bot',
    description: 'High-risk trading on digits under 5-6 with higher payouts',
    symbol: 'R_100',
    features: ['High Risk', 'High Payout', 'Dynamic Barriers'],
    file: 'underbot',
    color: '#99B898',
    rating: 4.3,
    locked: false
  }
];

const MPESA_NUMBER_KEY = '@mpesa_number';

function BotCard({ bot }: { bot: BotCard }) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'weekly' | 'monthly'>('weekly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    checkBotAccess();
  }, [bot.name]);

  useEffect(() => {
    const loadMpesaNumber = async () => {
      try {
        const savedNumber = await AsyncStorage.getItem(MPESA_NUMBER_KEY);
        if (savedNumber) {
          setPhoneNumber(savedNumber);
        }
      } catch (error) {
        console.error('Error loading M-Pesa number:', error);
      }
    };
    loadMpesaNumber();
  }, []);

  const checkBotAccess = async () => {
    try {
      setIsCheckingAccess(true);
      const user = getCurrentUser();
      if (!user) return;

      const botSubscription = await checkSubscriptionStatus(user.uid, bot.name);
      setSubscription(botSubscription);
    } catch (error) {
      console.error('[Trading] Failed to check bot access:', error);
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const handleBotAccess = async () => {
    try {
      setIsModalLoading(true);
      console.log('[Trading] Checking bot access for:', bot.name);
      
      const user = getCurrentUser();
      if (!user) {
        console.log('[Trading] No user found, redirecting to auth');
        Alert.alert('Login Required', 'Please login to access this bot');
        router.push('/');
        return;
      }

      setShowPaymentModal(true);
    } catch (error) {
      console.error('[Trading] Access check failed:', error);
      Alert.alert('Error', 'Failed to check bot access. Please try again.');
    } finally {
      setIsModalLoading(false);
    }
  };

  const handlePayment = async () => {
    if (isProcessing) return;

    try {
      console.log('[Trading] Initializing payment process');
      setIsProcessing(true);
      const user = getCurrentUser();
      console.log('[Trading] User details:', { uid: user?.uid, email: user?.email });
      
      if (!user || !user.email) {
        console.log('[Trading] No user or email found');
        Alert.alert('Error', 'Please log in to continue');
        return;
      }

      const botTier = getBotTier(bot.name);
      console.log('[Trading] Bot tier details:', botTier);
      if (!botTier) {
        console.log('[Trading] Invalid bot tier for:', bot.name);
        Alert.alert('Error', 'Invalid bot tier');
        return;
      }

      const amount = selectedDuration === 'weekly' ? botTier.weeklyPrice : botTier.monthlyPrice;
      console.log('[Trading] Payment details:', {
        amount,
        duration: selectedDuration,
        tier: botTier.name
      });

      if (paymentMethod === 'mpesa') {
        // Format and validate phone number
        let formattedPhone = phoneNumber;
        if (phoneNumber.length === 9) {
          formattedPhone = '0' + phoneNumber;
        }
        if (!formattedPhone.startsWith('0')) {
          formattedPhone = '0' + formattedPhone;
        }
        
        // Save the M-Pesa number
        await AsyncStorage.setItem(MPESA_NUMBER_KEY, formattedPhone);
        
        // Convert to international format for M-Pesa
        formattedPhone = '254' + formattedPhone.substring(1);
        
        console.log('[Trading] Processing M-Pesa payment:', {
          originalNumber: phoneNumber,
          formattedNumber: formattedPhone,
          amount,
          metadata: {
            botName: bot.name,
            userId: user.uid,
            tier: botTier.name,
            subscriptionType: selectedDuration
          }
        });

        if (formattedPhone.length !== 12) {
          Alert.alert('Error', 'Please enter a valid phone number (e.g., 0712345678)');
          return;
        }

        try {
          const session = await initializeMPesaPayment(
            formattedPhone,
            amount,
            { 
              botName: bot.name,
              userId: user.uid,
              tier: botTier.name,
              subscriptionType: selectedDuration
            }
          );

          console.log('[Trading] M-Pesa session response:', session);
          if (!session || !session.checkoutRequestID) {
            console.error('[Trading] Invalid M-Pesa session:', {
              session,
              error: 'Missing checkoutRequestID'
            });
            Alert.alert('Error', 'Failed to initialize M-Pesa payment. Please try again.');
            return;
          }

          Alert.alert(
            'STK Push Sent',
            'Please check your phone for the M-Pesa payment prompt and enter your PIN to complete the payment.',
            [{ text: 'OK' }]
          );
          setShowPaymentModal(false);
        } catch (error) {
          console.error('[Trading] M-Pesa payment error:', {
            error,
            phoneNumber: formattedPhone,
            amount,
            metadata: {
              botName: bot.name,
              userId: user.uid,
              tier: botTier.name
            }
          });
          Alert.alert('Error', 'Failed to process M-Pesa payment. Please try again.');
        }
      } else {
        const session = await initializePayment(
          amount,
          user.email,
          botTier.name,
          selectedDuration,
          { 
            botName: bot.name,
            userId: user.uid,
            returnUrl: 'https://dfirst-payments.onrender.com/payment/verify'
          }
        );

        console.log('[Trading] Card payment session created:', session);
        if (!session || !session.authorization_url) {
          console.error('[Trading] Invalid payment session:', session);
          Alert.alert('Error', 'Failed to initialize card payment. Please try again.');
          return;
        }

        await Linking.openURL(session.authorization_url);
        setShowPaymentModal(false);
      }
    } catch (error) {
      console.error('[Trading] Payment failed:', error);
      if (error instanceof Error) {
        console.error('[Trading] Payment error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
      Alert.alert(
        'Payment Error',
        'Failed to initialize payment. Please try again later.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: bot.color }]}>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.botName}>{bot.name}</ThemedText>
        <View style={styles.headerRight}>
          <View style={[styles.ratingTag, { backgroundColor: bot.color + '20' }]}>
            <ThemedText style={[styles.ratingText, { color: bot.color }]}>★ {bot.rating}</ThemedText>
          </View>
          <View style={[styles.symbolTag, { backgroundColor: bot.color }]}>
            <ThemedText style={styles.symbolText}>{bot.symbol}</ThemedText>
          </View>
        </View>
      </View>
      
      <ThemedText style={styles.description}>{bot.description}</ThemedText>
      
      <View style={styles.features}>
        {bot.features.map((feature, index) => (
          <View key={index} style={[styles.featureTag, { backgroundColor: `${bot.color}20` }]}>
            <ThemedText style={[styles.featureText, { color: bot.color }]}>{feature}</ThemedText>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.accessButton, { backgroundColor: bot.color }]}
        onPress={handleBotAccess}
        disabled={isModalLoading}
      >
        {isModalLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.accessButtonContent}>
            <ThemedText style={styles.buttonText}>
              {bot.locked ? 'Locked Bot 🔒' : 'Open Bot'}
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { backgroundColor: bot.color + '20' }]}>
              <ThemedText style={[styles.modalBotName, { color: bot.color }]}>{bot.name}</ThemedText>
              <ThemedText style={styles.modalRating}>★ {bot.rating}</ThemedText>
            </View>
            
            <ThemedText style={styles.modalHype}>
              {bot.features[0]} • {bot.features[1]} • {bot.features[2]}
            </ThemedText>

            <ThemedText style={styles.modalDescription}>
              {bot.locked ? 
                "Unfortunately, this bot is currently locked. Join our community to connect with like-minded traders and share trading ideas!" :
                <View>
                  <ThemedText style={styles.tipsText}>
                    {"💡 TRADING TIPS:\n• The most important aspect of Deriv trading is risk management\n• Trust in slow, steady growth - avoid rushing for quick profits\n• Focus on consistent small wins rather than risky big trades"}
                  </ThemedText>
                  <ThemedText style={styles.modalDescription}>
                    {"Before you start trading, join our community to connect with like-minded traders and share trading ideas!"}
                  </ThemedText>
                </View>
              }
            </ThemedText>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.joinButton, { backgroundColor: bot.color }]}
                onPress={() => {
                  setShowCommunityModal(true);
                  setShowPaymentModal(false);
                }}
              >
                <ThemedText style={styles.joinButtonText}>Join Group</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.maybeLaterButton}
                onPress={() => {
                  setShowPaymentModal(false);
                  if (!bot.locked) {
                    router.push(`/bots/${bot.file}`);
                  }
                }}
              >
                <ThemedText style={styles.maybeLaterText}>Maybe Later</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCommunityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCommunityModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { backgroundColor: bot.color + '20' }]}>
              <ThemedText style={[styles.modalBotName, { color: bot.color }]}>Join Community</ThemedText>
              <TouchableOpacity 
                onPress={() => setShowCommunityModal(false)}
                style={styles.modalClose}
              >
                <ThemedText style={styles.modalCloseText}>×</ThemedText>
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.modalDescription}>
              Choose your preferred platform to connect with our trading community:
            </ThemedText>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.communityButton, { backgroundColor: '#0088cc' }]}
                onPress={() => {
                  Linking.openURL('https://t.me/+YAJDx7uwVcRhMjRk');
                  setShowCommunityModal(false);
                }}
              >
                <ThemedText style={styles.communityButtonText}>Join Telegram</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.communityButton, { backgroundColor: '#25D366' }]}
                onPress={() => {
                  Linking.openURL('https://chat.whatsapp.com/E1kSuMhFxulJcZiwoQyoRU');
                  setShowCommunityModal(false);
                }}
              >
                <ThemedText style={styles.communityButtonText}>Join WhatsApp</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.maybeLaterButton}
                onPress={() => {
                  setShowCommunityModal(false);
                  if (!bot.locked) {
                    router.push(`/bots/${bot.file}`);
                  }
                }}
              >
                <ThemedText style={styles.maybeLaterText}>Maybe Later</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TradingScreen() {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', async (event) => {
      if (event.url.includes('dfirsttrader://payment/verify')) {
        console.log('[Trading] Payment callback received:', event.url);
        const result = await handlePaymentCallback(event.url);
        
        if (result.success) {
          Alert.alert('Success', 'Payment successful! You now have access to the bot.');
          // If we're not already on the trading screen, navigate there
          if (result.screen === 'trading') {
            router.push('/bots/trading');
          }
        } else {
          Alert.alert('Error', 'Payment verification failed. Please contact support if you were charged.');
          // Still navigate to trading screen on error to maintain UX
          if (result.screen === 'trading') {
            router.push('/bots/trading');
          }
        }
      }
    });

    // Check for initial URL (app opened via payment callback)
    Linking.getInitialURL().then(async (url) => {
      if (url && url.includes('dfirsttrader://payment/verify')) {
        console.log('[Trading] Initial payment callback:', url);
        const result = await handlePaymentCallback(url);
        
        if (result.success) {
          Alert.alert('Success', 'Payment successful! You now have access to the bot.');
          // If we're not already on the trading screen, navigate there
          if (result.screen === 'trading') {
            router.push('/bots/trading');
          }
        } else {
          Alert.alert('Error', 'Payment verification failed. Please contact support if you were charged.');
          // Still navigate to trading screen on error to maintain UX
          if (result.screen === 'trading') {
            router.push('/bots/trading');
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleComingSoonPress = () => {
    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Login Required', 'Please login to access this feature');
      router.push('/');
      return;
    }
    setShowComingSoonModal(true);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Trading Bots</ThemedText>
          <ThemedText style={styles.subtitle}>Choose a bot to start trading</ThemedText>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.addButton]} 
            onPress={handleComingSoonPress}
          >
            <ThemedText style={styles.addButtonText}>+ Add Bot</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.platformButton]} 
            onPress={handleComingSoonPress}
          >
            <ThemedText style={styles.platformButtonText}>DERIV BOTS</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.platformButton]} 
            onPress={handleComingSoonPress}
          >
            <ThemedText style={styles.platformButtonText}>MT4/MT5 BOTS</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Coming Soon Modal */}
        <Modal
          visible={showComingSoonModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowComingSoonModal(false)}
        >
          <View style={styles.comingSoonModalContainer}>
            <View style={styles.comingSoonModalContent}>
              <View style={styles.comingSoonModalHeader}>
                <ThemedText style={styles.comingSoonModalTitle}>Coming Soon! 🚀</ThemedText>
                <TouchableOpacity 
                  onPress={() => setShowComingSoonModal(false)}
                  style={styles.comingSoonModalClose}
                >
                  <ThemedText style={styles.comingSoonModalCloseText}>×</ThemedText>
                </TouchableOpacity>
              </View>
              
              <ThemedText style={styles.comingSoonModalText}>
                Advanced fully automated bots are on the way to help you succeed in your trading journey!
              </ThemedText>
              
              <ThemedText style={styles.comingSoonModalSubtext}>
                Meanwhile, join our community to interact with other traders and creative minds.
              </ThemedText>

              <View style={styles.comingSoonModalButtons}>
                <TouchableOpacity
                  style={[styles.communityButton, { backgroundColor: '#0088cc' }]}
                  onPress={() => {
                    Linking.openURL('https://t.me/+YAJDx7uwVcRhMjRk');
                    setShowComingSoonModal(false);
                  }}
                >
                  <ThemedText style={styles.communityButtonText}>Join Telegram</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.communityButton, { backgroundColor: '#25D366' }]}
                  onPress={() => {
                    Linking.openURL('https://chat.whatsapp.com/E1kSuMhFxulJcZiwoQyoRU');
                    setShowComingSoonModal(false);
                  }}
                >
                  <ThemedText style={styles.communityButtonText}>Join WhatsApp</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.laterButton}
                  onPress={() => setShowComingSoonModal(false)}
                >
                  <ThemedText style={styles.laterButtonText}>Maybe Later</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {bots.map((bot, index) => (
            <BotCard key={index} bot={bot} />
          ))}
        </ScrollView>
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
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    paddingTop: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  botName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  symbolTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  symbolText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 20,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  featureTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '500',
  },
  accessButton: {
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  accessButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '90%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBotName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalRating: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalHype: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  tipsText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
    textAlign: 'left',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalButtons: {
    width: '100%',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16
  },
  joinButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  maybeLaterButton: {
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  maybeLaterText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500'
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addButton: {
    backgroundColor: '#4a90e2',
    minWidth: 85,
  },
  platformButton: {
    backgroundColor: '#2d2d2d',
    minWidth: 90,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  platformButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  comingSoonModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
  },
  comingSoonModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '85%',
    maxWidth: 300,
    padding: 20,
    alignItems: 'center',
  },
  comingSoonModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  comingSoonModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  comingSoonModalClose: {
    padding: 4,
  },
  comingSoonModalCloseText: {
    fontSize: 24,
    color: '#64748B',
    fontWeight: '300',
  },
  comingSoonModalText: {
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  comingSoonModalSubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  comingSoonModalButtons: {
    width: '100%',
    gap: 12,
    marginTop: 20
  },
  communityButton: {
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  communityButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  laterButton: {
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  laterButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500'
  },
  modalClose: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 24,
    color: '#64748B',
    fontWeight: '300',
  },
});

export default TradingScreen; 