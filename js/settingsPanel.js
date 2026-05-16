// Settings panel controller
const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    this.accountAvatar = document.querySelector('.dock-account-avatar');
    this.logoutButton = document.getElementById('dock-logout-btn');

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

    if (this.loginEmail) {
      this.loginEmail.addEventListener('input', () => {
        this.loginEmail.setCustomValidity('');
      });
    }

    if (this.loginPassword) {
      this.loginPassword.addEventListener('input', () => {
        this.loginPassword.setCustomValidity('');
      });
    }

    if (this.loginPasswordToggle) {
      this.loginPasswordToggle.addEventListener('click', () => {
        this.togglePasswordVisibility();
      });
    }

    if (this.logoutButton) {
      this.logoutButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await this.logout();
      });
    }

    if (this.loginRemember) {
      this.loginRemember.addEventListener('change', () => {
        if (!this.loginRemember.checked) {
          localStorage.setItem('huanyuzhiRememberPassword', 'false');
          localStorage.removeItem('huanyuzhiRememberedEmail');
        }
      });
    }

    // Initialize defaults - match original behavior
    settingStopRotate.checked = false;
    settingDisableChat.checked = false;
    settingDisableCloud.checked = false;
    settingDisableAtmosphere.checked = false;
    if (this.loginRemember) {
      this.loginRemember.checked = localStorage.getItem('huanyuzhiRememberPassword') === 'true';
    }
    this.restoreRememberedLogin();
    this.renderAccountState();
    this.restoreSession();
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

  getLoginCopy() {
    const language = window.AppState && AppState.currentLanguage === 'en' ? 'en' : 'zh';
    return language === 'en'
      ? {
          invalidEmail: 'Enter a valid email address.',
          invalidCredentials: 'Invalid username or password.',
          serviceUnavailable: 'Login service unavailable.'
        }
      : {
          invalidEmail: '请输入合规的邮箱地址。',
          invalidCredentials: '用户名或者密码错误。',
          serviceUnavailable: '登录服务暂时不可用。'
        };
  },

  async loginWithEmail() {
    if (!this.loginForm) return;

    const copy = this.getLoginCopy();
    const email = this.loginEmail ? this.loginEmail.value.trim().toLowerCase() : '';
    const password = this.loginPassword ? this.loginPassword.value : '';

    if (this.loginEmail) this.loginEmail.setCustomValidity('');
    if (this.loginPassword) this.loginPassword.setCustomValidity('');

    if (!LOGIN_EMAIL_PATTERN.test(email)) {
      if (this.loginEmail) {
        this.loginEmail.setCustomValidity(copy.invalidEmail);
        this.loginEmail.reportValidity();
      }
      return;
    }

    if (!this.loginForm.checkValidity()) {
      if (this.loginForm) this.loginForm.reportValidity();
      return;
    }

    let response = null;
    try {
      response = await fetch(`${window.AppConfig.apiBase}/api/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          remember: Boolean(this.loginRemember && this.loginRemember.checked)
        })
      });
    } catch (error) {
      if (this.loginPassword) this.loginPassword.setCustomValidity(copy.serviceUnavailable);
      this.loginForm.reportValidity();
      return;
    }

    if (!response.ok) {
      if (this.loginPassword) this.loginPassword.setCustomValidity(copy.invalidCredentials);
      this.loginForm.reportValidity();
      return;
    }

    const data = await response.json();
    this.persistSessionUser(data.user || {}, email, { afterLogin: true });
    this.renderAccountState();
    this.showDefaultView();
  },

  async restoreSession() {
    let response = null;
    try {
      response = await fetch(`${window.AppConfig.apiBase}/api/session`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json'
        }
      });
    } catch (error) {
      return;
    }

    if (response.status === 204) {
      this.clearSessionUser();
      this.renderAccountState();
      return;
    }

    if (!response.ok) {
      this.clearSessionUser();
      this.renderAccountState();
      return;
    }

    const data = await response.json();
    this.persistSessionUser(data.user || {});
    this.renderAccountState();
  },

  persistSessionUser(user, fallbackEmail = '', options = {}) {
    const accountEmail = user.email || fallbackEmail;
    if (!accountEmail && !user.userId) return;

    const accountName = user.nickname || accountEmail;
    const avatar = user.avatar || accountName.slice(0, 1).toUpperCase();
    const sessionUser = {
      userId: user.userId || null,
      sessionRecordId: user.sessionRecordId || null,
      nickname: accountName,
      email: accountEmail,
      avatar
    };
    sessionStorage.setItem('huanyuzhiLoggedIn', 'true');
    sessionStorage.setItem('huanyuzhiAccountEmail', accountEmail);
    sessionStorage.setItem('huanyuzhiAccountName', accountName);
    sessionStorage.setItem('huanyuzhiAccountAvatar', avatar);
    sessionStorage.setItem('huanyuzhiSessionUser', JSON.stringify(sessionUser));
    if (options.afterLogin) {
      this.persistRememberedLogin(accountEmail);
      if (this.loginPassword) this.loginPassword.value = '';
    }
    AppState.isLoggedIn = true;
    AppState.currentUser = sessionUser;
  },

  restoreRememberedLogin() {
    const shouldRemember = localStorage.getItem('huanyuzhiRememberPassword') === 'true';
    const rememberedEmail = localStorage.getItem('huanyuzhiRememberedEmail') || '';
    if (this.loginRemember) this.loginRemember.checked = shouldRemember;
    if (shouldRemember && rememberedEmail && this.loginEmail && !this.loginEmail.value) {
      this.loginEmail.value = rememberedEmail;
    }
  },

  persistRememberedLogin(email) {
    const shouldRemember = Boolean(this.loginRemember && this.loginRemember.checked);
    localStorage.setItem('huanyuzhiRememberPassword', shouldRemember ? 'true' : 'false');
    if (shouldRemember && email) {
      localStorage.setItem('huanyuzhiRememberedEmail', email);
      return;
    }
    localStorage.removeItem('huanyuzhiRememberedEmail');
  },

  clearSessionUser() {
    sessionStorage.removeItem('huanyuzhiLoggedIn');
    sessionStorage.removeItem('huanyuzhiAccountEmail');
    sessionStorage.removeItem('huanyuzhiAccountName');
    sessionStorage.removeItem('huanyuzhiAccountAvatar');
    sessionStorage.removeItem('huanyuzhiSessionUser');
    AppState.isLoggedIn = false;
    AppState.currentUser = null;
  },

  async logout() {
    if (this.logoutButton) {
      this.logoutButton.disabled = true;
    }

    try {
      await fetch(`${window.AppConfig.apiBase}/api/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          sessionRecordId: AppState.currentUser && AppState.currentUser.sessionRecordId
        })
      });
    } catch (error) {
      // Local state still needs to clear even if the network request fails.
    }

    this.clearSessionUser();
    if (this.logoutButton) {
      this.logoutButton.disabled = false;
    }
    this.renderAccountState();
    this.showDefaultView();
  },

  renderAccountState() {
    const signedIn = document.getElementById('dock-account-signed-in');
    const loginPrompt = document.getElementById('dock-login-prompt');
    if (signedIn) signedIn.hidden = !AppState.isLoggedIn;
    if (loginPrompt) loginPrompt.hidden = AppState.isLoggedIn;
    if (this.accountName && AppState.isLoggedIn) {
      const user = AppState.currentUser || {};
      const accountName = user.nickname || sessionStorage.getItem('huanyuzhiAccountName') || sessionStorage.getItem('huanyuzhiAccountEmail') || 'Account';
      const avatar = user.avatar || sessionStorage.getItem('huanyuzhiAccountAvatar') || accountName.slice(0, 1).toUpperCase();
      this.accountName.textContent = accountName;
      if (this.accountAvatar) this.accountAvatar.textContent = avatar.slice(0, 1).toUpperCase();
    }
  }
};
