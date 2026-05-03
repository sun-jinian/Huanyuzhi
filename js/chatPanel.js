// Chat panel controller
window.ChatPanelController = {
  init() {
    this.chatPanel = document.getElementById('chat-panel');
    this.dockChatToggle = document.getElementById('dock-chat-toggle');
    this.chatSizeToggle = document.getElementById('chat-size-toggle');
    this.chatCloseBtn = document.getElementById('chat-close-btn');
    this.chatPanelTitle = document.querySelector('.chat-panel-title');

    if (!this.chatPanel) return;

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

    this.setDisabled(AppState.chatDisabled);
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
  }
};
