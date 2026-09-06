/* =========================================================================
   ASTRA — script.js
   Vanilla JS only. No frameworks, no dependencies.
   ========================================================================= */

(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var NAV_HEIGHT_SCROLLED = 64;

  // Shared pointer state, read by the AI visualization canvases and written
  // to by initCursorInteraction(). Kept as simple module-level state so
  // multiple canvases can react to the same cursor position cheaply.
  var pointerState = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };

  /* =======================================================================
     Navigation
     ======================================================================= */
  function initNavigation() {
    var nav = document.getElementById("site-nav");
    if (!nav) return;

    function onScroll() {
      if (window.scrollY > 40) {
        nav.classList.add("is-scrolled");
      } else {
        nav.classList.remove("is-scrolled");
      }
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Scroll-spy: highlight the nav link for the section in view.
    var navLinks = Array.prototype.slice.call(
      document.querySelectorAll('.nav__links a[data-nav-link]')
    );
    var sections = navLinks
      .map(function (link) {
        var id = link.getAttribute("href").replace("#", "");
        return document.getElementById(id);
      })
      .filter(Boolean);

    if (!("IntersectionObserver" in window) || sections.length === 0) return;

    var spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = navLinks.find(function (l) {
            return l.getAttribute("href") === "#" + entry.target.id;
          });
          if (!link) return;
          if (entry.isIntersecting) {
            navLinks.forEach(function (l) {
              l.classList.remove("is-active");
            });
            link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      spyObserver.observe(section);
    });
  }

  /* =======================================================================
     Mobile Menu
     ======================================================================= */
  function initMobileMenu() {
    var toggle = document.getElementById("nav-toggle");
    var drawer = document.getElementById("mobile-drawer");
    if (!toggle || !drawer) return;

    function openDrawer() {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function closeDrawer() {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function isOpen() {
      return toggle.getAttribute("aria-expanded") === "true";
    }

    toggle.addEventListener("click", function () {
      isOpen() ? closeDrawer() : openDrawer();
    });

    drawer.querySelectorAll("[data-drawer-link]").forEach(function (link) {
      link.addEventListener("click", closeDrawer);
    });

    // Exposed so the accessibility module can close the drawer on Escape.
    window.__astraCloseDrawer = closeDrawer;
    window.__astraDrawerIsOpen = isOpen;
  }

  /* =======================================================================
     Smooth Scrolling
     ======================================================================= */
  function initSmoothScrolling() {
    var links = document.querySelectorAll('a[href^="#"]');

    links.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var hash = link.getAttribute("href");
        if (!hash || hash === "#") return;

        var target = document.getElementById(hash.slice(1));
        if (!target) return;

        event.preventDefault();

        var offset =
          window.scrollY +
          target.getBoundingClientRect().top -
          NAV_HEIGHT_SCROLLED;

        window.scrollTo({
          top: Math.max(offset, 0),
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });

        // Update the URL without jumping.
        history.pushState(null, "", hash);
      });
    });
  }

  /* =======================================================================
     Scroll Animations
     ======================================================================= */
  function initScrollAnimations() {
    var revealEls = document.querySelectorAll(".reveal");
    if (revealEls.length === 0) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      revealEls.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* =======================================================================
     AI Visualization
     Lightweight canvas particle fields shared by the hero, the network
     section and the final CTA. Each field is self-contained: it manages
     its own particles, animation frame and resize handling.
     ======================================================================= */
  function createParticleField(canvas, options) {
    if (!canvas || !canvas.getContext) return null;

    var ctx = canvas.getContext("2d");
    var settings = Object.assign(
      {
        density: 9000, // px^2 per particle — lower is denser
        maxLinkDistance: 130,
        color: "60, 65, 75",
        speed: 0.15,
        interactive: true,
        pointerRadius: 220,
      },
      options
    );

    var width = 0;
    var height = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var rafId = null;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    }

    function seedParticles() {
      var count = Math.max(18, Math.floor((width * height) / settings.density));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * settings.speed,
          vy: (Math.random() - 0.5) * settings.speed,
          r: Math.random() * 1.2 + 0.6,
        });
      }
    }

    function step() {
      ctx.clearRect(0, 0, width, height);

      var pointerX = pointerState.x - canvas.getBoundingClientRect().left;
      var pointerY = pointerState.y - canvas.getBoundingClientRect().top;

      // Move particles.
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;

        if (settings.interactive) {
          var dx = pointerX - p.x;
          var dy = pointerY - p.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < settings.pointerRadius && dist > 0.01) {
            var pull = (1 - dist / settings.pointerRadius) * 0.02;
            p.vx += (dx / dist) * pull;
            p.vy += (dy / dist) * pull;
          }
        }

        // Gentle drag so velocity doesn't grow unbounded.
        p.vx *= 0.985;
        p.vy *= 0.985;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
      });

      // Draw links between nearby particles.
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var a = particles[i];
          var b = particles[j];
          var ddx = a.x - b.x;
          var ddy = a.y - b.y;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < settings.maxLinkDistance) {
            var opacity = (1 - d / settings.maxLinkDistance) * 0.35;
            ctx.strokeStyle = "rgba(" + settings.color + ", " + opacity + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw particle points.
      particles.forEach(function (p) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + settings.color + ", 0.7)";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      rafId = requestAnimationFrame(step);
    }

    function start() {
      resize();
      if (prefersReducedMotion) {
        // Draw a single static frame instead of animating continuously.
        ctx.clearRect(0, 0, width, height);
        particles.forEach(function (p) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(" + settings.color + ", 0.6)";
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        return;
      }
      if (rafId) cancelAnimationFrame(rafId);
      step();
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        if (prefersReducedMotion) start();
      }, 150);
    });

    return { start: start };
  }

  function initAIVisualization() {
    var heroCanvas = document.querySelector('[data-visual="hero"]');
    var networkCanvas = document.querySelector('[data-visual="network"]');
    var ctaCanvas = document.querySelector('[data-visual="cta"]');

    var heroField = createParticleField(heroCanvas, {
      density: 11000,
      maxLinkDistance: 120,
      color: "70, 74, 84",
      speed: 0.12,
      interactive: true,
      pointerRadius: 260,
    });

    var networkField = createParticleField(networkCanvas, {
      density: 6500,
      maxLinkDistance: 150,
      color: "235, 237, 245",
      speed: 0.18,
      interactive: true,
      pointerRadius: 260,
    });

    var ctaField = createParticleField(ctaCanvas, {
      density: 12000,
      maxLinkDistance: 110,
      color: "235, 237, 245",
      speed: 0.1,
      interactive: false,
    });

    if (heroField) heroField.start();
    if (networkField) networkField.start();
    if (ctaField) ctaField.start();
  }

  /* =======================================================================
     Demo Response
     Simulated assistant reply that types in progressively. Structured so
     the fake delay/typing logic below can be swapped for a real API call:
     replace `simulateAssistantReply()` with a fetch to your backend and
     stream the returned text into the same `typeInto()` renderer.
     ======================================================================= */
  function typeInto(el, text, onDone) {
    var i = 0;
    var speed = 18; // ms per character

    function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed);
      } else if (typeof onDone === "function") {
        onDone();
      }
    }
    tick();
  }

  function simulateAssistantReply(el, text, onDone) {
    // In a real integration this is where a request to the ASTRA API would
    // be made, streaming tokens into `el` as they arrive.
    typeInto(el, text, onDone);
  }

  function initDemo() {
    var chat = document.querySelector(".chat");
    var responseEl = document.querySelector("[data-typewriter]");
    if (!chat || !responseEl) return;

    var fullText = responseEl.getAttribute("data-full-text") || "";
    var hasPlayed = false;

    function play() {
      if (hasPlayed) return;
      hasPlayed = true;
      responseEl.textContent = "";
      responseEl.classList.remove("is-done");

      if (prefersReducedMotion) {
        responseEl.textContent = fullText;
        responseEl.classList.add("is-done");
        return;
      }

      simulateAssistantReply(responseEl, fullText, function () {
        responseEl.classList.add("is-done");
      });
    }

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              play();
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 }
      );
      observer.observe(chat);
    } else {
      play();
    }

    // Regenerate: replay the typing animation from scratch.
    var regenerateBtn = document.querySelector('[data-action="regenerate"]');
    if (regenerateBtn) {
      regenerateBtn.addEventListener("click", function () {
        hasPlayed = false;
        play();
      });
    }

    // Continue: append a short follow-up line to the existing response.
    var continueBtn = document.querySelector('[data-action="continue"]');
    if (continueBtn) {
      continueBtn.addEventListener("click", function () {
        var addition =
          " From there, testing each step against real data keeps the solution honest.";
        var base = responseEl.textContent;
        responseEl.classList.remove("is-done");

        if (prefersReducedMotion) {
          responseEl.textContent = base + addition;
          responseEl.classList.add("is-done");
          return;
        }

        var i = 0;
        var speed = 18;
        (function tick() {
          if (i <= addition.length) {
            responseEl.textContent = base + addition.slice(0, i);
            i++;
            setTimeout(tick, speed);
          } else {
            responseEl.classList.add("is-done");
          }
        })();
      });
    }
  }

  /* =======================================================================
     Copy Buttons
     ======================================================================= */
  function initCopyButtons() {
    var buttons = document.querySelectorAll("[data-copy-target]");

    buttons.forEach(function (button) {
      var originalLabel = button.textContent;
      var targetId = button.getAttribute("data-copy-target");

      button.addEventListener("click", function () {
        var target = document.getElementById(targetId);
        if (!target) return;

        var text = target.innerText || target.textContent;

        function markCopied() {
          button.textContent = "Copied";
          button.classList.add("is-copied");
          setTimeout(function () {
            button.textContent = originalLabel;
            button.classList.remove("is-copied");
          }, 1800);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(markCopied, markCopied);
        } else {
          // Fallback for browsers without the async clipboard API.
          var textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand("copy");
          } catch (err) {
            /* no-op: clipboard unsupported */
          }
          document.body.removeChild(textarea);
          markCopied();
        }
      });
    });
  }

  /* =======================================================================
     Cursor Interaction
     ======================================================================= */
  function initCursorInteraction() {
    if (prefersReducedMotion) return;

    function updatePointer(x, y) {
      pointerState.x = x;
      pointerState.y = y;
    }

    window.addEventListener(
      "pointermove",
      function (e) {
        updatePointer(e.clientX, e.clientY);
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      function (e) {
        if (e.touches && e.touches[0]) {
          updatePointer(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: true }
    );
  }

  /* =======================================================================
     Accessibility
     ======================================================================= */
  function initAccessibility() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (window.__astraDrawerIsOpen && window.__astraDrawerIsOpen()) {
        window.__astraCloseDrawer();
      }
    });
  }

  /* =======================================================================
     Init
     ======================================================================= */
  function init() {
    initNavigation();
    initMobileMenu();
    initSmoothScrolling();
    initScrollAnimations();
    initCursorInteraction();
    initAIVisualization();
    initDemo();
    initCopyButtons();
    initAccessibility();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
