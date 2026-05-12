// Globe controller - all Three.js logic
window.GlobeController = {
  // Three.js objects
  renderer: null,
  scene: null,
  camera: null,
  cameraDirection: null,
  globe: null,
  cloudLayer: null,
  atmosphere: null,
  cityMarkerGroup: null,
  reticleEl: null,
  
  // State
  isDragging: false,
  activePointerId: null,
  velX: 0,
  velY: 0,
  autoRotate: true,
  dragReleaseAt: 0,
  reticleX: window.innerWidth / 2,
  reticleY: window.innerHeight / 2,
  reticleRadiusPx: 35,
  markerHitRadiusPx: 5,
  markerClickRadiusPx: 12,
  previewCityId: '',
  targetDistance: 3.2,
  currentDistance: 3.2,
  lastCameraDistance: 3.2,
  cloudDrift: 0,
  GROUP_ROT: { x: 0, y: 0 },
  pendingDrag: { dx: 0, dy: 0 },
  reticleActivePlace: '',
  centeredCityId: '',
  reticleReleaseCenterTimer: null,
  animationFrameId: null,
  isRenderingFrame: false,
  sceneDirty: true,
  chatUpdateToken: 0,
  lastReticleProbe: 0,
  cityMarkerBaseOpacity: 1,
  cityMarkerDimOpacity: 0.6,
  cityMarkerActiveOpacity: 1,
  
  // Quality settings
  fpsFrames: 0,
  fpsSampleStart: 0,
  lowFpsStreak: 0,
  highFpsStreak: 0,
  QUALITY_PIXEL_CAP: { low: 0.9, medium: 1.25, high: 1.6 },
  RETICLE_RELEASE_CENTER_DELAY_MS: 500,
  DRAG_SENSITIVITY: 0.002,
  
  // Sizes
  minDistance: 1.8,
  maxDistance: 6.0,
  viewportW: window.innerWidth,
  viewportH: window.innerHeight,
  
  // Arrays
  allObjects: [],
  dotMeshes: [],
  cityMarkerMeshes: [],
  
  // Pinch zoom
  pinchStartDist: 0,
  pinchStartZoom: 3.2,
  
  // Raycasters
  raycaster: null,
  reticleRaycaster: null,
  reticleNdc: null,
  mouse2: null,
  markerProjectWorldDir: null,
  markerProjectNdc: null,
  markerProjectEuler: null,
  
  // Callback
  onPlaceChangeCallback: null,
  onPreviewCityCallback: null,
  onEnterCityCallback: null,
  onClearCityCallback: null,
  onReticleDragStartCallback: null,

  init() {
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupStars();
    this.setupGlobe();
    this.setupLights();
    this.setupMarkers();
    this.setupReticle();
    this.setupDragAndRotate();
    this.setupZoom();
    this.setupRaycasters();
    this.setupResize();
    this.setupVisibilityHandling();
    this.requestRender();
  },

  setupRenderer() {
    const canvas = document.getElementById('globe-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.applyRendererQuality();
    this.renderer.setSize(this.viewportW, this.viewportH);
    this.renderer.setClearColor(0x05070f, 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
  },

  setupScene() {
    this.scene = new THREE.Scene();
  },

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(42, this.viewportW / this.viewportH, 0.1, 1000);
    this.cameraDirection = new THREE.Vector3(1.0, 0.32, 3.0).normalize();
    this.camera.position.copy(this.cameraDirection).multiplyScalar(this.currentDistance);
    this.camera.lookAt(0, 0, 0);
  },

  setupStars() {
    const starGeo = new THREE.BufferGeometry();
    const sv = [];
    for (let i = 0; i < 1200; i++) {
      const r = 80 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      sv.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xb4d5ff,
      size: 0.22,
      transparent: true,
      opacity: 0.32
    });
    this.scene.add(new THREE.Points(starGeo, starMat));
  },

  setupGlobe() {
    const globeGeo = new THREE.SphereGeometry(1, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const prepareTexture = (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = maxAnisotropy;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    const earthTexture = prepareTexture(
      textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg')
    );
    const bumpTexture = textureLoader.load('https://threejs.org/examples/textures/planets/earth_bump_2048.jpg');
    bumpTexture.anisotropy = maxAnisotropy;
    const specTexture = textureLoader.load('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg');
    specTexture.anisotropy = maxAnisotropy;
    const lightsTexture = prepareTexture(
      textureLoader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png')
    );
    const cloudTexture = textureLoader.load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png');
    cloudTexture.anisotropy = maxAnisotropy;

    const globeMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      bumpMap: bumpTexture,
      bumpScale: 0.04,
      specularMap: specTexture,
      specular: new THREE.Color(0x446688),
      shininess: 14,
      emissive: new THREE.Color(0x1a3658),
      emissiveMap: lightsTexture,
      emissiveIntensity: 0.35
    });
    this.globe = new THREE.Mesh(globeGeo, globeMat);
    this.scene.add(this.globe);

    this.cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(1.014, 48, 48),
      new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
      })
    );
    this.scene.add(this.cloudLayer);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 48, 48),
      new THREE.MeshPhongMaterial({
        color: 0x66a7ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide
      })
    );
    this.scene.add(this.atmosphere);
  },

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0x6f8fb8, 0.45));
    const keyLight = new THREE.DirectionalLight(0xcde5ff, 1.08);
    keyLight.position.set(5, 2, 4);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x3a7dff, 0.6);
    rimLight.position.set(-5, -2, -4);
    this.scene.add(rimLight);
  },

  setupMarkers() {
    this.cityMarkerGroup = new THREE.Group();
    this.cityMarkerGroup.visible = false;
    this.scene.add(this.cityMarkerGroup);
    this.loadCityMarkers();
  },

  async loadCityMarkers() {
    try {
      const response = await fetch(`${window.AppConfig.apiBase}/api/cities`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to load city coordinates');
      const data = await response.json();
      this.renderCityMarkers(data.cities || []);
    } catch (error) {
      console.warn('City markers unavailable. Start the Node server to load database-backed dots.', error);
    }
  },

  renderCityMarkers(cities) {
    const markerGeometry = new THREE.CircleGeometry(0.0020, 12);
    const makeMarkerMaterial = () => new THREE.MeshBasicMaterial({
      color: 0x00d287,
      transparent: true,
      opacity: this.cityMarkerBaseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    cities.forEach(city => {
      if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) return;
      const pos = this.latLon(city.latitude, city.longitude, 1.018);
      const markerMaterial = makeMarkerMaterial();
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(pos);
      marker.lookAt(pos.clone().multiplyScalar(3));
      marker.userData.city = city;
      marker.userData.chatRoomId = city.cityId;
      marker.userData.localPosition = pos.clone();
      this.cityMarkerGroup.add(marker);
      this.cityMarkerMeshes.push(marker);
    });
  },

  setupReticle() {
    this.reticleEl = document.getElementById('screen-reticle');
    if (!this.reticleEl) return;

    this.setReticlePosition();
  },

  setReticlePosition() {
    this.reticleX = this.viewportW / 2;
    this.reticleY = this.viewportH / 2;
    if (this.reticleEl) {
      this.reticleEl.style.left = '50%';
      this.reticleEl.style.top = '50%';
    }
  },

  setupDragAndRotate() {
    const canvas = document.getElementById('globe-canvas');
    
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      e.preventDefault();
      const clickMarker = this.getMarkerAtScreenPoint(e.clientX, e.clientY);
      if (clickMarker) {
        this.cancelReticleReleaseCenter();
        this.enterCityMarker(clickMarker);
        return;
      }

      this.isDragging = true;
      this.activePointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.autoRotate = false;
      this.velX = 0;
      this.velY = 0;
      this.cancelReticleReleaseCenter();
      this.clearCenteredCity();
      this.requestRender();
    });

    canvas.addEventListener('pointermove', e => {
      if (!this.isDragging) {
        canvas.style.cursor = this.getMarkerAtScreenPoint(e.clientX, e.clientY) ? 'pointer' : 'grab';
        return;
      }
      if (e.pointerId !== this.activePointerId) return;
      canvas.style.cursor = 'grabbing';
      this.pendingDrag.dx += e.movementX;
      this.pendingDrag.dy += e.movementY;
      this.requestRender();
    });

    canvas.addEventListener('pointerleave', () => {
      if (!this.isDragging) canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('pointerup', e => {
      this.stopDrag(e.pointerId);
    });

    canvas.addEventListener('pointercancel', e => {
      this.stopDrag(e.pointerId);
    });
  },

  stopDrag(pointerId) {
    if (!this.isDragging || pointerId !== this.activePointerId) return;
    this.isDragging = false;
    this.activePointerId = null;
    this.pendingDrag.dx = 0;
    this.pendingDrag.dy = 0;
    const canvas = document.getElementById('globe-canvas');
    if (canvas) canvas.style.cursor = 'grab';

    this.dragReleaseAt = performance.now();
    this.scheduleReticleReleaseCenter();
    this.requestRender();
    setTimeout(() => {
      if (this.centeredCityId) return;
      this.autoRotate = true;
      this.requestRender();
    }, 1500);
  },

  cancelReticleReleaseCenter() {
    if (!this.reticleReleaseCenterTimer) return;
    clearTimeout(this.reticleReleaseCenterTimer);
    this.reticleReleaseCenterTimer = null;
  },

  scheduleReticleReleaseCenter() {
    this.cancelReticleReleaseCenter();
    if (!AppState.exploreEnabled || this.cityMarkerMeshes.length === 0) {
      this.clearCenteredCity({ notify: true });
      return;
    }

    const hit = this.getReticleCityHit();
    if (!hit) {
      this.previewCityId = '';
      this.clearCenteredCity({ notify: true });
      return;
    }

    const markerToCenter = hit.marker;
    this.reticleReleaseCenterTimer = setTimeout(() => {
      this.reticleReleaseCenterTimer = null;
      if (this.isDragging || !AppState.exploreEnabled) return;

      const latestHit = this.getReticleCityHit();
      if (!latestHit || latestHit.marker !== markerToCenter) {
        this.previewCityId = '';
        if (Math.abs(this.velX) <= 0.00001 && Math.abs(this.velY) <= 0.00001) {
          this.clearCenteredCity({ notify: true });
        }
        return;
      }

      this.enterCityMarker(markerToCenter);
    }, this.RETICLE_RELEASE_CENTER_DELAY_MS);
  },

  setupZoom() {
    const canvas = document.getElementById('globe-canvas');
    
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const direction = Math.sign(e.deltaY);
      const zoomStep = 0.22;
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance + direction * zoomStep,
        this.minDistance,
        this.maxDistance
      );
      this.requestRender();
    }, { passive: false });

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDist = Math.hypot(dx, dy);
      this.pinchStartZoom = this.targetDistance;
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || this.pinchStartDist <= 0) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentPinchDist = Math.hypot(dx, dy);
      const ratio = this.pinchStartDist / currentPinchDist;
      this.targetDistance = THREE.MathUtils.clamp(
        this.pinchStartZoom * ratio,
        this.minDistance,
        this.maxDistance
      );
      this.requestRender();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.pinchStartDist = 0;
    }, { passive: true });
  },

  setupRaycasters() {
    this.raycaster = new THREE.Raycaster();
    this.mouse2 = new THREE.Vector2();
    this.reticleRaycaster = new THREE.Raycaster();
    this.reticleNdc = new THREE.Vector2(0, 0);
    this.markerProjectWorldDir = new THREE.Vector3();
    this.markerProjectNdc = new THREE.Vector3();
    this.markerProjectEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  },

  setupResize() {
    window.addEventListener('resize', () => {
      this.viewportW = window.innerWidth;
      this.viewportH = window.innerHeight;
      this.camera.aspect = this.viewportW / this.viewportH;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.viewportW, this.viewportH);
      this.applyRendererQuality();
      this.setReticlePosition();
      this.requestRender();
    });
  },

  setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.animationFrameId !== null) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
        return;
      }

      this.fpsFrames = 0;
      this.fpsSampleStart = performance.now();
      this.requestRender();
    });
  },

  latLon(lat, lon, r = 1.002) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  },

  applyRotation() {
    this.globe.rotation.x = this.GROUP_ROT.x;
    this.globe.rotation.y = this.GROUP_ROT.y;
    if (this.cityMarkerGroup) {
      this.cityMarkerGroup.rotation.x = this.GROUP_ROT.x;
      this.cityMarkerGroup.rotation.y = this.GROUP_ROT.y;
    }
    this.allObjects.forEach(o => {
      o.rotation.x = this.GROUP_ROT.x;
      o.rotation.y = this.GROUP_ROT.y;
    });
  },

  applyRendererQuality() {
    const qualityCap = AppState.qualityLevel === 'high'
      ? AppState.adaptivePixelCap
      : (this.QUALITY_PIXEL_CAP[AppState.qualityLevel] || this.QUALITY_PIXEL_CAP.medium);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, qualityCap)
    );
    this.requestRender();
  },

  applyLayerVisibility() {
    this.cloudLayer.visible = !AppState.cloudLayerDisabled;
    this.atmosphere.visible = !AppState.atmosphereLayerDisabled;
  },

  setStopRotate(value) {
    AppState.stopAutoRotate = value;
    if (AppState.stopAutoRotate) {
      this.autoRotate = false;
      this.velX = 0;
      this.velY = 0;
    } else if (!this.isDragging) {
      this.autoRotate = true;
    }
    this.requestRender();
  },

  setCloudDisabled(value) {
    AppState.cloudLayerDisabled = value;
    this.applyLayerVisibility();
    this.requestRender();
  },

  setAtmosphereDisabled(value) {
    AppState.atmosphereLayerDisabled = value;
    this.applyLayerVisibility();
    this.requestRender();
  },

  setQuality(level) {
    AppState.qualityLevel = level;
    AppState.adaptivePixelCap = this.QUALITY_PIXEL_CAP[level] || this.QUALITY_PIXEL_CAP.medium;
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;
    this.fpsFrames = 0;
    this.fpsSampleStart = performance.now();
    this.applyRendererQuality();
    this.requestRender();
  },

  setExploreEnabled(value) {
    AppState.exploreEnabled = value;
    if (this.cityMarkerGroup) {
      this.cityMarkerGroup.visible = !!value;
    }
    if (!value) {
      this.clearCenteredCity();
    }
    this.requestRender();
  },

  focusRandomCity() {
    if (this.cityMarkerMeshes.length === 0) return null;
    this.cancelReticleReleaseCenter();
    const marker = this.cityMarkerMeshes[Math.floor(Math.random() * this.cityMarkerMeshes.length)];
    this.enterCityMarker(marker);
    const city = marker.userData.city || null;
    return city;
  },

  onReticlePlaceChange(callback) {
    this.onPlaceChangeCallback = callback;
  },

  onReticleCityPreview(callback) {
    this.onPreviewCityCallback = callback;
  },

  onReticleCityEnter(callback) {
    this.onEnterCityCallback = callback;
  },

  onReticleCityClear(callback) {
    this.onClearCityCallback = callback;
  },

  onReticleDragStart(callback) {
    this.onReticleDragStartCallback = callback;
  },

  adaptHighQualityPixelRatio(now) {
    if (AppState.qualityLevel !== 'high') return;
    this.fpsFrames += 1;
    const elapsed = now - this.fpsSampleStart;
    if (elapsed < 1200) return;

    const fps = (this.fpsFrames * 1000) / elapsed;
    this.fpsFrames = 0;
    this.fpsSampleStart = now;

    if (fps < 50) {
      this.lowFpsStreak += 1;
      this.highFpsStreak = 0;
    } else if (fps > 58) {
      this.highFpsStreak += 1;
      this.lowFpsStreak = 0;
    } else {
      this.lowFpsStreak = 0;
      this.highFpsStreak = 0;
    }

    if (this.lowFpsStreak >= 2 && AppState.adaptivePixelCap > 1.2) {
      AppState.adaptivePixelCap = Math.max(1.2, AppState.adaptivePixelCap - 0.15);
      this.applyRendererQuality();
      this.lowFpsStreak = 0;
    }

    if (this.highFpsStreak >= 3 && AppState.adaptivePixelCap < this.QUALITY_PIXEL_CAP.high) {
      AppState.adaptivePixelCap = Math.min(this.QUALITY_PIXEL_CAP.high, AppState.adaptivePixelCap + 0.1);
      this.applyRendererQuality();
      this.highFpsStreak = 0;
    }
  },

  updateReticleChat(now) {
    if (!AppState.exploreEnabled || this.cityMarkerMeshes.length === 0) return;
    if (!this.isDragging) return;
    this.updateReticlePreview(now);
  },

  updateInertiaReticleLock(now) {
    if (!AppState.exploreEnabled || this.cityMarkerMeshes.length === 0) return;
    if (this.isDragging || this.centeredCityId || this.reticleReleaseCenterTimer) return;
    if (this.autoRotate && !AppState.stopAutoRotate) return;
    if (Math.abs(this.velX) <= 0.00001 && Math.abs(this.velY) <= 0.00001) return;
    if (now - this.lastReticleProbe < 60) return;

    const hit = this.getReticleCityHit();
    if (!hit) return;

    this.lastReticleProbe = now;
    this.setMarkerFocus(hit.marker);
    const city = hit.marker.userData.city;
    if (city) this.previewCityId = String(city.cityId);
    this.scheduleReticleReleaseCenter();
  },

  updateReticlePreview(now) {
    if (!AppState.exploreEnabled || this.cityMarkerMeshes.length === 0) return;
    if (now - this.lastReticleProbe < 60) return;
    this.lastReticleProbe = now;

    const hit = this.getReticleCityHit();
    if (!hit) {
      this.previewCityId = '';
      this.clearCenteredCity({ notify: true });
      return;
    }

    this.setMarkerFocus(hit.marker);
    const city = hit.marker.userData.city;
    if (!city || String(city.cityId) === this.previewCityId) return;
    this.previewCityId = String(city.cityId);
    if (this.onPreviewCityCallback) {
      this.onPreviewCityCallback(city);
    }
  },

  commitReticleCity() {
    const hit = this.getReticleCityHit();
    if (!hit) {
      this.previewCityId = '';
      this.clearCenteredCity({ notify: true });
      return;
    }

    const city = hit.marker.userData.city;
    if (!city) return;
    this.snapReticleToMarker(hit.marker);
    this.enterCityMarker(hit.marker, { centerGlobe: false });
  },

  getReticleCityHit() {
    let bestHit = null;

    this.cityMarkerMeshes.forEach(marker => {
      const projected = this.projectMarker(marker, this.GROUP_ROT.x, this.GROUP_ROT.y);
      if (!projected || projected.ndc.z < -1 || projected.ndc.z > 1) return;
      if (projected.worldDir.dot(this.cameraDirection) < 0.18) return;
      const distance = Math.hypot(projected.screenX - this.reticleX, projected.screenY - this.reticleY);
      if (distance > this.reticleRadiusPx + this.markerHitRadiusPx) return;
      if (!bestHit || distance < bestHit.distance) {
        bestHit = { marker, distance, projected };
      }
    });

    return bestHit;
  },

  getMarkerAtScreenPoint(screenX, screenY) {
    if (!AppState.exploreEnabled || this.cityMarkerMeshes.length === 0) return null;

    let bestHit = null;
    this.cityMarkerMeshes.forEach(marker => {
      const projected = this.projectMarker(marker, this.GROUP_ROT.x, this.GROUP_ROT.y);
      if (!projected || projected.ndc.z < -1 || projected.ndc.z > 1) return;
      if (projected.worldDir.dot(this.cameraDirection) < 0.18) return;

      const distance = Math.hypot(projected.screenX - screenX, projected.screenY - screenY);
      if (distance > this.markerClickRadiusPx) return;
      if (!bestHit || distance < bestHit.distance) {
        bestHit = { marker, distance };
      }
    });

    return bestHit ? bestHit.marker : null;
  },

  centerMarkerInReticle(marker) {
    if (!marker || !marker.userData.localPosition) return;

    const centerX = this.viewportW / 2;
    const centerY = this.viewportH / 2;
    const currentDistance = (rotX, rotY) => {
      const probe = this.projectMarker(marker, rotX, rotY);
      if (!probe) return Number.POSITIVE_INFINITY;
      if (probe.ndc.z < -1 || probe.ndc.z > 1) return Number.POSITIVE_INFINITY;
      if (probe.worldDir.dot(this.cameraDirection) < 0.18) return Number.POSITIVE_INFINITY;
      return Math.hypot(probe.screenX - centerX, probe.screenY - centerY);
    };

    const clampX = value => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, value));
    const normalizeY = value => {
      let normalized = value;
      while (normalized > Math.PI) normalized -= Math.PI * 2;
      while (normalized < -Math.PI) normalized += Math.PI * 2;
      return normalized;
    };
    const seeds = [
      [this.GROUP_ROT.x, this.GROUP_ROT.y],
      [-Math.PI / 2, this.GROUP_ROT.y],
      [-Math.PI / 4, this.GROUP_ROT.y],
      [0, this.GROUP_ROT.y],
      [Math.PI / 4, this.GROUP_ROT.y],
      [Math.PI / 2, this.GROUP_ROT.y]
    ];

    for (let i = 0; i < 16; i += 1) {
      const rotY = this.GROUP_ROT.y + (i / 16) * Math.PI * 2;
      seeds.push([-Math.PI / 2, rotY], [-Math.PI / 4, rotY], [0, rotY], [Math.PI / 4, rotY], [Math.PI / 2, rotY]);
    }

    let bestX = this.GROUP_ROT.x;
    let bestY = this.GROUP_ROT.y;
    let bestDistance = Number.POSITIVE_INFINITY;

    seeds.forEach(([rotX, rotY]) => {
      const clampedX = clampX(rotX);
      const distance = currentDistance(clampedX, rotY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = clampedX;
        bestY = rotY;
      }
    });

    let step = 0.16;

    for (let round = 0; round < 90 && bestDistance > 1.5; round += 1) {
      let improved = false;
      const candidates = [
        [bestX + step, bestY],
        [bestX - step, bestY],
        [bestX, bestY + step],
        [bestX, bestY - step],
        [bestX + step, bestY + step],
        [bestX + step, bestY - step],
        [bestX - step, bestY + step],
        [bestX - step, bestY - step]
      ];

      candidates.forEach(([rotX, rotY]) => {
        const clampedX = clampX(rotX);
        const distance = currentDistance(clampedX, rotY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = clampedX;
          bestY = rotY;
          improved = true;
        }
      });

      if (!improved) step *= 0.55;
      if (step < 0.0008) break;
    }

    this.GROUP_ROT.x = bestX;
    this.GROUP_ROT.y = normalizeY(bestY);
    this.applyRotation();
  },

  snapReticleToMarker(marker) {
    this.centerMarkerInReticle(marker);
  },

  focusCityMarker(marker, options = {}) {
    if (!marker) return;
    const { centerGlobe = true } = options;
    this.autoRotate = false;
    this.velX = 0;
    this.velY = 0;
    if (centerGlobe) this.centerMarkerInReticle(marker);
    const city = marker.userData.city;
    if (!city) return;
    this.centeredCityId = String(city.cityId);
    this.setMarkerFocus(marker);
    this.requestRender();
  },

  enterCityMarker(marker, options = {}) {
    if (!marker) return;
    this.focusCityMarker(marker, options);
    const city = marker.userData.city;
    if (!city) return;
    this.previewCityId = '';
    this.reticleActivePlace = String(city.cityId);

    if (this.onEnterCityCallback) {
      this.onEnterCityCallback(city);
    } else if (this.onPlaceChangeCallback) {
      this.onPlaceChangeCallback(city);
    }
  },

  setMarkerFocus(activeMarker) {
    this.cityMarkerMeshes.forEach(marker => {
      marker.material.opacity = marker === activeMarker
        ? this.cityMarkerActiveOpacity
        : this.cityMarkerDimOpacity;
    });
    this.requestRender();
  },

  resetMarkerFocus() {
    this.cityMarkerMeshes.forEach(marker => {
      marker.material.opacity = this.cityMarkerBaseOpacity;
    });
    this.requestRender();
  },

  clearCenteredCity(options = {}) {
    this.centeredCityId = '';
    this.reticleActivePlace = '';
    this.resetMarkerFocus();
    if (options.notify && this.onClearCityCallback) {
      this.onClearCityCallback();
    }
  },

  projectMarker(marker, rotX, rotY) {
    const localPosition = marker.userData.localPosition;
    if (!localPosition) return null;
    this.markerProjectEuler.set(rotX, rotY, 0, 'XYZ');
    const worldDir = this.markerProjectWorldDir.copy(localPosition).applyEuler(this.markerProjectEuler).normalize();
    const ndc = this.markerProjectNdc.copy(worldDir).project(this.camera);
    return {
      ndc,
      worldDir,
      screenX: (ndc.x + 1) * 0.5 * this.viewportW,
      screenY: (-ndc.y + 1) * 0.5 * this.viewportH
    };
  },

  requestRender() {
    this.sceneDirty = true;
    if (document.hidden || this.isRenderingFrame || this.animationFrameId !== null) return;
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  },

  animate() {
    this.animationFrameId = null;
    if (document.hidden) return;
    this.isRenderingFrame = true;
    
    const now = performance.now();
    this.adaptHighQualityPixelRatio(now);
    this.updateReticleChat(now);
    let changed = this.sceneDirty;
    this.sceneDirty = false;

    if (this.isDragging) {
      const dx = this.pendingDrag.dx;
      const dy = this.pendingDrag.dy;
      this.pendingDrag.dx = 0;
      this.pendingDrag.dy = 0;
      if (dx !== 0 || dy !== 0) {
        this.velY = dx * this.DRAG_SENSITIVITY;
        this.velX = dy * this.DRAG_SENSITIVITY;
        this.GROUP_ROT.x += this.velX;
        this.GROUP_ROT.y += this.velY;
        this.GROUP_ROT.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.GROUP_ROT.x));
        this.applyRotation();
        changed = true;
      }
    } else {
      if (this.autoRotate && !AppState.stopAutoRotate) {
        this.GROUP_ROT.y += 0.0018;
        changed = true;
      } else {
        const hasVelocity = Math.abs(this.velX) > 0.00001 || Math.abs(this.velY) > 0.00001;
        this.velX *= 0.94;
        this.velY *= 0.94;
        if (hasVelocity) {
          this.GROUP_ROT.x += this.velX;
          this.GROUP_ROT.y += this.velY;
          this.GROUP_ROT.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.GROUP_ROT.x));
          changed = true;
        } else {
          this.velX = 0;
          this.velY = 0;
        }
      }
      if (changed) this.applyRotation();
      this.updateInertiaReticleLock(now);
    }

    if (!AppState.cloudLayerDisabled) {
      if (!this.centeredCityId && !AppState.stopAutoRotate) {
        this.cloudDrift += 0.00035;
        changed = true;
      }
      this.cloudLayer.rotation.x = this.GROUP_ROT.x;
      this.cloudLayer.rotation.y = this.GROUP_ROT.y + this.cloudDrift;
    }

    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.targetDistance, 0.14);
    if (Math.abs(this.currentDistance - this.lastCameraDistance) > 0.0005) {
      this.camera.position.copy(this.cameraDirection).multiplyScalar(this.currentDistance);
      this.camera.lookAt(0, 0, 0);
      this.lastCameraDistance = this.currentDistance;
      changed = true;
    }

    if (changed) {
      this.renderer.render(this.scene, this.camera);
    }

    if (
      this.isDragging ||
      (this.autoRotate && !AppState.stopAutoRotate) ||
      Math.abs(this.velX) > 0.00001 ||
      Math.abs(this.velY) > 0.00001 ||
      Math.abs(this.currentDistance - this.targetDistance) > 0.0005
    ) {
      this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    this.isRenderingFrame = false;
  }
};
