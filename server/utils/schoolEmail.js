// server/utils/schoolEmail.js
// Validates that an email is from a recognized k12 or school domain.

// Common k12 / school email patterns
const SCHOOL_PATTERNS = [
  /\.k12\.[a-z]{2}\.us$/i,          // *.k12.tx.us, *.k12.ca.us, etc.
  /\.k12\.[a-z]+\.edu$/i,            // some states use .k12.*.edu
  /^[^@]+@[^@]+\.k12$/i,            // @school.k12
  /\.edu$/i,                         // any .edu address (colleges + high school)
  /student[s]?\.[^@]+\.[a-z]{2,}$/i,// students.district.org
  /stu\.[^@]+\.[a-z]{2,}$/i,        // stu.district.net
  /^[^@]+@[^@]*school[^@]*\.[a-z]{2,}$/i, // @anyschool.com
  /^[^@]+@[^@]*isd\.[a-z]{2,}$/i,   // @districtISD.net
  /^[^@]+@[^@]*cusd\.[a-z]{2,}$/i,  // @cusd.com
  /^[^@]+@[^@]*usd\.[a-z]{2,}$/i,   // @usd.com
  /^[^@]+@[^@]*hs\.[a-z]{2,}$/i,    // @wesths.edu
  /^[^@]+@[^@]*academy\.[a-z]{2,}$/i,
  /^[^@]+@[^@]*highschool\.[a-z]{2,}$/i,
];

/**
 * Returns true if the email looks like a school / k12 address.
 * For development, also accepts @yardconnect.test
 */
function isSchoolEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();

  // Dev shortcut
  if (lower.endsWith('@yardconnect.test')) return true;

  return SCHOOL_PATTERNS.some(re => re.test(lower));
}

module.exports = { isSchoolEmail };
