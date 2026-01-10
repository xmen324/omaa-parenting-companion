/**
 * AI Service for OMaa - Your AI Parenting Companion
 * ==================================================
 *
 * This service handles communication with the backend API.
 * The backend securely manages API keys for OpenAI and Anthropic.
 */

class AIService {
    constructor() {
        this.currentProvider = 'openai'; // Default provider
        this.conversationHistory = [];
        this.loadChatHistory();
    }

    /**
     * Load chat history from storage
     */
    loadChatHistory() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
            if (stored) {
                this.conversationHistory = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load chat history:', e);
            this.conversationHistory = [];
        }
    }

    /**
     * Save chat history to storage
     */
    saveChatHistory() {
        try {
            // Keep only last N messages
            const maxMessages = AI_CONFIG.chatSettings.maxHistoryMessages;
            if (this.conversationHistory.length > maxMessages) {
                this.conversationHistory = this.conversationHistory.slice(-maxMessages);
            }
            localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(this.conversationHistory));
        } catch (e) {
            console.error('Failed to save chat history:', e);
        }
    }

    /**
     * Clear chat history
     */
    clearHistory() {
        this.conversationHistory = [];
        localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
    }

    /**
     * Add a message to history
     */
    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
        this.saveChatHistory();
    }

    /**
     * Send a message to the AI and get a response
     */
    async sendMessage(userMessage) {
        // Add user message to history
        this.addToHistory('user', userMessage);

        try {
            // Build messages array with system prompt and history
            const messages = [
                { role: 'system', content: AI_CONFIG.systemPrompt },
                ...this.conversationHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ];

            // Call our backend API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages,
                    provider: this.currentProvider
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `API error: ${response.status}`);
            }

            const data = await response.json();
            const assistantMessage = data.content;

            // Add assistant response to history
            this.addToHistory('assistant', assistantMessage);
            return assistantMessage;
        } catch (error) {
            // Remove the user message from history if request failed
            this.conversationHistory.pop();
            this.saveChatHistory();
            throw error;
        }
    }

    /**
     * Check backend health and available providers
     */
    async checkHealth() {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (e) {
            console.error('Health check failed:', e);
            return null;
        }
    }

    /**
     * Service is always configured when using backend
     */
    isConfigured() {
        return true;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            provider: this.currentProvider,
            providerName: 'OMaa AI',
            isConfigured: true,
            historyLength: this.conversationHistory.length
        };
    }

    // Legacy methods for compatibility (no longer needed with backend)
    getStoredProvider() { return this.currentProvider; }
    setProvider(provider) { this.currentProvider = provider; }
    getApiKey() { return 'server-managed'; }
    setApiKey() { }
    getModel() { return 'auto'; }
    setModel() { }
    getProviderConfig() { return AI_CONFIG.providers.openai; }
}

// Create global instance
const aiService = new AIService();
