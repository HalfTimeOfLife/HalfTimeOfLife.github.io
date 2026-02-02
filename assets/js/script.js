// ============================================
// TRANSLATIONS
// ============================================
const translations = {
  fr: {
    nav_home: "Accueil",
    nav_about: "À propos",
    nav_projects: "Projets",
    nav_publications: "Publications",
    nav_menu_label: "Ouvrir le menu",

    hero_tagline: "Cybersécurité • Rétro-ingénierie • Analyse de malwares",
    
    who_title: "Qui suis-je ?",
    who_text: "Passionné de cybersécurité et titulaire d'un master en cryptologie et sécurité informatique. Je me spécialise dans l'analyse de malwares, la rétro-ingénierie de binaires Windows et Linux, et le développement d'outils d'automatisation pour faciliter l'analyse.",
    
    projects_title: "Projets",
    project_panoptiv_desc: "DLL et techniques de hooking pour contourner des protections anti-VM.",
    project_wine_desc: "Analyse du malware WINE d'APT29 et PoC.",
    project_malauto_desc: "Extension WinDbg pour préparer breakpoints et dumper régions mémoire automatiquement.",
    view_github: "Voir sur GitHub →",
    all_projects: "Tous les projets",
    
    pubs_title: "Publications & mémoires",
    pub_master_title: "Mémoire de Master – Détection de protections Anti-VM utilisées par les malwares",
    pub_master_desc: "Recherche approfondie sur les techniques anti-émulation.",
    pub_antiem_title: "Techniques anti-émulation sur Windows",
    pub_antiem_desc: "Article expliquant les techniques de détection d'émulation utilisées par les malwares sur Windows.",
    pub_rootkit_title: "Linux Kernel Rootkit en 2025",
    pub_rootkit_desc: "Étude approfondie des rootkits Linux à travers l'exemple de KoviD.",
    download_fr: "Télécharger (FR)→",
    download_en: "Télécharger (EN)→",
    all_publications: "Toutes les publications",
    
    contact_title: "Contact",
    contact_email: "Email",
    contact_networks: "Réseaux",
    
    about_title: "À propos",
    about_lead: "Diplômé d'un master en cryptologie et sécurité informatique – rétro-ingénierie & analyse de malwares.",
    
    skills_title: "Compétences techniques",
    skill_languages: "Langages",
    skill_languages_list: "Python, C, Assembleur x86/x64, LaTeX",
    skill_systems: "Systèmes",
    skill_systems_list: "Linux, Windows",
    skill_static: "Analyse Statique",
    skill_static_list: "Ghidra, Binary Ninja",
    skill_dynamic: "Analyse Dynamique",
    skill_dynamic_list: "GDB, WinDbg, Reven TTD",
    skill_virtual: "Virtualisation",
    skill_virtual_list: "QEMU, VMware, VirtualBox",
    skill_pentest: "Pentest",
    skill_pentest_list: "Nmap, Burp Suite, Wireshark, Metasploit",
    
    experience_title: "Expérience",
    exp_eshard_title: "Stage en reverse engineering",
    exp_eshard_company: "eShard",
    exp_eshard_location: "Pessac, France",
    exp_eshard_period: "Mars 2025 - Août 2025",
    exp_eshard_desc: "Implémentation, détection et contournement de techniques anti-émulation pour Windows. Travail sur le Time Travel Debugging (TTD) Reven en émulation système complète.",
    exp_eshard_item1: "Implémentation de détection de virtualisation (assembleur INTEL x86, C)",
    exp_eshard_item2: "Implémentation d'une pipeline de génération de binaire contenant des anti-VM",
    exp_eshard_item3: "Reverse engineering de techniques anti-émulation",
    exp_eshard_item4: "Automatisation de la détection d'anti-émulation avec du scripting en TTD",
    exp_eshard_item5: "Contournement via patching d'API Windows et configuration QEMU",
    exp_eshard_item6: "Création de contenu de vulgarisation (YouTube, blog)",
    exp_eshard_item7: "Documentation avec Jupyter Notebook",
    
    education_title: "Formation",
    edu_master_title: "Master Cryptologie & Sécurité Informatique",
    edu_master_school: "Université de Bordeaux",
    edu_master_period: "2023–2025",
    edu_license_title: "Licence Mathématiques & Informatique",
    edu_license_school: "Université de Bordeaux",
    edu_license_period: "2020–2023",
    
    ctf_title: "CTF",
    
    projects_page_title: "Projets",
    projects_lead: "Travaux, outils et analyses publiées.",
    
    project_panoptiv_title: "Panoptiv",
    project_panoptiv_full_desc: "DLL utilisant des techniques de hooking pour contourner des protections anti-vm.",
    
    project_wine_title: "Analyse du malware WINE",
    project_wine_full_desc: "Une analyse du malware WINE (associé au groupe APT29) en 2025, incluant une preuve de concept.",
    
    project_malauto_title: "Malauto",
    project_malauto_full_desc: "Extension WinDbg pour l'analyse automatisée de malwares Windows. Prépare automatiquement des breakpoints, dumpe les régions mémoire dépaquetées au format PE et génère des rapports d'analyse structurés.",
    
    publications_title: "Publications",
    publications_lead: "Mémoires, articles et ressources publiques.",
    
    pub_master_full_desc: "Recherche approfondie sur les techniques anti-émulation et leur contournement dans le contexte du Time Travel Debugging (TTD) en émulation système complète.",
    
    pub_antiem_full_desc: "Article de vulgarisation expliquant les principales techniques de détection d'émulation utilisées par les malwares Windows, ainsi que des stratégies de contournement.",
    pub_antiem_link: "Lire l'article →",
    
    pub_intro_title: "Introduction aux protections anti-vm",
    pub_intro_desc: "Série de vidéos pédagogiques présentant les mécanismes de détection de virtualisation et leurs implications dans l'analyse de malwares.",
    pub_intro_link: "Voir la playlist →",
    
    pub_rootkit_full_desc: "Étude de l'état des rootkits Linux en 2025 à travers l'exemple du rootkit KoviD. Analyse des techniques de furtivité, de persistance et de contournement des mécanismes de sécurité du noyau.",
    pub_rootkit_ref: "Ce mémoire est également référencé dans le",
    pub_rootkit_ref_link: "Projet d'Étude et de Recherche (PER-Master2) 2025",
    pub_rootkit_ref_end: "du Master Cryptologie & Sécurité Informatique de l'Université de Bordeaux.",
    
    pub_pir_title: "Protocole d'interrogation anonyme de base de données",
    pub_pir_desc: "Implémentation d'un protocole PIR (Private Information Retrieval) en C, basé sur le chiffrement homomorphe de Paillier pour permettre l'interrogation anonyme de bases de données.",
    
    footer_social: "Social",
    footer_rights: "All rights reserved.",
    
    badge_memoir: "Mémoire",
    badge_article: "Article",
    badge_pdf: "PDF",
    badge_youtube: "Playlist YouTube",
  },
  
  en: {
    nav_home: "Home",
    nav_about: "About",
    nav_projects: "Projects",
    nav_publications: "Publications",
    nav_menu_label: "Open menu",

    hero_tagline: "Cybersecurity • Reverse Engineering • Malware Analysis",
    
    who_title: "Who am I?",
    who_text: "Cybersecurity enthusiast with a master's degree in cryptology and information security. I specialize in malware analysis, reverse engineering of Windows and Linux binaries, and developing automation tools to facilitate analysis.",
    
    projects_title: "Projects",
    project_panoptiv_desc: "DLL and hooking techniques to bypass anti-VM protections.",
    project_wine_desc: "Analysis of APT29's WINE malware and PoC.",
    project_malauto_desc: "WinDbg extension to prepare breakpoints and automatically dump memory regions.",
    view_github: "View on GitHub →",
    all_projects: "All projects",
    
    pubs_title: "Publications & Theses",
    pub_master_title: "Master's Thesis – Detection of Anti-VM Protections Used by Malware",
    pub_master_desc: "In-depth research on anti-emulation techniques.",
    pub_antiem_title: "Anti-emulation Techniques on Windows",
    pub_antiem_desc: "Article explaining emulation detection techniques used by Windows malware.",
    pub_rootkit_title: "Linux Kernel Rootkit in 2025",
    pub_rootkit_desc: "In-depth study of Linux rootkits through the KoviD example.",
    download_fr: "Donwload (FR) →",
    download_en: "Download (EN) →",
    all_publications: "All publications",
    
    contact_title: "Contact",
    contact_email: "Email",
    contact_networks: "Networks",
    
    about_title: "About",
    about_lead: "Master's degree in cryptology and information security – reverse engineering & malware analysis.",
    
    skills_title: "Technical Skills",
    skill_languages: "Languages",
    skill_languages_list: "Python, C, x86/x64 Assembly, LaTeX",
    skill_systems: "Systems",
    skill_systems_list: "Linux, Windows",
    skill_static: "Static Analysis",
    skill_static_list: "Ghidra, Binary Ninja",
    skill_dynamic: "Dynamic Analysis",
    skill_dynamic_list: "GDB, WinDbg, Reven TTD",
    skill_virtual: "Virtualization",
    skill_virtual_list: "QEMU, VMware, VirtualBox",
    skill_pentest: "Pentest",
    skill_pentest_list: "Nmap, Burp Suite, Wireshark, Metasploit",
    
    experience_title: "Experience",
    exp_eshard_title: "Reverse Engineering Internship",
    exp_eshard_company: "eShard",
    exp_eshard_location: "Pessac, France",
    exp_eshard_period: "March 2025 - August 2025",
    exp_eshard_desc: "Implementation, detection, and bypass of anti-emulation techniques for Windows. Work on Time Travel Debugging (TTD) Reven in full system emulation.",
    exp_eshard_item1: "Implementation of virtualization detection (INTEL x86 assembly, C)",
    exp_eshard_item2: "Implementation of a binary generation pipeline containing anti-VM techniques",
    exp_eshard_item3: "Reverse engineering of anti-emulation techniques",
    exp_eshard_item4: "Automation of anti-emulation detection with TTD scripting",
    exp_eshard_item5: "Bypass via Windows API patching and QEMU configuration",
    exp_eshard_item6: "Creation of educational content (YouTube, blog)",
    exp_eshard_item7: "Documentation with Jupyter Notebook",
    
    education_title: "Education",
    edu_master_title: "Master in Cryptology & Information Security",
    edu_master_school: "University of Bordeaux",
    edu_master_period: "2023–2025",
    edu_license_title: "Bachelor's in Mathematics & Computer Science",
    edu_license_school: "University of Bordeaux",
    edu_license_period: "2020–2023",
    
    ctf_title: "CTF",
    
    projects_page_title: "Projects",
    projects_lead: "Work, tools, and published analyses.",
    
    project_panoptiv_title: "Panoptiv",
    project_panoptiv_full_desc: "DLL using hooking techniques to bypass anti-VM protections.",
    
    project_wine_title: "WINE Malware Analysis",
    project_wine_full_desc: "An analysis of the WINE malware (associated with APT29 group) in 2025, including a proof of concept.",
    
    project_malauto_title: "Malauto",
    project_malauto_full_desc: "WinDbg extension for automated Windows malware analysis. Automatically sets breakpoints, dumps unpacked memory regions in PE format, and generates structured analysis reports.",
    
    publications_title: "Publications",
    publications_lead: "Theses, articles, and public resources.",
    
    pub_master_full_desc: "In-depth research on anti-emulation techniques and their bypass in the context of Time Travel Debugging (TTD) in full system emulation.",
    pub_master_link: "Download →",
    
    pub_antiem_full_desc: "Educational article explaining the main emulation detection techniques used by Windows malware, as well as bypass strategies.",
    pub_antiem_link: "Read article →",
    
    pub_intro_title: "Introduction to Anti-VM Protections",
    pub_intro_desc: "Series of educational videos presenting virtualization detection mechanisms and their implications in malware analysis.",
    pub_intro_link: "View playlist →",
    
    pub_rootkit_full_desc: "Study of the state of Linux rootkits in 2025 through the KoviD rootkit example. Analysis of stealth techniques, persistence, and bypass of kernel security mechanisms.",
    pub_rootkit_ref: "This thesis is also referenced in the",
    pub_rootkit_ref_link: "Research and Study Project (PER-Master2) 2025",
    pub_rootkit_ref_end: "of the Master in Cryptology & Information Security at the University of Bordeaux.",
    
    pub_pir_title: "Anonymous Database Query Protocol",
    pub_pir_desc: "Implementation of a PIR (Private Information Retrieval) protocol in C, based on Paillier homomorphic encryption to enable anonymous database queries.",
    
    footer_social: "Social",
    footer_rights: "All rights reserved.",
    
    badge_memoir: "Thesis",
    badge_article: "Article",
    badge_pdf: "PDF",
    badge_youtube: "YouTube Playlist",
  }
};

