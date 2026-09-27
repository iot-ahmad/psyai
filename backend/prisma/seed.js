const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Default Admin User
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@psyai.com' },
    update: {},
    create: {
      firstName: 'مدير',
      lastName: 'المنصة',
      email: 'admin@psyai.com',
      phone: '+962791000000',
      gender: 'male',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isVerified: true,
      status: 'active'
    }
  });
  console.log('Admin user ready:', admin.email);

  // 2. Create Initial Specialists
  const specialistsData = [
    {
      name: 'د. سارة النابلسي',
      title: 'استشارية الطب النفسي والعلاج السلوكي المعرفي (CBT)',
      specialty: 'القلق والتوتر، الاكتئاب، إدارة الضغوط',
      bio: 'خبرة أكثر من ١٢ عاماً في علاج اضطرابات القلق والاكتئاب، حاصلة على البورد الكندي في العلاج النفسي.',
      expYears: 12,
      rating: 4.95,
      price: 80,
      gender: 'female',
      avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
      isFeatured: true
    },
    {
      name: 'د. خالد الطراونة',
      title: 'أخصائي أول في العلاقات الزوجية والاضطرابات السلوكية',
      specialty: 'مشاكل العلاقات والأسرة، إدارة الغضب، الوسواس القهري',
      bio: 'متخصص في الإرشاد الأسري والعلاقات، عضو الجمعية الأردنية لعلم النفس ومرخص رسمياً.',
      expYears: 10,
      rating: 4.9,
      price: 70,
      gender: 'male',
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400',
      isFeatured: true
    },
    {
      name: 'د. منى الزعبي',
      title: 'استشارية نفسية للأطفال والمراهقين واضطرابات المزاج',
      specialty: 'اضطرابات الأطفال، تدني الثقة بالنفس، اضطرابات النوم',
      bio: 'عضو الرابطة الأردنية للصحة النفسية، متخصصة في تعديل السلوك للأطفال وبناء المرونة النفسية للمراهقين.',
      expYears: 14,
      rating: 4.98,
      price: 90,
      gender: 'female',
      avatar: 'https://images.unsplash.com/photo-1594824813583-982834b68ef5?auto=format&fit=crop&q=80&w=400',
      isFeatured: true
    },
    {
      name: 'د. فراس الحموري',
      title: 'أخصائي علاج الصدمات النفسية واضطراب ما بعد الصدمة (PTSD)',
      specialty: 'الصدمات النفسية، الإرهاق الوظيفي، الرهاب الاجتماعي',
      bio: 'معالج معتمد بتقنية الـ EMDR لعلاج الصدمات المعقدة والتعافي من الضغوط المهنية الشديدة.',
      expYears: 9,
      rating: 4.88,
      price: 65,
      gender: 'male',
      avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=400',
      isFeatured: true
    }
  ];

  for (const s of specialistsData) {
    const existing = await prisma.specialist.findFirst({ where: { name: s.name } });
    if (!existing) {
      await prisma.specialist.create({ data: s });
    }
  }
  console.log('Initial Specialists seeded (4 specialists)');

  // 3. Create Services for Admin Panel & Showcase
  const servicesData = [
    {
      name: 'الاستشارات الفردية',
      slug: 'individual',
      description: 'جلسات سرية فردية مع نخبة من الأخصائيين المعتمدين لعلاج القلق، الاكتئاب، وتطوير الذات.',
      icon: 'user'
    },
    {
      name: 'استشارات الأطفال والمراهقين',
      slug: 'kids',
      description: 'دعم نفسي وتعديل سلوك للأطفال والمراهقين بأحدث المنهجيات التفاعلية.',
      icon: 'smile'
    },
    {
      name: 'رفاه الشركات والمؤسسات B2B',
      slug: 'corporate',
      description: 'برامج دعم الموظفين (EAP)، إدارة الضغوط المهنية، وورش العمل التفاعلية.',
      icon: 'briefcase'
    }
  ];

  for (const svc of servicesData) {
    await prisma.service.upsert({
      where: { slug: svc.slug },
      update: {},
      create: svc
    });
  }
  console.log('Services seeded');

  // 4. Create Sample B2B Companies
  const companiesData = [
    {
      name: 'مجموعة زين الأردن',
      email: 'wellness@zain-jo.demo',
      phone: '+96265001122',
      employeesCount: 350
    },
    {
      name: 'شركة المستقبل للتقنية',
      email: 'hr@futuretech-jo.demo',
      phone: '+96265003344',
      employeesCount: 120
    }
  ];

  for (const c of companiesData) {
    await prisma.company.upsert({
      where: { email: c.email },
      update: {},
      create: c
    });
  }
  console.log('Companies seeded');

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
