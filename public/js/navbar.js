// TTSA Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  // Ensure backdrop exists
  let backdrop = document.querySelector('.navbar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'navbar-backdrop';
    document.body.appendChild(backdrop);
  }

  function openNav() {
    toggle.classList.add('active');
    toggle.setAttribute('aria-expanded', 'true');
    links.classList.add('active');
    backdrop.classList.add('active');
    document.body.classList.add('nav-open');
  }

  function closeNav() {
    toggle.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    links.classList.remove('active');
    backdrop.classList.remove('active');
    document.body.classList.remove('nav-open');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (links.classList.contains('active')) {
      closeNav();
    } else {
      openNav();
    }
  });

  backdrop.addEventListener('click', closeNav);

  // Close when clicking any link inside menu
  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        closeNav();
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('active')) {
      closeNav();
    }
  });

  // Auto-close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 991 && links.classList.contains('active')) {
      closeNav();
    }
  });
});

// ─── TTSA Page Loader Handler (afraid-horse-51 animation) ────────────────────
(function initPageLoader() {
  function dismissLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader && !loader.classList.contains('fade-out')) {
      loader.classList.add('fade-out');
      setTimeout(() => {
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
      }, 450);
    }
  }

  // Dismiss on window load with slight delay for silky visual presentation
  if (document.readyState === 'complete') {
    setTimeout(dismissLoader, 350);
  } else {
    window.addEventListener('load', () => {
      setTimeout(dismissLoader, 350);
    });
    // Safety fallback: dismiss after 3s max
    setTimeout(dismissLoader, 3000);
  }

  // Intercept internal page navigations for seamless transition loader
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || !link.href) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;

    try {
      const url = new URL(link.href, window.location.origin);
      if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
        let loader = document.getElementById('pageLoader');
        if (!loader) {
          loader = document.createElement('div');
          loader.id = 'pageLoader';
          loader.className = 'page-loader-overlay fade-out';
          loader.innerHTML = '<div class="page-loader-spinner"></div>';
          document.body.appendChild(loader);
          requestAnimationFrame(() => loader.classList.remove('fade-out'));
        }
      }
    } catch (_) {}
  });
})();

