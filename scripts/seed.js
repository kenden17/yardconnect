// scripts/seed.js — Adds test users and jobs to the database
// Run with: node scripts/seed.js
require('dotenv').config();
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../server/db');

// ── Helper ────────────────────────────────────────────────────────────────────
function ago(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function seed() {
  console.log('🌱 Seeding test data...\n');

  // ── Test Students ──────────────────────────────────────────────────────────
  const password = await bcrypt.hash('Test1234!', 12);

  const students = [
    { name: 'Alex Rivera',   email: 'alex@students.austinisd.k12.tx.us', dob: '2007-03-14', rating: 4.8, rcount: 12 },
    { name: 'Jordan Lee',    email: 'jordan@students.austinisd.k12.tx.us', dob: '2006-07-22', rating: 4.5, rcount: 6 },
    { name: 'Maya Patel',    email: 'maya@stu.utexas.edu',                dob: '2005-11-08', rating: 5.0, rcount: 3 },
    { name: 'Tyler Brooks',  email: 'tyler@students.roundrockisd.k12.tx.us', dob: '2008-01-30', rating: 0, rcount: 0 },
    { name: 'Sofia Nguyen',  email: 'sofia@students.austinisd.k12.tx.us', dob: '2006-09-15', rating: 4.2, rcount: 8 },
  ];

  const studentIds = [];
  for (const s of students) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(s.email);
    if (existing) {
      console.log(`  ⚠️  Skipping existing user: ${s.email}`);
      studentIds.push(existing.id);
      continue;
    }
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, name, email, password, dob, verified, avg_rating, rating_count)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, s.name, s.email, password, s.dob, s.rating, s.rcount);
    studentIds.push(id);
    console.log(`  ✅ Student: ${s.name} <${s.email}>`);
  }

  console.log('');

  // ── Test Jobs ──────────────────────────────────────────────────────────────
  const jobs = [
    {
      poster_name:    'Karen Mitchell',
      poster_email:   'karen.mitchell@email.com',
      poster_phone:   '512-555-0101',
      poster_address: '1842 Barton Hills Dr, Austin, TX 78704',
      poster_dob:     '1978-04-12',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX12345678',
      poster_agreed:  1,
      title:          'Help with yard cleanup and leaf blowing',
      description:    'Need someone to rake leaves, edge the lawn, and bag everything up. About 3-4 hours of work. All equipment provided — just bring energy! Backyard has a dog (friendly golden retriever). Great starter job.',
      category:       'Yard & Outdoor',
      pay:            55.00,
      address:        '1842 Barton Hills Dr',
      city:           'Austin',
      state:          'TX',
      zip:            '78704',
      status:         'open',
      duration_estimate: '3–4 hours',
      has_pets:       1,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(2),
    },
    {
      poster_name:    'David Chen',
      poster_email:   'dchen@email.com',
      poster_phone:   '512-555-0202',
      poster_address: '3301 Speedway, Austin, TX 78705',
      poster_dob:     '1965-09-03',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX87654321',
      poster_agreed:  1,
      title:          'Move furniture and boxes to new apartment',
      description:    'Moving from a 1BR to a 2BR about 2 miles away. Mainly boxes and a few pieces of furniture (couch, bed frame, dresser). Will need 2 strong people ideally. Truck provided. Stairs involved — 3rd floor walk-up at destination.',
      category:       'Heavy Moving & Hauling',
      pay:            120.00,
      address:        '3301 Speedway',
      city:           'Austin',
      state:          'TX',
      zip:            '78705',
      status:         'open',
      duration_estimate: '4–5 hours',
      has_pets:       0,
      has_stairs:     1,
      heavy_lifting:  1,
      created_at:     ago(1),
    },
    {
      poster_name:    'Patricia Gomez',
      poster_email:   'pat.gomez@email.com',
      poster_phone:   '512-555-0303',
      poster_address: '7200 Hart Lane, Austin, TX 78731',
      poster_dob:     '1982-06-17',
      poster_id_type: 'State ID',
      poster_id_num:  'TX11223344',
      poster_agreed:  1,
      title:          'Grocery run and light errands',
      description:    'Need someone to pick up groceries from HEB (list will be provided) and drop off a package at the UPS store nearby. Should take about 1.5 hours. You\'ll need a car. Gas reimbursed.',
      category:       'Errands & Delivery',
      pay:            25.00,
      address:        '7200 Hart Lane',
      city:           'Austin',
      state:          'TX',
      zip:            '78731',
      status:         'open',
      duration_estimate: '1–2 hours',
      has_pets:       0,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(3),
    },
    {
      poster_name:    'James Okafor',
      poster_email:   'james.okafor@email.com',
      poster_phone:   '512-555-0404',
      poster_address: '5600 Manor Rd, Austin, TX 78723',
      poster_dob:     '1990-12-01',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX55667788',
      poster_agreed:  1,
      title:          'Set up new TV and help with tech stuff',
      description:    'Just got a new 65" TV and a new laptop. Need help mounting the TV (mount already purchased, wall is drywall), setting up the laptop with Windows, and maybe helping configure the smart home devices. Good for someone tech-savvy.',
      category:       'Tech Help',
      pay:            45.00,
      address:        '5600 Manor Rd',
      city:           'Austin',
      state:          'TX',
      zip:            '78723',
      status:         'open',
      duration_estimate: '2–3 hours',
      has_pets:       0,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(1),
    },
    {
      poster_name:    'Sandra Webb',
      poster_email:   'sandra.w@email.com',
      poster_phone:   '512-555-0505',
      poster_address: '2200 Exposition Blvd, Austin, TX 78703',
      poster_dob:     '1974-02-28',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX99887766',
      poster_agreed:  1,
      title:          'Babysit two kids (ages 7 and 9) Saturday afternoon',
      description:    'Looking for a responsible babysitter for my two kids this Saturday from 2PM to 7PM. Ages 7 and 9, both well-behaved. Activities: games, homework, snacks. Must be 18+. References helpful but not required.',
      category:       'Babysitting & Childcare',
      pay:            75.00,
      address:        '2200 Exposition Blvd',
      city:           'Austin',
      state:          'TX',
      zip:            '78703',
      status:         'open',
      duration_estimate: '5 hours',
      has_pets:       1,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(4),
    },
    {
      poster_name:    'Robert Kim',
      poster_email:   'rkim@email.com',
      poster_phone:   '512-555-0606',
      poster_address: '900 Congress Ave, Austin, TX 78701',
      poster_dob:     '1988-08-11',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX44332211',
      poster_agreed:  1,
      title:          'Assemble IKEA furniture — dresser, bookshelf, desk',
      description:    'Bought three pieces of IKEA furniture that need assembling. All boxes are already here. MALM dresser (6 drawer), KALLAX shelf, and a LINNMON desk setup. Tools provided. Moderate lifting involved.',
      category:       'Furniture Assembly',
      pay:            65.00,
      address:        '900 Congress Ave',
      city:           'Austin',
      state:          'TX',
      zip:            '78701',
      status:         'open',
      duration_estimate: '3–4 hours',
      has_pets:       0,
      has_stairs:     1,
      heavy_lifting:  1,
      created_at:     ago(5),
    },
    {
      poster_name:    'Lisa Torres',
      poster_email:   'l.torres@email.com',
      poster_phone:   '512-555-0707',
      poster_address: '4801 Burnet Rd, Austin, TX 78756',
      poster_dob:     '1985-05-20',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX66554433',
      poster_agreed:  1,
      title:          'Deep clean kitchen and bathrooms',
      description:    'Need a thorough cleaning of my kitchen (stovetop, inside oven, counters, sink, cabinet exteriors) and two bathrooms (toilets, tubs, mirrors, floors). All cleaning supplies provided. About 4 hours of work.',
      category:       'Cleaning & Tidying',
      pay:            60.00,
      address:        '4801 Burnet Rd',
      city:           'Austin',
      state:          'TX',
      zip:            '78756',
      status:         'open',
      duration_estimate: '3–4 hours',
      has_pets:       0,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(2),
    },
    {
      poster_name:    'Mark Stevenson',
      poster_email:   'mark.s@email.com',
      poster_phone:   '512-555-0808',
      poster_address: '1100 Lavaca St, Austin, TX 78701',
      poster_dob:     '1979-11-14',
      poster_id_type: "Driver's License",
      poster_id_num:  'TX77889900',
      poster_agreed:  1,
      title:          'Walk and feed my two dogs for a week',
      description:    'Going out of town for 7 days. Need someone to come by once in the morning (7-8am) and once in the evening (5-6pm) to walk and feed my two labs. They\'re friendly but energetic. Full instructions and house key provided.',
      category:       'Pet Care',
      pay:            140.00,
      address:        '1100 Lavaca St',
      city:           'Austin',
      state:          'TX',
      zip:            '78701',
      status:         'open',
      duration_estimate: '1 hr/day × 7 days',
      has_pets:       1,
      has_stairs:     0,
      heavy_lifting:  0,
      created_at:     ago(6),
    },
  ];

  for (const job of jobs) {
    const existing = db.prepare(
      'SELECT id FROM jobs WHERE poster_email = ? AND title = ?'
    ).get(job.poster_email, job.title);
    if (existing) {
      console.log(`  ⚠️  Skipping existing job: "${job.title}"`);
      continue;
    }
    const id = uuidv4();
    db.prepare(`
      INSERT INTO jobs (
        id, poster_name, poster_email, poster_phone, poster_address,
        poster_dob, poster_id_type, poster_id_num, poster_id_photo,
        poster_agreed, title, description, category, pay,
        address, city, state, zip, status,
        duration_estimate, has_pets, has_stairs, heavy_lifting, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      id, job.poster_name, job.poster_email, job.poster_phone, job.poster_address,
      job.poster_dob, job.poster_id_type, job.poster_id_num, null,
      job.poster_agreed, job.title, job.description, job.category, job.pay,
      job.address, job.city, job.state, job.zip, job.status,
      job.duration_estimate, job.has_pets, job.has_stairs, job.heavy_lifting,
      job.created_at
    );
    console.log(`  ✅ Job: "${job.title}" — $${job.pay} (${job.category})`);
  }

  console.log('\n✨ Seed complete!');
  console.log('\nTest student login credentials (all same password):');
  console.log('  Password: Test1234!');
  students.forEach(s => console.log(`  ${s.name}: ${s.email}`));
  console.log('\nNote: babysitting jobs require 18+ — students born before 2006 can apply.');
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
