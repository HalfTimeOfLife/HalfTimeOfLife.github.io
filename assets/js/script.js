// JS minimal mais complet : scroll indicator, reveal on scroll, mobile nav toggle, fermeture menu on link click
document.addEventListener('DOMContentLoaded', () => {
  // Scroll indicator
  const indicator = document.querySelector('.scroll-indicator');
  const updateIndicator = () => {
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const pct = height ? (scrollTop / height) * 100 : 0;
    if (indicator) indicator.style.width = pct + '%';
  };
  updateIndicator();
  window.addEventListener('scroll', updateIndicator, { passive: true });
  window.addEventListener('resize', updateIndicator);

  // Reveal elements
  const reveals = document.querySelectorAll('.reveal');
  const obsOptions = { threshold: 0.08, rootMargin: '0px 0px -30px 0px' };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        // optional: unobserve to improve perf
        observer.unobserve(entry.target);
      }
    });
  }, obsOptions);
  reveals.forEach(el => observer.observe(el));

  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const body = document.body;
  const navLinks = document.querySelectorAll('.nav-links a');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      body.classList.toggle('nav-open');
    });
  }

  // close mobile menu when clicking a link
  navLinks.forEach(a => {
    a.addEventListener('click', () => {
      body.classList.remove('nav-open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // form handler fallback (if any form is added later)
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Merci pour votre message ! Je vous rÃ©pondrai bientÃ´t.');
      form.reset();
    });
  }
});


// Translation
let translations = {};
let currentLang = localStorage.getItem('preferredLanguage') || 'fr';

fetch('translations.json')
  .then(response => response.json())
  .then(data => {
    translations = data;
    applyTranslations(currentLang);
    updateLanguageSelector(currentLang);
  })
  .catch(error => console.error('Erreur de chargement des traductions:', error));

function applyTranslations(lang) {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const keys = key.split('.');
    let translation = translations[lang];
    
    for (const k of keys) {
      translation = translation?.[k];
    }
    
    if (translation) {
      element.textContent = translation;
    }
  });
  
  document.documentElement.lang = lang;
}

function switchLanguage(newLang) {
  currentLang = newLang;
  localStorage.setItem('preferredLanguage', newLang);
  applyTranslations(newLang);
  updateLanguageSelector(newLang);
}

function updateLanguageSelector(lang) {
  const currentLangBtn = document.querySelector('.current-lang');
  const langOptions = document.querySelectorAll('.lang-option');
  
  if (currentLangBtn) {
    currentLangBtn.textContent = lang.toUpperCase();
  }
  
  langOptions.forEach(option => {
    if (option.getAttribute('data-lang') === lang) {
      option.classList.add('active');
    } else {
      option.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const currentLangBtn = document.querySelector('.current-lang');
  const langDropdown = document.querySelector('.lang-dropdown');
  const langOptions = document.querySelectorAll('.lang-option');
  
  if (currentLangBtn) {
    currentLangBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle('show');
    });
  }
  
  langOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedLang = option.getAttribute('data-lang');
      switchLanguage(selectedLang);
      langDropdown.classList.remove('show');
    });
  });
  
  document.addEventListener('click', () => {
    if (langDropdown) {
      langDropdown.classList.remove('show');
    }
  });
});