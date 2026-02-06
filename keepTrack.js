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
    onChange: null
  };

  const valueCache = new WeakMap();
  let configCache = new WeakMap();
  let lastScrollbarWidth;
  let lastScrollbarHeight;

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

  return function (options) {
    const publicAPIs = {};
    let settings;
    let resizeHandler;
    let resizeObserver;
    let observer;
    let pollId;
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
      });

      // DOM changes → observe new elements if relevant
      const debouncedMutation = debounce(() => {
        invalidateConfigCache();
        refreshElements();
        trackedElements.forEach((el) => calculateElement(el, settings));
      }, settings.debounceTime);

      observer = new MutationObserver((mutations) => {
        let relevant = false;
        for (const mutation of mutations) {
          // Attribute changes on tracked elements
          if (mutation.type === 'attributes' && mutation.target.hasAttribute('data-keeptrack')) {
            invalidateConfigCache();
            calculateElement(mutation.target, settings);
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
        attributeFilter: ['data-keeptrack', 'data-keeptrack-target-parent', 'data-keeptrack-addparent', 'id']
      });

      // Poll for non-resize computed style changes
      if (settings.poll) {
        (function poll() {
          trackedElements.forEach((el) => calculateElement(el, settings));
          pollId = requestAnimationFrame(poll);
        })();
      }

      // Initial calculation
      calculateScrollbars(settings);
      refreshElements();
      trackedElements.forEach((el) => calculateElement(el, settings));
    };

    publicAPIs.observe = function (el) {
      if (trackedElements.indexOf(el) !== -1) return;
      trackedElements.push(el);
      if (resizeObserver) resizeObserver.observe(el);
      calculateElement(el, settings);
    };

    publicAPIs.unobserve = function (el) {
      const index = trackedElements.indexOf(el);
      if (index === -1) return;
      trackedElements.splice(index, 1);
      if (resizeObserver) resizeObserver.unobserve(el);
      valueCache.delete(el);
      configCache.delete(el);
    };

    publicAPIs.recalculate = function () {
      calculateScrollbars(settings);
      trackedElements.forEach((el) => calculateElement(el, settings));
    };

    publicAPIs.destroy = function () {
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
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
      trackedElements = [];
    };

    publicAPIs.init(options);

    return publicAPIs;
  };
});
