/**
 * PsyAI Articles Data Store
 * Provides initial seed articles and unified CRUD operations with localStorage sync.
 */

const DEFAULT_ARTICLES = [
  {
    id: "anxiety-guide",
    title:
      "كيف تميز بين القلق الطبيعي واضطراب القلق العام؟ دليل عملي من واقع العيادة",
    category: "الرفاه وجودة الحياة",
    categorySlug: "clinical",
    lead: "القلق جزء أصيل من التجربة الإنسانية، لكن متى يتحول هذا الشعور الفطري من آلية حماية مفيدة إلى عبء ذهني وجسدي يستنزف طاقتك اليومية ويعيق جودة حياتك؟",
    readTime: "٦ دقائق",
    author: "د. سارة المنصوري",
    authorRole: "أخصائية علم النفس والرفاه",
    date: "١ سبتمبر ٢٠٢٦",
    image: "storybook_card_1.png",
    takeaways: [
      "القلق الطبيعي مؤقت ويرتبط بموقف محدد، بينما اضطراب القلق مستمر ويعمم على تفاصيل الحياة اليومية.",
      "معيار الشدة والاستمرارية: استمرار القلق لأكثر من ٦ أشهر يعيق الأداء اليومي هو مؤشر مهم يستدعي المتابعة.",
      "الأعراض الجسدية (توتر العضلات، اضطرابات النوم، الخفقان) تمثل أكثر من ٥٠٪ من تجربة القلق.",
      "الإرشاد والتمارين السلوكية اليومية تقدم أدوات عملية فعالة لاستعادة الهدوء والسيطرة على الأفكار.",
    ],
    content: `
            <h2 id="section-1">١. ما هو القلق في الأصل؟ ولماذا نشعر به؟</h2>
            <p>
                من منظور تطوري وعصبي، القلق ليس "عيباً" في دماغك أو دليلاً على ضعف شخصيتك؛ بل هو نظام إنذار مبكر مصمم لحمايتك من الأخطار. عندما يواجه الإنسان تحدياً مهماً — كمقابلة عمل، أو اختبار مصيري، أو قرار عائلي كبير — يفرز الدماغ هرمونات الأدرينالين والكورتيزول لرفع درجة الانتباه وشحذ التركيز.
            </p>
            <p>
                هذا النوع يُعرف في علم النفس بـ <strong>"القلق المتكيف أو الصحي" (Adaptive Anxiety)</strong>، وينتهي تلقائياً بمجرد زوال الموقف المسبب له، بل إنه يسهم في تحسين أدائك واستعدادك.
            </p>

            <div class="clinical-pullquote">
                <p>«القلق الطبيعي يجعلك تستعد للامتحان؛ أما اضطراب القلق فيجعلك تعتقد أنك ستفشل في الحياة كلها حتى لو ذاكرت كل صفحة.»</p>
                <span>— مبدأ توجيهي في العلاج المعرفي السلوكي (CBT)</span>
            </div>

            <h2 id="section-2">٢. متى يتحول القلق إلى "اضطراب قلق عام" (GAD)؟</h2>
            <p>
                وفقاً للدليل الإرشادي، يتحول القلق إلى حالة تستدعي الدعم عندما يصبح مفرطاً، يصعب التحكم فيه، ويستمر في معظم الأيام لمدة <strong>لا تقل عن ٦ أشهر متواصلة</strong>، مع تركز الأفكار حول سيناريوهات كارثية لأمور روتينية (العمل، الصحة، الأبناء، المستقبل).
            </p>
            <p>
                يترافق اضطراب القلق العام عادة مع ثلاثة على الأقل من الأعراض الجسدية والنفسية التالية:
            </p>
            <ul>
                <li><strong>الشعور بالتململ والتوتر الدائم:</strong> إحساس مستمر كأنك "على حافة الهاوية" أو مشدود الأعصاب.</li>
                <li><strong>سرعة الإجهاد والتعب:</strong> استنزاف الطاقة البدنية حتى بعد بذل مجهود بسيط.</li>
                <li><strong>صعوبة التركيز أو فراغ الذهن:</strong> التشتت المستمر بسبب هجوم سيناريوهات "ماذا لو؟".</li>
                <li><strong>الشد العضلي المزمن:</strong> آلام في الرقبة، الكتفين، أو الفك نتيجة انقباض العضلات اللاإرادي.</li>
                <li><strong>اضطرابات النوم:</strong> صعوبة الاستغراق في النوم بسبب تسارع الأفكار، أو الاستيقاظ المتكرر والشعور بعدم الراحة.</li>
            </ul>

            <h2 id="section-3">٣. جدول المقارنة: القلق الطبيعي مقابل اضطراب القلق</h2>
            <p>
                يوضح الجدول التالي الفروق الجوهرية التي يعتمد عليها الأخصائيون في تقييم مستوى الدعم والرفاه:
            </p>

            <div class="article-table-wrap">
                <table class="article-table">
                    <thead>
                        <tr>
                            <th>وجه المقارنة</th>
                            <th>القلق الطبيعي (Normal)</th>
                            <th>اضطراب القلق العام (GAD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>المحفز والسبب</strong></td>
                            <td>مرتبط بحدث محدد ومبرر (امتحان، أزمة مالية مؤقتة)</td>
                            <td>شامل وغامض، ينتقل من موضوع لآخر بلا سبب محدد</td>
                        </tr>
                        <tr>
                            <td><strong>المدة الزمنية</strong></td>
                            <td>مؤقت ويزول بزوال الموقف</td>
                            <td>مزمن ومستمر لأشهر طويلة دون توقف</td>
                        </tr>
                        <tr>
                            <td><strong>القدرة على التحكم</strong></td>
                            <td>يمكن تشتيته أو تهدئته بالمنطق والتطمين</td>
                            <td>يصعب جداً إيقافه أو السيطرة على تسارعه</td>
                        </tr>
                        <tr>
                            <td><strong>التأثير على الحياة</strong></td>
                            <td>لا يعيق الإنتاجية ولا يمنع ممارسة الروتين</td>
                            <td>يعيق العمل، العلاقات، النوم، والنشاط الاجتماعي</td>
                        </tr>
                        <tr>
                            <td><strong>الأعراض الجسدية</strong></td>
                            <td>خفيفة وعابرة (تسارع طفيف بالنبض)</td>
                            <td>مزمنة (صداع، قولون عصبي، شد عضلي، إرهاق مستمر)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h2 id="section-4">٤. استراتيجيات علمية مبسطة للتعامل الفوري مع نوبات القلق</h2>
            <p>
                إذا شعرت بتصاعد حدة التوتر في لحظة معينة، يمكنك الاستعانة بهذه التمارين المعتمدة في الدعم النفسي والرفاه:
            </p>
            <h3>أ) تقنية التأريض الحسي 5-4-3-2-1 (Grounding Technique)</h3>
            <p>
                تعمل هذه التقنية على إعادة عقلك إلى اللحظة الحالية وفصل الاتصال بدوامة الأفكار المستقبلية عبر الحواس الخمس:
            </p>
            <ul>
                <li><strong>٥ أشياء تراها</strong> في الغرفة من حولك (مثل لون الستارة، كوب الماء).</li>
                <li><strong>٤ أشياء تلمسها</strong> بيدك (ملمس القماش، برودة الطاولة).</li>
                <li><strong>٣ أصوات تسمعها</strong> (صوت المكيف، حركة السيارات في الخارج).</li>
                <li><strong>شيئان تشمهما</strong> (رائحة القهوة، نسيم الهواء).</li>
                <li><strong>شيء واحد تتذوقه</strong> (طعم النعناع، رشفة ماء بارد).</li>
            </ul>

            <h3>ب) سجل تفنيد الأفكار القلقة (Thought Challenge)</h3>
            <p>
                عندما تباغتك فكرة مثل: <em>"سأفشل حتماً في هذا المشروع وسأفقد وظيفتي"</em>، اسأل نفسك ثلاثة أسئلة منطقية:
            </p>
            <ol>
                <li>ما هو الدليل الواقعي الحقيقي الذي يؤيد هذه الفكرة الآن؟</li>
                <li>ما هو السيناريو الأكثر واقعية واحتمالاً (بدلاً من السيناريو الأسوأ)؟</li>
                <li>إذا حدث ما أخشاه، ما هي الخطوات العملية التي يمكنني اتخاذها لمعالجته؟</li>
            </ol>

            <div class="article-inline-cta">
                <div class="article-inline-cta-text">
                    <h4>هل تجد صعوبة في التعامل مع القلق بمفردك؟</h4>
                    <p>لست مضطراً لخوض هذا المسار وحدك. فريق مختصي PsyAI مستعد لمساعدتك بخطط دعم وتمارين شخصية وسرية تامة.</p>
                </div>
                <a href="login.html" class="btn btn-gold">تحدث مع مختص الآن</a>
            </div>

            <h2 id="section-5">٥. متى يكون طلب المساعدة المتخصصة خطوة ضرورية؟</h2>
            <p>
                تذكر دائماً أن طلب الدعم النفسي ليس علامة فشل، بل هو قرار واعٍ وشجاع يشبه تماماً استشارة الطبيب عند الشعور بألم جسدي مستمر. ننصحك بحجز جلسة تقييم مع أخصائي نفسي معتمد إذا:
            </p>
            <ul>
                <li>أصبح القلق يمنعك من الذهاب إلى العمل أو ممارسة مهامك الأساسية.</li>
                <li>تأثرت جودة نومك وصحتك الجسدية بصورة ملحوظة لأكثر من شهرين.</li>
                <li>بدأت تلجأ إلى العزلة التامة وتجنب المواقف الاجتماعية خوفاً من التوتر.</li>
                <li>شعرت بنوبات هلع مفاجئة (خفقان حاد، شعور بالاختناق، خوف شديد من فقدان السيطرة).</li>
            </ul>
        `,
  },
];

