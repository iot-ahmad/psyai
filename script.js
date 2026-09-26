// =============================================
// PsyAI Website — Vanilla JavaScript
// =============================================

// Ticker data
const conditions = [
  "القلق والتوتر المستمر",
  "الحزن وفقدان الشغف والحماس",
  "ضغط العمل والإرهاق المهني",
  "الاحتراق الوظيفي وضعف الإنتاجية",
  "مشاكل العلاقات الأسرية والاجتماعية",
  "إدارة الغضب والتوازن العاطفي",
  "تدني الثقة بالنفس وتقدير الذات",
  "اضطرابات وجودة النوم",
  "التفكير المفرط والتشوش الذهني",
  "الموازنة بين العمل والمسؤوليات الشخصية",
  "التسويف وصعوبات التركيز والإنجاز",
  "تطوير مهارات التواصل وحل الخلافات",
  "ضغوط التربية وبناء الذكاء العاطفي للأبناء",
  "بناء المرونة النفسية والتكيف مع التغيرات",
  "الإجهاد والإنهاك العام بدون سبب واضح",
  "مساحة للفضفضة وتفريغ المشاعر",
];

// Initialize ticker
function initTicker() {
  const tickerTrack = document.getElementById("tickerTrack");
  if (!tickerTrack) return;
  const tickerHTML = [
    ...conditions,
    ...conditions,
    ...conditions,
    ...conditions,
  ]
    .map((condition) => `<span>${condition}</span>`)
    .join("");
  tickerTrack.innerHTML = tickerHTML;
}

// Header scroll effect
function initHeaderScroll() {
  const header = document.querySelector(".header");
  if (!header) return;
  window.addEventListener("scroll", () => {
    if (window.scrollY > 20) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });
}

// Mobile menu toggle
function initMobileMenu() {
  const hamburger = document.querySelector(".hamburger");
  const mobileNav = document.getElementById("mobileNav");
  if (!hamburger || !mobileNav) return;
  const navLinks = document.querySelectorAll(".mobile-nav .nav-link");

  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    mobileNav.classList.toggle("active");
  });

  // Close menu when link is clicked
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("active");
      mobileNav.classList.remove("active");
    });
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".header")) {
      hamburger.classList.remove("active");
      mobileNav.classList.remove("active");
    }
  });
}

// Desktop dropdown click support
function initDesktopDropdown() {
  const navItems = document.querySelectorAll(".nav-item");
  if (!navItems.length) return;

  navItems.forEach((item) => {
    const link = item.querySelector(".nav-link");
    if (!link) return;

    link.addEventListener("click", (e) => {
      if (window.innerWidth <= 960) return;

      e.preventDefault();
      const isOpen = item.classList.contains("open");

      navItems.forEach((otherItem) => {
        if (otherItem !== item) {
          otherItem.classList.remove("open");
        }
      });

      if (isOpen) {
        item.classList.remove("open");
      } else {
        item.classList.add("open");
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-item")) {
      navItems.forEach((item) => item.classList.remove("open"));
    }
  });
}

// FAQ accordion
function initFAQ() {
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach((item) => {
    const question = item.querySelector(".faq-question, .faq-question-btn");
    if (!question) return;

    question.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen =
        item.classList.contains("open") || item.classList.contains("active");

      // Close other items
      faqItems.forEach((otherItem) => {
        if (otherItem !== item) {
          otherItem.classList.remove("active", "open");
          const otherBtn = otherItem.querySelector(".faq-question-btn");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        }
      });

      // Toggle current item
      if (isOpen) {
        item.classList.remove("active", "open");
        question.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("active", "open");
        question.setAttribute("aria-expanded", "true");
      }
    });
  });
}

// Specialists carousel navigation
function initSpecialistsCarousel() {
  const grid = document.getElementById("specialistsGrid");
  const prevBtn = document.getElementById("specPrev");
  const nextBtn = document.getElementById("specNext");
  if (!grid || !prevBtn || !nextBtn) return;

  prevBtn.addEventListener("click", () => {
    grid.scrollBy({ left: 260, behavior: "smooth" });
  });

  nextBtn.addEventListener("click", () => {
    grid.scrollBy({ left: -260, behavior: "smooth" });
  });
}

