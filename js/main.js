// Main entry point
document.addEventListener('DOMContentLoaded', () => {
  window.LoadingController.init();
  window.LanguageController.applyLanguage(AppState.currentLanguage);
  window.ChatPanelController.init();
  window.ExploreDockController.init();
  window.GlobeController.init();
  window.SettingsPanelController.init();

  window.GlobeController.onReticlePlaceChange((placeKey) => {
    if (!AppState.chatEnabled || AppState.chatDisabled) return;
    const token = ++window.GlobeController.chatUpdateToken;
    setTimeout(() => {
      if (token !== window.GlobeController.chatUpdateToken) return;
      if (!AppState.chatEnabled || AppState.chatDisabled) return;
      if (!window.ExploreDockController.setCurrentPlace(placeKey)) return;
      window.ChatPanelController.open();
    }, 130);
  });

  const heroBtn = document.querySelector('.hero-btn');
  const heroText = document.querySelector('.hero-text');

  if (heroBtn) {
    heroBtn.addEventListener('click', e => {
      e.preventDefault();
      if (AppState.exploreTriggered) return;
      AppState.exploreTriggered = true;

      if (heroText) {
        heroText.addEventListener('transitionend', (event) => {
          if (event.target !== heroText) return;
          if (event.propertyName !== 'transform') return;
          heroText.style.display = 'none';
        }, { once: true });
      }

      document.body.classList.add('explore-mode');

      setTimeout(() => {
        AppState.exploreEnabled = true;
        window.GlobeController.setExploreEnabled(true);
        window.ExploreDockController.show();
        if (AppState.chatEnabled && !AppState.chatDisabled) {
          window.ChatPanelController.open();
        }
        window.LanguageController.applyLanguage(AppState.currentLanguage);
      }, 620);
    });
  }
});