const ArticlesStore = {
  STORAGE_KEY: "psyai_articles",

  init() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(DEFAULT_ARTICLES));
    }
  },

  getAll() {
    this.init();
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : DEFAULT_ARTICLES;
    } catch (e) {
      console.error("Error reading articles:", e);
      return DEFAULT_ARTICLES;
    }
  },

  getById(id) {
    const list = this.getAll();
    return list.find((a) => a.id === id) || list[0];
  },

  save(article) {
    const list = this.getAll();
    if (!article.id) {
      article.id = "art-" + Date.now();
    }
    if (!article.date) {
      const now = new Date();
      const months = [
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
      ];
      article.date = now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear();
    }
    const idx = list.findIndex((a) => a.id === article.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...article };
    } else {
      list.unshift(article);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    return article;
  },

  delete(id) {
    const list = this.getAll();
    const filtered = list.filter((a) => a.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  },

  resetToDefault() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(DEFAULT_ARTICLES));
    return DEFAULT_ARTICLES;
  },

  async syncWithBackend(apiBase = "") {
    try {
      const base = apiBase || (window.location.port === "5000" ? "" : "http://localhost:5000");
      const res = await fetch(`${base}/api/articles?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.articles)) {
        const currentList = this.getAll();
        const serverArticles = data.articles.map((item) => {
          const createdAtDate = item.createdAt ? new Date(item.createdAt) : new Date();
          const months = [
            "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
            "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
          ];
          const dateStr = createdAtDate.getDate() + " " + months[createdAtDate.getMonth()] + " " + createdAtDate.getFullYear();

          return {
            id: item.id,
            title: item.title,
            category: item.category || "الرفاه وجودة الحياة",
            categorySlug: item.categorySlug || "clinical",
            lead: item.lead || "",
            readTime: item.readTime || "٥ دقائق",
            author: item.authorName || "أخصائي PsyAI",
            authorRole: item.authorTitle || "أخصائي نفسي معتمد",
            date: dateStr,
            image: item.image || "storybook_card_2.png",
            takeaways: Array.isArray(item.takeaways) ? item.takeaways : [],
            content: item.content
          };
        });

        // Merge server articles into list (prioritize server ones, keep unique by id)
        const combined = [...serverArticles];
        for (const localArt of currentList) {
          if (!combined.some((a) => a.id === localArt.id)) {
            combined.push(localArt);
          }
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(combined));
      }
    } catch (err) {
      console.warn("Could not sync articles with backend:", err);
    }
  }
};

// Initialize on script load
ArticlesStore.init();