// Smooth scroll for anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href !== "#" && href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  });
}

// Hide instant banner when user scrolls down past top; show near top
function initBannerVisibility() {
  const banner = document.querySelector(".instant-banner");
  if (!banner) return;

  const threshold = 60; // px from top to keep banner visible

  function onScroll() {
    if (window.scrollY > threshold) {
      banner.classList.add("hidden");
    } else {
      banner.classList.remove("hidden");
    }
  }

  // run on load and on scroll
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

// Intersection Observer for scroll animations
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, observerOptions);

  document.querySelectorAll(".reveal").forEach((el) => {
    observer.observe(el);
  });
}

// Complete i18n Translation Dictionary (100% Site Coverage)
const translationDictionary = {
  // Nav & Header
  الرئيسية: "Home",
  المختصين: "Specialists",
  "PsyAI الأعمال": "PsyAI Business",
  "انضم كمختص": "Join as Specialist",
  المدونة: "Blog",
  خدماتنا: "Services",
  "دعم نفسي فردي": "Individual Support",
  "برامج الشركات": "Corporate Programs",
  "برامج الأطفال": "Kids Programs",
  "محتوى تثقيفي": "Educational Content",
  قيمنا: "Our Values",
  "احجز جلسة": "Book a Session",
  "احجز الآن": "Book Now",
  "احجز جلستك الآن": "Book Your Session Now",
  "تصفح الأخصائيين": "Browse Specialists",

  // Banner
  "احجز جلسة فورية": "Book an Instant Session",
  "محتاج دعم نفسي بأقرب وقت؟ احجزها خلال دقائق":
    "Need urgent psychological support? Book in minutes",

  // Hero Section
  "منصة الرفاه النفسي": "Mental Wellbeing Platform",
  "منصة الرفاه النفسي المتكاملة": "Integrated Mental Wellbeing Platform",
  PsyAI: "PsyAI",
  "نحن هنا لدعمك": "We Are Here To Support You",
  "رعاية نفسية بخصوصية تامة، بدون وصمة، ومتاحة للجميع.":
    "Psychological care with complete privacy, stigma-free, accessible to all.",
  "مدعومة بعلم النفس المبني على الأدلة والأخصائيين المعتمدين.":
    "Empowered by evidence-based psychology and certified experts.",
  مستفيد: "Beneficiaries",
  جائزة: "Awards",
  منتج: "Products",
  دعم: "Support",

  // Features & Brand
  منظومتنا: "Ecosystem",
  "خدمات متكاملة": "Integrated Services",
  "مجموعة شاملة من الخدمات المصممة لدعم رفاهك النفسي.":
    "A comprehensive suite of services designed for your psychological well-being.",
  "سرية تامة": "Total Confidentiality",
  "بياناتك محمية بأعلى معايير الأمان":
    "Your data is protected with top security standards",
  "أخصائيون معتمدون": "Certified Experts",
  "فريق من علماء النفس المرخصين": "A team of licensed psychologists",
  "بلا وصمة": "Stigma-Free",
  "بيئة آمنة خالية من الحكم": "A safe, judgment-free environment",
  "عربي أولاً": "Arabic First",
  "مصمم خصيصاً للمجتمع العربي": "Specially designed for the Arab community",
  "24/7": "24/7",
  "دعم متواصل على مدار الساعة": "Continuous 24/7 support",

  // Services Section
  "حلول متكاملة لكل احتياج": "Complete Solutions For Every Need",
  "مصممة للأفراد والشركات والأطفال — مدعومة بعلم النفس المبني على الأدلة.":
    "Designed for individuals, enterprises, and kids — backed by evidence-based psychology.",
  للأفراد: "For Individuals",
  "جلسات فردية": "Individual Sessions",
  "وصول مباشر لجلسات دعم نفسي فردية عن بعد مع أخصائيين مرخصين. بيئة آمنة وسرية تماماً.":
    "Direct access to online individual therapy sessions with licensed experts. Safe and fully confidential.",
  "بيئة آمنة": "Safe Environment",
  "اعرف المزيد": "Learn More",

  "برامج مؤسسية": "Corporate Programs",
  "برامج رفاه مؤسسي لتحسين بيئة العمل وتقليل الاحتراق الوظيفي مع توفير تحليلات للإدارة.":
    "Corporate wellbeing programs to enhance workplace environment, reduce burnout, with executive analytics.",
  "تقييم الموظفين": "Employee Assessment",
  "منع الاحتراق": "Burnout Prevention",
  "تقارير شهرية": "Monthly Reports",
  "لوحات الإدارة": "Management Dashboards",

  "مسار مخصص للأطفال من 4 إلى 10 سنوات يوفر إطار عمل للذكاء العاطفي والمهارات الحياتية.":
    "A specialized track for children aged 4 to 10 providing a framework for emotional intelligence and life skills.",
  "4 إلى 10 سنوات": "Ages 4 to 10",
  "الذكاء العاطفي": "Emotional Intelligence",
  "مهارات حياتية": "Life Skills",
  "أدلة الوالدين": "Parenting Guides",

  // Products Grid
  "الخدمة الأساسية": "Core Service",
  "جلسات نفسية فردية": "Individual Therapy Sessions",
  "جلسات مباشرة مع أخصائيين معتمدين. جدول مرن وأسعار معقولة وبيئة آمنة تماماً.":
    "Live sessions with certified specialists. Flexible scheduling, affordable rates, and a fully safe environment.",
  "حجز سهل": "Easy Booking",
  "جدول مرن": "Flexible Schedule",

  للشركات: "For Corporate",
  "برامج الرفاه المؤسسي": "Corporate Wellbeing Programs",
  "حلول رفاه نفسية للمؤسسات: منع الاحتراق وإدارة الضغوط ودعم الموظفين.":
    "Corporate wellbeing solutions: burnout prevention, stress management, and employee support.",
  "تقييمات الموظفين": "Employee Assessments",

  للعائلات: "For Families",
  "استشارات أسرية": "Family Consultations",
  "جلسات موجهة لتحسين التواصل الأسري والعلاقات الزوجية وحل النزاعات.":
    "Guided sessions to improve family communication, marital relationships, and conflict resolution.",
  "العلاج الأسري": "Family Therapy",
  "العلاقات الزوجية": "Marital Relationships",
  "التواصل الفعال": "Effective Communication",
  "حل النزاعات": "Conflict Resolution",

  "برامج متخصصة لتطوير الذكاء العاطفي والمهارات الحياتية للأطفال.":
    "Specialized programs to develop emotional intelligence and life skills for children.",

  متخصص: "Specialized",
  "استشارات متخصصة": "Specialized Consultations",
  "استشارات في مجالات متخصصة: القلق، الاكتئاب، الضغوط، العلاقات والمزيد.":
    "Consultations in specialized fields: Anxiety, depression, stress, relationships, and more.",
  "تخصصات متعددة": "Multiple Specialties",
  "خبرة عميقة": "Deep Expertise",
  "نتائج فعالة": "Effective Results",
  "دعم شامل": "Comprehensive Support",

  تثقيفي: "Educational",
  "مقالات وموارد تثقيفية حول الصحة النفسية والذكاء العاطفي والرفاه.":
    "Articles and educational resources about mental health, emotional intelligence, and wellbeing.",
  "مقالات مفيدة": "Useful Articles",
  "نصائح عملية": "Practical Tips",
  "موارد مجانية": "Free Resources",
  "تثقيف مستمر": "Continuous Education",

  // How It Works
  العملية: "The Process",
  "كيف يعمل": "How It Works",
  "ابدأ رحلة رفاهك النفسي في أربع خطوات بسيطة.":
    "Start your psychological wellbeing journey in four simple steps.",
  "اتصل بنا": "Contact Us",
  "تواصل معنا عبر البريد الإلكتروني أو الهاتف. سنستمع إليك ونفهم احتياجاتك.":
    "Get in touch via email or phone. We will listen and understand your needs.",
  "يتم مطابقتك": "Get Matched",
  "سننسبك مع الأخصائي الأنسب بناءً على تخصصه وخبرته وتوافقه مع احتياجاتك.":
    "We will match you with the best specialist based on expertise, experience, and compatibility.",
  "احجز جلستك": "Book Your Session",
  "اختر وقتاً يناسبك واحجز مع أخصائيك بأسعار معقولة وجدول مرن.":
    "Choose a convenient time and book with your specialist at affordable rates and flexible schedule.",
  "ابدأ الجلسة": "Start Your Session",
  "تواصل مع أخصائيك في الوقت المحدد وابدأ رحلتك النفسية في بيئة آمنة.":
    "Connect with your specialist at the scheduled time and start your journey in a safe environment.",

  // Specialists
  "فريق الأخصائيين": "Specialists Team",
  "أخصائيونا المعتمدون": "Our Certified Experts",
  "فريق من علماء النفس والأخصائيين المرخصين والمتخصصين في مجالات مختلفة من الصحة النفسية.":
    "A team of licensed psychologists and specialists expert in various mental health fields.",
  "د. أروى القفاري": "Dr. Arwa Al-Qaffari",
  "أخصائي نفسي": "Psychologist",
  "د. ناهي الرويلي": "Dr. Nahi Al-Ruwaili",
  "أخصائي رفاه نفسي": "Wellness Specialist",
  "طبيب نفسي": "Wellness Specialist",
  "د. عبدالمجيد الصي": "Dr. Abdulmajeed Al-Sai",
  "د. سعد العنزي": "Dr. Saad Al-Enazi",
  "د. شادي عاشور": "Dr. Shadi Ashour",
  "جميع المختصين": "All Specialists",
  السابق: "Previous",
  التالي: "Next",

  // Team
  فريقنا: "Our Team",
  "من يقف خلف PsyAI": "Who Stands Behind PsyAI",
  "فريق متنوع من المهنيين والمبتكرين الملتزمين بتحسين الصحة النفسية.":
    "A diverse team of professionals and innovators committed to improving mental health.",
  "أحمد محمد": "Ahmed Mohamed",
  "المؤسس والرئيس التنفيذي": "Founder & CEO",
  "خبير صحة رقمية": "Digital Health Expert",
  "د. فاطمة علي": "Dr. Fatima Ali",
  "رئيسة العمليات وتطوير البرامج": "COO & Head of Program Development",
  "دكتوراة في علم النفس الإرشادي والرفاه": "PhD in Counseling Psychology",
  "دكتوراة علم نفس سريري": "PhD in Counseling Psychology",
  "محمود حسن": "Mahmoud Hassan",
  "رئيس التكنولوجيا والابتكار": "CTO & Head of Innovation",
  "هندسة البرمجيات": "Software Engineering",
  "سارة محمود": "Sara Mahmoud",
  "مديرة التسويق والشراكات": "CMO & Partnerships Director",
  "تسويق استراتيجي": "Strategic Marketing",
  "علي محمد": "Ali Mohamed",
  "مدير العلاقات مع العملاء": "Customer Relations Director",
  "تجربة العملاء": "Customer Experience",

  // Awards
  "التأثير والتقدير": "Impact & Recognition",
  "تأثير حقيقي": "Real Impact",
  "تم تقديرنا من قبل المنظمات والمسرعات الرائدة لالتزامنا بالابتكار.":
    "Recognized by leading organizations and accelerators for our commitment to innovation.",
  "الفائز Asfari Social Innovation Challenge":
    "Winner Asfari Social Innovation Challenge",
  "الفائز — Asfari Social Innovation Challenge":
    "Winner Asfari Social Innovation Challenge",
  "تقدير دولي للابتكار الاجتماعي في مجال الصحة النفسية":
    "International recognition for social innovation in mental health",
  "الفائز Future Solutions Hackathon": "Winner Future Solutions Hackathon",
  "الفائز — Future Solutions Hackathon": "Winner Future Solutions Hackathon",
  "حل تقني مبتكر للتحديات الصحية النفسية في المنطقة":
    "Innovative tech solution for regional mental health challenges",
  "معتمد ومدعوم — مؤسسة مسك": "Certified & Supported — Misk Foundation",
  "دعم مؤسسي من إحدى أبرز مؤسسات الابتكار في المملكة العربية السعودية":
    "Institutional support from one of Saudi Arabia's leading innovation foundations",

  // FAQ
  "الأسئلة الشائعة": "Frequently Asked Questions",
  "أسئلة يسألها عملاؤنا": "Questions Asked By Our Clients",
  "كيف أحجز جلسة مع أخصائي؟": "How do I book a session with a specialist?",
  "يمكنك التواصل معنا عبر البريد الإلكتروني psyaiwellbeing@gmail.com أو الهاتف. سنساعدك في اختيار الأخصائي المناسب وحجز جلسة في الوقت الذي يناسبك.":
    "You can contact us via email at psyaiwellbeing@gmail.com or phone. We will help you select the right specialist and book a session at your convenience.",
  "ما هي طريقة التواصل مع الأخصائيين؟":
    "How do I communicate with specialists?",
  "يمكنك التواصل مع الأخصائيين عبر الجلسات المرئية أو الصوتية أو المحادثة النصية، وذلك بشكل كامل عبر المنصة بسرية تامة.":
    "You can connect via video, voice, or text chat sessions, fully through the platform with complete confidentiality.",
  "هل جلساتي سرية بالكامل؟": "Are my sessions completely confidential?",
  "نعم، جميع جلساتك ومعلوماتك الشخصية محمية بأعلى معايير الخصوصية والأمان. لن يطلع على بياناتك أي طرف ثالث.":
    "Yes, all your sessions and personal data are protected by top privacy and security standards. No third party will access your data.",
  "كيف تعمل برامج الرفاه المؤسسي؟": "How do corporate wellbeing programs work?",
  "نقدم للشركات برامج متكاملة لتقييم الصحة النفسية للموظفين ومنع الاحتراق الوظيفي وتقارير شهرية للإدارة — كل ذلك بسرية تامة.":
    "We provide companies with comprehensive programs to assess employee mental health, prevent burnout, and monthly reports for management — all with total privacy.",
  "هل هناك برامج للأطفال؟": "Are there programs for children?",
  "نعم، لدينا برامج متخصصة للأطفال من 4 إلى 10 سنوات تركز على تطوير الذكاء العاطفي والمهارات الحياتية.":
    "Yes, we have specialized programs for kids aged 4 to 10 focusing on developing emotional intelligence and life skills.",
  "ما هي أسعار الجلسات؟": "What are the session prices?",
  "نقدم أسعاراً معقولة وميسورة. يمكنك التواصل معنا للحصول على معلومات تفصيلية عن الأسعار والباقات المختلفة.":
    "We offer affordable and accessible rates. You can contact us to get detailed information about pricing and various packages.",

  // CTA
  "ابدأ رحلتك نحو الرفاه النفسي اليوم":
    "Start Your Journey Towards Wellbeing Today",
  "انضم لمئات الذين اختاروا الاستثمار في رفاههم النفسي. سري، آمن، وموثوق.":
    "Join hundreds who chose to invest in their mental wellbeing. Private, safe, and reliable.",

  // Footer
  "منصة الرفاه النفسي — نحو رعاية نفسية بخصوصية تامة، بدون وصمة، ومتاحة للجميع.":
    "Mental Wellbeing Platform — Towards psychological care with full privacy, stigma-free, accessible to all.",
  الشركة: "Company",
  الفريق: "Team",
  الجوائز: "Awards",
  "جميع الحقوق محفوظة.": "All rights reserved.",
  "© 2025 PsyAI. جميع الحقوق محفوظة.": "© 2025 PsyAI. All rights reserved.",
  "سياسة الخصوصية": "Privacy Policy",
  "الشروط والأحكام": "Terms & Conditions",
};

