import { StyleSheet, View, TouchableOpacity, ScrollView, Share, Clipboard, TextInput, Linking, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getFirestore, doc, setDoc, getDoc, addDoc } from 'firebase/firestore';
import { getCurrentUser } from '../../firebase.config';
import { Ionicons } from '@expo/vector-icons';

interface BotPurchase {
  botName: string;
  price: number;
  purchaseDate: Date;
  usedDiscount: boolean;
  discountAmount?: number;
  sharePercentage: number;
  status: 'pending' | 'paid' | 'withdrawn';
}

interface ReferredUser {
  id: string;
  name: string;
  signupDate: Date;
  purchases: BotPurchase[];
  totalEarned: number;
  pendingPayout: number;
  mpesaNumber?: string;
  mpesaName?: string;
}

interface WithdrawalRequest {
  id?: string;
  partnerId: string;
  amount: number;
  mpesaNumber: string;
  mpesaName: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected';
  relatedTransactions: string[];
  totalEarnings: number;
  pendingPayout: number;
}

const DEFAULT_P2P_DEPOSIT = "https://p2p.deriv.com/advertiser/426826?advert_id=3182910&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk";
const DEFAULT_P2P_WITHDRAW = "https://p2p.deriv.com/advertiser/426826?advert_id=3202284&t=_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk";
const DERIV_AFFILIATE = "_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk";

