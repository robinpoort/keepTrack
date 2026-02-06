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
  const appliedConfig = new WeakMap();
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

  function getStickyContainer(el) {
    let parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
      if (window.getComputedStyle(parent).display !== 'contents') return parent;
      parent = parent.parentElement;
    }
    return document.documentElement;
  }

  function getElementConfig(el) {
    if (configCache.has(el)) return configCache.get(el);

    const raw = el.getAttribute('data-keeptrack');
    if (!raw) return null;
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

  function sameTypes(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function calculateElement(el, settings) {
    const config = getElementConfig(el);
    if (!config || !config.types || config.types.length === 0) {
      if (appliedConfig.has(el)) cleanupElement(el);
      return;
    }
    const { types, id, target } = config;
    const prev = appliedConfig.get(el);
    if (prev && (!sameTypes(prev.types, types) || prev.id !== id || prev.target !== target)) {
      cleanupElement(el, prev);
    }
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
    appliedConfig.set(el, { types, id, target });
  }

  function calculateScrollPadding(elements, settings) {
    let top = 0;
    let hasAny = false;
    for (const el of elements) {
      if (!el.hasAttribute('data-keeptrack-scroll-padding')) continue;
      if (settings && settings.detectSticky) {
        const config = getElementConfig(el);
        if (!config) continue;
        if (config.isSticky === undefined) {
          config.isSticky = window.getComputedStyle(el).position === 'sticky';
        }
        if (config.isSticky && !el.hasAttribute('data-keeptrack-stuck')) continue;
      }
      hasAny = true;
      top += el.getBoundingClientRect().height;
    }
    if (!hasAny) {
      if (lastScrollPaddingTop) {
        document.documentElement.style.removeProperty('scroll-padding-top');
        lastScrollPaddingTop = undefined;
      }
      return;
    }
    const value = `${top}px`;
    if (value !== lastScrollPaddingTop) {
      lastScrollPaddingTop = value;
      document.documentElement.style.setProperty('scroll-padding-top', value);
    }
  }

  function cleanupElement(el, configOverride) {
    const config = configOverride || appliedConfig.get(el) || configCache.get(el);
    if (config) {
      const { types, id, target } = config;
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
    appliedConfig.delete(el);
  }

  function checkStickyElements(elements, settings) {
    for (const el of elements) {
      const config = getElementConfig(el);
      if (!config) continue;
      if (config.isSticky === undefined) {
        config.isSticky = window.getComputedStyle(el).position === 'sticky';
      }
      if (!config.isSticky) continue;

      const rect = el.getBoundingClientRect();
      const stickyTop = parseFloat(window.getComputedStyle(el).top);
      if (isNaN(stickyTop)) continue;

      const stuck = rect.top >= stickyTop - 1 && rect.top <= stickyTop + 1;
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
    let anchorHandler;
    let scrollTicking = false;
    let trackedElements = [];

    function refreshElements() {
      const nextElements = Array.from(document.querySelectorAll('[data-keeptrack]'));
      const nextSet = new Set(nextElements);
      if (resizeObserver) {
        for (const el of trackedElements) {
          if (!nextSet.has(el)) {
            resizeObserver.unobserve(el);
            cleanupElement(el);
          }
        }
        for (const el of nextElements) {
          if (trackedElements.indexOf(el) === -1) {
            resizeObserver.observe(el);
          }
        }
      }
      trackedElements = nextElements;
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
        calculateScrollPadding(trackedElements, settings);
      });

      // DOM changes → observe new elements if relevant
      const debouncedMutation = debounce(() => {
        invalidateConfigCache();
        refreshElements();
        trackedElements.forEach((el) => calculateElement(el, settings));
        calculateScrollPadding(trackedElements, settings);
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
              cleanupElement(el);
              invalidateConfigCache();
              calculateElement(el, settings);
              calculateScrollPadding(trackedElements, settings);
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
              calculateScrollPadding(trackedElements, settings);
              scrollTicking = false;
            });
          }
        };
        window.addEventListener('scroll', scrollHandler, { passive: true });
      }

      // Predict scroll-padding-top on anchor link clicks
      anchorHandler = function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const targetNode = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
        if (!targetNode || !targetNode.closest) return;
        const anchor = targetNode.closest('a[href^="#"]');
        if (!anchor) return;
        const targetId = anchor.getAttribute('href').slice(1);
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;

        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        let top = 0;
        let hasAny = false;

        for (const el of trackedElements) {
          if (!el.hasAttribute('data-keeptrack-scroll-padding')) continue;

          const config = getElementConfig(el);
          if (!config) continue;

          if (config.isSticky === undefined) {
            config.isSticky = window.getComputedStyle(el).position === 'sticky';
          }

          if (!config.isSticky) {
            hasAny = true;
            top += el.getBoundingClientRect().height;
            continue;
          }

          const container = getStickyContainer(el);
          const containerBottom = container.getBoundingClientRect().top + window.scrollY + container.offsetHeight;

          if (targetTop < containerBottom) {
            hasAny = true;
            top += el.getBoundingClientRect().height;
          }
        }

        if (hasAny) {
          const value = `${top}px`;
          lastScrollPaddingTop = value;
          document.documentElement.style.setProperty('scroll-padding-top', value);
        } else if (lastScrollPaddingTop) {
          document.documentElement.style.removeProperty('scroll-padding-top');
          lastScrollPaddingTop = undefined;
        }
      };
      document.addEventListener('click', anchorHandler);

      // Poll for non-resize computed style changes
      if (settings.poll) {
        (function poll() {
          trackedElements.forEach((el) => calculateElement(el, settings));
          if (settings.detectSticky) {
            checkStickyElements(trackedElements, settings);
          }
          calculateScrollPadding(trackedElements, settings);
          pollId = requestAnimationFrame(poll);
        })();
      }

      // Initial calculation
      calculateScrollbars(settings);
      refreshElements();
      trackedElements.forEach((el) => calculateElement(el, settings));
      if (settings.detectSticky) {
        checkStickyElements(trackedElements, settings);
      }
      calculateScrollPadding(trackedElements, settings);
    };

    publicAPIs.observe = function (el) {
      if (trackedElements.indexOf(el) !== -1) return;
      trackedElements.push(el);
      if (resizeObserver) resizeObserver.observe(el);
      calculateElement(el, settings);
      calculateScrollPadding(trackedElements, settings);
    };

    publicAPIs.unobserve = function (el) {
      const index = trackedElements.indexOf(el);
      if (index === -1) return;
      cleanupElement(el);
      trackedElements.splice(index, 1);
      if (resizeObserver) resizeObserver.unobserve(el);
      calculateScrollPadding(trackedElements, settings);
    };

    publicAPIs.recalculate = function () {
      calculateScrollbars(settings);
      trackedElements.forEach((el) => calculateElement(el, settings));
      if (settings.detectSticky) {
        checkStickyElements(trackedElements, settings);
      }
      calculateScrollPadding(trackedElements, settings);
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
      if (anchorHandler) {
        document.removeEventListener('click', anchorHandler);
        anchorHandler = null;
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
