import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, Timestamp, doc, getDoc, updateDoc as updateFirestoreDoc } from 'firebase/firestore';
import Constants from 'expo-constants';

interface BotTier {
  name: string;
  icon: string;
  weeklyPrice: number;
  monthlyPrice: number;
  bots: Array<{
    name: string;
    rating: number;
  }>;
}

export interface PaymentSession {
  reference?: string;
  access_code?: string;
  authorization_url?: string;
  checkoutRequestID?: string;
  merchantRequestID?: string;
  responseCode?: string;
  customerMessage?: string;
}

export interface Subscription {
  userId: string;
  tier: string;
  botName: string;
  startDate: Date | Timestamp;
  endDate: Date | Timestamp;
  subscriptionType: 'weekly' | 'monthly';
  status: 'active' | 'expired';
  paymentReference: string;
  autoRenew: boolean;
}

export interface MPesaPaymentSession {
  checkoutRequestID: string;
  merchantRequestID: string;
  responseCode: string;
  customerMessage: string;
}

export const BOT_TIERS: BotTier[] = [
  {
    name: "Free Tier",
    icon: "🆓",
    weeklyPrice: 0,
    monthlyPrice: 0,
    bots: [
      { name: "DIFFER Bot", rating: 4.5 },
      { name: "Metro Differ Bot", rating: 4.6 }
    ]
  },
  {
    name: "Bronze Tier",
    icon: "🥉",
    weeklyPrice: 500,
    monthlyPrice: 1600,
    bots: [
      { name: "Safe Over Bot", rating: 4.7 },
      { name: "Safe Under Bot", rating: 4.7 }
    ]
  },
  {
    name: "Silver Tier",
    icon: "🥈",
    weeklyPrice: 1000,
    monthlyPrice: 3200,
    bots: [
      { name: "Russian Odds Bot", rating: 4.6 },
      { name: "No Touch Bot", rating: 4.6 }
    ]
  },
  {
    name: "Gold Tier",
    icon: "🥇",
    weeklyPrice: 2000,
    monthlyPrice: 6400,
    bots: [
      { name: "Smart Even Bot", rating: 4.8 },
      { name: "Smart Volatility Bot", rating: 4.7 }
    ]
  },
  {
    name: "Diamond Tier",
    icon: "💎",
    weeklyPrice: 3500,
    monthlyPrice: 11200,
    bots: [
      { name: "High Risk Over Bot", rating: 4.4 },
      { name: "High Risk Under Bot", rating: 4.3 }
    ]
  },
  {
    name: "Royal Tier",
    icon: "👑",
    weeklyPrice: 5000,
    monthlyPrice: 16000,
    bots: [
      { name: "Alien Rise Fall Bot", rating: 4.8 },
      { name: "Rise Fall Bot", rating: 4.9 }
    ]
  }
];

// Constants for payment URLs
const PAYMENT_SERVER_URL = 'https://dfirst-payments.onrender.com';
const PAYMENT_VERIFY_URL = `dfirsttrader://payment/verify`;
const PAYMENT_WEBHOOK_URL = `${PAYMENT_SERVER_URL}/webhook`;
const PAYMENT_INITIALIZE_URL = `${PAYMENT_SERVER_URL}/payment/initialize`;

// Get environment variables
const getPaystackKeys = () => {
  const config = Constants.expoConfig?.extra;
  if (!config) {
    throw new Error('App configuration is missing');
  }

  const keys = {
    publicKey: config.PAYSTACK_PUBLIC_KEY,
    secretKey: config.PAYSTACK_SECRET_KEY,
    webhookSecret: config.PAYSTACK_WEBHOOK_SECRET
  };

  if (!keys.publicKey || !keys.secretKey) {
    throw new Error('Paystack configuration is missing');
  }

  return keys;
};

export const initializePayment = async (
  amount: number,
  email: string,
  tier: string,
  subscriptionType: 'weekly' | 'monthly',
  metadata: any = {}
): Promise<PaymentSession> => {
  console.log('[Subscriptions] Initializing payment:', {
    amount,
    email,
    tier,
    subscriptionType,
    metadata
  });

  try {
    const response = await fetch(PAYMENT_INITIALIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        callback_url: PAYMENT_VERIFY_URL,
        metadata: {
          tier,
          subscriptionType,
          userId: metadata.userId,
          botName: metadata.botName,
          returnUrl: PAYMENT_VERIFY_URL
        }
      }),
    });

    console.log('[Subscriptions] Payment server response status:', response.status);
    
    if (!response.ok) {
      let errorMessage = 'Payment initialization failed';
      try {
        const errorData = await response.json();
        console.error('[Subscriptions] Payment server error:', errorData);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        console.error('[Subscriptions] Error parsing error response:', e);
        const text = await response.text();
        console.error('[Subscriptions] Raw error response:', text);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Subscriptions] Payment server success response:', data);
    
    if (!data.status) {
      console.error('[Subscriptions] Invalid payment server response:', data);
      throw new Error(data.message || 'Invalid payment server response');
    }

    return {
      reference: data.data.reference,
      access_code: data.data.access_code,
      authorization_url: data.data.authorization_url,
    };
  } catch (error) {
    console.error('[Subscriptions] Payment initialization error:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    throw error;
  }
};

