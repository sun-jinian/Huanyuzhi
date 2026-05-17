// Chat panel controller
window.ChatPanelController = {
  init() {
    this.chatPanel = document.getElementById('chat-panel');
    this.dockChatToggle = document.getElementById('dock-chat-toggle');
    this.chatSizeToggle = document.getElementById('chat-size-toggle');
    this.chatCloseBtn = document.getElementById('chat-close-btn');
    this.chatPanelTitle = document.querySelector('.chat-panel-title');
    this.activeCity = null;
    this.activeMode = '';
    this.socket = null;
    this.pollTimer = null;
    this.ablyClient = null;
    this.ablyChannel = null;
    this.ablyHandler = null;
    this.messageIds = new Set();
    this.senderName = this.getSenderName();

    if (!this.chatPanel) return;
    this.chatContent = this.chatPanel.querySelector('.chat-content');
    this.chatInput = this.chatPanel.querySelector('.chat-panel-body input');

    if (this.dockChatToggle) {
      this.dockChatToggle.addEventListener('click', () => {
        if (AppState.chatDisabled) {
          this.showChatDisabledToast();
          return;
        }
        this.toggle();
      });
    }

    if (this.chatSizeToggle) {
      this.chatSizeToggle.addEventListener('click', () => {
        this.toggleFullHeight();
      });
    }

    if (this.chatCloseBtn) {
      this.chatCloseBtn.addEventListener('click', () => {
        this.close();
      });
    }

    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        this.sendCurrentMessage();
      });
    }

    this.setDisabled(AppState.chatDisabled);
    this.setInputEnabled(false);
    this.close();
  },

  isOpen() {
    return !!this.chatPanel && this.chatPanel.classList.contains('open');
  },

  open() {
    if (AppState.chatDisabled) {
      this.showChatDisabledToast();
      return;
    }
    AppState.chatEnabled = true;
    if (this.dockChatToggle) this.dockChatToggle.classList.add('is-active');
    if (this.chatPanel) this.chatPanel.classList.add('open');
  },

  close() {
    AppState.chatEnabled = false;
    if (this.dockChatToggle) this.dockChatToggle.classList.remove('is-active');
    if (this.chatPanel) this.chatPanel.classList.remove('open');
  },

  toggle() {
    if (AppState.chatDisabled) {
      this.showChatDisabledToast();
      return;
    }
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  },

  setDisabled(disabled) {
    AppState.chatDisabled = !!disabled;
    if (this.dockChatToggle) {
      this.dockChatToggle.classList.toggle('is-disabled', AppState.chatDisabled);
      this.dockChatToggle.setAttribute('aria-disabled', AppState.chatDisabled ? 'true' : 'false');
    }
    if (AppState.chatDisabled) {
      this.close();
    }
  },

  setPlace(placeKey) {
    const place = window.MockProfile.getPlace(placeKey);
    if (!place || !this.chatPanelTitle) return;
    this.chatPanelTitle.textContent = `${place.address} 聊天室`;
  },

  async setCity(city, options = {}) {
    if (!city || !city.cityId) return;
    const mode = options.preview ? 'preview' : 'entered';
    const sameCity = this.activeCity && this.activeCity.cityId === city.cityId;
    if (sameCity && this.activeMode === mode) return;

    this.activeCity = city;
    this.activeMode = mode;
    this.updateTitle();

    if (!sameCity) {
      this.messageIds.clear();
      this.renderMessages([]);
      await this.loadLatestMessages(city.cityId);
    }

    if (mode === 'preview') {
      this.setInputEnabled(false);
      this.disconnectSocket();
      return;
    }

    this.setInputEnabled(true);
    this.connectCitySocket(city.cityId);
  },

  updateLanguage() {
    this.updateTitle();
  },

  enterPreviewMode() {
    this.activeMode = 'preview';
    this.setInputEnabled(false);
    this.disconnectSocket();
  },

  updateTitle() {
    if (!this.chatPanelTitle || !this.activeCity) return;
    const cityName = this.getCityName(this.activeCity);
    this.chatPanelTitle.textContent = `${cityName} `;
  },

  getCityName(city) {
    if (AppState.currentLanguage === 'zh') {
      return city.cityNameZh || city.cityName || '';
    }
    return city.cityName || city.cityNameZh || '';
  },

  toggleFullHeight() {
    if (this.chatPanel) this.chatPanel.classList.toggle('full-height');
  },

  showChatDisabledToast() {
    if (document.querySelector('.chat-disabled-toast')) return;
    const toast = document.createElement('div');
    toast.className = 'chat-disabled-toast';
    toast.textContent = '聊天室已在设置中禁用';
    document.body.appendChild(toast);
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  },

  getSenderName() {
    const legacyKey = 'touringGuideSenderName';
    const previousProjectKey = 'yuanyuzhiSenderName';
    const key = 'huanyuzhiSenderName';
    const legacy = localStorage.getItem(legacyKey);
    if (localStorage.getItem(key) === null && legacy !== null) {
      localStorage.setItem(key, legacy);
    }
    const previousProjectValue = localStorage.getItem(previousProjectKey);
    if (localStorage.getItem(key) === null && previousProjectValue !== null) {
      localStorage.setItem(key, previousProjectValue);
    }
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(key, generated);
    return generated;
  },

  async loadLatestMessages(cityId) {
    try {
      const response = await fetch(`${window.AppConfig.apiBase}/api/chat/${encodeURIComponent(cityId)}/messages?limit=10`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to load chat messages');
      const data = await response.json();
      this.renderMessages(data.messages || []);
    } catch (error) {
      this.renderSystemMessage('暂时无法加载聊天室消息');
    }
  },

  connectCitySocket(cityId) {
    this.disconnectSocket();

    if (window.Ably) {
      try {
        this.ablyClient = this.ablyClient || new window.Ably.Realtime({
          authUrl: `${window.AppConfig.apiBase}/api/ably/token`
        });
        this.ablyChannel = this.ablyClient.channels.get(`city:${cityId}:chat`);
        this.ablyHandler = message => {
          if (message && message.name === 'message' && message.data) {
            this.appendMessage(message.data);
          }
        };
        this.ablyChannel.subscribe('message', this.ablyHandler);
        return;
      } catch (error) {
        this.startPolling();
        return;
      }
    }

    this.startPolling();
  },

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = window.setInterval(() => {
      if (this.activeCity && this.activeMode === 'entered') {
        this.loadLatestMessages(this.activeCity.cityId);
      }
    }, 4000);
  },

  disconnectSocket() {
    if (this.ablyChannel && this.ablyHandler) {
      this.ablyChannel.unsubscribe('message', this.ablyHandler);
    }
    this.ablyChannel = null;
    this.ablyHandler = null;
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  },

  setInputEnabled(enabled) {
    if (!this.chatInput) return;
    this.chatInput.disabled = !enabled;
    this.chatInput.placeholder = enabled ? '输入消息...' : '松开准心后进入聊天室';
  },

  async sendCurrentMessage() {
    if (this.activeMode !== 'entered') return;
    if (!this.activeCity || !this.chatInput) return;
    const messageText = this.chatInput.value.trim();
    if (!messageText) return;
    this.chatInput.value = '';

    try {
      const response = await fetch(`${window.AppConfig.apiBase}/api/chat/${encodeURIComponent(this.activeCity.cityId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          senderName: this.senderName,
          messageText
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }
      await this.loadLatestMessages(this.activeCity.cityId);
    } catch (error) {
      this.renderSystemMessage('消息发送失败，请稍后再试');
    }
  },

  renderMessages(messages) {
    if (!this.chatContent) return;
    this.chatContent.textContent = '';
    this.messageIds.clear();
    messages.forEach(message => this.appendMessage(message));
  },

  appendMessage(message) {
    if (!this.chatContent || !message || this.messageIds.has(message.messageId)) return;
    this.messageIds.add(message.messageId);

    const item = document.createElement('li');
    item.className = 'chat-message';

    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    meta.textContent = `${message.senderName || 'Anonymous'} · ${this.formatMessageTime(message.createdAt)}`;

    const text = document.createElement('div');
    text.className = 'chat-message-text';
    text.textContent = message.messageText || '';

    item.appendChild(meta);
    item.appendChild(text);
    this.chatContent.appendChild(item);
    this.chatContent.scrollTop = this.chatContent.scrollHeight;
  },

  renderSystemMessage(text) {
    if (!this.chatContent) return;
    const item = document.createElement('li');
    item.className = 'chat-message chat-message-system';
    item.textContent = text;
    this.chatContent.appendChild(item);
  },

  formatMessageTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};