// Language Switcher Functionality
function initLanguageSwitcher() {
  const langBtns = document.querySelectorAll(".lang-btn");
  if (!langBtns.length) return;

  // Load saved language preference or default to 'ar'
  const savedLang = localStorage.getItem("psyai_lang") || "ar";
  applyLanguage(savedLang);

  langBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const currentLang = localStorage.getItem("psyai_lang") || "ar";
      const nextLang = currentLang === "ar" ? "en" : "ar";
      applyLanguage(nextLang);
    });
  });
}

function applyLanguage(lang) {
  const isEn = lang === "en";
  localStorage.setItem("psyai_lang", lang);

  document.documentElement.lang = lang;
  document.documentElement.dir = isEn ? "ltr" : "rtl";

  // Update toggle button text
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.textContent = isEn ? "العربية" : "EN";
  });

  // Walk through all text nodes and replace matching phrases
  translateDOMNodes(document.body, isEn);

  // Re-render ticker with translated terms if ticker active
  updateTickerForLang(isEn);
}

// Recursive DOM Text Node & Attribute Translation Engine
function translateDOMNodes(rootNode, isEn) {
  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
      const parentTag = node.parentNode
        ? node.parentNode.tagName.toLowerCase()
        : "";
      if (["script", "style", "noscript", "svg"].includes(parentTag)) {
        return NodeFilter.FILTER_SKIP;
      }
      if (node.parentNode && node.parentNode.classList.contains("lang-btn")) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodesToTranslate = [];
  while (walker.nextNode()) {
    nodesToTranslate.push(walker.currentNode);
  }

  nodesToTranslate.forEach((node) => {
    const text = node.nodeValue.trim();

    if (isEn) {
      if (!node._originalArText) {
        node._originalArText = text;
      }
      const translated =
        translationDictionary[node._originalArText] ||
        translationDictionary[text];
      if (translated) {
        node.nodeValue = node.nodeValue.replace(text, translated);
      }
    } else {
      if (node._originalArText) {
        node.nodeValue = node._originalArText;
      }
    }
  });

  // Translate Attributes (alt, aria-label, placeholder)
  const attrElements = rootNode.querySelectorAll(
    "[alt], [aria-label], [placeholder]",
  );
  attrElements.forEach((el) => {
    ["alt", "aria-label", "placeholder"].forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val && val.trim()) {
        const trimVal = val.trim();
        if (isEn) {
          if (!el[`_orig_${attr}`]) el[`_orig_${attr}`] = trimVal;
          const translated =
            translationDictionary[el[`_orig_${attr}`]] ||
            translationDictionary[trimVal];
          if (translated) el.setAttribute(attr, translated);
        } else {
          if (el[`_orig_${attr}`]) el.setAttribute(attr, el[`_orig_${attr}`]);
        }
      }
    });
  });
}

