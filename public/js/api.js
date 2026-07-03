// public/js/api.js — Shared API helper
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body = null) {
    const token = localStorage.getItem('ch_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body)  headers['Content-Type'] = 'application/json';

    const opts = { method, headers, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);

    const res  = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    // Auth (students only)
    register: (name, email, pw) => request('POST', '/auth/register', { name, email, password: pw }),
    login:    (email, pw)       => request('POST', '/auth/login',    { email, password: pw }),
    logout:   ()                => request('POST', '/auth/logout'),
    me:       ()                => request('GET',  '/auth/me'),

    // Jobs / Tasks
    getJobs:       (params = {}) => request('GET', '/jobs?' + new URLSearchParams(params).toString()),
    getCategories: ()            => request('GET', '/jobs/categories'),
    postJob:       (data)        => request('POST', '/jobs', data),
    myJobsStudent: ()            => request('GET', '/jobs/mine/student'),
    markComplete:  (jobId, posterEmail) => request('POST', `/jobs/${jobId}/mark-complete`, { poster_email: posterEmail }),
    rateJob:       (jobId, data)        => request('POST', `/jobs/${jobId}/rate`, data),

    // Applications (student applies)
    apply: (job_id, message) => request('POST', '/applications', { job_id, message }),

    // Payments (student)
    paymentHistory: () => request('GET',  '/payments/history'),
    stripeOnboard:  () => request('POST', '/payments/onboard-student'),
  };
})();
