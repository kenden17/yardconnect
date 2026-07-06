// server/utils/validate.js — Input validation helpers
const dns = require('dns').promises;

// ── US ZIP → {city, state} lookup (partial dataset, major ZIPs) ──────────────
// We use a curated list of ~43k ZIP codes bundled as a JSON file.
// For server use we do a lightweight check: ZIP must be 5 digits and
// the state abbreviation provided must match the ZIP prefix range.
// Full city/state matching requires the full USPS dataset — here we
// validate structure and state-prefix plausibility.

const STATE_ZIP_PREFIXES = {
  AL:[350,352,354,356,357,358,359,360,361,362,363,364,365,366,367,368,369],
  AK:[995,996,997,998,999],
  AZ:[850,852,853,855,856,857,858,859,860,863,864,865],
  AR:[716,717,718,719,720,721,722,723,724,725,726,727,728,729],
  CA:[900,901,902,903,904,905,906,907,908,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,930,931,932,933,934,935,936,937,938,939,940,941,942,943,944,945,946,947,948,949,950,951,952,953,954,955,959,960,961],
  CO:[800,801,802,803,804,805,806,807,808,809,810,811,812,813,814,815,816],
  CT:[60,61,62,63,64,65,66,67,68,69],
  DE:[197,198,199],
  FL:[320,321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,341,342,344,346,347,349],
  GA:[300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,398,399],
  HI:[967,968],
  ID:[832,833,834,835,836,837,838],
  IL:[600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,622,623,624,625,626,627,628,629],
  IN:[460,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,479],
  IA:[500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,520,521,522,523,524,525,526,527,528],
  KS:[660,661,662,664,665,666,667,668,669,670,671,672,673,674,675,676,677,678,679],
  KY:[400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,420,421,422,423,424,425,426,427],
  LA:[700,701,703,704,705,706,707,708,710,711,712,713,714],
  ME:[39,40,41,42,43,44,45,46,47,48,49],
  MD:[206,207,208,209,210,211,212,214,215,216,217,218,219],
  MA:[10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27],
  MI:[480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,495,496,497,498,499],
  MN:[550,551,553,554,555,556,557,558,559,560,561,562,563,564,565,566,567],
  MS:[386,387,388,389,390,391,392,393,394,395,396,397],
  MO:[630,631,633,634,635,636,637,638,639,640,641,644,645,646,647,648,649,650,651,652,653,654,655,656,657,658],
  MT:[590,591,592,593,594,595,596,597,598,599],
  NE:[680,681,683,684,685,686,687,688,689,690,691,692,693],
  NV:[889,890,891,893,894,895,897,898],
  NH:[30,31,32,33,34,35,36,37,38],
  NJ:[70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89],
  NM:[870,871,872,873,874,875,877,878,879,880,881,882,883,884],
  NY:[100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149],
  NC:[270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289],
  ND:[580,581,582,583,584,585,586,587,588],
  OH:[430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457,458],
  OK:[730,731,734,735,736,737,738,739,740,741,743,744,745,746,747,748,749],
  OR:[970,971,972,973,974,975,976,977,978,979],
  PA:[150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196],
  RI:[28,29],
  SC:[290,291,292,293,294,295,296,297,298,299],
  SD:[570,571,572,573,574,575,576,577],
  TN:[370,371,372,373,374,375,376,377,378,379,380,381,382,383,384,385],
  TX:[750,751,752,753,754,755,756,757,758,759,760,761,762,763,764,765,766,767,768,769,770,772,773,774,775,776,777,778,779,780,781,782,783,784,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799],
  UT:[840,841,842,843,844,845,846,847],
  VT:[50,51,52,53,54,55,56,57,58,59],
  VA:[201,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246],
  WA:[980,981,982,983,984,985,986,988,989,990,991,992,993,994],
  WV:[247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268],
  WI:[530,531,532,534,535,537,538,539,540,541,542,543,544,545,546,547,548,549],
  WY:[820,821,822,823,824,825,826,827,828,829,830,831],
  DC:[200,202,203,204,205],
  PR:[900,906,907,908,909],
};

