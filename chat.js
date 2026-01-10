/**
 * Chat Page JavaScript for Mother of Mother
 * ==========================================
 *
 * Handles the chat interface, settings modal, and AI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');
    const saveSettings = document.getElementById('saveSettings');
    const aiProviderSelect = document.getElementById('aiProvider');
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');

    // Initialize settings
    initializeSettings();

    // Load chat history
    loadChatHistory();

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
    });

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
        loadSettingsValues();
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });

    saveSettings.addEventListener('click', saveSettingsHandler);

    aiProviderSelect.addEventListener('change', () => {
        updateModelOptions(aiProviderSelect.value);
        // Load saved API key for selected provider
        apiKeyInput.value = aiService.getApiKey(aiProviderSelect.value);
    });

    /**
     * Initialize settings UI
     */
    function initializeSettings() {
        // Populate provider dropdown
        Object.entries(AI_CONFIG.providers).forEach(([key, provider]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = provider.name;
            aiProviderSelect.appendChild(option);
        });

        // Set current provider
        aiProviderSelect.value = aiService.currentProvider;
        updateModelOptions(aiService.currentProvider);
    }

    /**
     * Load current settings values into the form
     */
    function loadSettingsValues() {
        const provider = aiService.currentProvider;
        aiProviderSelect.value = provider;
        apiKeyInput.value = aiService.getApiKey(provider);
        updateModelOptions(provider);
        modelSelect.value = aiService.getModel(provider);
    }

    /**
     * Update model dropdown based on selected provider
     */
    function updateModelOptions(provider) {
        modelSelect.innerHTML = '';
        const providerConfig = AI_CONFIG.providers[provider];

        providerConfig.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });

        // Set current model
        modelSelect.value = aiService.getModel(provider);
    }

    /**
     * Save settings
     */
    function saveSettingsHandler() {
        const provider = aiProviderSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;

        // Save settings
        aiService.setProvider(provider);
        aiService.setApiKey(provider, apiKey);
        aiService.setModel(provider, model);

        // Close modal
        settingsModal.classList.remove('active');

        // Show confirmation
        showNotification('Settings saved successfully!');
    }

    /**
     * Load and display chat history
     */
    function loadChatHistory() {
        // Clear existing messages except the welcome message
        const welcomeMessage = chatMessages.querySelector('.ai-message');

        // Display conversation history
        aiService.conversationHistory.forEach(msg => {
            addMessageToUI(msg.content, msg.role === 'user');
        });
    }

    /**
     * Send a message
     */
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Check if configured
        if (!aiService.isConfigured()) {
            showNotification('Please configure your API key in settings first.', 'error');
            settingsModal.classList.add('active');
            loadSettingsValues();
            return;
        }

        // Add user message to UI
        addMessageToUI(message, true);
        chatInput.value = '';

        // Show typing indicator
        const typingIndicator = showTypingIndicator();

        try {
            // Send to AI
            const response = await aiService.sendMessage(message);

            // Remove typing indicator
            typingIndicator.remove();

            // Add AI response to UI
            addMessageToUI(response, false);
        } catch (error) {
            // Remove typing indicator
            typingIndicator.remove();

            // Show error
            addMessageToUI(`Sorry, I encountered an error: ${error.message}`, false, true);
        }

        // Scroll to bottom
        scrollToBottom();
    }

    /**
     * Add a message to the chat UI
     */
    function addMessageToUI(content, isUser = false, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;

        const avatar = isUser ?
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="40" r="25" fill="%23667"%3E%3C/circle%3E%3Ccircle cx="50" cy="100" r="35" fill="%23667"%3E%3C/circle%3E%3C/svg%3E' :
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="35" r="20" fill="%23f4a8a8"/%3E%3Ccircle cx="50" cy="70" r="12" fill="%23ffd4d4"/%3E%3C/svg%3E';

        // Format content with markdown-like parsing
        const formattedContent = formatMessageContent(content);

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${avatar}" alt="${isUser ? 'You' : 'MoM'}">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${isUser ? 'You' : 'MoM'}</span>
                    ${!isUser ? '<span class="thinking-label">Thought</span>' : ''}
                </div>
                <div class="message-text ${isError ? 'error-message' : ''}">
                    ${formattedContent}
                </div>
            </div>
        `;

        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    /**
     * Format message content (basic markdown parsing)
     */
    function formatMessageContent(content) {
        // Split into paragraphs
        const paragraphs = content.split('\n\n');

        return paragraphs.map(para => {
            // Handle bullet points
            if (para.includes('\n- ') || para.startsWith('- ')) {
                const items = para.split('\n').filter(item => item.trim());
                const listItems = items.map(item => {
                    const text = item.replace(/^[-*]\s*/, '');
                    return `<li>${escapeHtml(text)}</li>`;
                }).join('');
                return `<ul>${listItems}</ul>`;
            }

            // Handle numbered lists
            if (/^\d+\.\s/.test(para)) {
                const items = para.split('\n').filter(item => item.trim());
                const listItems = items.map(item => {
                    const text = item.replace(/^\d+\.\s*/, '');
                    return `<li>${escapeHtml(text)}</li>`;
                }).join('');
                return `<ol>${listItems}</ol>`;
            }

            // Handle headers
            if (para.startsWith('# ')) {
                return `<h3>${escapeHtml(para.substring(2))}</h3>`;
            }
            if (para.startsWith('## ')) {
                return `<h4>${escapeHtml(para.substring(3))}</h4>`;
            }

            // Regular paragraph with bold/italic
            let text = escapeHtml(para);
            text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

            return `<p>${text}</p>`;
        }).join('');
    }

    /**
     * Escape HTML characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show typing indicator
     */
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='35' r='20' fill='%23f4a8a8'/%3E%3Ccircle cx='50' cy='70' r='12' fill='%23ffd4d4'/%3E%3C/svg%3E" alt="MoM">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">MoM</span>
                    <span class="thinking-label">Thinking...</span>
                </div>
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
        return typingDiv;
    }

    /**
     * Scroll chat to bottom
     */
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Show notification
     */
    function showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            padding: 1rem 2rem;
            background: ${type === 'error' ? '#ff4444' : '#44aa44'};
            color: white;
            border-radius: 8px;
            z-index: 1001;
            animation: fadeIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Add fadeOut animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; transform: translateX(-50%) translateY(0); }
            to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
        .error-message {
            background: #fff0f0 !important;
            border-left: 3px solid #ff4444;
        }
    `;
    document.head.appendChild(style);
});
