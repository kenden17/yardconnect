// server/utils/ageCheck.js

function getAge(dobString) {
  if (!dobString) return -1;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Poster must be 18+
// In dev mode always passes so you can test easily
function isPosterOldEnough(dobString) {
  if (process.env.NODE_ENV !== 'production') return true;
  return getAge(dobString) >= 18;
}

// Student must be 13–20
// In dev mode always passes
function isStudentAgeValid(dobString) {
  if (process.env.NODE_ENV !== 'production') return true;
  const age = getAge(dobString);
  return age >= 13 && age <= 20;
}

module.exports = { getAge, isPosterOldEnough, isStudentAgeValid };
