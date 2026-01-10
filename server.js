/**
 * OMaa Backend Server
 * Handles AI API calls securely with server-side API keys
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        providers: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY
        }
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
