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

    items.forEach(function (el) { observer.observe(el); });
  }

  /* --------------------------------------------------------- form logic -- */
  // Validates, then shows a local confirmation. No data is transmitted: the
  // site is static and there is no backend form handler configured yet, so
  // pretending to send would be worse than saying so.
  function initForms() {
    document.querySelectorAll("[data-enquiry-form]").forEach(function (form) {
      var status = form.querySelector("[data-form-status]");

      function setError(field, message) {
        var input = field.querySelector("input, select, textarea");
        var box = field.querySelector(".error");
        if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
        if (box) box.textContent = message || "";
      }

      function clearAll() {
        form.querySelectorAll(".field").forEach(function (field) { setError(field, ""); });
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        clearAll();
        if (status) status.removeAttribute("data-state");

        var ok = true;
        var firstInvalid = null;

        form.querySelectorAll(".field").forEach(function (field) {
          var input = field.querySelector("input, select, textarea");
          if (!input || !input.required) return;

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

        if (!ok) {
          if (status) {
            status.setAttribute("data-state", "error");
            status.textContent = "Please correct the highlighted fields and try again.";
          }
          if (firstInvalid) firstInvalid.focus();
          return;
        }

        form.reset();
        if (status) {
          status.setAttribute("data-state", "success");
          status.textContent =
            "Thank you — your enquiry is ready to send. Connect a form handler " +
            "(or email us directly at hello@coopvest.africa) to receive it.";
        }
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
    initForms();
  });
})();