function PartnerProgramScreen() {
  const [users, setUsers] = useState<ReferredUser[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralLink, setReferralLink] = useState<string>('');
  const [showCopiedMessage, setShowCopiedMessage] = useState<'code' | 'link' | null>(null);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [pendingEarnings, setPendingEarnings] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [mpesaNumber, setMpesaNumber] = useState<string>('');
  const [mpesaName, setMpesaName] = useState<string>('');
  const [isSavingMpesa, setIsSavingMpesa] = useState<boolean>(false);
  const [p2pDepositLink, setP2pDepositLink] = useState('');
  const [p2pWithdrawLink, setP2pWithdrawLink] = useState('');
  const [paDepositLink, setPaDepositLink] = useState('');
  const [paWithdrawLink, setPaWithdrawLink] = useState('');
  const [isEditingP2P, setIsEditingP2P] = useState(false);
  const [isEditingPA, setIsEditingPA] = useState(false);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([]);
  const [isEditingMpesa, setIsEditingMpesa] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(true);
  const [neverShowPopup, setNeverShowPopup] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    // Set referral code (using user's uid)
    setReferralCode(currentUser.uid);
    setReferralLink(`https://dfirst.page.link/invite?code=${currentUser.uid}`);

    const db = getFirestore();
    const usersRef = collection(db, 'users');
    const referralsQuery = query(
      usersRef,
      where('referredBy', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(referralsQuery, (snapshot) => {
      const referredUsers: ReferredUser[] = [];
      snapshot.forEach((doc) => {
        const userData = doc.data();
        referredUsers.push({
          id: doc.id,
          name: userData.displayName || 'Anonymous User',
          signupDate: userData.createdAt?.toDate() || new Date(),
          purchases: userData.purchases || [],
          totalEarned: userData.totalEarned || 0,
          pendingPayout: userData.pendingPayout || 0
        });
      });
      setUsers(referredUsers.sort((a, b) => b.signupDate.getTime() - a.signupDate.getTime()));
    });

    // Load P2P and Payment Agent links
    const loadLinks = async () => {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setP2pDepositLink(data.p2pDepositLink || '');
        setP2pWithdrawLink(data.p2pWithdrawLink || '');
        setPaDepositLink(data.paDepositLink || '');
        setPaWithdrawLink(data.paWithdrawLink || '');
      }
    };

    loadLinks();

    // Load M-Pesa settings
    const loadMpesaSettings = async () => {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setMpesaNumber(data.mpesaNumber || '');
        setMpesaName(data.mpesaName || '');
      }
    };

    loadMpesaSettings();

    if (neverShowPopup) {
      setShowInfoPopup(false);
    }

    return () => unsubscribe();
  }, [neverShowPopup]);

  const handleCopyCode = async () => {
    await Clipboard.setString(referralCode);
    setShowCopiedMessage('code');
    setTimeout(() => setShowCopiedMessage(null), 2000);
  };

  const handleCopyLink = async () => {
    await Clipboard.setString(referralLink);
    setShowCopiedMessage('link');
    setTimeout(() => setShowCopiedMessage(null), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🚀 Check out this new Deriv-powered trading platform!\n\nFeatures:\n✨ Free AI-powered trading bots\n💳 Instant P2P & Payment Agent deposits and withdrawals\n📊 Advanced trading tools\n👥 Active trading community\n🤝 Partner program\n\nAll powered by Deriv's secure infrastructure.\n\nGet started here: ${referralLink}`,
        title: 'DFirst Trading Platform'
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const calculatePayout = (purchase: BotPurchase) => {
    const baseShare = purchase.price * 0.5; // 50% share
    if (purchase.usedDiscount && purchase.discountAmount) {
      return baseShare - (purchase.discountAmount * 0.5); // Deduct 50% of discount from share
    }
    return baseShare;
  };

  const toggleUserExpansion = (userId: string) => {
    setExpandedUser(expandedUser === userId ? null : userId);
  };

  const validateP2PLink = (link: string) => {
    if (!link) return true; // Empty link is valid (will use default)
    return link.startsWith('https://p2p.deriv.com/');
  };

  const validatePALink = (link: string) => {
    if (!link) return true; // Empty link is valid (will use default)
    return link.includes('deriv.com/') && link.includes('payment_agent');
  };

  const addAffiliateToLink = (link: string) => {
    if (!link) return link;
    const url = new URL(link);
    url.searchParams.set('t', DERIV_AFFILIATE);
    return url.toString();
  };

  const handleSaveP2PLinks = async () => {
    if (!validateP2PLink(p2pDepositLink) || !validateP2PLink(p2pWithdrawLink)) {
      Alert.alert('Invalid Link', 'Please enter valid Deriv P2P links only');
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
      const db = getFirestore();
      await setDoc(doc(db, 'users', currentUser.uid), {
        p2pDepositLink: p2pDepositLink ? addAffiliateToLink(p2pDepositLink) : '',
        p2pWithdrawLink: p2pWithdrawLink ? addAffiliateToLink(p2pWithdrawLink) : '',
      }, { merge: true });

      setIsEditingP2P(false);
    } catch (error) {
      console.error('Error saving P2P links:', error);
      Alert.alert('Error', 'Failed to save P2P links');
    }
  };

  const handleSavePALinks = async () => {
    if (!validatePALink(paDepositLink) || !validatePALink(paWithdrawLink)) {
      Alert.alert('Invalid Link', 'Please enter valid Deriv Payment Agent links only');
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
      const db = getFirestore();
      await setDoc(doc(db, 'users', currentUser.uid), {
        paDepositLink: paDepositLink ? addAffiliateToLink(paDepositLink) : '',
        paWithdrawLink: paWithdrawLink ? addAffiliateToLink(paWithdrawLink) : '',
      }, { merge: true });

      setIsEditingPA(false);
    } catch (error) {
      console.error('Error saving Payment Agent links:', error);
      Alert.alert('Error', 'Failed to save Payment Agent links');
    }
  };

  const handleOpenDerivP2P = () => {
    Linking.openURL('https://p2p.deriv.com/?t=' + DERIV_AFFILIATE);
  };

  const handleWithdraw = async () => {
    if (!mpesaNumber || !mpesaName) {
      Alert.alert('Error', 'Please set your M-Pesa details first');
      return;
    }

    if (isSubmittingWithdrawal) return;

    try {
      setIsSubmittingWithdrawal(true);
      const user = getCurrentUser();
      if (!user) return;

      const db = getFirestore();
      
      // Get all related transactions
      const relatedTransactions: string[] = [];
      users.forEach(referredUser => {
        referredUser.purchases.forEach(purchase => {
          if (purchase.status === 'pending') {
            relatedTransactions.push(purchase.botName + '_' + referredUser.id);
          }
        });
      });

      const withdrawalRequest: WithdrawalRequest = {
        partnerId: user.uid,
        amount: pendingEarnings,
        mpesaNumber,
        mpesaName,
        timestamp: new Date(),
        status: 'pending',
        relatedTransactions,
        totalEarnings: totalEarnings,
        pendingPayout: pendingEarnings
      };

      await addDoc(collection(db, 'withdrawalRequests'), withdrawalRequest);

      Alert.alert(
        'Success',
        'Your withdrawal request has been submitted and is pending approval'
      );
    } catch (error) {
      console.error('Withdrawal request error:', error);
      Alert.alert(
        'Error',
        'Failed to submit withdrawal request. Please try again.'
      );
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const handleSaveMpesaSettings = async () => {
    if (isSavingMpesa) return;
    
    // Validate M-Pesa number format (0700000000)
    const mpesaRegex = /^0[17][0-9]{8}$/;
    if (!mpesaRegex.test(mpesaNumber)) {
      Alert.alert('Invalid Number', 'Please enter a valid M-Pesa number (e.g., 0700000000)');
      return;
    }

    // Limit M-Pesa name to three words
    const nameWords = mpesaName.trim().split(' ');
    if (nameWords.length > 3) {
      Alert.alert('Invalid Name', 'M-Pesa name should not exceed three words');
      return;
    }

    if (!mpesaName.trim()) {
      Alert.alert('Invalid Name', 'Please enter the M-Pesa account name');
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
      setIsSavingMpesa(true);
      const db = getFirestore();
      await setDoc(doc(db, 'users', currentUser.uid), {
        mpesaNumber,
        mpesaName: mpesaName.trim()
      }, { merge: true });

      Alert.alert('Success', 'M-Pesa details saved successfully');
    } catch (error) {
      console.error('Error saving M-Pesa settings:', error);
      Alert.alert('Error', 'Failed to save M-Pesa details');
    } finally {
      setIsSavingMpesa(false);
    }
  };

  const handleClosePopup = () => {
    setShowInfoPopup(false);
  };

  const handleNeverShowPopup = () => {
    setNeverShowPopup(true);
    setShowInfoPopup(false);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <TouchableOpacity style={styles.infoButton} onPress={() => setShowInfoPopup(true)}>
          <ThemedText style={styles.infoButtonText}>How It Works</ThemedText>
        </TouchableOpacity>

        <Modal
          visible={showInfoPopup}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.popupContainer}>
            <View style={styles.popupContent}>
              <View style={styles.popupHeader}>
                <ThemedText style={styles.popupTitle}>Welcome to the Partner Program!</ThemedText>
                <TouchableOpacity style={styles.modernCloseButton} onPress={handleClosePopup}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.popupText}>
                🌟 Earn money when your community members pay for the bot.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                💸 Maximum daily withdrawal is KES 500,000/= (M-Pesa limit).
              </ThemedText>
              <ThemedText style={styles.popupText}>
                ⏱️ Request any time, payment made within 2 hours.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                ✅ Ensure your withdrawal details are correct.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                🤖 Encourage your community to pay for bots to automate trading.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                👥 Create groups to develop trading strategies together.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                📈 Avoid greed, embrace growth and risk management.
              </ThemedText>
              <ThemedText style={styles.popupText}>
                🤝 Share your links to boost your income.
              </ThemedText>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity 
                  style={styles.checkbox} 
                  onPress={() => setNeverShowPopup(!neverShowPopup)}
                >
                  {neverShowPopup && <Ionicons name="checkmark" size={16} color="#10B981" />}
                </TouchableOpacity>
                <ThemedText style={styles.checkboxText}>Don't show this message again</ThemedText>
              </View>
              <TouchableOpacity style={styles.modernCloseButtonLarge} onPress={handleClosePopup}>
                <ThemedText style={styles.modernCloseButtonText}>Got it</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.header}>
          <ThemedText style={styles.title}>Partner Program</ThemedText>
          <ThemedText style={styles.subtitle}>
            Join our partner community and unlock 24/7 passive income opportunities. Earn and withdraw anytime while helping others succeed.
          </ThemedText>
        </View>

        <View style={styles.earningsSection}>
          <View style={styles.earningsCard}>
            <View style={styles.earningsSummary}>
              <View style={styles.earningsItem}>
                <ThemedText style={styles.earningsLabel}>Total Earnings</ThemedText>
                <ThemedText style={styles.earningsValue}>KES {totalEarnings.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsItem}>
                <ThemedText style={styles.earningsLabel}>Available to Withdraw</ThemedText>
                <ThemedText style={[styles.earningsValue, styles.pendingValue]}>
                  KES {pendingEarnings.toFixed(2)}
                </ThemedText>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.withdrawButton,
                (!mpesaNumber || !mpesaName || isSubmittingWithdrawal || pendingEarnings === 0) && styles.buttonDisabled
              ]}
              onPress={handleWithdraw}
              disabled={!mpesaNumber || !mpesaName || isSubmittingWithdrawal || pendingEarnings === 0}
            >
              <ThemedText style={styles.withdrawButtonText}>
                {isSubmittingWithdrawal ? 'Submitting...' : 'Withdraw Earnings'}
              </ThemedText>
            </TouchableOpacity>

            <View style={styles.mpesaSettingsContainer}>
              <View style={styles.mpesaHeader}>
                <ThemedText style={styles.mpesaLabel}>Withdrawal Details</ThemedText>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditingMpesa(true)}
                >
                  <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.mpesaInstruction}>Please save your M-Pesa details to request withdrawals.</ThemedText>
              {isEditingMpesa ? (
                <View style={styles.mpesaInputColumn}>
                  <TextInput
                    style={styles.fullWidthMpesaInput}
                    placeholder="M-Pesa Name"
                    value={mpesaName}
                    onChangeText={setMpesaName}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={styles.fullWidthMpesaInput}
                    placeholder="M-Pesa Number (0700000000)"
                    value={mpesaNumber}
                    onChangeText={setMpesaNumber}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                  <TouchableOpacity
                    style={[styles.fullWidthMpesaButton, isSavingMpesa && styles.buttonDisabled]}
                    onPress={handleSaveMpesaSettings}
                    disabled={isSavingMpesa}
                  >
                    <ThemedText style={styles.fullWidthMpesaButtonText}>
                      {isSavingMpesa ? 'Saving...' : 'Save M-Pesa Details'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.mpesaDisplayColumn}>
                  <ThemedText style={styles.mpesaDisplayText}>Name: {mpesaName}</ThemedText>
                  <ThemedText style={styles.mpesaDisplayText}>Number: {mpesaNumber}</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.referralSection}>
          <View style={styles.referralCard}>
            <View style={styles.referralHeader}>
              <ThemedText style={styles.referralTitle}>Partner Link</ThemedText>
              <TouchableOpacity 
                style={styles.shareButton}
                onPress={handleShare}
              >
                <ThemedText style={styles.shareButtonText}>Share ↗️</ThemedText>
              </TouchableOpacity>
            </View>
            
            <View style={styles.referralDetails}>
              <TouchableOpacity 
                style={styles.codeButton} 
                onPress={handleCopyCode}
              >
                <View style={styles.codeWrapper}>
                  <ThemedText style={styles.codeLabel}>Code:</ThemedText>
                  <ThemedText style={styles.codeText}>
                    {referralCode.substring(0, 8)}...
                  </ThemedText>
                </View>
                {showCopiedMessage === 'code' && (
                  <ThemedText style={styles.copiedText}>Copied!</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.p2pSection}>
          <View style={styles.p2pCard}>
            <View style={styles.p2pHeader}>
              <ThemedText style={styles.p2pTitle}>P2P Links (Optional)</ThemedText>
              <TouchableOpacity 
                style={styles.p2pButton}
                onPress={() => isEditingP2P ? handleSaveP2PLinks() : setIsEditingP2P(true)}
              >
                <ThemedText style={styles.p2pButtonText}>
                  {isEditingP2P ? 'Save' : 'Edit'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {isEditingP2P ? (
              <View style={styles.p2pInputs}>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>P2P Deposit Link</ThemedText>
                  <TextInput
                    style={styles.p2pInput}
                    value={p2pDepositLink}
                    onChangeText={setP2pDepositLink}
                    placeholder="https://p2p.deriv.com/..."
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>P2P Withdraw Link</ThemedText>
                  <TextInput
                    style={styles.p2pInput}
                    value={p2pWithdrawLink}
                    onChangeText={setP2pWithdrawLink}
                    placeholder="https://p2p.deriv.com/..."
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity 
                  onPress={handleOpenDerivP2P}
                >
                  <ThemedText style={styles.getLinksText}>
                    Get your P2P links from Deriv ↗️
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.p2pStatus}>
                <ThemedText style={styles.p2pStatusText}>
                  {p2pDepositLink || p2pWithdrawLink ? 
                    'Your P2P links are set up' : 
                    'Set up your P2P links to earn from deposits & withdrawals'}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.p2pSection}>
          <View style={styles.p2pCard}>
            <View style={styles.p2pHeader}>
              <ThemedText style={styles.p2pTitle}>Payment Agent Links (Optional)</ThemedText>
              <TouchableOpacity 
                style={styles.p2pButton}
                onPress={() => isEditingPA ? handleSavePALinks() : setIsEditingPA(true)}
              >
                <ThemedText style={styles.p2pButtonText}>
                  {isEditingPA ? 'Save' : 'Edit'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {isEditingPA ? (
              <View style={styles.p2pInputs}>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Payment Agent Deposit Link</ThemedText>
                  <TextInput
                    style={styles.p2pInput}
                    value={paDepositLink}
                    onChangeText={setPaDepositLink}
                    placeholder="https://deriv.com/payment_agent/..."
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Payment Agent Withdraw Link</ThemedText>
                  <TextInput
                    style={styles.p2pInput}
                    value={paWithdrawLink}
                    onChangeText={setPaWithdrawLink}
                    placeholder="https://deriv.com/payment_agent/..."
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity 
                  onPress={() => Linking.openURL('https://track.deriv.com/_30qaRjl291dMjdsyM5hasGNd7ZgqdRLk/1/')}
                >
                  <ThemedText style={styles.getLinksText}>
                    Get your Payment Agent links from Deriv ↗️
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.p2pStatus}>
                <ThemedText style={styles.p2pStatusText}>
                  {paDepositLink || paWithdrawLink ? 
                    'Your Payment Agent links are set up' : 
                    'Set up your Payment Agent links to earn from deposits & withdrawals'}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.usersSection}>
          <View style={styles.usersSummary}>
            <ThemedText style={styles.usersTitle}>Your Community</ThemedText>
            <View style={styles.userCount}>
              <ThemedText style={styles.userCountNumber}>{users.length}</ThemedText>
              <ThemedText style={styles.userCountLabel}>Total Users</ThemedText>
            </View>
          </View>

          <View style={styles.usersList}>
            {users.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <TouchableOpacity 
                  style={styles.userHeader}
                  onPress={() => toggleUserExpansion(user.id)}
                >
                  <View style={styles.userInfo}>
                    <ThemedText style={styles.userName}>{user.name}</ThemedText>
                    <View style={styles.userStats}>
                      <ThemedText style={styles.userDate}>
                        Joined {user.signupDate.toLocaleDateString()}
                      </ThemedText>
                      {user.purchases.length > 0 ? (
                        <View style={styles.userBadges}>
                          {user.purchases.filter(p => p.status !== 'withdrawn').map((purchase, idx) => (
                            <View key={idx} style={styles.botBadge}>
                              <ThemedText style={styles.botBadgeText}>
                                {purchase.botName.split(' ')[0]} • {purchase.sharePercentage}%
                              </ThemedText>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.noPurchaseBadge}>
                          <ThemedText style={styles.noPurchaseText}>No Purchases</ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                  <ThemedText style={styles.expandIcon}>
                    {expandedUser === user.id ? '▼' : '▶'}
                  </ThemedText>
                </TouchableOpacity>

                {expandedUser === user.id && (
                  <View style={styles.purchasesList}>
                    {user.purchases.length > 0 ? (
                      user.purchases.map((purchase, index) => (
                        <View key={index} style={styles.purchaseItem}>
                          <View style={styles.purchaseHeader}>
                            <View style={styles.purchaseInfo}>
                              <ThemedText style={styles.botName}>{purchase.botName}</ThemedText>
                              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(purchase.status) }]}>
                                <ThemedText style={styles.statusText}>
                                  {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                                </ThemedText>
                              </View>
                            </View>
                            <ThemedText style={styles.purchaseDate}>
                              {purchase.purchaseDate.toLocaleDateString()}
                            </ThemedText>
                          </View>
                          
                          <View style={styles.purchaseDetails}>
                            <View style={styles.priceRow}>
                              <ThemedText style={styles.priceLabel}>Price</ThemedText>
                              <ThemedText style={styles.priceValue}>
                                KES {purchase.price.toFixed(2)}
                              </ThemedText>
                            </View>
                            
                            {purchase.usedDiscount && (
                              <View style={styles.discountRow}>
                                <ThemedText style={styles.discountLabel}>Discount Used</ThemedText>
                                <ThemedText style={styles.discountValue}>
                                  -KES {purchase.discountAmount?.toFixed(2) || '0.00'}
                                </ThemedText>
                              </View>
                            )}
                            
                            <View style={styles.payoutRow}>
                              <ThemedText style={styles.payoutLabel}>Your Share ({purchase.sharePercentage}%)</ThemedText>
                              <ThemedText style={[
                                styles.payoutValue,
                                { color: getStatusColor(purchase.status) }
                              ]}>
                                KES {calculatePayout(purchase).toFixed(2)}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      ))
                    ) : (
                      <View style={styles.emptyPurchases}>
                        <ThemedText style={styles.emptyPurchasesText}>
                          No purchases yet
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}

            {users.length === 0 && (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>
                  No referred users yet. Share your link to start earning!
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return '#F59E0B';
    case 'paid': return '#10B981';
    case 'withdrawn': return '#6B7280';
    default: return '#6B7280';
  }
};

const getBotColor = (botName: string) => {
  // Simple hash function to generate consistent colors
  const hash = botName.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
  const colors = [
    '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  return colors[hash % colors.length];
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    paddingTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  usersSection: {
    paddingHorizontal: 20,
  },
  usersSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  usersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  userCount: {
    alignItems: 'center',
  },
  userCountNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  userCountLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  usersList: {
    gap: 12,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  userInfo: {
    flex: 1,
  },
  userStats: {
    marginTop: 4,
  },
  userBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  userDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },
  purchasesList: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 16,
    gap: 16,
  },
  purchaseItem: {
    gap: 8,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  purchaseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  botName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  purchaseDate: {
    fontSize: 12,
    color: '#64748B',
  },
  purchaseDetails: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  priceValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  discountLabel: {
    fontSize: 12,
    color: '#EF4444',
  },
  discountValue: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginTop: 4,
  },
  payoutLabel: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  payoutValue: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  referralSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  referralCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  referralTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  shareButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareButtonText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  referralDetails: {
    gap: 12,
  },
  codeButton: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  codeText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  copiedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  p2pSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  p2pCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  p2pHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  p2pTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  p2pButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  p2pButtonText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  p2pInputs: {
    gap: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  p2pInput: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
    color: '#1E293B',
  },
  getLinksText: {
    fontSize: 13,
    color: '#4F46E5',
    textAlign: 'center',
  },
  p2pStatus: {
    padding: 8,
  },
  p2pStatusText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  earningsSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  earningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  earningsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  earningsItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningsDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  pendingValue: {
    color: '#10B981',
  },
  withdrawButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  withdrawButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userStats: {
    marginTop: 4,
  },
  noPurchaseBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  noPurchaseText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
  },
  emptyPurchases: {
    padding: 12,
    alignItems: 'center',
  },
  emptyPurchasesText: {
    fontSize: 12,
    color: '#64748B',
  },
  mpesaSettingsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  mpesaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mpesaLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  mpesaInstruction: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  mpesaInputColumn: {
    gap: 8,
  },
  fullWidthMpesaInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
  },
  fullWidthMpesaButton: {
    height: 36,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidthMpesaButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mpesaDisplayColumn: {
    flexDirection: 'column',
    gap: 4,
    marginBottom: 8,
  },
  mpesaDisplayText: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#EEF2FF',
    padding: 6,
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '500',
  },
  infoButton: {
    backgroundColor: '#4F46E5',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  popupContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  popupContent: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    flexDirection: 'column',
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1E293B',
  },
  popupText: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
    color: '#333333',
  },
  modernCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  modernCloseButtonLarge: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  modernCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxText: {
    fontSize: 14,
    color: '#64748B',
  },
  botBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  botBadgeText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '500',
  },
});

export default PartnerProgramScreen; 