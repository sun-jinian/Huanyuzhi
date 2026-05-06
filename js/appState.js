// Shared application state
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
  stopAutoRotate: false
};

window.AppConfig = {
  apiBase: window.location.origin && window.location.port === '3000'
    ? window.location.origin
    : 'http://localhost:3000',
  wsBase: window.location.origin && window.location.port === '3000'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:3000'
};