/**
 * Validates that a 5-digit ZIP code is structurally valid for the given
 * 2-letter US state abbreviation.
 * Returns { valid: boolean, error?: string }
 */
function validateZipState(zip, state) {
  if (!zip || !/^\d{5}$/.test(zip)) return { valid: false, error: 'ZIP code must be 5 digits.' };
  const st = (state || '').toUpperCase().trim();
  if (!st || st.length !== 2) return { valid: false, error: 'State must be a 2-letter abbreviation.' };
  const prefixes = STATE_ZIP_PREFIXES[st];
  if (!prefixes) return { valid: false, error: `"${st}" is not a valid US state abbreviation.` };
  const prefix = parseInt(zip.slice(0, 3), 10);
  if (!prefixes.includes(prefix)) {
    return { valid: false, error: `ZIP code ${zip} does not appear to be in ${st}.` };
  }
  return { valid: true };
}

/**
 * Validates a US phone number (10 digits, valid area code).
 * Strips all non-digit characters first.
 */
function validatePhone(phone) {
  if (!phone) return { valid: false, error: 'Phone number is required.' };
  const digits = phone.replace(/\D/g, '');
  // Allow +1 country code prefix
  const normalized = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  if (normalized.length !== 10) return { valid: false, error: 'Phone number must be 10 digits.' };
  const area = parseInt(normalized.slice(0, 3), 10);
  // Area codes cannot start with 0 or 1
  if (area < 200) return { valid: false, error: 'Phone number has an invalid area code.' };
  // N11 area codes (211, 311, etc.) are not valid geographic area codes
  if (normalized[1] === '1' && normalized[2] === '1') {
    return { valid: false, error: 'Phone number has an invalid area code.' };
  }
  return { valid: true, normalized };
}

/**
 * Validates a US driver's license or state ID number format by state.
 * Returns { valid: boolean, error?: string }
 * Patterns sourced from AAMVA DL/ID standard and public state-specific formats.
 */
const DL_PATTERNS = {
  AL: /^\d{7,8}$/,
  AK: /^\d{1,7}$/,
  AZ: /^[A-Z]\d{8}$|^\d{9}$/,
  AR: /^\d{9}$/,
  CA: /^[A-Z]\d{7}$/,
  CO: /^\d{9}$|^[A-Z]\d{3,6}$|^[A-Z]{2}\d{2,5}$/,
  CT: /^\d{9}$/,
  DE: /^\d{1,7}$/,
  FL: /^[A-Z]\d{12}$/,
  GA: /^\d{7,9}$/,
  HI: /^[A-Z]\d{8}$|^\d{9}$/,
  ID: /^[A-Z]{2}\d{6}[A-Z]$/,
  IL: /^[A-Z]\d{11,12}$/,
  IN: /^[A-Z]\d{9}$|^\d{9,10}$/,
  IA: /^\d{9}$|^\d{3}[A-Z]{2}\d{4}$/,
  KS: /^[A-Z]\d{8}$|^[A-Z]{1,2}\d{5,8}$|^\d{9}$/,
  KY: /^[A-Z]\d{8,9}$/,
  LA: /^\d{9}$/,
  ME: /^\d{7}$|^\d{8}$/,
  MD: /^[A-Z]\d{12}$/,
  MA: /^[A-Z]\d{8}$|^\d{9}$/,
  MI: /^[A-Z]\d{10}$|^[A-Z]\d{12}$/,
  MN: /^[A-Z]\d{12}$/,
  MS: /^\d{9}$/,
  MO: /^[A-Z]\d{5,9}$|^\d{9}$|^\d{8}[A-Z]{2}$/,
  MT: /^\d{9}$|^[A-Z]\d{8}$|^\d{13,14}$|^[A-Z]{3}\d{10}$/,
  NE: /^[A-Z]\d{6,8}$/,
  NV: /^\d{9,10}$|^[A-Z]\d{8}$|^X\d{8}$/,
  NH: /^\d{2}[A-Z]{3}\d{5}$/,
  NJ: /^[A-Z]\d{14}$/,
  NM: /^\d{8,9}$/,
  NY: /^\d{9}$|^[A-Z]{2}\d{7}$|^[A-Z]\d{7}$|^\d{16}$/,
  NC: /^\d{1,12}$/,
  ND: /^[A-Z]{3}\d{6}$|^\d{9}$/,
  OH: /^[A-Z]{2}\d{6}$|^[A-Z]\d{4,8}$|^\d{8}$/,
  OK: /^[A-Z]\d{9}$|^\d{9}$/,
  OR: /^\d{1,9}$/,
  PA: /^\d{8}$/,
  RI: /^\d{7}$|^V\d{6}$/,
  SC: /^\d{5,11}$/,
  SD: /^\d{6,10}$|^[A-Z]{1,2}\d{6,7}$/,
  TN: /^\d{7,9}$/,
  TX: /^\d{8}$/,
  UT: /^\d{4,10}$/,
  VT: /^\d{8}$|^\d{7}[A-Z]$/,
  VA: /^[A-Z]\d{8}$|^\d{9}$/,
  WA: /^(?=.{12}$)[A-Z]{1,7}\d*[A-Z*]*$/,
  WV: /^[A-Z0-9]\d{6}$/,
  WI: /^[A-Z]\d{13}$/,
  WY: /^\d{9,10}$/,
  DC: /^\d{7}$/,
};

