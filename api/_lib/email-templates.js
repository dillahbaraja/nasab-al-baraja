function safeValue(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatTimestamp(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return safeValue(value);
  }

  return date.toISOString();
}

function renderSections({ arabicLines, englishLines, indonesianLines }) {
  return [
    'Arabic',
    ...arabicLines,
    '',
    'English',
    ...englishLines,
    '',
    'Indonesia',
    ...indonesianLines
  ].join('\n');
}

export function buildPendingMemberEmail(member) {
  const arabicName = safeValue(member?.arabic_name_snapshot);
  const englishName = safeValue(member?.english_name_snapshot);
  const email = safeValue(member?.email);
  const city = safeValue(member?.city);
  const country = safeValue(member?.country);
  const submittedAt = formatTimestamp(member?.created_at);

  return {
    subject: 'طلب عضوية جديد | New Member Registration',
    text: renderSections({
      arabicLines: [
        'تم استلام طلب عضوية جديد ويحتاج إلى التحقق من قبل الإدارة.',
        `الاسم العربي: ${arabicName}`,
        `الاسم الإنجليزي: ${englishName}`,
        `البريد الإلكتروني: ${email}`,
        `المدينة: ${city}`,
        `الدولة: ${country}`,
        `وقت الإرسال: ${submittedAt}`
      ],
      englishLines: [
        'A new member registration has been submitted and requires admin verification.',
        `Arabic name: ${arabicName}`,
        `English name: ${englishName}`,
        `Email: ${email}`,
        `City: ${city}`,
        `Country: ${country}`,
        `Submitted at: ${submittedAt}`
      ],
      indonesianLines: [
        'Ada pendaftaran member baru yang telah dikirim dan perlu diverifikasi oleh admin.',
        `Nama Arab: ${arabicName}`,
        `Nama English: ${englishName}`,
        `Email: ${email}`,
        `Kota: ${city}`,
        `Negara: ${country}`,
        `Waktu pengiriman: ${submittedAt}`
      ]
    })
  };
}

export function buildAdminPromotionEmail(member) {
  const arabicName = safeValue(member?.arabic_name_snapshot);
  const englishName = safeValue(member?.english_name_snapshot);
  const email = safeValue(member?.email);
  const promotedAt = formatTimestamp(member?.updated_at || member?.approved_at);

  return {
    subject: 'تعيين مشرف جديد | New Admin Appointment',
    text: renderSections({
      arabicLines: [
        'تم تعيين عضو جديد كمشرف في نظام شجرة العائلة.',
        `الاسم العربي: ${arabicName}`,
        `الاسم الإنجليزي: ${englishName}`,
        `البريد الإلكتروني: ${email}`,
        `وقت التعيين: ${promotedAt}`
      ],
      englishLines: [
        'A member has been appointed as a new admin in the family tree system.',
        `Arabic name: ${arabicName}`,
        `English name: ${englishName}`,
        `Email: ${email}`,
        `Promoted at: ${promotedAt}`
      ],
      indonesianLines: [
        'Seorang member telah diangkat menjadi admin baru dalam sistem pohon keluarga.',
        `Nama Arab: ${arabicName}`,
        `Nama English: ${englishName}`,
        `Email: ${email}`,
        `Waktu pengangkatan: ${promotedAt}`
      ]
    })
  };
}

export function buildMemberApprovedEmail(member) {
  const arabicName = safeValue(member?.arabic_name_snapshot);
  const englishName = safeValue(member?.english_name_snapshot);
  const email = safeValue(member?.email);
  const approvedAt = formatTimestamp(member?.approved_at || member?.updated_at);

  return {
    subject: 'تم اعتماد عضو جديد | New Member Verification',
    text: renderSections({
      arabicLines: [
        'تم اعتماد عضو جديد في نظام شجرة العائلة.',
        `الاسم العربي: ${arabicName}`,
        `الاسم الإنجليزي: ${englishName}`,
        `البريد الإلكتروني: ${email}`,
        `وقت الاعتماد: ${approvedAt}`
      ],
      englishLines: [
        'A new member has been verified in the family tree system.',
        `Arabic name: ${arabicName}`,
        `English name: ${englishName}`,
        `Email: ${email}`,
        `Verified at: ${approvedAt}`
      ],
      indonesianLines: [
        'Seorang member baru telah diverifikasi dalam sistem pohon keluarga.',
        `Nama Arab: ${arabicName}`,
        `Nama English: ${englishName}`,
        `Email: ${email}`,
        `Waktu verifikasi: ${approvedAt}`
      ]
    })
  };
}

function getProposalLabels(type) {
  if (type === 'proposal_add_child') {
    return {
      arabic: 'اقتراح إضافة اسم جديد',
      english: 'Add-new-name proposal',
      indonesian: 'Usulan penambahan nama baru'
    };
  }

  return {
    arabic: 'اقتراح تغيير اسم',
    english: 'Name-change proposal',
    indonesian: 'Usulan perubahan nama'
  };
}

