/* ==========================================================================
   Coopvest Africa - shared site behaviour
   Progressive enhancement only: every page works without JavaScript.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------- mobile navigation */
  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.querySelector("[data-nav]");
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.setAttribute("data-open", String(open));
      toggle.setAttribute("aria-expanded", String(open));
    }

    setOpen(false);

    toggle.addEventListener("click", function () {
      setOpen(nav.getAttribute("data-open") !== "true");
    });

    // Close on outside click, on Escape, and after following an in-page link.
    document.addEventListener("click", function (event) {
      if (nav.getAttribute("data-open") !== "true") return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });
  }

  /* -------------------------------------------------- active nav highlight */
  function initActiveLink() {
    var here = location.pathname.replace(/index\.html$/, "");
    if (here === "" ) here = "/";

    document.querySelectorAll("[data-nav] a[href]").forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href || href.charAt(0) === "#") return;
      var target = href.replace(/index\.html$/, "");
      if (target === here) link.setAttribute("aria-current", "page");
    });
  }

  /* ------------------------------------------------------- current year -- */
  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------------------ scroll reveal -- */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    // Stagger siblings so a row of cards arrives in sequence rather than as one
    // block. The delay is capped: past the fourth item the eye has already read
    // the row, and a long cascade just feels slow.
    items.forEach(function (el) {
      var parent = el.parentElement;
      var index = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
      el.style.setProperty("--reveal-delay", Math.min(index, 3) * 90 + "ms");
      observer.observe(el);
    });
  }

  /* ------------------------------------------------- count-up statistics -- */
  // Elements marked `data-count` animate from zero to their target once, when
  // scrolled into view. The final value is written to the element's text, and
  // `data-count-prefix` / `data-count-suffix` wrap it (currency, percent, +).
  function initCounters() {
    var items = document.querySelectorAll("[data-count]");
    if (!items.length) return;

    function render(el, value) {
      var target = Number(el.getAttribute("data-count"));
      var decimals = (el.getAttribute("data-count-decimals") || "0") | 0;
      var prefix = el.getAttribute("data-count-prefix") || "";
      var suffix = el.getAttribute("data-count-suffix") || "";
      el.textContent = prefix + value.toLocaleString("en-NG", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + suffix;
      return target;
    }

    function animate(el) {
      var target = Number(el.getAttribute("data-count"));
      if (isNaN(target)) return;
      var duration = 1400;
      var start = null;

      function step(now) {
        if (start === null) start = now;
        var p = Math.min((now - start) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        render(el, target * eased);
        if (p < 1) requestAnimationFrame(step);
        else render(el, target);
      }
      requestAnimationFrame(step);
    }

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { render(el, Number(el.getAttribute("data-count"))); });
      return;
    }

    items.forEach(function (el) { render(el, 0); });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* -------------------------------------------------- scroll affordances -- */
  // Three things that depend on scroll position: the header compacts, the
  // reading-progress bar fills, and the back-to-top control appears. They share
  // one rAF-throttled listener rather than three, and the work is skipped
  // entirely when the reader prefers reduced motion (the header still compacts,
  // because that is a layout change rather than animation).
  function initScrollAffordances() {
    var header = document.querySelector(".site-header");
    var progress = document.querySelector("[data-scroll-progress]");
    var toTop = document.querySelector("[data-to-top]");

    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || document.documentElement.scrollTop;
      var doc = document.documentElement;

      if (header) header.setAttribute("data-scrolled", String(y > 8));

      if (progress) {
        var scrollable = doc.scrollHeight - window.innerHeight;
        var ratio = scrollable > 0 ? Math.min(y / scrollable, 1) : 0;
        progress.style.transform = "scaleX(" + ratio + ")";
      }

      if (toTop) {
        var show = y > window.innerHeight * 1.5;
        toTop.setAttribute("data-visible", String(show));
        // Keep it out of the tab order until it is actually shown.
        toTop.setAttribute("tabindex", show ? "0" : "-1");
        toTop.setAttribute("aria-hidden", String(!show));
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    if (toTop) {
      toTop.addEventListener("click", function () {
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      });
    }
  }

  /* --------------------------------------------------------- form logic -- */
  // Validates client-side, then posts to /api/contact, which records the
  // enquiry so an admin can answer it from the dashboard.
  // Client validation is for fast feedback only - the endpoint validates again.
  function initForms() {
    document.querySelectorAll("[data-enquiry-form]").forEach(function (form) {
      var status = form.querySelector("[data-form-status]");
      var submit = form.querySelector('button[type="submit"]');
      var submitLabel = submit ? submit.textContent : "";

      function setError(field, message) {
        var input = field.querySelector("input, select, textarea");
        var box = field.querySelector(".error");
        if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
        if (box) box.textContent = message || "";
      }

      function clearAll() {
        form.querySelectorAll(".field").forEach(function (field) { setError(field, ""); });
      }

      function showStatus(state, message) {
        if (!status) return;
        status.setAttribute("data-state", state);
        status.textContent = message;
      }

      function validate() {
        var ok = true;
        var firstInvalid = null;

        form.querySelectorAll(".field").forEach(function (field) {
          var input = field.querySelector("input, select, textarea");
          if (!input || !input.required) return;

          // Skip the honeypot - it is intentionally empty and hidden.
          if (input.name === "website") return;

          var value = (input.value || "").trim();
          var message = "";

          if (!value) {
            message = "This field is required.";
          } else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            message = "Enter a valid email address.";
          } else if (input.type === "tel" && !/^[+()\d\s-]{7,20}$/.test(value)) {
            message = "Enter a valid phone number.";
          } else if (input.tagName === "TEXTAREA" && value.length < 10) {
            message = "Please add a little more detail.";
          }

          if (message) {
            ok = false;
            setError(field, message);
            if (!firstInvalid) firstInvalid = input;
          }
        });

        return { ok: ok, firstInvalid: firstInvalid };
      }

      // Surface per-field errors returned by the endpoint.
      function applyServerErrors(errors) {
        Object.keys(errors || {}).forEach(function (name) {
          var input = form.querySelector('[name="' + name + '"]');
          if (input) setError(input.closest(".field"), errors[name]);
        });
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        clearAll();
        if (status) status.removeAttribute("data-state");

        var result = validate();
        if (!result.ok) {
          showStatus("error", "Please correct the highlighted fields and try again.");
          if (result.firstInvalid) result.firstInvalid.focus();
          return;
        }

        var payload = {};
        new FormData(form).forEach(function (value, key) {
          payload[key] = value;
        });

        if (submit) {
          submit.disabled = true;
          submit.textContent = "Sending…";
        }

        fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
              return { ok: response.ok, data: data };
            });
          })
          .then(function (outcome) {
            if (outcome.ok) {
              form.reset();
              showStatus("success", "Thank you, your message has been sent. We will respond shortly.");
              return;
            }

            if (outcome.data.error === "validation_failed") {
              applyServerErrors(outcome.data.errors);
              showStatus("error", "Please correct the highlighted fields and try again.");
              return;
            }

            showStatus(
              "error",
              outcome.data.message ||
                "We could not send your message. Please email coopvestafrica@gmail.com directly."
            );
          })
          .catch(function () {
            showStatus(
              "error",
              "We could not reach the server. Please email coopvestafrica@gmail.com directly."
            );
          })
          .finally(function () {
            if (submit) {
              submit.disabled = false;
              submit.textContent = submitLabel;
            }
          });
      });
    });
  }

  /* ------------------------------------------------------ hero glass sheen --
   The hero panel is a liquid-glass surface. The refraction and edge highlight
   are pure CSS; this only moves the specular highlight to follow the pointer.
   It is a light-direction cue, not information, so it is skipped entirely for
   readers who prefer reduced motion and on coarse pointers, where there is no
   hover to follow and the highlight would just sit at its CSS default. */
  function initGlassSheen() {
    var panel = document.querySelector(".hero__panel");
    if (!panel) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var frame = null;
    panel.addEventListener("pointermove", function (event) {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = null;
        var box = panel.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var x = ((event.clientX - box.left) / box.width) * 100;
        var y = ((event.clientY - box.top) / box.height) * 100;
        panel.style.setProperty("--glass-x", x.toFixed(1) + "%");
        panel.style.setProperty("--glass-y", y.toFixed(1) + "%");
      });
    });

    panel.addEventListener("pointerleave", function () {
      panel.style.removeProperty("--glass-x");
      panel.style.removeProperty("--glass-y");
    });
  }

  /* ---------------------------------------------------- release metadata --
   The download page ships the current version and SHA-256 digest as static
   text, so it is correct without JavaScript and never blank. This refreshes
   those values from the release the download button resolves to, so the page
   does not drift as new builds are published. A failure leaves the static
   fallback in place rather than emptying the fields. */
  function initReleaseInfo() {
    var sha = document.querySelector('[data-release-field="sha256"]');
    if (!sha || !window.fetch) return;

    window.fetch("/api/release-info", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("release info " + response.status);
        return response.json();
      })
      .then(function (info) {
        if (!info) return;
        if (info.sha256) sha.textContent = info.sha256;
        if (info.version) {
          var v = document.querySelector('[data-release-field="version"]');
          if (v) v.textContent = info.version;
        }
        if (info.size) {
          var s = document.querySelector('[data-release-field="size"]');
          if (s) s.textContent = "about " + info.size;
        }
        var link = document.querySelector('[data-release-field="releaseUrl"]');
        if (link && info.releaseUrl) link.href = info.releaseUrl;
      })
      .catch(function () { /* keep the static fallback */ });
  }

  /* ------------------------------------------------------ loan calculator */
  // Flat interest, matching the worked examples on /loan-products/ exactly:
  // total = amount + (amount x rate); monthly = total / tenure.
  var LOAN_PRODUCTS = {
    quick:    { name: "Quick Loan",             rate: 0.075, months: 4,  multiple: 3 },
    flexi:    { name: "Flexi Loan",             rate: 0.07,  months: 6,  multiple: 3 },
    stable12: { name: "Stable Loan (12 months)", rate: 0.05, months: 12, multiple: 3 },
    stable18: { name: "Stable Loan (18 months)", rate: 0.07, months: 18, multiple: 3 },
    premium:  { name: "Premium Loan",           rate: 0.14,  months: 24, multiple: 4 },
    maxi:     { name: "Maxi Loan",              rate: 0.19,  months: 36, multiple: 5 }
  };
  var LOAN_MIN = 1000;

  function naira(value) {
    var rounded = Math.round(value);
    return "\u20a6" + rounded.toLocaleString("en-NG");
  }

  function initLoanCalculator() {
    var root = document.querySelector("[data-calc]");
    if (!root) return;

    var savingsInput = root.querySelector("[data-calc-savings]");
    var savingsRange = root.querySelector("[data-calc-savings-range]");
    var field = {
      amount: root.querySelector("[data-calc-amount]"),
      productName: root.querySelector("[data-calc-product-name]"),
      savingsOut: root.querySelector("[data-calc-savings-out]"),
      limit: root.querySelector("[data-calc-limit]"),
      interest: root.querySelector("[data-calc-interest]"),
      total: root.querySelector("[data-calc-total]"),
      monthly: root.querySelector("[data-calc-monthly]")
    };
    var chips = Array.prototype.slice.call(root.querySelectorAll("[data-calc-product]"));
    var current = "stable12";

    function readSavings() {
      var value = parseInt(savingsInput.value, 10);
      if (isNaN(value) || value < 0) value = 0;
      return value;
    }

    function render() {
      var product = LOAN_PRODUCTS[current];
      var savings = readSavings();
      var limit = savings * product.multiple;
      var borrowable = limit >= LOAN_MIN;
      var amount = borrowable ? limit : 0;
      var interest = amount * product.rate;
      var total = amount + interest;
      var monthly = product.months ? total / product.months : 0;

      if (savingsInput.value !== String(savings)) savingsInput.value = String(savings);
      if (savingsRange) savingsRange.value = String(Math.min(savings, parseInt(savingsRange.max, 10) || savings));

      field.savingsOut.textContent = naira(savings);
      field.productName.textContent =
        product.name + " \u00b7 " + (product.rate * 100).toFixed(1) + "% flat \u00b7 " +
        product.months + " months";

      if (!borrowable) {
        field.amount.textContent = "Below the \u20a6" + LOAN_MIN.toLocaleString("en-NG") + " minimum";
        field.limit.textContent = naira(limit) + " (" + product.multiple + "\u00d7 savings)";
        field.interest.textContent = "\u2014";
        field.total.textContent = "\u2014";
        field.monthly.textContent = "\u2014";
        return;
      }

      field.amount.textContent = naira(amount);
      field.limit.textContent = naira(limit) + " (" + product.multiple + "\u00d7 savings)";
      field.interest.textContent = naira(interest) + " (" + (product.rate * 100).toFixed(1) + "% flat)";
      field.total.textContent = naira(total);
      field.monthly.textContent = naira(monthly) + " over " + product.months + " months";
    }

    function select(product) {
      if (!LOAN_PRODUCTS[product]) return;
      current = product;
      chips.forEach(function (chip) {
        chip.setAttribute("aria-pressed", String(chip.getAttribute("data-calc-product") === product));
      });
      render();
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        select(chip.getAttribute("data-calc-product"));
      });
    });

    savingsInput.addEventListener("input", render);
    if (savingsRange) {
      savingsRange.addEventListener("input", function () {
        savingsInput.value = savingsRange.value;
        render();
      });
    }

    select(current);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    initNav();
    initActiveLink();
    initYear();
    initReveal();
    initCounters();
    initScrollAffordances();
    initGlassSheen();
    initForms();
    initReleaseInfo();
    initLoanCalculator();
  });
})();
