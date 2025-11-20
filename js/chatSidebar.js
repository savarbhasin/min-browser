const webviews = require('webviews.js')
const { marked } = require('marked');
const Dexie = require('dexie');

const API_URL = 'http://192.168.2.235:8000/api/chat'; // User provided: apibaseurl/chat

// Initialize Dexie
const db = new Dexie('ChatDatabase');
// Update schema for version 2 to include conversations
db.version(2).stores({
    conversations: '++id, title, timestamp',
    messages: '++id, conversationId, role, content, timestamp'
}).upgrade(tx => {
    // Optional: Migrate old messages to a default conversation if needed.
    // For now, we'll leave them orphaned or clear them.
});

const chatSidebar = {
    currentConversationId: null,

    initialize: async function () {
        if (document.getElementById('chat-sidebar')) {
            return;
        }

        const sidebar = document.createElement('div');
        sidebar.id = 'chat-sidebar';
        sidebar.hidden = true;
        sidebar.innerHTML = `
      <div id="chat-header">
        <div class="header-title">Phishing Assistant</div>
        <div class="header-controls">
            <button id="chat-new" title="New Chat">New Chat +</button>
            <button id="chat-history-btn" title="History">History</button>
            <span id="chat-close">&times;</span>
        </div>
      </div>
      <div id="chat-content-area">
          <div id="chat-messages"></div>
          <div id="chat-history-list" hidden></div>
      </div>
      <div id="chat-input-area">
        <input type="text" id="chat-input" placeholder="Ask about phishing..." />
        <button id="chat-send">Send</button>
      </div>
    `;

        document.body.appendChild(sidebar);

        document.getElementById('chat-close').addEventListener('click', () => {
            this.toggle();
        });

        document.getElementById('chat-new').addEventListener('click', () => {
            this.startNewChat();
        });

        document.getElementById('chat-history-btn').addEventListener('click', () => {
            this.toggleHistory();
        });

        document.getElementById('chat-send').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Load last conversation or start new
        await this.loadLastConversation();
    },

    toggle: function () {
        const sidebar = document.getElementById('chat-sidebar');
        if (sidebar.hidden) {
            sidebar.hidden = false;
            webviews.adjustMargin([0, 450, 0, 0]);
            setTimeout(() => document.getElementById('chat-input').focus(), 100);
        } else {
            sidebar.hidden = true;
            webviews.adjustMargin([0, -450, 0, 0]);
        }
    },

    startNewChat: function () {
        this.currentConversationId = null;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-history-list').hidden = true;
        document.getElementById('chat-messages').hidden = false;
        document.getElementById('chat-input').focus();
    },

    toggleHistory: async function () {
        const historyList = document.getElementById('chat-history-list');
        const messagesArea = document.getElementById('chat-messages');

        if (historyList.hidden) {
            // Show history
            await this.renderHistoryList();
            historyList.hidden = false;
            messagesArea.hidden = true;
        } else {
            // Hide history
            historyList.hidden = true;
            messagesArea.hidden = false;
        }
    },

    renderHistoryList: async function () {
        const historyList = document.getElementById('chat-history-list');
        historyList.innerHTML = '';

        const conversations = await db.conversations.orderBy('timestamp').reverse().toArray();

        if (conversations.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No past conversations</div>';
            return;
        }

        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = conv.title || 'Untitled Chat';
            item.onclick = () => this.loadConversation(conv.id);
            historyList.appendChild(item);
        });
    },

    loadConversation: async function (id) {
        this.currentConversationId = id;
        document.getElementById('chat-messages').innerHTML = '';

        const messages = await db.messages.where('conversationId').equals(id).sortBy('timestamp');
        messages.forEach(msg => this.addMessage(msg.content, msg.role));

        document.getElementById('chat-history-list').hidden = true;
        document.getElementById('chat-messages').hidden = false;
    },

    loadLastConversation: async function () {
        const lastConv = await db.conversations.orderBy('timestamp').last();
        if (lastConv) {
            await this.loadConversation(lastConv.id);
        } else {
            this.startNewChat();
        }
    },

    sendMessage: async function () {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;

        // Ensure conversation exists
        if (!this.currentConversationId) {
            const title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
            this.currentConversationId = await db.conversations.add({
                title: title,
                timestamp: Date.now()
            });
        }

        // Get history BEFORE adding the new message (for API context)
        const history = this.getHistory();

        this.addMessage(message, 'user');
        await this.saveMessageToDB('user', message);
        input.value = '';

        // Add loading indicator
        const loadingId = this.addMessage('Typing...', 'assistant');

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    conversation_history: history
                })
            });

            const data = await response.json();

            // Remove loading indicator
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();

            this.addMessage(data.response, 'assistant');
            await this.saveMessageToDB('assistant', data.response);

            // Update conversation timestamp
            await db.conversations.update(this.currentConversationId, { timestamp: Date.now() });

        } catch (error) {
            console.error('Chat API Error:', error);
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();
            this.addMessage('Error connecting to assistant.', 'assistant');
        }
    },

    addMessage: function (text, sender) {
        const messagesDiv = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;

        if (sender === 'assistant' && text !== 'Typing...' && text !== 'Error connecting to assistant.') {
            msgDiv.innerHTML = marked.parse(text);
        } else {
            msgDiv.textContent = text;
        }

        msgDiv.id = 'msg-' + Date.now();
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return msgDiv.id;
    },

    getHistory: function () {
        const messages = document.querySelectorAll('.chat-message');
        const history = [];
        messages.forEach(msg => {
            if (msg.textContent === 'Typing...' || msg.textContent === 'Error connecting to assistant.') return;
            history.push({
                role: msg.classList.contains('user') ? 'user' : 'assistant',
                content: msg.textContent
            });
        });
        return history;
    },

    saveMessageToDB: async function (role, content) {
        try {
            if (this.currentConversationId) {
                await db.messages.add({
                    conversationId: this.currentConversationId,
                    role: role,
                    content: content,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            console.error('Failed to save message to DB:', e);
        }
    },

    // Removed loadHistoryFromDB as it's replaced by loadConversation
};

module.exports = chatSidebar;