export const verifyPayment = async (reference: string): Promise<boolean> => {
  console.log('[Subscriptions] Verifying payment:', reference);

  try {
    const response = await fetch(`${PAYMENT_VERIFY_URL}/${reference}`);

    console.log('[Subscriptions] Verification response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Subscriptions] Verification error:', errorData);
      throw new Error(errorData.message || 'Payment verification failed');
    }

    const data = await response.json();
    console.log('[Subscriptions] Verification response:', data);
    if (!data.status || data.data.status !== 'success') {
      console.error('[Subscriptions] Invalid verification response:', data);
      throw new Error(data.message || 'Payment verification failed');
    }

    const metadata = data.data.metadata;
    console.log('[Subscriptions] Creating subscription with metadata:', metadata);
    await createSubscription(
      metadata.userId,
      metadata.tier,
      metadata.subscriptionType,
      metadata.paymentReference,
      metadata.botName
    );

    return true;
  } catch (error) {
    console.error('[Subscriptions] Payment verification error:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return false;
  }
};

// Firebase subscription management
export const createSubscription = async (
  userId: string,
  tier: string,
  subscriptionType: 'weekly' | 'monthly',
  paymentReference: string,
  botName: string
): Promise<void> => {
  console.log('[Subscriptions] Creating subscription:', {
    userId,
    tier,
    botName,
    subscriptionType,
    paymentReference
  });

  try {
    const db = getFirestore();
    
    // Check for existing active subscription for this bot
    const existingSubscription = await checkSubscriptionStatus(userId, botName);
    if (existingSubscription) {
      console.log('[Subscriptions] Active subscription already exists for this bot');
      return;
    }

    const now = new Date();
    const endDate = new Date(now);
    
    if (subscriptionType === 'weekly') {
      endDate.setDate(endDate.getDate() + 7);
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

    const subscription: Subscription = {
      userId,
      tier,
      botName,
      startDate: now,
      endDate,
      subscriptionType,
      status: 'active',
      paymentReference,
      autoRenew: false,
    };

    console.log('[Subscriptions] Adding subscription to Firestore:', subscription);
    await addDoc(collection(db, 'subscriptions'), subscription);
    console.log('[Subscriptions] Subscription created successfully');
  } catch (error) {
    console.error('[Subscriptions] Failed to create subscription:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    throw error;
  }
};

export const checkSubscriptionStatus = async (userId: string, botName?: string): Promise<Subscription | null> => {
  console.log('[Subscriptions] Checking subscription status:', { userId, botName });

  try {
    const db = getFirestore();
    const subscriptionsRef = collection(db, 'subscriptions');
    const q = query(
      subscriptionsRef,
      where('userId', '==', userId),
      where('botName', '==', botName),
      where('status', '==', 'active')
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('[Subscriptions] No active subscription found');
      return null;
    }

    const subscription = querySnapshot.docs[0].data() as Subscription;
    const now = new Date();
    const endDate = subscription.endDate instanceof Timestamp ? 
      subscription.endDate.toDate() : 
      subscription.endDate;

    if (now > endDate) {
      console.log('[Subscriptions] Subscription expired');
      // Update subscription status to expired
      await updateFirestoreDoc(querySnapshot.docs[0].ref, {
        status: 'expired'
      });
      return null;
    }

    console.log('[Subscriptions] Active subscription found:', subscription);
    return subscription;
  } catch (error) {
    console.error('[Subscriptions] Failed to check subscription:', error);
    throw error;
  }
};

// Helper function to check if a bot is in free tier
export const isBotFree = (botName: string): boolean => {
  const freeTier = BOT_TIERS.find(tier => tier.name === "Free Tier");
  return freeTier ? freeTier.bots.some(bot => bot.name === botName) : false;
};

// Helper function to get bot's tier
export const getBotTier = (botName: string): BotTier | null => {
  return BOT_TIERS.find(tier => 
    tier.bots.some(bot => bot.name === botName)
  ) || null;
};

// Helper function to check if user has access to a bot based on their subscription
export const hasBotAccess = async (botName: string, userId: string): Promise<boolean> => {
  // First check if the bot is free
  if (isBotFree(botName)) {
    return true;
  }

  // Then check for active subscription
  const subscription = await checkSubscriptionStatus(userId, botName);
  return subscription !== null;
};

// Helper function to get remaining time for a subscription
export const getSubscriptionTimeRemaining = (endDate: any): string => {
  if (!endDate) return '';

  const end = endDate instanceof Date ? endDate : endDate.toDate();
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
};

// Update payment callback handling
export const handlePaymentCallback = async (url: string): Promise<{success: boolean; screen?: string}> => {
  console.log('[Subscriptions] Processing payment callback:', url);
  try {
    const params = new URLSearchParams(url.split('?')[1]);
    const reference = params.get('reference');
    const checkoutRequestId = params.get('checkoutRequestId');
    const status = params.get('status');
    const error = params.get('error');
    const screen = params.get('screen');

    console.log('[Subscriptions] Payment callback params:', { 
      reference, 
      checkoutRequestId, 
      status, 
      error, 
      screen 
    });

    // Handle M-Pesa callback
    if (checkoutRequestId) {
      const success = await verifyMPesaPayment(checkoutRequestId);
      return { success, screen: screen || undefined };
    }

    // Handle Paystack callback
    if (!reference || status !== 'success') {
      console.error('[Subscriptions] Payment callback failed:', { reference, status, error });
      return { success: false, screen: screen || undefined };
    }

    console.log('[Subscriptions] Verifying payment with server:', reference);
    const response = await fetch(`${PAYMENT_SERVER_URL}/payment/verify?reference=${reference}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DFirstApp/1.0'
      }
    });

    if (!response.ok) {
      console.error('[Subscriptions] Server verification failed:', response.status);
      return { success: false, screen: screen || undefined };
    }

    const data = await response.json();
    console.log('[Subscriptions] Server verification response:', data);

    if (!data.status || !data.data?.status || data.data.status !== 'success') {
      console.error('[Subscriptions] Payment verification failed:', data);
      return { success: false, screen: screen || undefined };
    }

    const metadata = data.data.metadata;
    console.log('[Subscriptions] Creating subscription with metadata:', metadata);
    
    await createSubscription(
      metadata.userId,
      metadata.tier,
      metadata.subscriptionType,
      reference,
      metadata.botName
    );

    return { success: true, screen: screen || undefined };
  } catch (error) {
    console.error('[Subscriptions] Payment callback error:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    const params = new URLSearchParams(url.split('?')[1]);
    return { success: false, screen: params.get('screen') || undefined };
  }
};

export const initializeMPesaPayment = async (
  phoneNumber: string,
  amount: number,
  metadata: any = {}
): Promise<PaymentSession> => {
  console.log('[Subscriptions] Initializing M-Pesa payment:', {
    phoneNumber,
    amount,
    metadata
  });

  try {
    const response = await fetch(`${PAYMENT_SERVER_URL}/payment/mpesa/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        amount,
        metadata
      }),
    });

    console.log('[Subscriptions] M-Pesa server response status:', response.status);
    
    if (!response.ok) {
      let errorMessage = 'M-Pesa payment initialization failed';
      try {
        const errorData = await response.json();
        console.error('[Subscriptions] M-Pesa server error:', errorData);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        console.error('[Subscriptions] Error parsing error response:', e);
        const text = await response.text();
        console.error('[Subscriptions] Raw error response:', text);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Subscriptions] M-Pesa server success response:', data);
    
    if (!data.status) {
      console.error('[Subscriptions] Invalid M-Pesa server response:', data);
      throw new Error(data.message || 'Invalid M-Pesa server response');
    }

    return {
      checkoutRequestID: data.data.checkoutRequestID,
      merchantRequestID: data.data.merchantRequestID,
      responseCode: data.data.responseCode,
      customerMessage: data.data.customerMessage
    };
  } catch (error) {
    console.error('[Subscriptions] M-Pesa payment initialization error:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    throw error;
  }
};

export const verifyMPesaPayment = async (checkoutRequestId: string): Promise<boolean> => {
  console.log('[Subscriptions] Verifying M-Pesa payment:', checkoutRequestId);

  try {
    const response = await fetch(
      `${PAYMENT_SERVER_URL}/payment/mpesa/verify/${checkoutRequestId}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('[Subscriptions] M-Pesa verification failed:', response.status);
      return false;
    }

    const data = await response.json();
    console.log('[Subscriptions] M-Pesa verification response:', data);

    if (!data.status) {
      console.error('[Subscriptions] M-Pesa payment verification failed:', data);
      return false;
    }

    const metadata = data.data.metadata;
    if (!metadata) {
      console.error('[Subscriptions] No metadata found in verification response');
      return false;
    }

    console.log('[Subscriptions] Creating subscription with metadata:', metadata);
    await createSubscription(
      metadata.userId,
      metadata.tier,
      metadata.subscriptionType,
      checkoutRequestId,
      metadata.botName
    );

    return true;
  } catch (error) {
    console.error('[Subscriptions] M-Pesa payment verification error:', error);
    if (error instanceof Error) {
      console.error('[Subscriptions] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return false;
  }
}; 