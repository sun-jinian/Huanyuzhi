// Language controller
window.LanguageController = {
  hintText: {
    zh: {
      locked: '拖动旋转 · 滚轮缩放',
      unlocked: '拖动旋转 · 滚轮缩放 · 点击探索',
      searchPlaceholder: '搜索城市、国家或地址',
      feedback: '发送反馈',
      privacy: '隐私政策',
      randomCity: '随机城市',
      registerLink: '蓬门今始为君开',
      loginLink: '花径不曾缘客扫',
      loginEmail: '邮箱',
      loginPassword: '密码',
      rememberPassword: '记住密码',
      loginSubmit: '登录',
      chatroom: '聊天室'
    },
    en: {
      locked: 'Drag to rotate · Wheel to zoom',
      unlocked: 'Drag to rotate · Wheel to zoom · Click to explore',
      searchPlaceholder: 'Search city, country or address',
      feedback: 'Send feedback',
      privacy: 'Privacy Policy',
      randomCity: 'Random city',
      registerLink: 'my humble gate opens',
      loginLink: 'For thee alone',
      loginEmail: 'Email',
      loginPassword: 'Password',
      rememberPassword: 'Remember password',
      loginSubmit: 'Log in',
      chatroom: 'Chatroom'
    }
  },

  applyLanguage(lang) {
    AppState.currentLanguage = lang;
    const text = this.hintText[AppState.currentLanguage] || this.hintText.zh;
    
    // Update hint text safely (handle null check)
    const bottomHint = document.getElementById('bottom-hint');
    if (bottomHint) {
      bottomHint.textContent = AppState.exploreEnabled ? text.unlocked : text.locked;
    }

    // Update search placeholder
    const dockSearchInput = document.getElementById('dock-search-input');
    if (dockSearchInput) {
      dockSearchInput.placeholder = text.searchPlaceholder;
    }

    // Update settings text
    const settingFeedback = document.getElementById('setting-feedback');
    if (settingFeedback) {
      settingFeedback.textContent = text.feedback;
    }

    const settingPrivacy = document.getElementById('setting-privacy');
    if (settingPrivacy) {
      settingPrivacy.textContent = text.privacy;
    }

    const settingRandomCity = document.getElementById('setting-random-city');
    if (settingRandomCity) {
      settingRandomCity.textContent = text.randomCity;
    }

    const dockRegisterLink = document.getElementById('dock-register-link');
    if (dockRegisterLink) {
      dockRegisterLink.textContent = text.registerLink;
    }

    const dockLoginLink = document.getElementById('dock-login-link');
    if (dockLoginLink) {
      dockLoginLink.textContent = text.loginLink;
    }

    const settingsLoginEmailLabel = document.getElementById('settings-login-email-label');
    if (settingsLoginEmailLabel) {
      settingsLoginEmailLabel.textContent = text.loginEmail;
    }

    const settingsLoginPasswordLabel = document.getElementById('settings-login-password-label');
    if (settingsLoginPasswordLabel) {
      settingsLoginPasswordLabel.textContent = text.loginPassword;
    }

    const settingsLoginRememberLabel = document.getElementById('settings-login-remember-label');
    if (settingsLoginRememberLabel) {
      settingsLoginRememberLabel.textContent = text.rememberPassword;
    }

    const settingsLoginSubmit = document.getElementById('settings-login-submit');
    if (settingsLoginSubmit) {
      settingsLoginSubmit.textContent = text.loginSubmit;
    }

    document.documentElement.lang = AppState.currentLanguage;
    if (window.ChatPanelController && typeof window.ChatPanelController.updateLanguage === 'function') {
      window.ChatPanelController.updateLanguage();
    }
  }
};
