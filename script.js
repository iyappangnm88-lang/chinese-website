/**
 * The Traveler’s Myth — Cinematic Mythic Experience
 * Core Engine: High-performance canvas frame sequence, progressive loading,
 * smooth lerp scroll synchronization, custom cursor, and responsive state tracking.
 */

(function () {
  'use strict';

  // --- Configuration ---
  const CONFIG = {
    totalFrames: 240,
    framePath: (index) => `enhanced-frames/ezgif-frame-${String(index).padStart(3, '0')}.jpg`,
    criticalFrameCount: 20, // Enough enhanced 1080p frames to begin immediate fluid interaction
    lerpFactor: 0.12,        // Smooth camera dampening factor
    maxConcurrentLoads: 10   // Concurrency limit for progressive preloading
  };

  // --- State ---
  const state = {
    images: new Array(CONFIG.totalFrames).fill(null),
    loadedFlags: new Array(CONFIG.totalFrames).fill(false),
    loadedCount: 0,
    targetFrame: 0,
    currentFrame: 0,
    lastDrawnFrame: -1,
    isReady: false,
    motionEnabled: true,
    canvasWidth: 0,
    canvasHeight: 0,
    cursor: { x: window.innerWidth / 2, y: window.innerHeight / 2, ringX: window.innerWidth / 2, ringY: window.innerHeight / 2 },
    isTouchDevice: !window.matchMedia('(hover: hover) and (pointer: fine)').matches
  };

  // --- DOM Elements ---
  const DOM = {
    body: document.body,
    preloader: document.getElementById('preloader'),
    preloaderBar: document.getElementById('preloader-bar'),
    preloaderPercent: document.getElementById('preloader-percent'),
    preloaderStatus: document.getElementById('preloader-status'),
    skipLoaderBtn: document.getElementById('skip-loader-btn'),
    canvas: document.getElementById('cinema-canvas'),
    ctx: null,
    progressBar: document.getElementById('scroll-progress-bar'),
    motionToggleBtn: document.getElementById('motion-toggle-btn'),
    navLinks: document.querySelectorAll('.nav-link'),
    trackerSteps: document.querySelectorAll('.tracker-step'),
    storySections: document.querySelectorAll('.story-section'),
    milestoneCards: document.querySelectorAll('.milestone-card'),
    returnTopBtn: document.getElementById('return-top-btn'),
    beginJourneyBtn: document.getElementById('begin-journey-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileNav: document.getElementById('mobile-nav'),
    mobileNavLinks: document.querySelectorAll('.mobile-nav-link'),
    customCursor: document.getElementById('custom-cursor'),
    cursorDot: document.querySelector('.cursor-dot'),
    cursorRing: document.querySelector('.cursor-ring')
  };

  if (DOM.canvas) {
    DOM.ctx = DOM.canvas.getContext('2d', { alpha: false });
  }

  // --- Reduced Motion Check ---
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotionQuery.matches) {
    state.motionEnabled = false;
    updateMotionToggleUI();
  }

  reducedMotionQuery.addEventListener('change', (e) => {
    state.motionEnabled = !e.matches;
    updateMotionToggleUI();
    if (!state.motionEnabled) {
      drawFrame(0);
    }
  });

  // --- Motion Toggle Button ---
  if (DOM.motionToggleBtn) {
    DOM.motionToggleBtn.addEventListener('click', () => {
      state.motionEnabled = !state.motionEnabled;
      updateMotionToggleUI();
      if (!state.motionEnabled) {
        state.targetFrame = 0;
        state.currentFrame = 0;
        drawFrame(0);
      } else {
        calculateScrollProgress();
      }
    });
  }

  function updateMotionToggleUI() {
    if (!DOM.motionToggleBtn) return;
    const pillText = DOM.motionToggleBtn.querySelector('.pill-text');
    DOM.motionToggleBtn.setAttribute('aria-pressed', (!state.motionEnabled).toString());
    if (pillText) {
      pillText.textContent = state.motionEnabled ? 'Motion: On' : 'Motion: Off';
    }
  }

  // --- Canvas Sizing & High DPI Handling ---
  function resizeCanvas() {
    if (!DOM.canvas || !DOM.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    if (DOM.canvas.width !== displayWidth * dpr || DOM.canvas.height !== displayHeight * dpr) {
      DOM.canvas.width = Math.floor(displayWidth * dpr);
      DOM.canvas.height = Math.floor(displayHeight * dpr);
      state.canvasWidth = DOM.canvas.width;
      state.canvasHeight = DOM.canvas.height;
    }

    // Force redraw
    state.lastDrawnFrame = -1;
    drawFrame(Math.round(state.currentFrame));
  }

  window.addEventListener('resize', debounce(resizeCanvas, 100));

  // --- Frame Drawing with Aspect-Ratio "Cover" Crop ---
  function drawFrame(frameIndex) {
    if (!DOM.ctx || !DOM.canvas) return;

    // Constrain index
    const clampedIndex = Math.max(0, Math.min(CONFIG.totalFrames - 1, frameIndex));
    
    // Find closest loaded frame if desired frame is still loading
    let imgToDraw = state.images[clampedIndex];
    if (!imgToDraw || !state.loadedFlags[clampedIndex]) {
      // Look backward for nearest loaded frame
      for (let i = clampedIndex - 1; i >= 0; i--) {
        if (state.loadedFlags[i] && state.images[i]) {
          imgToDraw = state.images[i];
          break;
        }
      }
      // If none backward, look forward
      if (!imgToDraw) {
        for (let i = clampedIndex + 1; i < CONFIG.totalFrames; i++) {
          if (state.loadedFlags[i] && state.images[i]) {
            imgToDraw = state.images[i];
            break;
          }
        }
      }
    }

    if (!imgToDraw) {
      // Graceful fallback if no frame available at all
      drawFallbackCanvas();
      return;
    }

    const cw = state.canvasWidth;
    const ch = state.canvasHeight;
    const iw = imgToDraw.naturalWidth || imgToDraw.width;
    const ih = imgToDraw.naturalHeight || imgToDraw.height;

    if (iw === 0 || ih === 0) return;

    // Calculate "Cover" geometry
    const canvasAspect = cw / ch;
    const imageAspect = iw / ih;
    let drawW, drawH, drawX, drawY;

    if (canvasAspect > imageAspect) {
      drawW = cw;
      drawH = cw / imageAspect;
      drawX = 0;
      drawY = (ch - drawH) / 2;
    } else {
      drawH = ch;
      drawW = ch * imageAspect;
      drawX = (cw - drawW) / 2;
      drawY = 0;
    }

    DOM.ctx.imageSmoothingEnabled = true;
    DOM.ctx.imageSmoothingQuality = 'high';
    DOM.ctx.drawImage(imgToDraw, drawX, drawY, drawW, drawH);
    state.lastDrawnFrame = clampedIndex;
  }

  function drawFallbackCanvas() {
    if (!DOM.ctx) return;
    const cw = state.canvasWidth;
    const ch = state.canvasHeight;
    const grad = DOM.ctx.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, Math.max(cw, ch) / 1.5);
    grad.addColorStop(0, '#161e24');
    grad.addColorStop(1, '#06080a');
    DOM.ctx.fillStyle = grad;
    DOM.ctx.fillRect(0, 0, cw, ch);
  }

  // --- Progressive Image Loader ---
  function preloadSingleImage(index) {
    return new Promise((resolve) => {
      const img = new Image();
      let attemptedFallback = false;

      img.onload = () => {
        state.images[index] = img;
        state.loadedFlags[index] = true;
        state.loadedCount++;
        onFrameLoaded(index);
        resolve(true);
      };

      img.onerror = () => {
        if (!attemptedFallback) {
          attemptedFallback = true;
          // Graceful fallback to original 308x174 background frame if enhanced frame fails
          img.src = `background/ezgif-frame-${String(index + 1).padStart(3, '0')}.jpg`;
          return;
        }
        console.warn(`[Mythic Cinema] Frame ${index + 1} could not be loaded.`);
        state.loadedFlags[index] = false;
        state.loadedCount++;
        onFrameLoaded(index);
        resolve(false);
      };

      img.src = CONFIG.framePath(index + 1);
    });
  }

  function onFrameLoaded(index) {
    // If first frame loaded, draw immediately to avoid void background
    if (index === 0 && DOM.ctx) {
      drawFrame(0);
    }

    const percentage = Math.min(100, Math.round((state.loadedCount / CONFIG.totalFrames) * 100));
    if (DOM.preloaderPercent) {
      DOM.preloaderPercent.textContent = `${percentage}%`;
    }
    if (DOM.preloaderBar) {
      DOM.preloaderBar.style.width = `${percentage}%`;
    }

    // When essential frames are ready, enable page experience
    if (!state.isReady && (state.loadedCount >= CONFIG.criticalFrameCount || state.loadedCount >= CONFIG.totalFrames)) {
      completePreload();
    }
  }

  async function startPreloader() {
    // Reveal skip button if loading takes longer than 2.5s
    setTimeout(() => {
      if (DOM.skipLoaderBtn && !state.isReady) {
        DOM.skipLoaderBtn.classList.remove('hidden');
      }
    }, 2500);

    // 1. Load frame 1 immediately
    await preloadSingleImage(0);

    // 2. Load remaining frames with steady concurrent worker pool
    let nextIndex = 1;
    const workerCount = Math.min(CONFIG.maxConcurrentLoads, CONFIG.totalFrames - 1);
    const workers = [];

    for (let w = 0; w < workerCount; w++) {
      workers.push((async () => {
        while (nextIndex < CONFIG.totalFrames) {
          const currentIndex = nextIndex++;
          await preloadSingleImage(currentIndex);
        }
      })());
    }

    await Promise.all(workers);
    if (DOM.preloaderStatus) {
      DOM.preloaderStatus.textContent = 'All 240 frames ready.';
    }
  }

  function completePreload() {
    if (state.isReady) return;
    state.isReady = true;
    window.__MYTHIC_READY__ = true;

    DOM.body.classList.remove('loading-active');
    if (DOM.preloader) {
      DOM.preloader.classList.add('fade-out');
      // Completely remove from render tree once faded
      setTimeout(() => {
        DOM.preloader.style.display = 'none';
      }, 850);
    }

    // Initial positioning
    calculateScrollProgress();
    requestAnimationFrame(renderLoop);
  }

  if (DOM.skipLoaderBtn) {
    DOM.skipLoaderBtn.addEventListener('click', () => {
      completePreload();
    });
  }

  // --- Scroll Progress & Camera Lerp Physics ---
  function calculateScrollProgress() {
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    const maxScroll = docHeight - winHeight;

    if (maxScroll <= 0) {
      state.targetFrame = 0;
      return;
    }

    const currentScroll = Math.max(0, Math.min(window.scrollY, maxScroll));
    const progress = currentScroll / maxScroll;

    if (state.motionEnabled) {
      state.targetFrame = progress * (CONFIG.totalFrames - 1);
    } else {
      state.targetFrame = 0;
    }

    // Update modern progress bar fallback if CSS animation-timeline is unsupported
    if (DOM.progressBar && !CSS.supports('animation-timeline', 'scroll()')) {
      DOM.progressBar.style.transform = `scaleX(${progress})`;
    }

    updateActiveWaypoints(progress);
    updateMilestoneHighlights(progress);
  }

  window.addEventListener('scroll', calculateScrollProgress, { passive: true });

  // --- Active Nav & Waypoint Tracking ---
  function updateActiveWaypoints(progress) {
    const scrollPos = window.scrollY + window.innerHeight * 0.35;
    let activeSectionId = 'hero';

    DOM.storySections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        activeSectionId = sec.id;
      }
    });

    // Update nav links
    DOM.navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === `#${activeSectionId}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update side tracker dots
    DOM.trackerSteps.forEach((step) => {
      const target = step.getAttribute('data-section');
      if (target === activeSectionId) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  }

  // --- Milestone Interactive Activation ---
  function updateMilestoneHighlights(progress) {
    // Milestones are located within Section 4 (~65% to 85% total page scroll)
    const journeySection = document.getElementById('journey');
    if (!journeySection) return;

    const jTop = journeySection.offsetTop;
    const jHeight = journeySection.offsetHeight;
    const scrollMid = window.scrollY + window.innerHeight * 0.5;

    if (scrollMid >= jTop && scrollMid <= jTop + jHeight) {
      const jProgress = Math.min(1, Math.max(0, (scrollMid - jTop) / jHeight));
      const activeStage = Math.min(4, Math.max(1, Math.ceil(jProgress * 4)));
      
      DOM.milestoneCards.forEach((card) => {
        const stage = parseInt(card.getAttribute('data-stage'), 10);
        if (stage === activeStage) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
  }

  // Allow clicking milestone cards to smoothly advance to that milestone
  DOM.milestoneCards.forEach((card) => {
    card.addEventListener('click', () => {
      const stage = parseInt(card.getAttribute('data-stage'), 10);
      const journeySection = document.getElementById('journey');
      if (!journeySection) return;
      const stepOffset = ((stage - 1) / 4) * journeySection.offsetHeight;
      window.scrollTo({
        top: journeySection.offsetTop + stepOffset - 80,
        behavior: 'smooth'
      });
    });
  });

  // --- Smooth Animation Render Loop ---
  function renderLoop() {
    if (state.motionEnabled) {
      // Gentle Lerp Easing
      const delta = state.targetFrame - state.currentFrame;
      if (Math.abs(delta) > 0.005) {
        state.currentFrame += delta * CONFIG.lerpFactor;
      } else {
        state.currentFrame = state.targetFrame;
      }

      const frameToDraw = Math.round(state.currentFrame);
      if (frameToDraw !== state.lastDrawnFrame) {
        drawFrame(frameToDraw);
      }
    }

    // Smooth Cursor Physics on Desktop
    if (!state.isTouchDevice && DOM.customCursor) {
      state.cursor.ringX += (state.cursor.x - state.cursor.ringX) * 0.2;
      state.cursor.ringY += (state.cursor.y - state.cursor.ringY) * 0.2;

      if (DOM.cursorDot) {
        DOM.cursorDot.style.transform = `translate(${state.cursor.x}px, ${state.cursor.y}px)`;
      }
      if (DOM.cursorRing) {
        DOM.cursorRing.style.transform = `translate(${state.cursor.ringX}px, ${state.cursor.ringY}px)`;
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // --- Desktop Custom Cursor Tracking ---
  if (!state.isTouchDevice) {
    window.addEventListener('mousemove', (e) => {
      state.cursor.x = e.clientX;
      state.cursor.y = e.clientY;
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      if (DOM.customCursor) {
        DOM.customCursor.style.opacity = '0';
      }
    });

    document.addEventListener('mouseenter', () => {
      if (DOM.customCursor) {
        DOM.customCursor.style.opacity = '1';
      }
    });

    // Cursor hover reaction on interactive elements
    const interactiveSelectors = 'a, button, input, .milestone-card, .pill-btn, .tracker-step, [role="button"]';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(interactiveSelectors)) {
        DOM.body.classList.add('cursor-hover');
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(interactiveSelectors)) {
        DOM.body.classList.remove('cursor-hover');
      }
    });
  }

  // --- Mobile Menu Toggle ---
  if (DOM.mobileMenuBtn && DOM.mobileNav) {
    DOM.mobileMenuBtn.addEventListener('click', () => {
      const isExpanded = DOM.mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      DOM.mobileMenuBtn.setAttribute('aria-expanded', (!isExpanded).toString());
      DOM.mobileNav.classList.toggle('open', !isExpanded);
      DOM.mobileNav.setAttribute('aria-hidden', isExpanded.toString());
    });

    DOM.mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        DOM.mobileMenuBtn.setAttribute('aria-expanded', 'false');
        DOM.mobileNav.classList.remove('open');
        DOM.mobileNav.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // --- Navigation & Action Buttons Smooth Scroll ---
  if (DOM.returnTopBtn) {
    DOM.returnTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (DOM.beginJourneyBtn) {
    DOM.beginJourneyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('legend');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Smooth scroll for all anchor jump links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href').slice(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // --- Utility Functions ---
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // --- Initialization ---
  function init() {
    resizeCanvas();
    startPreloader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
