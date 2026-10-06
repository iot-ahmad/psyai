const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const EncryptionService = require('../src/services/encryptionService');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PostgreSQL database for PsyAI...');

  // 1. Create Default Admin User
  const adminEmail = 'admin@psyai.com';
  const adminPhone = '+962791000000';
  const adminEmailHash = EncryptionService.generateBlindIndex(adminEmail);
  const adminPhoneHash = EncryptionService.generateBlindIndex(adminPhone);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { emailHash: adminEmailHash },
    update: {},
    create: {
      firstName: 'مدير',
      lastName: 'المنصة',
      emailEncrypted: EncryptionService.encryptField(adminEmail),
      emailHash: adminEmailHash,
      phoneEncrypted: EncryptionService.encryptField(adminPhone),
      phoneHash: adminPhoneHash,
      gender: 'male',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isVerified: true,
      status: 'active',
      language: 'ar'
    }
  });
  console.log('✔ Admin user ready:', adminEmail);

  // 2. Create Initial Specialists (User account + Specialist profile + Schedule)
  const specialistsData = [
    {
      email: 'sara.nabulsi@psyai.com',
      phone: '+962791111111',
      firstName: 'سارة',
      lastName: 'النابلسي',
      gender: 'female',
      name: 'د. سارة النابلسي',
      title: 'استشارية الطب النفسي والعلاج السلوكي المعرفي (CBT)',
      specialty: 'القلق والتوتر، الاكتئاب، إدارة الضغوط',
      bio: 'خبرة أكثر من ١٢ عاماً في علاج اضطرابات القلق والاكتئاب، حاصلة على البورد الكندي في العلاج النفسي.',
      rating: 4.9,
      price: 80,
      isFeatured: true,
      licenseNumber: 'JO-PSY-2014-042'
    },
    {
      email: 'khaled.tarawneh@psyai.com',
      phone: '+962792222222',
      firstName: 'خالد',
      lastName: 'الطراونة',
      gender: 'male',
      name: 'د. خالد الطراونة',
      title: 'أخصائي أول في العلاقات الزوجية والاضطرابات السلوكية',
      specialty: 'مشاكل العلاقات والأسرة، إدارة الغضب، الوسواس القهري',
      bio: 'متخصص في الإرشاد الأسري والعلاقات، عضو الجمعية الأردنية لعلم النفس ومرخص رسمياً.',
      rating: 4.9,
      price: 70,
      isFeatured: true,
      licenseNumber: 'JO-PSY-2016-118'
    },
    {
      email: 'muna.zoubi@psyai.com',
      phone: '+962793333333',
      firstName: 'منى',
      lastName: 'الزعبي',
      gender: 'female',
      name: 'د. منى الزعبي',
      title: 'استشارية نفسية للأطفال والمراهقين واضطرابات المزاج',
      specialty: 'اضطرابات الأطفال، تدني الثقة بالنفس، اضطرابات النوم',
      bio: 'عضو الرابطة الأردنية للصحة النفسية، متخصصة في تعديل السلوك للأطفال وبناء المرونة النفسية للمراهقين.',
      rating: 5.0,
      price: 90,
      isFeatured: true,
      licenseNumber: 'JO-PSY-2012-089'
    },
    {
      email: 'firas.hammouri@psyai.com',
      phone: '+962794444444',
      firstName: 'فراس',
      lastName: 'الحموري',
      gender: 'male',
      name: 'د. فراس الحموري',
      title: 'أخصائي علاج الصدمات النفسية واضطراب ما بعد الصدمة (PTSD)',
      specialty: 'الصدمات النفسية، الإرهاق الوظيفي، الرهاب الاجتماعي',
      bio: 'معالج معتمد بتقنية الـ EMDR لعلاج الصدمات المعقدة والتعافي من الضغوط المهنية الشديدة.',
      rating: 4.8,
      price: 65,
      isFeatured: true,
      licenseNumber: 'JO-PSY-2017-205'
    }
  ];

  const defaultPasswordHash = await bcrypt.hash('Specialist@2025', 10);

  for (const s of specialistsData) {
    const emailHash = EncryptionService.generateBlindIndex(s.email);
    const phoneHash = EncryptionService.generateBlindIndex(s.phone);

    // 1. User Record for Specialist
    let user = await prisma.user.findUnique({ where: { emailHash } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          firstName: s.firstName,
          lastName: s.lastName,
          emailEncrypted: EncryptionService.encryptField(s.email),
          emailHash,
          phoneEncrypted: EncryptionService.encryptField(s.phone),
          phoneHash,
          gender: s.gender,
          passwordHash: defaultPasswordHash,
          role: 'specialist',
          isVerified: true,
          status: 'active',
          language: 'ar'
        }
      });
    }

    // 2. Specialist Profile
    let spec = await prisma.specialist.findUnique({ where: { userId: user.id } });
    if (!spec) {
      spec = await prisma.specialist.create({
        data: {
          userId: user.id,
          name: s.name,
          title: s.title,
          specialty: s.specialty,
          bio: s.bio,
          price: s.price,
          rating: s.rating,
          isFeatured: s.isFeatured,
          licenseNumber: s.licenseNumber
        }
      });

      // 3. Specialist Schedule (Sunday to Thursday, 04:00 PM to 08:00 PM)
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
      for (const day of days) {
        await prisma.specialistSchedule.create({
          data: {
            specialistId: spec.id,
            day,
            startTime: new Date('1970-01-01T16:00:00Z'),
            endTime: new Date('1970-01-01T20:00:00Z'),
            available: true
          }
        });
      }
    }
  }
  console.log('✔ Seeded 4 Specialist profiles and their schedules.');

  // 3. Seed Articles
  const firstSpec = await prisma.specialist.findFirst();
  if (firstSpec) {
    const existingArticle = await prisma.article.findFirst({
      where: { specialistId: firstSpec.id }
    });

    if (!existingArticle) {
      await prisma.article.create({
        data: {
          specialistId: firstSpec.id,
          title: 'كيف تتعامل مع نوبات القلق والتوتر في بيئة العمل؟',
          categorySlug: 'anxiety',
          body: 'يعاني الكثير من الأشخاص من ضغوط متزايدة في بيئة العمل، مما يؤدي إلى نوبات من القلق والتوتر المفاجئ. في هذا المقال نناقش تقنيات التنفس العميق، وإعادة الهيكلة المعرفية، وأهمية وضع حدود واضحة بين الحياة المهنية والشخصية.',
          status: 'published'
        }
      });
      console.log('✔ Sample mental health article seeded.');
    }
  }

  console.log('🎉 PostgreSQL Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
