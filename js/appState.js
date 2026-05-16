// Shared application state
const HuanyuzhiStorage = {
  migrate(storage, oldKey, newKey) {
    const existing = storage.getItem(newKey);
    const legacy = storage.getItem(oldKey);
    if (existing === null && legacy !== null) {
      storage.setItem(newKey, legacy);
    }
  }
};

HuanyuzhiStorage.migrate(sessionStorage, 'touringGuideLoggedIn', 'huanyuzhiLoggedIn');
HuanyuzhiStorage.migrate(sessionStorage, 'yuanyuzhiLoggedIn', 'huanyuzhiLoggedIn');
HuanyuzhiStorage.migrate(sessionStorage, 'yuanyuzhiAccountEmail', 'huanyuzhiAccountEmail');
HuanyuzhiStorage.migrate(sessionStorage, 'yuanyuzhiDirectExplore', 'huanyuzhiDirectExplore');
HuanyuzhiStorage.migrate(localStorage, 'touringGuideLanguage', 'huanyuzhiLanguage');
HuanyuzhiStorage.migrate(localStorage, 'yuanyuzhiLanguage', 'huanyuzhiLanguage');
HuanyuzhiStorage.migrate(localStorage, 'yuanyuzhiRememberPassword', 'huanyuzhiRememberPassword');

window.AppState = {
  currentLanguage: 'zh',
  exploreEnabled: false,
  exploreTriggered: false,
  qualityLevel: 'medium',
  adaptivePixelCap: 1.25,
  chatEnabled: false,
  chatDisabled: false,
  cloudLayerDisabled: false,
  atmosphereLayerDisabled: false,
  stopAutoRotate: false,
  isLoggedIn: sessionStorage.getItem('huanyuzhiLoggedIn') === 'true',
  currentUser: null
};

try {
  window.AppState.currentUser = JSON.parse(sessionStorage.getItem('huanyuzhiSessionUser') || 'null');
} catch (error) {
  window.AppState.currentUser = null;
}

window.AppConfig = {
  apiBase: window.location.protocol.startsWith('http')
    ? window.location.origin
    : 'http://localhost:3000',
  wsBase: window.location.protocol.startsWith('http')
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:3000'
};
