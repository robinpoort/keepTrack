(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return factory(root);
    });
  } else if (typeof exports === 'object') {
    module.exports = factory(root);
  } else {
    root.KeepTrack = factory(root);
  }
})(typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this, function (window) {

  const defaults = {
    scrollbarWidth: true,
    scrollbarHeight: false,
    debounceTime: 250,
    poll: false,
    detectSticky: false,
    onChange: null
  };

  const valueCache = new WeakMap();
  let configCache = new WeakMap();
  let lastScrollbarWidth;
  let lastScrollbarHeight;
  let lastScrollPaddingTop;

  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        requestAnimationFrame(() => fn.apply(this, args));
      }, delay);
    };
  }

  function getTarget(el, value) {
    if (!value) return false;

    const level = parseInt(value, 10);
    if (!isNaN(level) && level > 0) {
      let node = el;
      for (let i = 0; i < level; i++) {
        if (!node.parentElement) return false;
        node = node.parentElement;
      }
      return node;
    }

    try {
      return el.closest(value) || document.querySelector(value) || false;
    } catch (e) {
      return false;
    }
  }

  function getElementConfig(el) {
    if (configCache.has(el)) return configCache.get(el);

    const raw = el.getAttribute('data-keeptrack');
    const types = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const id = el.id || false;
    const targetValue = el.getAttribute('data-keeptrack-target-parent') || el.getAttribute('data-keeptrack-addparent');
    const target = getTarget(el, targetValue);

    const config = { types, id, target };
    configCache.set(el, config);
    return config;
  }

  function invalidateConfigCache() {
    configCache = new WeakMap();
  }

  function calculateScrollbars(settings) {
    if (settings.scrollbarWidth) {
      const value = `${window.innerWidth - document.documentElement.clientWidth}px`;
      if (value !== lastScrollbarWidth) {
        lastScrollbarWidth = value;
        document.documentElement.style.setProperty('--scrollbar-width', value);
      }
    }
    if (settings.scrollbarHeight) {
      const value = `${window.innerHeight - document.documentElement.clientHeight}px`;
      if (value !== lastScrollbarHeight) {
        lastScrollbarHeight = value;
        document.documentElement.style.setProperty('--scrollbar-height', value);
      }
    }
  }

  function calculateElement(el, settings) {
    const { types, id, target } = getElementConfig(el);
    const computed = window.getComputedStyle(el);

    if (!valueCache.has(el)) valueCache.set(el, {});
    const elCache = valueCache.get(el);

    for (const prop of types) {
      const style = computed.getPropertyValue(prop);
      if (elCache[prop] === style) continue;
      elCache[prop] = style;
      const name = id ? `--${id}-${prop}` : `--${prop}`;
      if (target) {
        target.style.setProperty(name, style);
      } else if (id) {
        document.documentElement.style.setProperty(name, style);
      } else {
        el.style.setProperty(name, style);
      }
      if (settings.onChange) {
        settings.onChange(el, prop, style);
      }
    }
  }

  function calculateScrollPadding(elements) {
    let top = 0;
    let hasAny = false;
    for (const el of elements) {
      if (!el.hasAttribute('data-keeptrack-scroll-padding')) continue;
      hasAny = true;
      top += el.getBoundingClientRect().height;
    }
    if (!hasAny) return;
    const value = `${top}px`;
    if (value !== lastScrollPaddingTop) {
      lastScrollPaddingTop = value;
      document.documentElement.style.setProperty('scroll-padding-top', value);
    }
  }

  function cleanupElement(el) {
    if (configCache.has(el)) {
      const { types, id, target } = configCache.get(el);
      for (const prop of types) {
        const name = id ? `--${id}-${prop}` : `--${prop}`;
        if (target) {
          target.style.removeProperty(name);
        } else if (id) {
          document.documentElement.style.removeProperty(name);
        } else {
          el.style.removeProperty(name);
        }
      }
      if (id) {
        document.documentElement.style.removeProperty(`--${id}-stuck`);
      } else {
        el.style.removeProperty('--stuck');
      }
    }
    el.removeAttribute('data-keeptrack-stuck');
    valueCache.delete(el);
    configCache.delete(el);
  }

  function checkStickyElements(elements, settings) {
    for (const el of elements) {
      const config = getElementConfig(el);
      if (config.isSticky === undefined) {
        config.isSticky = window.getComputedStyle(el).position === 'sticky';
      }
      if (!config.isSticky) continue;

      const rect = el.getBoundingClientRect();
      const stickyTop = parseFloat(window.getComputedStyle(el).top);
      if (isNaN(stickyTop)) continue;

      const stuck = rect.top <= stickyTop + 1;
      const wasStuck = el.hasAttribute('data-keeptrack-stuck');

      if (stuck === wasStuck) continue;

      if (stuck) {
        el.setAttribute('data-keeptrack-stuck', '');
      } else {
        el.removeAttribute('data-keeptrack-stuck');
      }

      const id = el.id;
      const stuckValue = stuck ? '1' : '0';
      if (id) {
        document.documentElement.style.setProperty(`--${id}-stuck`, stuckValue);
      } else {
        el.style.setProperty('--stuck', stuckValue);
      }

      if (settings.onChange) {
        settings.onChange(el, 'stuck', stuck ? '1' : '0');
      }
    }
  }

  return function (options) {
    const publicAPIs = {};
    let settings;
    let resizeHandler;
    let resizeObserver;
    let observer;
    let pollId;
    let scrollHandler;
    let scrollTicking = false;
    let trackedElements = [];

    function refreshElements() {
      trackedElements = Array.from(document.querySelectorAll('[data-keeptrack]'));
      trackedElements.forEach((el) => resizeObserver.observe(el));
    }

    publicAPIs.init = function (opts) {
      publicAPIs.destroy();

      settings = Object.assign({}, defaults, opts || {});

      // Viewport resize → scrollbar dimensions
      resizeHandler = debounce(() => {
        calculateScrollbars(settings);
      }, settings.debounceTime);
      window.addEventListener('resize', resizeHandler);

      // Element resize → recalculate that element
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          calculateElement(entry.target, settings);
        }
        calculateScrollPadding(trackedElements);
      });

      // DOM changes → observe new elements if relevant
      const debouncedMutation = debounce(() => {
        invalidateConfigCache();
        refreshElements();
        trackedElements.forEach((el) => calculateElement(el, settings));
        calculateScrollPadding(trackedElements);
      }, settings.debounceTime);

      observer = new MutationObserver((mutations) => {
        let relevant = false;
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            const el = mutation.target;
            if (mutation.attributeName === 'data-keeptrack') {
              if (el.hasAttribute('data-keeptrack')) {
                // data-keeptrack added or changed → full refresh to start tracking
                relevant = true;
              } else {
                // data-keeptrack removed → clean up and refresh
                cleanupElement(el);
                relevant = true;
              }
            } else if (el.hasAttribute('data-keeptrack')) {
              // Other tracked attribute changed (id, target-parent, etc.)
              invalidateConfigCache();
              calculateElement(el, settings);
              calculateScrollPadding(trackedElements);
            }
            continue;
          }
          // Added/removed tracked elements
          if (!relevant) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1 &&
                (node.matches('[data-keeptrack]') || node.querySelector('[data-keeptrack]'))) {
                relevant = true;
                break;
              }
            }
          }
          if (!relevant) {
            for (const node of mutation.removedNodes) {
              if (node.nodeType === 1 &&
                (node.matches('[data-keeptrack]') || node.querySelector('[data-keeptrack]'))) {
                relevant = true;
                break;
              }
            }
          }
        }
        if (relevant) debouncedMutation();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-keeptrack', 'data-keeptrack-target-parent', 'data-keeptrack-addparent', 'data-keeptrack-scroll-padding', 'id']
      });

      // Sticky detection on scroll
      if (settings.detectSticky) {
        scrollHandler = function () {
          if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(() => {
              checkStickyElements(trackedElements, settings);
              scrollTicking = false;
            });
          }
        };
        window.addEventListener('scroll', scrollHandler, { passive: true });
      }

      // Poll for non-resize computed style changes
      if (settings.poll) {
        (function poll() {
          trackedElements.forEach((el) => calculateElement(el, settings));
          calculateScrollPadding(trackedElements);
          if (settings.detectSticky) {
            checkStickyElements(trackedElements, settings);
          }
          pollId = requestAnimationFrame(poll);
        })();
      }

      // Initial calculation
      calculateScrollbars(settings);
      refreshElements();
      trackedElements.forEach((el) => calculateElement(el, settings));
      calculateScrollPadding(trackedElements);
      if (settings.detectSticky) {
        checkStickyElements(trackedElements, settings);
      }
    };

    publicAPIs.observe = function (el) {
      if (trackedElements.indexOf(el) !== -1) return;
      trackedElements.push(el);
      if (resizeObserver) resizeObserver.observe(el);
      calculateElement(el, settings);
      calculateScrollPadding(trackedElements);
    };

    publicAPIs.unobserve = function (el) {
      const index = trackedElements.indexOf(el);
      if (index === -1) return;
      cleanupElement(el);
      trackedElements.splice(index, 1);
      if (resizeObserver) resizeObserver.unobserve(el);
      calculateScrollPadding(trackedElements);
    };

    publicAPIs.recalculate = function () {
      calculateScrollbars(settings);
      trackedElements.forEach((el) => calculateElement(el, settings));
      calculateScrollPadding(trackedElements);
      if (settings.detectSticky) {
        checkStickyElements(trackedElements, settings);
      }
    };

    publicAPIs.destroy = function () {
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (pollId) {
        cancelAnimationFrame(pollId);
        pollId = null;
      }

      // Clean up CSS variables and attributes
      trackedElements.forEach(cleanupElement);

      if (lastScrollbarWidth) {
        document.documentElement.style.removeProperty('--scrollbar-width');
        lastScrollbarWidth = undefined;
      }
      if (lastScrollbarHeight) {
        document.documentElement.style.removeProperty('--scrollbar-height');
        lastScrollbarHeight = undefined;
      }
      if (lastScrollPaddingTop) {
        document.documentElement.style.removeProperty('scroll-padding-top');
        lastScrollPaddingTop = undefined;
      }

      trackedElements = [];
      scrollTicking = false;
    };

    publicAPIs.init(options);

    return publicAPIs;
  };
});
