import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, getDoc, writeBatch } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

interface BotPurchase {
  botName: string;
  status: 'pending' | 'paid' | 'withdrawn';
}

interface BotTransaction {
  id: string;
  userId: string;
  botName: string;
  amount: number;
  duration: 'weekly' | 'monthly';
  paymentMethod: 'mpesa' | 'card';
  referredBy: string | null;
  timestamp: Timestamp;
  status: 'completed' | 'failed';
  paymentReference: string;
}

interface WithdrawalRequest {
  id: string;
  partnerId: string;
  amount: number;
  mpesaNumber: string;
  mpesaName: string;
  timestamp: Timestamp;
  status: 'pending' | 'approved' | 'rejected';
  relatedTransactions: string[];
  totalEarnings: number;
  pendingPayout: number;
}

function AdminScreen() {
  const [transactions, setTransactions] = useState<BotTransaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [selectedTab, setSelectedTab] = useState<'transactions' | 'withdrawals' | 'processed'>('transactions');
  const [financialSummary, setFinancialSummary] = useState({
    totalSales: 0,
    partnerPayouts: 0,
    netEarnings: 0
  });
  const [newTransactions, setNewTransactions] = useState(0);
  const [newWithdrawals, setNewWithdrawals] = useState(0);
  const [allTimeProcessed, setAllTimeProcessed] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState<{
    transactions: BotTransaction[];
    withdrawals: WithdrawalRequest[];
  }>({ transactions: [], withdrawals: [] });
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const db = getFirestore();
    
    // Listen to bot transactions
    const transactionsQuery = query(
      collection(db, 'botTransactions'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsData: BotTransaction[] = [];
      let totalAmount = 0;
      let partnerAmount = 0;
      let newTransactionsCount = 0;

      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      snapshot.forEach((doc) => {
        const transaction = { id: doc.id, ...doc.data() } as BotTransaction;
        transactionsData.push(transaction);
        
        if (transaction.status === 'completed') {
          totalAmount += transaction.amount;
          if (transaction.referredBy) {
            partnerAmount += transaction.amount * 0.5;
          }
          // Count transactions in last 24 hours
          if (transaction.timestamp.toDate() > twentyFourHoursAgo) {
            newTransactionsCount++;
          }
        }
      });

      setTransactions(transactionsData);
      setNewTransactions(newTransactionsCount);
      setFinancialSummary({
        totalSales: totalAmount,
        partnerPayouts: partnerAmount,
        netEarnings: totalAmount - partnerAmount
      });
    });

    // Listen to withdrawal requests
    const withdrawalsQuery = query(
      collection(db, 'withdrawalRequests'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
      const withdrawalData: WithdrawalRequest[] = [];
      let pendingCount = 0;
      let processedCount = 0;

      snapshot.forEach((doc) => {
        const withdrawal = { id: doc.id, ...doc.data() } as WithdrawalRequest;
        withdrawalData.push(withdrawal);
        if (withdrawal.status === 'pending') {
          pendingCount++;
        } else {
          processedCount++;
        }
      });

      setWithdrawalRequests(withdrawalData);
      setNewWithdrawals(pendingCount);
      setAllTimeProcessed(processedCount);
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeWithdrawals();
    };
  }, []);

  // Add search functionality
  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    
    if (!query) {
      setFilteredData({
        transactions: transactions,
        withdrawals: withdrawalRequests
      });
      return;
    }

    // Filter transactions
    const matchedTransactions = transactions.filter(transaction => {
      return (
        transaction.userId.toLowerCase().includes(query) ||
        transaction.botName.toLowerCase().includes(query) ||
        transaction.amount.toString().includes(query) ||
        transaction.duration.toLowerCase().includes(query) ||
        transaction.paymentMethod.toLowerCase().includes(query) ||
        (transaction.referredBy?.toLowerCase().includes(query) ?? false) ||
        transaction.timestamp.toDate().toLocaleString().toLowerCase().includes(query)
      );
    });

    // Filter withdrawals
    const matchedWithdrawals = withdrawalRequests.filter(request => {
      return (
        request.partnerId.toLowerCase().includes(query) ||
        request.mpesaNumber.includes(query) ||
        request.mpesaName.toLowerCase().includes(query) ||
        request.amount.toString().includes(query) ||
        request.status.toLowerCase().includes(query) ||
        request.timestamp.toDate().toLocaleString().toLowerCase().includes(query)
      );
    });

    setFilteredData({
      transactions: matchedTransactions,
      withdrawals: matchedWithdrawals
    });
  }, [searchQuery, transactions, withdrawalRequests]);

  const handleApproveWithdrawal = async (requestId: string) => {
    const db = getFirestore();
    const withdrawalRef = doc(db, 'withdrawalRequests', requestId);
    
    try {
      // Get the withdrawal request data
      const withdrawalDoc = await getDoc(withdrawalRef);
      if (!withdrawalDoc.exists()) return;
      
      const withdrawalData = withdrawalDoc.data() as WithdrawalRequest;
      
      // Start a batch operation
      const batch = writeBatch(db);
      
      // 1. Update withdrawal request status
      batch.update(withdrawalRef, {
        status: 'approved',
        processedAt: Timestamp.now()
      });
      
      // 2. Update user's pending payout and total earnings
      const userRef = doc(db, 'users', withdrawalData.partnerId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        batch.update(userRef, {
          pendingPayout: 0, // Reset pending payout
          totalEarned: userDoc.data().totalEarned || withdrawalData.totalEarnings // Ensure total earnings are preserved
        });
      }
      
      // 3. Update all related transactions to 'withdrawn' status
      for (const transactionId of withdrawalData.relatedTransactions) {
        const [botName, userId] = transactionId.split('_');
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const updatedPurchases = userData.purchases.map((purchase: BotPurchase) => {
            if (purchase.botName === botName && purchase.status === 'pending') {
              return { ...purchase, status: 'withdrawn' };
            }
            return purchase;
          });
          
          batch.update(userRef, { purchases: updatedPurchases });
        }
      }
      
      // Commit all changes
      await batch.commit();
      
      Alert.alert('Success', 'Withdrawal approved and records updated');
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      Alert.alert('Error', 'Failed to approve withdrawal. Please try again.');
    }
  };

  const handleRejectWithdrawal = async (requestId: string) => {
    const db = getFirestore();
    await updateDoc(doc(db, 'withdrawalRequests', requestId), {
      status: 'rejected',
      processedAt: Timestamp.now()
    });
  };

  const renderTransactionItem = (transaction: BotTransaction) => {
    // Calculate earnings (50% split)
    const totalEarnings = transaction.amount;
    const partnerShare = transaction.referredBy ? totalEarnings * 0.5 : 0;

    return (
      <View key={transaction.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.botName}>{transaction.botName}</ThemedText>
          <ThemedText style={styles.amount}>KES {transaction.amount}</ThemedText>
        </View>
        <View style={styles.cardDetails}>
          <ThemedText style={styles.detail}>User ID: {transaction.userId}</ThemedText>
          <ThemedText style={styles.detail}>Duration: {transaction.duration}</ThemedText>
          <ThemedText style={styles.detail}>Payment: {transaction.paymentMethod}</ThemedText>
          <View style={styles.earningsContainer}>
            <ThemedText style={styles.earningsLabel}>Total Earnings:</ThemedText>
            <ThemedText style={styles.earningsAmount}>KES {totalEarnings}</ThemedText>
          </View>
          <View style={styles.earningsContainer}>
            <ThemedText style={styles.earningsLabel}>Partner Share (50%):</ThemedText>
            <ThemedText style={styles.earningsAmount}>KES {partnerShare}</ThemedText>
          </View>
          <View style={styles.referralContainer}>
            {transaction.referredBy ? (
              <View style={styles.referralBadge}>
                <ThemedText style={styles.referralText}>
                  Partner: #{transaction.referredBy.substring(0, 6)}...
                </ThemedText>
              </View>
            ) : (
              <View style={[styles.referralBadge, styles.noReferralBadge]}>
                <ThemedText style={[styles.referralText, styles.noReferralText]}>
                  Not Referred
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.timestamp}>
            {transaction.timestamp.toDate().toLocaleString()}
          </ThemedText>
        </View>
      </View>
    );
  };

  const renderWithdrawalItem = (request: WithdrawalRequest) => (
    <View key={request.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.partnerInfo}>
          <ThemedText style={styles.partnerName}>{request.mpesaName}</ThemedText>
          <ThemedText style={styles.mpesaNumber}>{request.mpesaNumber}</ThemedText>
        </View>
        <ThemedText style={styles.amount}>KES {request.amount}</ThemedText>
      </View>
      <View style={styles.cardDetails}>
        <ThemedText style={styles.detail}>Total Earnings: KES {request.totalEarnings}</ThemedText>
        <ThemedText style={styles.detail}>Pending: KES {request.pendingPayout}</ThemedText>
        <ThemedText style={styles.timestamp}>
          {request.timestamp.toDate().toLocaleString()}
        </ThemedText>
      </View>
      {request.status === 'pending' && (
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleApproveWithdrawal(request.id)}
          >
            <ThemedText style={styles.buttonText}>Approve</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleRejectWithdrawal(request.id)}
          >
            <ThemedText style={styles.buttonText}>Reject</ThemedText>
          </TouchableOpacity>
        </View>
      )}
      {request.status !== 'pending' && (
        <View style={[styles.statusBadge, 
          request.status === 'approved' ? styles.approvedBadge : styles.rejectedBadge
        ]}>
          <ThemedText style={styles.statusText}>
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </ThemedText>
        </View>
      )}
    </View>
  );

  const getSelectedTabName = () => {
    switch (selectedTab) {
      case 'transactions': return 'Transactions';
      case 'withdrawals': return 'Pending Withdrawals';
      case 'processed': return 'Processed';
      default: return 'Transactions';
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <ThemedText style={styles.title}>Admin Panel</ThemedText>
          </View>
          <ThemedText style={styles.subtitle}>
            Manage users and monitor platform activity
          </ThemedText>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryLabel}>Total Sales</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: '#4a90e2' }]}>
              KES {financialSummary.totalSales.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryLabel}>Partner Payouts</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: '#dc2626' }]}>
              KES {financialSummary.partnerPayouts.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryLabel}>Net Earnings</ThemedText>
            <ThemedText style={[styles.summaryValue, { color: '#059669' }]}>
              KES {financialSummary.netEarnings.toLocaleString()}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.dropdownContainer, { marginTop: 220 }]}>
          <TouchableOpacity 
            style={styles.dropdownButton}
            onPress={() => setShowDropdown(!showDropdown)}
          >
            <View style={styles.dropdownHeader}>
              <ThemedText style={styles.dropdownSelectedText}>{getSelectedTabName()}</ThemedText>
              <Ionicons 
                name={showDropdown ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#64748B" 
              />
            </View>
          </TouchableOpacity>

          {showDropdown && (
            <View style={styles.dropdownMenu}>
              <TouchableOpacity 
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedTab('transactions');
                  setShowDropdown(false);
                }}
              >
                <View style={styles.dropdownItemContent}>
                  <View style={styles.dropdownCount}>
                    <ThemedText style={styles.dropdownCountText}>
                      {newTransactions > 0 ? `+${newTransactions}` : transactions.length}
                    </ThemedText>
                  </View>
                  <ThemedText style={[
                    styles.dropdownItemText,
                    selectedTab === 'transactions' && styles.dropdownItemTextSelected
                  ]}>
                    Transactions
                  </ThemedText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedTab('withdrawals');
                  setShowDropdown(false);
                }}
              >
                <View style={styles.dropdownItemContent}>
                  <View style={[styles.dropdownCount, newWithdrawals > 0 && styles.dropdownCountActive]}>
                    <ThemedText style={[
                      styles.dropdownCountText,
                      newWithdrawals > 0 && styles.dropdownCountTextActive
                    ]}>
                      {newWithdrawals}
                    </ThemedText>
                  </View>
                  <ThemedText style={[
                    styles.dropdownItemText,
                    selectedTab === 'withdrawals' && styles.dropdownItemTextSelected
                  ]}>
                    Pending Withdrawals
                  </ThemedText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedTab('processed');
                  setShowDropdown(false);
                }}
              >
                <View style={styles.dropdownItemContent}>
                  <View style={styles.dropdownCount}>
                    <ThemedText style={styles.dropdownCountText}>
                      {allTimeProcessed}
                    </ThemedText>
                  </View>
                  <ThemedText style={[
                    styles.dropdownItemText,
                    selectedTab === 'processed' && styles.dropdownItemTextSelected
                  ]}>
                    Processed
                  </ThemedText>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search any detail across all cards..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                style={styles.clearButton}
                onPress={() => setSearchQuery('')}
              >
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={[styles.content, { marginTop: 12 }]}>
          {selectedTab === 'transactions' && 
            filteredData.transactions.map(renderTransactionItem)}
          {selectedTab === 'withdrawals' && 
            filteredData.withdrawals
              .filter(req => req.status === 'pending')
              .map(renderWithdrawalItem)}
          {selectedTab === 'processed' && 
            filteredData.withdrawals
              .filter(req => req.status !== 'pending')
              .map(renderWithdrawalItem)}
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
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  tabs: {
    flexDirection: 'row',
    marginTop: 220,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  selectedTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    color: '#1a1a1a',
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  mpesaNumber: {
    fontSize: 14,
    color: '#64748b',
  },
  amount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#059669',
  },
  cardDetails: {
    gap: 4,
  },
  detail: {
    fontSize: 14,
    color: '#64748b',
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#059669',
  },
  rejectButton: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  approvedBadge: {
    backgroundColor: '#059669',
  },
  rejectedBadge: {
    backgroundColor: '#dc2626',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  earningsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    marginTop: 4,
  },
  earningsLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  earningsAmount: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  referralContainer: {
    marginTop: 8,
  },
  referralBadge: {
    backgroundColor: '#4a90e2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  noReferralBadge: {
    backgroundColor: '#94a3b8',
  },
  referralText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  noReferralText: {
    opacity: 0.9,
  },
  summaryCard: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 1,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabContent: {
    alignItems: 'center',
  },
  tallyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tallyNew: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  tallyPending: {
    marginTop: 2,
    color: '#059669',
  },
  tallyTotal: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  tallyProcessed: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  withdrawalsLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginLeft: 4,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    marginLeft: 8,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
  dropdownContainer: {
    paddingHorizontal: 20,
    zIndex: 2,
  },
  dropdownButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownCount: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
  },
  dropdownCountActive: {
    backgroundColor: '#10B981',
  },
  dropdownCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  dropdownCountTextActive: {
    color: '#FFFFFF',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#64748B',
  },
  dropdownItemTextSelected: {
    color: '#1E293B',
    fontWeight: '600',
  },
});

export default AdminScreen; 