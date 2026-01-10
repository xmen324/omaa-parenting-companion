/**
 * Chat Page JavaScript for OMaa - AI Parenting Companion
 * =======================================================
 *
 * Handles the chat interface and AI interactions.
 * Requires Stripe enrollment before allowing chat access.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const clearChatBtn = document.getElementById('clearChatBtn');
    const paywallModal = document.getElementById('paywallModal');
    const subscribePaywallBtn = document.getElementById('subscribePaywallBtn');
    const trialBadge = document.getElementById('trialBadge');
    const enrollModal = document.getElementById('enrollModal');
    const enrollBtn = document.getElementById('enrollBtn');

    // Initialize subscription service
    await subscriptionService.init();

    // Check if user has valid access
    const accessCheck = await checkAccess();

    if (!accessCheck.valid) {
        // User not enrolled - show enrollment modal
        showEnrollModal();
        disableChat();
    } else {
        // User has access - enable chat
        enableChat();
        updateTrialBadge();
        loadChatHistory();
    }

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
        });
    }

    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Clear all chat history?')) {
                aiService.clearHistory();
                // Remove all messages except the welcome message
                const messages = chatMessages.querySelectorAll('.message');
                messages.forEach((msg, index) => {
                    if (index > 0) msg.remove();
                });
                showNotification('Chat history cleared');
            }
        });
    }

    // Enroll button handler
    if (enrollBtn) {
        enrollBtn.addEventListener('click', async () => {
            try {
                enrollBtn.disabled = true;
                enrollBtn.textContent = 'Loading...';
                await subscriptionService.startCheckout();
            } catch (error) {
                showNotification('Failed to start checkout. Please try again.', 'error');
                enrollBtn.disabled = false;
                enrollBtn.textContent = 'Start 7-Day Free Trial';
            }
        });
    }

    // Subscribe button handler (paywall)
    if (subscribePaywallBtn) {
        subscribePaywallBtn.addEventListener('click', async () => {
            try {
                subscribePaywallBtn.disabled = true;
                subscribePaywallBtn.textContent = 'Loading...';
                await subscriptionService.startCheckout();
            } catch (error) {
                showNotification('Failed to start checkout. Please try again.', 'error');
                subscribePaywallBtn.disabled = false;
                subscribePaywallBtn.textContent = 'Subscribe Now';
            }
        });
    }

    // Close modals on outside click
    if (paywallModal) {
        paywallModal.addEventListener('click', (e) => {
            if (e.target === paywallModal) {
                hidePaywall();
            }
        });
    }

    /**
     * Check user access via subscription service
     */
    async function checkAccess() {
        if (!subscriptionService.hasSession()) {
            return { valid: false, reason: 'not_enrolled' };
        }

        const access = await subscriptionService.verifyAccess();
        return access;
    }

    /**
     * Show enrollment modal for users without Stripe session
     */
    function showEnrollModal() {
        if (enrollModal) {
            enrollModal.style.display = 'flex';
        }
    }

    /**
     * Hide enrollment modal
     */
    function hideEnrollModal() {
        if (enrollModal) {
            enrollModal.style.display = 'none';
        }
    }

    /**
     * Disable chat input
     */
    function disableChat() {
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = 'Please enroll to start chatting...';
        }
        if (sendBtn) {
            sendBtn.disabled = true;
        }
    }

    /**
     * Enable chat input
     */
    function enableChat() {
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'What would you like to talk about?';
        }
        if (sendBtn) {
            sendBtn.disabled = false;
        }
        hideEnrollModal();
    }

    /**
     * Load and display chat history
     */
    function loadChatHistory() {
        if (typeof aiService !== 'undefined' && aiService.conversationHistory) {
            aiService.conversationHistory.forEach(msg => {
                addMessageToUI(msg.content, msg.role === 'user');
            });
        }
    }

    /**
     * Send a message
     */
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Verify user can still send messages
        if (!subscriptionService.canSendMessage()) {
            const reason = subscriptionService.getPaywallReason();
            showPaywall(reason);
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

            // Track message in Stripe (for trial users)
            if (subscriptionService.isTrialUser()) {
                const trackResult = await subscriptionService.recordMessage();
                updateTrialBadge();

                // Check if limit reached after this message
                if (trackResult.limitReached) {
                    showPaywall('message_limit');
                }
            }
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
                <img src="${avatar}" alt="${isUser ? 'You' : 'OMaa'}">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${isUser ? 'You' : 'OMaa'}</span>
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
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='35' r='20' fill='%23f4a8a8'/%3E%3Ccircle cx='50' cy='70' r='12' fill='%23ffd4d4'/%3E%3C/svg%3E" alt="OMaa">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">OMaa</span>
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
        .clear-chat-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 8px;
            color: var(--text-secondary, #666);
            transition: color 0.2s;
        }
        .clear-chat-btn:hover {
            color: var(--primary-color, #f4a8a8);
        }
    `;
    document.head.appendChild(style);

    /**
     * Show paywall modal
     */
    function showPaywall(reason) {
        const message = document.getElementById('paywallMessage');

        if (reason === 'message_limit') {
            message.textContent = 'You\'ve used all 20 free trial messages.';
        } else if (reason === 'subscription_ended') {
            message.textContent = 'Your subscription has ended.';
        } else {
            message.textContent = 'Subscribe to continue chatting with MoM.';
        }

        paywallModal.style.display = 'flex';
        disableChat();
    }

    /**
     * Hide paywall modal
     */
    function hidePaywall() {
        paywallModal.style.display = 'none';
    }

    /**
     * Update trial badge display
     */
    function updateTrialBadge() {
        const countEl = document.getElementById('trialCount');

        if (subscriptionService.isPaidUser()) {
            // Paid user - hide badge
            trialBadge.style.display = 'none';
        } else if (subscriptionService.isTrialUser()) {
            // Trial user - show remaining messages
            const remaining = subscriptionService.getMessagesRemaining();
            countEl.textContent = remaining;
            trialBadge.style.display = 'block';

            // Add warning style when low
            if (remaining <= 5) {
                trialBadge.classList.add('warning');
            } else {
                trialBadge.classList.remove('warning');
            }

            // Hide badge if no messages left (paywall will show)
            if (remaining <= 0) {
                trialBadge.style.display = 'none';
            }
        } else {
            trialBadge.style.display = 'none';
        }
    }
});
