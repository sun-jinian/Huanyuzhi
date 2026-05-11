// Settings panel controller
window.SettingsPanelController = {
  init() {
    const settingStopRotate = document.getElementById('setting-stop-rotate');
    const settingDisableChat = document.getElementById('setting-disable-chat');
    const settingDisableCloud = document.getElementById('setting-disable-cloud');
    const settingDisableAtmosphere = document.getElementById('setting-disable-atmosphere');
    const settingTheme = document.getElementById('setting-theme');
    const settingQuality = document.getElementById('setting-quality');
    const settingLanguage = document.getElementById('setting-language');
    const settingRandomCity = document.getElementById('setting-random-city');
    this.defaultView = document.getElementById('settings-default-view');
    this.loginView = document.getElementById('settings-login-view');
    this.loginLink = document.getElementById('dock-login-link');
    this.loginBack = document.getElementById('settings-login-back');
    this.loginForm = document.getElementById('settings-login-form');
    this.loginEmail = document.getElementById('settings-login-email');
    this.loginPassword = document.getElementById('settings-login-password');
    this.loginPasswordToggle = document.getElementById('settings-login-password-toggle');
    this.loginRemember = document.getElementById('settings-login-remember');
    this.accountName = document.querySelector('.dock-account-name');

    // Stop auto-rotate
    settingStopRotate.addEventListener('change', () => {
      window.GlobeController.setStopRotate(settingStopRotate.checked);
    });

    // Disable chat
    settingDisableChat.addEventListener('change', () => {
      window.ChatPanelController.setDisabled(settingDisableChat.checked);
    });

    // Disable cloud layer
    settingDisableCloud.addEventListener('change', () => {
      window.GlobeController.setCloudDisabled(settingDisableCloud.checked);
    });

    // Disable atmosphere layer
    settingDisableAtmosphere.addEventListener('change', () => {
      window.GlobeController.setAtmosphereDisabled(settingDisableAtmosphere.checked);
    });

    // Theme mode
    settingTheme.addEventListener('change', () => {
      const isLight = settingTheme.value === 'light';
      document.body.classList.toggle('light-mode', isLight);
      window.GlobeController.renderer.setClearColor(isLight ? 0xe6edf8 : 0x05070f, 1);
    });

    // Quality level
    settingQuality.addEventListener('change', () => {
      window.GlobeController.setQuality(settingQuality.value);
    });

    // Language
    settingLanguage.addEventListener('change', () => {
      window.LanguageController.applyLanguage(settingLanguage.value);
    });

    if (settingRandomCity) {
      settingRandomCity.addEventListener('click', () => {
        window.GlobeController.focusRandomCity();
      });
    }

    if (this.loginLink) {
      this.loginLink.addEventListener('click', () => {
        this.showLoginView();
      });
    }

    if (this.loginBack) {
      this.loginBack.addEventListener('click', () => {
        this.showDefaultView();
      });
    }

    if (this.loginForm) {
      this.loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        await this.loginWithEmail();
      });
    }

    if (this.loginPasswordToggle) {
      this.loginPasswordToggle.addEventListener('click', () => {
        this.togglePasswordVisibility();
      });
    }

    // Initialize defaults - match original behavior
    settingStopRotate.checked = false;
    settingDisableChat.checked = false;
    settingDisableCloud.checked = false;
    settingDisableAtmosphere.checked = false;
    if (this.loginRemember) {
      this.loginRemember.checked = localStorage.getItem('yuanyuzhiRememberPassword') === 'true';
    }
    this.renderAccountState();
  },

  showLoginView() {
    if (AppState.isLoggedIn) return;
    if (this.defaultView) this.defaultView.hidden = true;
    if (this.loginView) this.loginView.hidden = false;
    if (this.loginEmail) this.loginEmail.focus();
  },

  showDefaultView() {
    if (this.defaultView) this.defaultView.hidden = false;
    if (this.loginView) this.loginView.hidden = true;
  },

  togglePasswordVisibility() {
    if (!this.loginPassword || !this.loginPasswordToggle) return;
    const shouldShow = this.loginPassword.type === 'password';
    this.loginPassword.type = shouldShow ? 'text' : 'password';
    this.loginPasswordToggle.classList.toggle('is-visible', shouldShow);
    this.loginPasswordToggle.setAttribute('aria-label', shouldShow ? '隐藏密码' : '显示密码');
  },

  async loginWithEmail() {
    if (!this.loginForm || !this.loginForm.checkValidity()) {
      if (this.loginForm) this.loginForm.reportValidity();
      return;
    }

    const email = this.loginEmail.value.trim();
    const password = this.loginPassword ? this.loginPassword.value : '';
    if (this.loginPassword) this.loginPassword.setCustomValidity('');

    let response = null;
    try {
      response = await fetch(`${window.AppConfig.apiBase}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      });
    } catch (error) {
      if (this.loginPassword) this.loginPassword.setCustomValidity('Login service unavailable');
      this.loginForm.reportValidity();
      return;
    }

    if (!response.ok) {
      if (this.loginPassword) this.loginPassword.setCustomValidity('Invalid email or password');
      this.loginForm.reportValidity();
      return;
    }

    const data = await response.json();
    const accountEmail = data.user && data.user.email ? data.user.email : email;
    sessionStorage.setItem('yuanyuzhiLoggedIn', 'true');
    sessionStorage.setItem('yuanyuzhiAccountEmail', accountEmail);
    localStorage.setItem('yuanyuzhiRememberPassword', this.loginRemember && this.loginRemember.checked ? 'true' : 'false');
    if (this.loginPassword) this.loginPassword.value = '';
    AppState.isLoggedIn = true;
    this.renderAccountState();
    this.showDefaultView();
  },

  renderAccountState() {
    const signedIn = document.getElementById('dock-account-signed-in');
    const loginPrompt = document.getElementById('dock-login-prompt');
    if (signedIn) signedIn.hidden = !AppState.isLoggedIn;
    if (loginPrompt) loginPrompt.hidden = AppState.isLoggedIn;
    if (this.accountName && AppState.isLoggedIn) {
      this.accountName.textContent = sessionStorage.getItem('yuanyuzhiAccountEmail') || 'Account';
    }
  }
};
