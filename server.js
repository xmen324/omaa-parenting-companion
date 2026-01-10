/**
 * OMaa Backend Server
 * Handles AI API calls securely with server-side API keys
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

// Middleware
app.use(cors());

// Raw body parser for Stripe webhooks (must be before express.json)
app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, provider = 'openai' } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        let response;

        if (provider === 'openai') {
            response = await callOpenAI(messages);
        } else if (provider === 'anthropic') {
            response = await callAnthropic(messages);
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        res.json(response);
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get AI response' });
    }
});

// OpenAI API call
async function callOpenAI(messages) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: messages,
            max_tokens: 1024,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return {
        content: data.choices[0].message.content,
        provider: 'openai'
    };
}

// Anthropic API call
async function callAnthropic(messages) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        throw new Error('Anthropic API key not configured');
    }

    // Convert messages format for Anthropic
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemMessage,
            messages: chatMessages
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    return {
        content: data.content[0].text,
        provider: 'anthropic'
    };
}

// Stripe: Create Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    try {
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{
                price: process.env.STRIPE_PRICE_ID,
                quantity: 1,
            }],
            subscription_data: {
                trial_period_days: 7,
            },
            success_url: `${baseUrl}/chat.html?session_id={CHECKOUT_SESSION_ID}&status=success`,
            cancel_url: `${baseUrl}/chat.html?status=cancelled`,
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Stripe: Get Subscription Status
app.get('/api/subscription-status', async (req, res) => {
    if (!stripe) {
        return res.json({ status: 'no_stripe', canChat: true });
    }

    const { session_id } = req.query;

    if (!session_id) {
        return res.json({
            status: 'no_subscription',
            canChat: true
        });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (!session.subscription) {
            return res.json({
                status: 'no_subscription',
                canChat: true
            });
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        res.json({
            status: subscription.status,
            canChat: ['trialing', 'active'].includes(subscription.status),
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            subscriptionId: subscription.id
        });
    } catch (error) {
        console.error('Subscription status error:', error);
        res.json({
            status: 'error',
            canChat: false,
            error: error.message
        });
    }
});

// Stripe: Webhook Handler
app.post('/api/webhook/stripe', async (req, res) => {
    if (!stripe) {
        return res.status(400).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            event = JSON.parse(req.body);
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle events
    switch (event.type) {
        case 'checkout.session.completed':
            console.log('Checkout completed:', event.data.object.id);
            break;
        case 'customer.subscription.updated':
            console.log('Subscription updated:', event.data.object.id, event.data.object.status);
            break;
        case 'customer.subscription.deleted':
            console.log('Subscription deleted:', event.data.object.id);
            break;
        case 'invoice.payment_succeeded':
            console.log('Payment succeeded:', event.data.object.id);
            break;
        case 'invoice.payment_failed':
            console.log('Payment failed:', event.data.object.id);
            break;
        default:
            console.log('Unhandled event type:', event.type);
    }

    res.json({ received: true });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        providers: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY
        },
        stripe: !!stripe
    });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`OMaa server running on port ${PORT}`);
    console.log(`OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`Anthropic configured: ${!!process.env.ANTHROPIC_API_KEY}`);
});
