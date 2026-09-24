/* ==========================================================================
   Coopvest Africa — shared site behaviour
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

  /* --------------------------------------------------------- form logic -- */
  // Validates client-side, then posts to /api/contact, which emails the enquiry.
  // Client validation is for fast feedback only — the endpoint validates again.
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

          // Skip the honeypot — it is intentionally empty and hidden.
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
              showStatus("success", "Thank you — your message has been sent. We will respond shortly.");
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
    initForms();
  });
})();
