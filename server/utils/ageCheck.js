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

function isPosterOldEnough(dobString) {
  if (process.env.DISABLE_SAFETY_CHECKS === 'true') return true;
  return getAge(dobString) >= 18;
}

function isStudentAgeValid(dobString) {
  if (process.env.DISABLE_SAFETY_CHECKS === 'true') return true;
  const age = getAge(dobString);
  return age >= 16 && age <= 24;
}

module.exports = { getAge, isPosterOldEnough, isStudentAgeValid };