// Update ticker conditions for current language
function updateTickerForLang(isEn) {
  const tickerTrack = document.getElementById("tickerTrack");
  if (!tickerTrack) return;

  const arConditions = [
    "القلق والتوتر المستمر",
    "الحزن وفقدان الشغف والحماس",
    "ضغط العمل والإرهاق المهني",
    "الاحتراق الوظيفي وضعف الإنتاجية",
    "مشاكل العلاقات الأسرية والاجتماعية",
    "إدارة الغضب والتوازن العاطفي",
    "تدني الثقة بالنفس وتقدير الذات",
    "اضطرابات وجودة النوم",
    "التفكير المفرط والتشوش الذهني",
    "الموازنة بين العمل والمسؤوليات الشخصية",
    "التسويف وصعوبات التركيز والإنجاز",
    "تطوير مهارات التواصل وحل الخلافات",
    "ضغوط التربية وبناء الذكاء العاطفي للأبناء",
    "بناء المرونة النفسية والتكيف مع التغيرات",
    "الإجهاد والإنهاك العام بدون سبب واضح",
    "مساحة للفضفضة وتفريغ المشاعر",
  ];

  const enConditions = [
    "Continuous Anxiety & Stress",
    "Sadness & Loss of Passion",
    "Work Pressure & Occupational Fatigue",
    "Job Burnout & Low Productivity",
    "Family & Social Relationship Issues",
    "Anger Management & Emotional Balance",
    "Low Self-Esteem & Self-Worth",
    "Sleep Disorders & Sleep Quality",
    "Overthinking & Mental Clutter",
    "Work-Life Balance & Personal Responsibilities",
    "Procrastination & Focus Difficulties",
    "Communication Skills & Conflict Resolution",
    "Parenting Stress & Building Emotional Intelligence",
    "Building Resilience & Adapting to Change",
    "General Exhaustion & Fatigue",
    "A Safe Space for Venting & Emotional Release",
  ];

  const list = isEn ? enConditions : arConditions;
  const tickerHTML = [...list, ...list, ...list, ...list]
    .map((condition) => `<span>${condition}</span>`)
    .join("");
  tickerTrack.innerHTML = tickerHTML;
}