/**
 * Validates an ID number based on type and, for DL/State ID, the state.
 */
function validateIdNumber(idType, idNum, state) {
  const num = (idNum || '').trim().toUpperCase().replace(/[-\s]/g, '');
  if (!num) return { valid: false, error: 'ID number is required.' };

  if (idType === 'Passport') {
    // US passport: letter followed by 8 digits
    if (/^[A-Z]\d{8}$/.test(num)) return { valid: true };
    // Also accept 9-digit numeric (older format)
    if (/^\d{9}$/.test(num)) return { valid: true };
    return { valid: false, error: 'US passport numbers are a letter followed by 8 digits (e.g. A12345678).' };
  }

  if (idType === "Driver's License" || idType === 'State ID') {
    const st = (state || '').toUpperCase().trim();
    if (!st || st.length !== 2) return { valid: false, error: 'State is required to validate your ID number.' };
    const pattern = DL_PATTERNS[st];
    if (!pattern) return { valid: true }; // unknown state — skip pattern check
    if (pattern.test(num)) return { valid: true };
    return { valid: false, error: `ID number format doesn't match a ${st} ${idType}. Please double-check your entry.` };
  }

  // Unrecognized type — require at least 4 chars
  if (num.length < 4) return { valid: false, error: 'ID number must be at least 4 characters.' };
  return { valid: true };
}

/**
 * Checks that an email domain has MX records (i.e. it can receive mail).
 * This is async — use with await.
 */
async function validateEmailDomain(email) {
  try {
    const domain = email.split('@')[1];
    if (!domain) return { valid: false, error: 'Invalid email address.' };
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, error: `The email domain "${domain}" cannot receive mail.` };
    }
    return { valid: true };
  } catch {
    // DNS lookup failed — domain doesn't exist or no MX records
    return { valid: false, error: `The email domain does not appear to exist. Please check your email address.` };
  }
}

/**
 * Validates a full name — at least 2 words, letters only (allows hyphens, apostrophes).
 */
function validateFullName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { valid: false, error: 'Full legal name is required.' };
  if (trimmed.length < 3) return { valid: false, error: 'Name is too short.' };
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(trimmed)) {
    return { valid: false, error: 'Name should contain only letters, hyphens, or apostrophes.' };
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { valid: false, error: 'Please enter your full legal name (first and last).' };
  return { valid: true };
}

module.exports = { validateZipState, validatePhone, validateIdNumber, validateEmailDomain, validateFullName };