// ============================================
// INTERNATIONALIZATION
// ============================================
function getTranslation(lang, key) {
  if (!lang || typeof lang !== 'string') return undefined;
  if (translations[lang] && translations[lang].hasOwnProperty(key)) {
    return translations[lang][key];
  }
  if (translations['fr'] && translations['fr'].hasOwnProperty(key)) {
    return translations['fr'][key];
  }
  return undefined;
}

let currentLang = (() => {
  try {
    const stored = localStorage.getItem('lang');
    if (stored) return stored.split('-')[0];
  } catch (e) {
    console.warn('localStorage inaccessible:', e);
  }
  return 'fr';
})();

function setLanguage(lang) {
  try {
    if (typeof lang !== 'string') lang = 'fr';
    lang = lang.split('-')[0];

    if (!translations[lang]) {
      console.warn(`Langue inconnue "${lang}", fallback sur "fr".`);
      lang = 'fr';
    }

    currentLang = lang;

    try {
      localStorage.setItem('lang', lang);
    } catch (e) {
      console.warn('Impossible d\'écrire dans localStorage', e);
    }

    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(element => {
      try {
        const key = element.getAttribute('data-i18n');
        const t = getTranslation(lang, key);
        if (typeof t !== 'undefined') {
          element.textContent = t;
        }
      } catch (e) {
        console.error('Erreur lors de la mise à jour [data-i18n]:', e, element);
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      try {
        const key = element.getAttribute('data-i18n-placeholder');
        const t = getTranslation(lang, key);
        if (typeof t !== 'undefined') element.placeholder = t;
      } catch (e) {
        console.error('Erreur placeholder:', e, element);
      }
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(element => {
      try {
        const key = element.getAttribute('data-i18n-aria');
        const t = getTranslation(lang, key);
        if (typeof t !== 'undefined') element.setAttribute('aria-label', t);
      } catch (e) {
        console.error('Erreur aria:', e, element);
      }
    });

    updateLanguageButtons();

    console.info(`Langue appliquée : ${lang}`);
  } catch (e) {
    console.error('Erreur setLanguage():', e);
  }
}

function updateLanguageButtons() {
  const frBtn = document.getElementById('lang-fr');
  const enBtn = document.getElementById('lang-en');

  if (frBtn && enBtn) {
    frBtn.classList.toggle('active', currentLang === 'fr');
    frBtn.setAttribute('aria-pressed', currentLang === 'fr' ? 'true' : 'false');

    enBtn.classList.toggle('active', currentLang === 'en');
    enBtn.setAttribute('aria-pressed', currentLang === 'en' ? 'true' : 'false');
  }
}

// ============================================
// REVEAL ANIMATIONS
// ============================================
function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length === 0) return;
  
  // Fonction pour vérifier et afficher les éléments visibles
  const checkVisibility = () => {
    reveals.forEach(el => {
      if (!el.classList.contains('is-visible')) {
        const rect = el.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // Si l'élément est visible dans le viewport
        if (rect.top < windowHeight * 0.85 && rect.bottom > 0) {
          el.classList.add('is-visible');
        }
      }
    });
  };
  
  // Vérifier immédiatement
  checkVisibility();
  
  // Vérifier au scroll avec debounce
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(checkVisibility, 100);
  }, { passive: true });
  
  // Vérifier au resize
  window.addEventListener('resize', checkVisibility);
}

// ============================================
// MAIN INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  // Appliquer les traductions
  setLanguage(currentLang);

  // Boutons de changement de langue
  const frBtn = document.getElementById('lang-fr');
  const enBtn = document.getElementById('lang-en');

  if (frBtn) {
    frBtn.addEventListener('click', () => {
      setLanguage('fr');
      // Re-initialiser les révélations après changement de langue
      setTimeout(initReveal, 100);
    });
  }
  
  if (enBtn) {
    enBtn.addEventListener('click', () => {
      setLanguage('en');
      // Re-initialiser les révélations après changement de langue
      setTimeout(initReveal, 100);
    });
  }

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

  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelectorAll('.nav-links a');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      body.classList.toggle('nav-open');
    });
  }

  navLinks.forEach(a => {
    a.addEventListener('click', () => {
      body.classList.remove('nav-open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Form fallback
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Merci pour votre message ! Je vous répondrai bientôt.');
      form.reset();
    });
  }

  // Initialiser les révélations après un court délai
  // pour s'assurer que les traductions sont appliquées
  setTimeout(initReveal, 100);
});

// Gestion des erreurs globales
window.addEventListener('error', (ev) => {
  console.error('Global error captured:', ev.message, ev.error);
});