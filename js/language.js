// Language controller
window.LanguageController = {
  hintText: {
    zh: {
      locked: '拖动旋转 · 滚轮缩放',
      unlocked: '拖动旋转 · 滚轮缩放 · 点击探索',
      searchPlaceholder: '搜索城市、国家或地址',
      feedback: '发送反馈',
      privacy: '隐私政策',
      randomCity: '随机城市'
    },
    en: {
      locked: 'Drag to rotate · Wheel to zoom',
      unlocked: 'Drag to rotate · Wheel to zoom · Click to explore',
      searchPlaceholder: 'Search city, country or address',
      feedback: 'Send feedback',
      privacy: 'Privacy Policy',
      randomCity: 'Random city'
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

    document.documentElement.lang = AppState.currentLanguage;
    if (window.ChatPanelController && typeof window.ChatPanelController.updateLanguage === 'function') {
      window.ChatPanelController.updateLanguage();
    }
  }
};
