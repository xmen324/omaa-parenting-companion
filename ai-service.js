/**
 * AI Service for Mother of Mother
 * ================================
 *
 * This service handles communication with different AI providers.
 * It supports OpenAI, Anthropic (Claude), and DeepSeek APIs.
 *
 * The service automatically formats requests for each provider's API format.
 */

class AIService {
    constructor() {
        this.currentProvider = this.getStoredProvider();
        this.conversationHistory = [];
        this.loadChatHistory();
    }

    /**
     * Get the currently selected provider from storage
     */
    getStoredProvider() {
        return localStorage.getItem(STORAGE_KEYS.PROVIDER) || AI_CONFIG.defaultProvider;
    }

    /**
     * Set the current provider
     */
    setProvider(provider) {
        if (AI_CONFIG.providers[provider]) {
            this.currentProvider = provider;
            localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
        }
    }

    /**
     * Get API key for a provider
     */
    getApiKey(provider = this.currentProvider) {
        return localStorage.getItem(STORAGE_KEYS.API_KEY_PREFIX + provider) || '';
    }

    /**
     * Set API key for a provider
     */
    setApiKey(provider, apiKey) {
        localStorage.setItem(STORAGE_KEYS.API_KEY_PREFIX + provider, apiKey);
    }

    /**
     * Get selected model for a provider
     */
    getModel(provider = this.currentProvider) {
        const stored = localStorage.getItem(STORAGE_KEYS.MODEL_PREFIX + provider);
        return stored || AI_CONFIG.providers[provider].defaultModel;
    }

    /**
     * Set model for a provider
     */
    setModel(provider, model) {
        localStorage.setItem(STORAGE_KEYS.MODEL_PREFIX + provider, model);
    }

    /**
     * Get provider configuration
     */
    getProviderConfig(provider = this.currentProvider) {
        return AI_CONFIG.providers[provider];
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
        const provider = this.currentProvider;
        const apiKey = this.getApiKey();
        const model = this.getModel();

        if (!apiKey) {
            throw new Error('API key not configured. Please add your API key in settings.');
        }

        // Add user message to history
        this.addToHistory('user', userMessage);

        try {
            let response;
            switch (provider) {
                case 'openai':
                    response = await this.sendOpenAIRequest(apiKey, model, userMessage);
                    break;
                case 'anthropic':
                    response = await this.sendAnthropicRequest(apiKey, model, userMessage);
                    break;
                case 'deepseek':
                    response = await this.sendDeepSeekRequest(apiKey, model, userMessage);
                    break;
                default:
                    throw new Error('Unknown provider: ' + provider);
            }

            // Add assistant response to history
            this.addToHistory('assistant', response);
            return response;
        } catch (error) {
            // Remove the user message from history if request failed
            this.conversationHistory.pop();
            this.saveChatHistory();
            throw error;
        }
    }

    /**
     * Send request to OpenAI API
     */
    async sendOpenAIRequest(apiKey, model, userMessage) {
        const messages = [
            { role: 'system', content: AI_CONFIG.systemPrompt },
            ...this.conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: AI_CONFIG.chatSettings.maxTokens,
                temperature: AI_CONFIG.chatSettings.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Send request to Anthropic API
     */
    async sendAnthropicRequest(apiKey, model, userMessage) {
        // Anthropic uses a different message format
        const messages = this.conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: AI_CONFIG.chatSettings.maxTokens,
                system: AI_CONFIG.systemPrompt,
                messages: messages
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    /**
     * Send request to DeepSeek API
     */
    async sendDeepSeekRequest(apiKey, model, userMessage) {
        // DeepSeek uses OpenAI-compatible API format
        const messages = [
            { role: 'system', content: AI_CONFIG.systemPrompt },
            ...this.conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: AI_CONFIG.chatSettings.maxTokens,
                temperature: AI_CONFIG.chatSettings.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `DeepSeek API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Check if the service is properly configured
     */
    isConfigured() {
        return !!this.getApiKey();
    }

    /**
     * Get current status
     */
    getStatus() {
        const provider = this.currentProvider;
        const config = this.getProviderConfig();
        return {
            provider: provider,
            providerName: config.name,
            model: this.getModel(),
            isConfigured: this.isConfigured(),
            historyLength: this.conversationHistory.length
        };
    }
}

// Create global instance
const aiService = new AIService();
