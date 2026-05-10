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

    // Initialize defaults - match original behavior
    settingStopRotate.checked = false;
    settingDisableChat.checked = false;
    settingDisableCloud.checked = false;
    settingDisableAtmosphere.checked = false;
    this.renderAccountState();
  },

  renderAccountState() {
    const signedIn = document.getElementById('dock-account-signed-in');
    const loginPrompt = document.getElementById('dock-login-prompt');
    if (signedIn) signedIn.hidden = !AppState.isLoggedIn;
    if (loginPrompt) loginPrompt.hidden = AppState.isLoggedIn;
  }
};
