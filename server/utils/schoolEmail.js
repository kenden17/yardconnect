// server/utils/schoolEmail.js — Strict school/k12 email validator

// Free/commercial email providers that are never school emails.
// Any address from these domains is rejected outright.
const BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com',
  'msn.com', 'passport.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com',
  'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'gmx.us',
  'inbox.com', 'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tuta.io',
  'hey.com',
  'yandex.com', 'yandex.ru',
  'rediffmail.com',
  'comcast.net', 'att.net', 'verizon.net', 'cox.net',
  'bellsouth.net', 'sbcglobal.net', 'charter.net', 'earthlink.net',
]);

// Patterns that positively identify a school/educational email.
// All must match the full lowercase email.
const SCHOOL_PATTERNS = [
  // US k12 formats
  /\.k12\.[a-z]{2}\.us$/,           // @students.district.k12.tx.us
  /\.k12\.[a-z]+\.edu$/,            // @school.k12.edu
  /@[^@]+\.k12$/,                   // @district.k12

  // .edu domains (colleges, universities, some high schools)
  /\.edu$/,

  // Common student subdomain patterns
  /^[^@]+@student[s]?\./,           // @student.school.org
  /^[^@]+@stu\./,                   // @stu.district.org
  /^[^@]+@[^@]*\.student[s]?\./,    // @name.students.school.edu

  // District / school org identifiers in domain
  /^[^@]+@[^@]*isd\.[a-z]{2,}$/,    // @district.isd.net
  /^[^@]+@[^@]*cisd\.[a-z]{2,}$/,   // @conroeisd.net
  /^[^@]+@[^@]*cusd\.[a-z]{2,}$/,   // @capousd.org
  /^[^@]+@[^@]*usd\.[a-z]{2,}$/,    // @lausd.net
  /^[^@]+@[^@]*csd\.[a-z]{2,}$/,    // @nycschools.csd.org
  /^[^@]+@[^@]*\.school\.[a-z]{2,}$/, // @my.school.nz
  /^[^@]+@[^@]*school\.[a-z]{2,}$/, // @anyschool.org
  /^[^@]+@[^@]*schools\.[a-z]{2,}$/, // @puyallupschools.org
  /^[^@]+@[^@]*academy\.[a-z]{2,}$/, // @kipp.academy
  /^[^@]+@[^@]*highschool\.[a-z]{2,}$/, // @lhighschool.org
  /^[^@]+@[^@]*\.hs\.[a-z]{2,}$/,   // @north.hs.edu
  /^[^@]+@[^@]*college\.[a-z]{2,}$/, // @deanza.college.edu
  /^[^@]+@[^@]*university\.[a-z]{2,}$/, // @mit.university.edu
];

function isSchoolEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();

  // Dev mode: skip check entirely so you can test with any email
  if (process.env.NODE_ENV !== 'production') return true;

  // Internal test domain
  if (lower.endsWith('@campushands.test')) return true;

  const domain = lower.split('@')[1];
  if (!domain) return false;

  // Hard block on known commercial providers
  if (BLOCKED_DOMAINS.has(domain)) return false;

  // Must match at least one school pattern
  return SCHOOL_PATTERNS.some(re => re.test(lower));
}

module.exports = { isSchoolEmail };
