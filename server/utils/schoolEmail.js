// server/utils/schoolEmail.js — School/k12 email validator

const SCHOOL_PATTERNS = [
  /\.k12\.[a-z]{2}\.us$/i,
  /\.k12\.[a-z]+\.edu$/i,
  /^[^@]+@[^@]+\.k12$/i,
  /\.edu$/i,
  /student[s]?\.[^@]+\.[a-z]{2,}$/i,
  /stu\.[^@]+\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*school[^@]*\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*isd\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*cusd\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*usd\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*hs\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*academy\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*highschool\.[a-z]{2,}$/i,
];

function isSchoolEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  // Dev shortcut
  if (lower.endsWith('@campushands.test')) return true;
  return SCHOOL_PATTERNS.some(re => re.test(lower));
}

module.exports = { isSchoolEmail };
