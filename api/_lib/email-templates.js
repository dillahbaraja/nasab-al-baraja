function safeValue(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return safeValue(value);
  }

  return date.toISOString();
}

function renderTextSections({ arabicLines, englishLines, indonesianLines }) {
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

function renderHtmlSection(title, lines, { rtl = false, arabic = false } = {}) {
  const fontSize = arabic ? '18px' : '15px';
  const lineHeight = arabic ? '1.9' : '1.7';
  const textAlign = rtl ? 'right' : 'left';
  const direction = rtl ? 'rtl' : 'ltr';

  return `
    <div dir="${direction}" style="margin:0 0 24px 0;text-align:${textAlign};font-family:${arabic ? 'Tahoma, Arial, sans-serif' : 'Arial, Helvetica, sans-serif'};">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#7c3aed;margin:0 0 10px 0;">${escapeHtml(title)}</div>
      ${lines.map((line) => `<div style="font-size:${fontSize};line-height:${lineHeight};color:#111827;margin:0 0 8px 0;">${escapeHtml(line)}</div>`).join('')}
    </div>
  `;
}

function renderHtmlEmail({ subject, arabicLines, englishLines, indonesianLines }) {
  return `
    <div style="margin:0;padding:24px;background:#f4f4f5;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
        <div style="font-family:Arial, Helvetica, sans-serif;font-size:20px;font-weight:700;line-height:1.4;color:#111827;margin:0 0 24px 0;">${escapeHtml(subject)}</div>
        ${renderHtmlSection('Arabic', arabicLines, { rtl: true, arabic: true })}
        ${renderHtmlSection('English', englishLines)}
        ${renderHtmlSection('Indonesia', indonesianLines)}
      </div>
    </div>
  `;
}

function createEmail({ subject, arabicLines, englishLines, indonesianLines }) {
  return {
    subject,
    text: renderTextSections({ arabicLines, englishLines, indonesianLines }),
    html: renderHtmlEmail({ subject, arabicLines, englishLines, indonesianLines })
  };
}

function getBaseMemberDetails(member) {
  return {
    arabicName: safeValue(member?.arabic_name_snapshot),
    englishName: safeValue(member?.english_name_snapshot),
    email: safeValue(member?.email),
    city: safeValue(member?.city),
    country: safeValue(member?.country),
    submittedAt: formatTimestamp(member?.created_at),
    approvedAt: formatTimestamp(member?.approved_at || member?.updated_at),
    promotedAt: formatTimestamp(member?.updated_at || member?.approved_at)
  };
}

export function buildPendingMemberEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'طلب عضوية جديد | New Member Registration',
    arabicLines: [
      'تم استلام طلب عضوية جديد ويحتاج إلى التحقق من قبل الإدارة.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `البريد الإلكتروني: ${details.email}`,
      `المدينة: ${details.city}`,
      `الدولة: ${details.country}`,
      `وقت الإرسال: ${details.submittedAt}`
    ],
    englishLines: [
      'A new member registration has been submitted and requires admin verification.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Email: ${details.email}`,
      `City: ${details.city}`,
      `Country: ${details.country}`,
      `Submitted at: ${details.submittedAt}`
    ],
    indonesianLines: [
      'Ada pendaftaran member baru yang telah dikirim dan perlu diverifikasi oleh admin.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Email: ${details.email}`,
      `Kota: ${details.city}`,
      `Negara: ${details.country}`,
      `Waktu pengiriman: ${details.submittedAt}`
    ]
  });
}

export function buildPendingMemberForRegistrantEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'تم استلام طلب عضويتك | Your Registration Is Pending Verification',
    arabicLines: [
      'تم استلام طلب عضويتك بنجاح وهو الآن بانتظار التحقق.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `البريد الإلكتروني: ${details.email}`,
      `وقت الإرسال: ${details.submittedAt}`
    ],
    englishLines: [
      'Your member registration has been received and is now waiting for verification.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Email: ${details.email}`,
      `Submitted at: ${details.submittedAt}`
    ],
    indonesianLines: [
      'Pendaftaran member Anda telah diterima dan saat ini sedang menunggu verifikasi.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Email: ${details.email}`,
      `Waktu pengiriman: ${details.submittedAt}`
    ]
  });
}

export function buildAdminPromotionEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'تعيين مشرف جديد | New Admin Appointment',
    arabicLines: [
      'تم تعيين عضو جديد كمشرف في نظام شجرة العائلة.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `البريد الإلكتروني: ${details.email}`,
      `وقت التعيين: ${details.promotedAt}`
    ],
    englishLines: [
      'A member has been appointed as a new admin in the family tree system.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Email: ${details.email}`,
      `Promoted at: ${details.promotedAt}`
    ],
    indonesianLines: [
      'Seorang member telah diangkat menjadi admin baru dalam sistem pohon keluarga.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Email: ${details.email}`,
      `Waktu pengangkatan: ${details.promotedAt}`
    ]
  });
}

export function buildAdminPromotionForMemberEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'تم تعيينك مشرفاً | You Have Been Appointed as Admin',
    arabicLines: [
      'تم تعيينك مشرفاً في نظام شجرة العائلة.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `وقت التعيين: ${details.promotedAt}`
    ],
    englishLines: [
      'You have been appointed as an admin in the family tree system.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Promoted at: ${details.promotedAt}`
    ],
    indonesianLines: [
      'Anda telah diangkat menjadi admin dalam sistem pohon keluarga.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Waktu pengangkatan: ${details.promotedAt}`
    ]
  });
}

export function buildMemberApprovedEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'تم اعتماد عضو جديد | New Member Verification',
    arabicLines: [
      'تم اعتماد عضو جديد في نظام شجرة العائلة.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `البريد الإلكتروني: ${details.email}`,
      `وقت الاعتماد: ${details.approvedAt}`
    ],
    englishLines: [
      'A new member has been verified in the family tree system.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Email: ${details.email}`,
      `Verified at: ${details.approvedAt}`
    ],
    indonesianLines: [
      'Seorang member baru telah diverifikasi dalam sistem pohon keluarga.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Email: ${details.email}`,
      `Waktu verifikasi: ${details.approvedAt}`
    ]
  });
}

export function buildMemberApprovedForMemberEmail(member) {
  const details = getBaseMemberDetails(member);

  return createEmail({
    subject: 'تم اعتماد عضويتك | Your Membership Has Been Verified',
    arabicLines: [
      'تم اعتماد عضويتك بنجاح في نظام شجرة العائلة.',
      `الاسم العربي: ${details.arabicName}`,
      `الاسم الإنجليزي: ${details.englishName}`,
      `وقت الاعتماد: ${details.approvedAt}`
    ],
    englishLines: [
      'Your membership has been verified successfully in the family tree system.',
      `Arabic name: ${details.arabicName}`,
      `English name: ${details.englishName}`,
      `Verified at: ${details.approvedAt}`
    ],
    indonesianLines: [
      'Keanggotaan Anda telah berhasil diverifikasi dalam sistem pohon keluarga.',
      `Nama Arab: ${details.arabicName}`,
      `Nama English: ${details.englishName}`,
      `Waktu verifikasi: ${details.approvedAt}`
    ]
  });
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

  return createEmail({
    subject: 'اقتراح جديد بانتظار المراجعة | New Proposal Awaiting Review',
    arabicLines: [
      'تم إرسال اقتراح جديد من زائر أو عضو ويحتاج إلى المراجعة.',
      `نوع الاقتراح: ${labels.arabic}`,
      `الاسم العربي المستهدف: ${targetArabicName}`,
      `الاسم الإنجليزي المستهدف: ${targetEnglishName}`,
      `اسم الأب بالعربية: ${parentArabicName}`,
      `اسم الأب بالإنجليزية: ${parentEnglishName}`,
      `وقت الإرسال: ${submittedAt}`
    ],
    englishLines: [
      'A new guest or member proposal has been submitted and requires review.',
      `Proposal type: ${labels.english}`,
      `Target Arabic name: ${targetArabicName}`,
      `Target English name: ${targetEnglishName}`,
      `Parent Arabic name: ${parentArabicName}`,
      `Parent English name: ${parentEnglishName}`,
      `Submitted at: ${submittedAt}`
    ],
    indonesianLines: [
      'Ada usulan baru dari guest atau member yang telah dikirim dan perlu ditinjau.',
      `Jenis usulan: ${labels.indonesian}`,
      `Nama Arab target: ${targetArabicName}`,
      `Nama English target: ${targetEnglishName}`,
      `Nama ayah Arab: ${parentArabicName}`,
      `Nama ayah English: ${parentEnglishName}`,
      `Waktu pengiriman: ${submittedAt}`
    ]
  });
}

export function buildAdminTreeChangeEmail({ notice, nodeDetails }) {
  const targetArabicName = safeValue(nodeDetails?.node?.arabic_name);
  const targetEnglishName = safeValue(nodeDetails?.node?.english_name);
  const parentArabicName = safeValue(nodeDetails?.parent?.arabic_name);
  const parentEnglishName = safeValue(nodeDetails?.parent?.english_name);
  const happenedAt = formatTimestamp(notice?.created_at || notice?.timestamp);
  const isAddChild = notice?.type === 'new_member';

  return createEmail({
    subject: isAddChild ? 'إضافة اسم جديد من الإدارة | Admin Added a New Family Member' : 'تعديل اسم من الإدارة | Admin Updated a Family Name',
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
  });
}