// Product cards scroll reveal animation (pair by pair)
function initProductCardScrollReveal() {
  const cards = document.querySelectorAll(".product-card");
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -40px 0px",
    },
  );

  cards.forEach((card) => observer.observe(card));
}

// Add reveal class to sections
function addRevealClasses() {
  document.querySelectorAll("section").forEach((section) => {
    section.classList.add("reveal");
  });
}

// Global Auth & Dynamic Header Navigation state
function updateHeaderNavState() {
  const userStr = localStorage.getItem("psyai_user");
  const token = localStorage.getItem("psyai_token");
  const authBtnContainers = document.querySelectorAll(
    ".header-actions, #headerAuthContainer, .mobile-nav",
  );

  authBtnContainers.forEach((container) => {
    const authBtn = container.querySelector(".btn-gold, #navAuthBtn");
    if (!authBtn) return;

    if (userStr && token) {
      try {
        const user = JSON.parse(userStr);
        authBtn.textContent = `مرحباً، ${user.first_name || "حسابي"}`;
        authBtn.href = "login.html";
        authBtn.style.background =
          "linear-gradient(135deg, var(--teal-dark), var(--teal-deep))";
        authBtn.style.color = "#fff";
      } catch (e) {
        authBtn.textContent = "احجز جلستك";
        authBtn.href = "login.html";
      }
    } else {
      authBtn.textContent = "احجز جلستك";
      authBtn.href = "login.html";
      authBtn.style.background = "";
      authBtn.style.color = "";
    }
  });
}

window.PsyAI = {
  API_BASE: "http://localhost:5000/api",
  updateNav: updateHeaderNavState,
};

// ──────────────────────────────────────────────
// Scroll Animations — IntersectionObserver
// ──────────────────────────────────────────────
function initAnimOnScroll() {
  const elements = document.querySelectorAll("[data-anim]");
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("anim-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  elements.forEach((el) => observer.observe(el));
}

// User Auth Status
function initUserAuthStatus() {
  try {
    const token = localStorage.getItem('psyai_token') || localStorage.getItem('token');
    if (token) {
      document.querySelectorAll('a[href="login.html"]').forEach((btn) => {
        btn.href = 'profile.html';
        btn.textContent = 'حسابي وجلساتي';
      });
    }
  } catch (e) {}
}

// Initialize all
document.addEventListener("DOMContentLoaded", () => {
  initTicker();
  initHeaderScroll();
  initMobileMenu();
  initDesktopDropdown();
  initFAQ();
  initSpecialistsCarousel();
  initSmoothScroll();
  addRevealClasses();
  initScrollAnimations();
  initLanguageSwitcher();
  initProductCardScrollReveal();
  initBannerVisibility();
  updateHeaderNavState();
  initAnimOnScroll();
  initUserAuthStatus();
});
