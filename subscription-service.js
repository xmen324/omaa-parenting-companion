/**
 * Subscription Service for OMaa
 * Manages subscription verification via Stripe
 *
 * Flow:
 * 1. User must complete Stripe Checkout to access chat
 * 2. Session ID stored in localStorage after checkout
 * 3. All access verification done via server API (Stripe)
 * 4. Unlimited messages during trial and after subscription
 */

const SUBSCRIPTION_CONFIG = {
    STORAGE_KEYS: {
        SESSION_ID: 'omaa_session_id'
    }
};

class SubscriptionService {
    constructor() {
        this.sessionId = null;
        this.accessData = null;
        this.initialized = false;
    }

    /**
     * Initialize the subscription service
     * Checks URL for session_id from Stripe redirect
     */
    async init() {
        if (this.initialized) return this.accessData;

        // Check for session_id in URL (after Stripe redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        const status = urlParams.get('status');

        if (sessionId && status === 'success') {
            // Store session ID from successful checkout
            localStorage.setItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
            this.sessionId = sessionId;
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else {
            // Try to get existing session ID
            this.sessionId = localStorage.getItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SESSION_ID);
        }

        this.initialized = true;
        return this.accessData;
    }

    /**
     * Check if user has a stored session
     */
    hasSession() {
        return !!this.sessionId;
    }

    /**
     * Verify access with the server
     * Returns access data including subscription status
     */
    async verifyAccess() {
        if (!this.sessionId) {
            return {
                valid: false,
                error: 'No session - user must enroll first'
            };
        }

        try {
            const response = await fetch(`/api/verify-session?session_id=${this.sessionId}`);
            const data = await response.json();
            this.accessData = data;
            return data;
        } catch (error) {
            console.error('Failed to verify access:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Check if user can send a message
     * Must be called after verifyAccess()
     */
    canSendMessage() {
        if (!this.accessData) return false;
        return this.accessData.valid && this.accessData.canChat;
    }

    /**
     * Get the reason for paywall
     */
    getPaywallReason() {
        if (!this.accessData) return 'not_enrolled';
        if (!this.accessData.valid) return 'not_enrolled';
        if (this.accessData.status === 'canceled' || this.accessData.status === 'past_due') {
            return 'subscription_ended';
        }
        return null;
    }

    /**
     * Start Stripe checkout process
     * @param {string} plan - 'monthly' or 'annual'
     */
    async startCheckout(plan = 'monthly') {
        try {
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan })
            });
            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'No checkout URL received');
            }
        } catch (error) {
            console.error('Failed to start checkout:', error);
            throw error;
        }
    }

    /**
     * Check if user has active paid subscription (not trial)
     */
    isPaidUser() {
        return this.accessData && this.accessData.isPaid;
    }

    /**
     * Check if user is on trial
     */
    isTrialUser() {
        return this.accessData && this.accessData.isTrialing;
    }

    /**
     * Get trial end date
     */
    getTrialEndDate() {
        if (!this.accessData || !this.accessData.trialEnd) return null;
        return new Date(this.accessData.trialEnd);
    }

    /**
     * Clear session (logout)
     */
    clearSession() {
        localStorage.removeItem(SUBSCRIPTION_CONFIG.STORAGE_KEYS.SESSION_ID);
        this.sessionId = null;
        this.accessData = null;
        this.initialized = false;
    }
}

// Create global instance
const subscriptionService = new SubscriptionService();
