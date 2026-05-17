// Main entry point
document.addEventListener('DOMContentLoaded', () => {
  window.LoadingController.init();
  window.LanguageController.applyLanguage(AppState.currentLanguage);
  window.ChatPanelController.init();
  window.ExploreDockController.init();
  window.GlobeController.init();
  window.SettingsPanelController.init();

  window.GlobeController.onReticleDragStart(() => {
    window.ChatPanelController.enterPreviewMode();
  });

  window.GlobeController.onReticleCityPreview((city) => {
    if (AppState.chatDisabled) return;
    const token = ++window.GlobeController.chatUpdateToken;
    setTimeout(() => {
      if (token !== window.GlobeController.chatUpdateToken) return;
      if (AppState.chatDisabled) return;
      window.ChatPanelController.setCity(city, { preview: true });
      window.ChatPanelController.open();
    }, 80);
  });

  window.GlobeController.onReticleCityEnter((city) => {
    if (AppState.chatDisabled) return;
    window.ChatPanelController.setCity(city);
    window.ChatPanelController.open();
  });

  window.GlobeController.onReticleCityClear(() => {
    window.ChatPanelController.enterPreviewMode();
    window.ChatPanelController.close();
  });

  const heroBtn = document.querySelector('.hero-btn');
  const heroText = document.querySelector('.hero-text');
  const enterExploreMode = (options = {}) => {
    if (AppState.exploreTriggered) return;
    AppState.exploreTriggered = true;

    if (heroText) {
      if (options.instant) {
        heroText.style.display = 'none';
      } else {
        heroText.addEventListener('transitionend', (event) => {
          if (event.target !== heroText) return;
          if (event.propertyName !== 'transform') return;
          heroText.style.display = 'none';
        }, { once: true });
      }
    }

    document.body.classList.add('explore-mode');

    const activateExplore = () => {
      AppState.exploreEnabled = true;
      window.GlobeController.setExploreEnabled(true);
      window.GlobeController.setStopRotate(true);
      window.GlobeController.setCloudDisabled(true);
      window.GlobeController.setAtmosphereDisabled(true);
      const stopRotateSetting = document.getElementById('setting-stop-rotate');
      if (stopRotateSetting) stopRotateSetting.checked = true;
      const cloudSetting = document.getElementById('setting-disable-cloud');
      if (cloudSetting) cloudSetting.checked = true;
      const atmosphereSetting = document.getElementById('setting-disable-atmosphere');
      if (atmosphereSetting) atmosphereSetting.checked = true;
      window.ExploreDockController.show();
      if (AppState.chatEnabled && !AppState.chatDisabled) {
        window.ChatPanelController.open();
      }
      window.LanguageController.applyLanguage(AppState.currentLanguage);
    };

    if (options.instant) {
      activateExplore();
    } else {
      setTimeout(activateExplore, 620);
    }
  };

  if (sessionStorage.getItem('huanyuzhiDirectExplore') === 'true') {
    sessionStorage.removeItem('huanyuzhiDirectExplore');
    document.body.classList.add('direct-explore');
    enterExploreMode({ instant: true });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('direct-explore');
      });
    });
  }

  if (heroBtn) {
    heroBtn.addEventListener('click', e => {
      e.preventDefault();
      enterExploreMode();
    });
  }
});
