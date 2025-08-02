// Linkding to Slack Webhook Service
// This service receives webhooks from Linkding and forwards them to Slack

const express = require('express');
const axios = require('axios');
const app = express();

// Configuration
const config = {
    port: process.env.PORT || 3000,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || 'YOUR_SLACK_WEBHOOK_URL_HERE',
    // Optional: Add a simple security token to verify requests
    webhookSecret: process.env.WEBHOOK_SECRET || null
};

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: 'Linkding to Slack webhook service is active' 
    });
});

// Main webhook endpoint that Linkding will call
app.post('/webhook/linkding', async (req, res) => {
    try {
        console.log('Received webhook from Linkding:', JSON.stringify(req.body, null, 2));
        
        // Optional: Verify webhook secret if configured
        if (config.webhookSecret) {
            const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;
            if (providedSecret !== config.webhookSecret) {
                return res.status(401).json({ error: 'Invalid webhook secret' });
            }
        }

        // Extract bookmark data from Linkding webhook
        const bookmarkData = extractBookmarkData(req.body);
        
        if (!bookmarkData) {
            console.log('No valid bookmark data found in webhook');
            return res.status(400).json({ error: 'Invalid bookmark data' });
        }

        // Format message for Slack
        const slackMessage = formatSlackMessage(bookmarkData);
        
        // Send to Slack
        await sendToSlack(slackMessage);
        
        console.log('Successfully sent bookmark to Slack');
        res.json({ success: true, message: 'Bookmark sent to Slack' });
        
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Extract bookmark data from various webhook formats
function extractBookmarkData(webhookBody) {
    // Handle different webhook formats that Linkding might send
    let bookmark = null;
    
    // Direct bookmark object
    if (webhookBody.url) {
        bookmark = webhookBody;
    }
    // Nested in data property
    else if (webhookBody.data && webhookBody.data.url) {
        bookmark = webhookBody.data;
    }
    // Nested in bookmark property
    else if (webhookBody.bookmark && webhookBody.bookmark.url) {
        bookmark = webhookBody.bookmark;
    }
    // Event-style webhook
    else if (webhookBody.object && webhookBody.object.url) {
        bookmark = webhookBody.object;
    }
    
    if (!bookmark || !bookmark.url) {
        return null;
    }
    
    return {
        url: bookmark.url,
        title: bookmark.title || bookmark.website_title || 'Untitled',
        description: bookmark.description || bookmark.website_description || '',
        tags: bookmark.tag_names || bookmark.tags || [],
        dateAdded: bookmark.date_added || bookmark.created || new Date().toISOString()
    };
}

// Format the Slack message
function formatSlackMessage(bookmark) {
    const tags = Array.isArray(bookmark.tags) ? bookmark.tags.join(', ') : '';
    const tagText = tags ? `🏷️ *Tags:* ${tags}` : '';
    
    // Create a rich Slack message
    const message = {
        text: `📌 New bookmark saved`,
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "📌 New Bookmark Saved"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*<${bookmark.url}|${bookmark.title}>*`
                }
            }
        ]
    };
    
    // Add description if available
    if (bookmark.description) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `📝 *Description:* ${bookmark.description}`
            }
        });
    }
    
    // Add tags if available
    if (tagText) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: tagText
            }
        });
    }
    
    // Add timestamp
    message.blocks.push({
        type: "context",
        elements: [
            {
                type: "mrkdwn",
                text: `⏰ Saved: ${new Date(bookmark.dateAdded).toLocaleString()}`
            }
        ]
    });
    
    return message;
}

// Send message to Slack
async function sendToSlack(message) {
    if (!config.slackWebhookUrl || config.slackWebhookUrl === 'YOUR_SLACK_WEBHOOK_URL_HERE') {
        throw new Error('Slack webhook URL not configured');
    }
    
    const response = await axios.post(config.slackWebhookUrl, message, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (response.status !== 200) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }
    
    return response.data;
}

// Test endpoint to verify Slack integration
app.post('/test-slack', async (req, res) => {
    try {
        const testMessage = {
            text: "🧪 Test message from Linkding webhook service",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "🧪 *Test Message*\nYour Linkding to Slack webhook service is working correctly!"
                    }
                }
            ]
        };
        
        await sendToSlack(testMessage);
        res.json({ success: true, message: 'Test message sent to Slack' });
    } catch (error) {
        console.error('Test failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(config.port, () => {
    console.log(`🚀 Linkding to Slack webhook service running on port ${config.port}`);
    console.log(`📡 Webhook endpoint: http://localhost:${config.port}/webhook/linkding`);
    console.log(`🧪 Test endpoint: http://localhost:${config.port}/test-slack`);
    
    if (config.slackWebhookUrl === 'YOUR_SLACK_WEBHOOK_URL_HERE') {
        console.log('⚠️  Please configure your Slack webhook URL in the environment variables');
    } else {
        console.log('✅ Slack webhook URL configured');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