export function buildGuestProposalEmail({ notice, nodeDetails }) {
  const labels = getProposalLabels(notice?.type);
  const targetArabicName = safeValue(nodeDetails?.node?.arabic_name);
  const targetEnglishName = safeValue(nodeDetails?.node?.english_name);
  const parentArabicName = safeValue(nodeDetails?.parent?.arabic_name);
  const parentEnglishName = safeValue(nodeDetails?.parent?.english_name);
  const submittedAt = formatTimestamp(notice?.created_at || notice?.timestamp);

  return {
    subject: 'اقتراح جديد بانتظار المراجعة | New Proposal Awaiting Review',
    text: renderSections({
      arabicLines: [
        'تم إرسال اقتراح جديد من زائر ويحتاج إلى المراجعة.',
        `نوع الاقتراح: ${labels.arabic}`,
        `الاسم العربي المستهدف: ${targetArabicName}`,
        `الاسم الإنجليزي المستهدف: ${targetEnglishName}`,
        `اسم الأب بالعربية: ${parentArabicName}`,
        `اسم الأب بالإنجليزية: ${parentEnglishName}`,
        `وقت الإرسال: ${submittedAt}`
      ],
      englishLines: [
        'A new guest proposal has been submitted and requires review.',
        `Proposal type: ${labels.english}`,
        `Target Arabic name: ${targetArabicName}`,
        `Target English name: ${targetEnglishName}`,
        `Parent Arabic name: ${parentArabicName}`,
        `Parent English name: ${parentEnglishName}`,
        `Submitted at: ${submittedAt}`
      ],
      indonesianLines: [
        'Ada usulan baru dari guest yang telah dikirim dan perlu ditinjau.',
        `Jenis usulan: ${labels.indonesian}`,
        `Nama Arab target: ${targetArabicName}`,
        `Nama English target: ${targetEnglishName}`,
        `Nama ayah Arab: ${parentArabicName}`,
        `Nama ayah English: ${parentEnglishName}`,
        `Waktu pengiriman: ${submittedAt}`
      ]
    })
  };
}

export function buildAdminTreeChangeEmail({ notice, nodeDetails }) {
  const targetArabicName = safeValue(nodeDetails?.node?.arabic_name);
  const targetEnglishName = safeValue(nodeDetails?.node?.english_name);
  const parentArabicName = safeValue(nodeDetails?.parent?.arabic_name);
  const parentEnglishName = safeValue(nodeDetails?.parent?.english_name);
  const happenedAt = formatTimestamp(notice?.created_at || notice?.timestamp);
  const isAddChild = notice?.type === 'new_member';

  return {
    subject: isAddChild ? 'إضافة اسم جديد من الإدارة | Admin Added a New Family Member' : 'تعديل اسم من الإدارة | Admin Updated a Family Name',
    text: renderSections({
      arabicLines: isAddChild ? [
        'تمت إضافة اسم جديد مباشرة من قبل الإدارة في شجرة العائلة.',
        `الاسم العربي: ${targetArabicName}`,
        `الاسم الإنجليزي: ${targetEnglishName}`,
        `اسم الأب بالعربية: ${parentArabicName}`,
        `اسم الأب بالإنجليزية: ${parentEnglishName}`,
        `وقت الإضافة: ${happenedAt}`
      ] : [
        'تم تعديل اسم أحد أفراد العائلة مباشرة من قبل الإدارة.',
        `الاسم العربي الحالي: ${targetArabicName}`,
        `الاسم الإنجليزي الحالي: ${targetEnglishName}`,
        `وقت التعديل: ${happenedAt}`
      ],
      englishLines: isAddChild ? [
        'A new family member was added directly by an admin.',
        `Arabic name: ${targetArabicName}`,
        `English name: ${targetEnglishName}`,
        `Parent Arabic name: ${parentArabicName}`,
        `Parent English name: ${parentEnglishName}`,
        `Added at: ${happenedAt}`
      ] : [
        'A family member name was updated directly by an admin.',
        `Current Arabic name: ${targetArabicName}`,
        `Current English name: ${targetEnglishName}`,
        `Updated at: ${happenedAt}`
      ],
      indonesianLines: isAddChild ? [
        'Ada penambahan nama baru yang dilakukan langsung oleh admin pada pohon keluarga.',
        `Nama Arab: ${targetArabicName}`,
        `Nama English: ${targetEnglishName}`,
        `Nama ayah Arab: ${parentArabicName}`,
        `Nama ayah English: ${parentEnglishName}`,
        `Waktu penambahan: ${happenedAt}`
      ] : [
        'Ada perubahan nama keluarga yang dilakukan langsung oleh admin.',
        `Nama Arab saat ini: ${targetArabicName}`,
        `Nama English saat ini: ${targetEnglishName}`,
        `Waktu perubahan: ${happenedAt}`
      ]
    })
  };
}
