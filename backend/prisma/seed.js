const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── إنشاء حساب admin ──────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { emailHash: 'admin_hash' },
    update: {},
    create: {
      firstName: 'مدير',
      lastName: 'النظام',
      emailEncrypted: 'admin@psyai.jo',
      emailHash: 'admin_hash',
      phoneEncrypted: '+962791234560',
      phoneHash: 'admin_phone_hash',
      passwordHash: adminHash,
      gender: 'male',
      role: 'admin',
      isVerified: true,
      status: 'active',
    },
  });

  // ── الأخصائيون ─────────────────────────────────────────────────
  const specialistsData = [
    {
      firstName: 'محمد', lastName: 'الأحمدي', emailHash: 'dr_mohammed_hash', phoneHash: 'dr_mohammed_phone',
      gender: 'male', name: 'د. محمد الأحمدي', title: 'معالج نفسي معتمد',
      specialty: 'القلق والاكتئاب', bio: 'خبرة 8 سنوات في علاج اضطرابات القلق والاكتئاب', price: 30.0, rating: 4.9, isFeatured: true,
      expYears: 8, avatar: 'assets/images/psyai.png',
    },
    {
      firstName: 'سارة', lastName: 'العمري', emailHash: 'dr_sara_hash', phoneHash: 'dr_sara_phone',
      gender: 'female', name: 'د. سارة العمري', title: 'أخصائية صحة نفسية',
      specialty: 'العلاقات الأسرية والتوتر', bio: 'متخصصة في ضغوط الحياة واضطرابات النوم', price: 30.0, rating: 4.8, isFeatured: true,
      expYears: 6, avatar: 'assets/images/psyai.png',
    },
    {
      firstName: 'يوسف', lastName: 'المنصور', emailHash: 'dr_yousef_hash', phoneHash: 'dr_yousef_phone',
      gender: 'male', name: 'د. يوسف المنصور', title: 'مستشار نفسي',
      specialty: 'الصدمات النفسية', bio: 'خبير في علاج الصدمات وتطوير الذات', price: 30.0, rating: 4.7, isFeatured: false,
      expYears: 10, avatar: 'assets/images/psyai.png',
    },
    {
      firstName: 'نور', lastName: 'الحسيني', emailHash: 'dr_nour_hash', phoneHash: 'dr_nour_phone',
      gender: 'female', name: 'د. نور الحسيني', title: 'أخصائية نفسية للأطفال',
      specialty: 'صحة الأطفال والمراهقين', bio: 'متخصصة في دعم الأطفال خلال مراحل النمو', price: 30.0, rating: 4.9, isFeatured: true,
      expYears: 5, avatar: 'assets/images/psyai.png',
    },
    {
      firstName: 'خالد', lastName: 'الزهراني', emailHash: 'dr_khaled_hash', phoneHash: 'dr_khaled_phone',
      gender: 'male', name: 'د. خالد الزهراني', title: 'معالج نفسي',
      specialty: 'إدارة الغضب وتطوير الذات', bio: 'متخصص في إدارة الغضب وتحسين جودة الحياة', price: 30.0, rating: 4.6, isFeatured: false,
      expYears: 7, avatar: 'assets/images/psyai.png',
    },
  ];

  const passHash = await bcrypt.hash('Specialist@123', 10);

  for (const sp of specialistsData) {
    const user = await prisma.user.upsert({
      where: { emailHash: sp.emailHash },
      update: {},
      create: {
        firstName: sp.firstName, lastName: sp.lastName,
        emailEncrypted: `${sp.emailHash}@psyai.jo`, emailHash: sp.emailHash,
        phoneEncrypted: `+96279${Math.floor(1000000 + Math.random() * 9000000)}`, phoneHash: sp.phoneHash,
        passwordHash: passHash, gender: sp.gender, role: 'specialist', isVerified: true, status: 'active',
      },
    });

    await prisma.specialist.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id, name: sp.name, title: sp.title, specialty: sp.specialty,
        bio: sp.bio, price: sp.price, rating: sp.rating, isFeatured: sp.isFeatured,
        gender: sp.gender, expYears: sp.expYears, avatar: sp.avatar, avatarUrl: sp.avatar,
        status: 'active', isAvailable: true,
      },
    });
  }

  // ── الخدمات (Services) ──────────────────────────────────────────
  const services = [
    { title: 'استشارة نفسية فردية', slug: 'individual-therapy', description: 'جلسة خاصة للتعامل مع القلق، التوتر، والمشاعر السلبية.', price: 25.0, duration: 45 },
    { title: 'استشارات العلاقات والأزواج', slug: 'couples-therapy', description: 'جلسات لتحسين التواصل وفهم الشريك وحل الخلافات الأسرية.', price: 35.0, duration: 60 },
    { title: 'صحة الأطفال والمراهقين', slug: 'kids-adolescents', description: 'دعم نفسي تربوي لمعالجة السلوكيات وصعوبات التركيز والنمو.', price: 30.0, duration: 45 },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });
  }

  console.log(`✅ Seeded ${specialistsData.length} specialists & ${services.length} services!`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
