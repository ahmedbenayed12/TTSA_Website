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
