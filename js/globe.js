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
  
  // State
  isDragging: false,
  activePointerId: null,
  velX: 0,
  velY: 0,
  autoRotate: true,
  targetDistance: 3.2,
  currentDistance: 3.2,
  lastCameraDistance: 3.2,
  cloudDrift: 0,
  GROUP_ROT: { x: 0, y: 0 },
  pendingDrag: { dx: 0, dy: 0 },
  reticleActivePlace: '',
  chatUpdateToken: 0,
  lastReticleProbe: 0,
  
  // Quality settings
  fpsFrames: 0,
  fpsSampleStart: 0,
  lowFpsStreak: 0,
  highFpsStreak: 0,
  QUALITY_PIXEL_CAP: { low: 0.9, medium: 1.25, high: 1.6 },
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
  
  // Callback
  onPlaceChangeCallback: null,

  init() {
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupStars();
    this.setupGlobe();
    this.setupLights();
    this.setupMarkers();
    this.setupDragAndRotate();
    this.setupZoom();
    this.setupRaycasters();
    this.setupResize();
    this.animate();
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
    const profiles = window.MockProfile.getProfiles();
    const placeCoordinates = {}; // Empty by design, preserve interface
    
    Object.entries(profiles).forEach(([key]) => {
      const coord = placeCoordinates[key];
      if (!coord) return;
      const [lat, lon] = coord;
      const pos = this.latLon(lat, lon, 1.015);
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(0.012, 18),
        new THREE.MeshBasicMaterial({
          color: 0x9edaff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        })
      );
      marker.position.copy(pos);
      marker.lookAt(pos.clone().multiplyScalar(3));
      marker.userData.placeKey = key;
      this.scene.add(marker);
      this.allObjects.push(marker);
      this.cityMarkerMeshes.push(marker);
    });
  },

  setupDragAndRotate() {
    const canvas = document.getElementById('globe-canvas');
    
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      e.preventDefault();
      this.isDragging = true;
      this.activePointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.autoRotate = false;
      this.velX = 0;
      this.velY = 0;
    });

    canvas.addEventListener('pointermove', e => {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      this.pendingDrag.dx += e.movementX;
      this.pendingDrag.dy += e.movementY;
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
    setTimeout(() => { this.autoRotate = true; }, 1500);
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
  },

  setupResize() {
    window.addEventListener('resize', () => {
      this.viewportW = window.innerWidth;
      this.viewportH = window.innerHeight;
      this.camera.aspect = this.viewportW / this.viewportH;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.viewportW, this.viewportH);
      this.applyRendererQuality();
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
  },

  setCloudDisabled(value) {
    AppState.cloudLayerDisabled = value;
    this.applyLayerVisibility();
  },

  setAtmosphereDisabled(value) {
    AppState.atmosphereLayerDisabled = value;
    this.applyLayerVisibility();
  },

  setQuality(level) {
    AppState.qualityLevel = level;
    AppState.adaptivePixelCap = this.QUALITY_PIXEL_CAP[level] || this.QUALITY_PIXEL_CAP.medium;
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;
    this.fpsFrames = 0;
    this.fpsSampleStart = performance.now();
    this.applyRendererQuality();
  },

  setExploreEnabled(value) {
    AppState.exploreEnabled = value;
  },

  onReticlePlaceChange(callback) {
    this.onPlaceChangeCallback = callback;
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
    if (!AppState.exploreEnabled || !AppState.chatEnabled || this.cityMarkerMeshes.length === 0) return;
    if (now - this.lastReticleProbe < 90) return;
    this.lastReticleProbe = now;

    this.reticleRaycaster.setFromCamera(this.reticleNdc, this.camera);
    const hits = this.reticleRaycaster.intersectObjects(this.cityMarkerMeshes);
    if (hits.length === 0) return;

    const placeKey = hits[0].object.userData.placeKey;
    if (!placeKey || placeKey === this.reticleActivePlace) return;
    this.reticleActivePlace = placeKey;
    
    if (this.onPlaceChangeCallback) {
      this.onPlaceChangeCallback(placeKey);
    }
  },

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const now = performance.now();
    this.adaptHighQualityPixelRatio(now);
    this.updateReticleChat(now);

    if (this.isDragging) {
      const dx = this.pendingDrag.dx;
      const dy = this.pendingDrag.dy;
      this.pendingDrag.dx = 0;
      this.pendingDrag.dy = 0;
      this.velY = dx * this.DRAG_SENSITIVITY;
      this.velX = dy * this.DRAG_SENSITIVITY;
      this.GROUP_ROT.x += this.velX;
      this.GROUP_ROT.y += this.velY;
      this.GROUP_ROT.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.GROUP_ROT.x));
      this.applyRotation();
    } else {
      if (this.autoRotate && !AppState.stopAutoRotate) {
        this.GROUP_ROT.y += 0.0018;
      } else {
        this.velX *= 0.94;
        this.velY *= 0.94;
        this.GROUP_ROT.x += this.velX;
        this.GROUP_ROT.y += this.velY;
        this.GROUP_ROT.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.GROUP_ROT.x));
      }
      this.applyRotation();
    }

    if (!AppState.cloudLayerDisabled) {
      this.cloudDrift += 0.00035;
      this.cloudLayer.rotation.x = this.GROUP_ROT.x;
      this.cloudLayer.rotation.y = this.GROUP_ROT.y + this.cloudDrift;
    }

    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.targetDistance, 0.14);
    if (Math.abs(this.currentDistance - this.lastCameraDistance) > 0.0005) {
      this.camera.position.copy(this.cameraDirection).multiplyScalar(this.currentDistance);
      this.camera.lookAt(0, 0, 0);
      this.lastCameraDistance = this.currentDistance;
    }

    this.renderer.render(this.scene, this.camera);
  }
};
