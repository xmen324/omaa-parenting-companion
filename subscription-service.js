/**
 * Subscription Service for OMaa
 * Manages trial limits and subscription status
 */

const SUBSCRIPTION_CONFIG = {
    TRIAL_MESSAGE_LIMIT: 20,
    TRIAL_DAYS: 7,
    STORAGE_KEYS: {
        MESSAGE_COUNT: 'omaa_trial_message_count',
        SESSION_ID: 'omaa_session_id',
        SUBSCRIPTION_STATUS: 'omaa_subscription_status',
        TRIAL_START: 'omaa_trial_start'
    }
};

class SubscriptionService {
    constructor() {
        this.sessionId = null;
        this.subscriptionStatus = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Check for session_id in URL (after Stripe redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        const status = urlParams.get('status');

        if (sessionId && status === 'success') {
            localStorage.setItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
            this.sessionId = sessionId;
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else {
            this.sessionId = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SESSION_ID);
        }

        // Initialize trial start date if not set
        if (!localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.TRIAL_START)) {
            localStorage.setItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.TRIAL_START, Date.now().toString());
        }

        // Check subscription status if we have a session
        if (this.sessionId) {
            await this.checkSubscriptionStatus();
        }

        this.initialized = true;
    }

    async checkSubscriptionStatus() {
        if (!this.sessionId) {
            return {
                status: 'trial',
                canChat: this.canSendMessage(),
                messagesRemaining: this.getMessagesRemaining()
            };
        }

        try {
            const response = await fetch(`/api/subscription-status?session_id=${this.sessionId}`);
            const data = await response.json();
            this.subscriptionStatus = data;
            localStorage.setItem(
                SUBSCRIPTION_CONFIG.STORAGE_KEYS.SUBSCRIPTION_STATUS,
                JSON.stringify(data)
            );
            return data;
        } catch (error) {
            console.error('Failed to check subscription:', error);
            // Fall back to cached status
            const cached = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SUBSCRIPTION_STATUS);
            if (cached) {
                this.subscriptionStatus = JSON.parse(cached);
            }
            return this.subscriptionStatus;
        }
    }

    getMessageCount() {
        const count = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.MESSAGE_COUNT);
        return count ? parseInt(count, 10) : 0;
    }

    incrementMessageCount() {
        const count = this.getMessageCount() + 1;
        localStorage.setItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.MESSAGE_COUNT, count.toString());
        return count;
    }

    getMessagesRemaining() {
        return Math.max(0, SUBSCRIPTION_CONFIG.TRIAL_MESSAGE_LIMIT - this.getMessageCount());
    }

    getTrialDaysRemaining() {
        const trialStart = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.TRIAL_START);
        if (!trialStart) return SUBSCRIPTION_CONFIG.TRIAL_DAYS;

        const trialEndTime = parseInt(trialStart, 10) + (SUBSCRIPTION_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);
        const remaining = trialEndTime - Date.now();
        return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    }

    isTrialExpired() {
        const trialStart = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.TRIAL_START);
        if (!trialStart) return false;

        const trialEndTime = parseInt(trialStart, 10) + (SUBSCRIPTION_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);
        return Date.now() > trialEndTime;
    }

    canSendMessage() {
        // If has active subscription, always allow
        if (this.hasActiveSubscription()) {
            return true;
        }

        // Check trial limits
        const hasMessages = this.getMessagesRemaining() > 0;
        const trialValid = !this.isTrialExpired();

        return hasMessages && trialValid;
    }

    getPaywallReason() {
        if (this.isTrialExpired()) {
            return 'trial_expired';
        }
        if (this.getMessagesRemaining() <= 0) {
            return 'message_limit';
        }
        return null;
    }

    async startCheckout() {
        try {
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL received');
            }
        } catch (error) {
            console.error('Failed to start checkout:', error);
            throw error;
        }
    }

    hasActiveSubscription() {
        return this.subscriptionStatus &&
            ['trialing', 'active'].includes(this.subscriptionStatus.status);
    }

    getStatus() {
        if (this.hasActiveSubscription()) {
            return {
                type: 'subscribed',
                status: this.subscriptionStatus.status,
                label: this.subscriptionStatus.status === 'trialing' ? 'Trial Active' : 'Subscribed'
            };
        }

        return {
            type: 'trial',
            messagesRemaining: this.getMessagesRemaining(),
            daysRemaining: this.getTrialDaysRemaining(),
            canChat: this.canSendMessage()
        };
    }
}

// Create global instance
const subscriptionService = new SubscriptionService();
