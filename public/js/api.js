// public/js/api.js — Shared API helper
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body = null) {
    const token = localStorage.getItem('ch_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body)  headers['Content-Type']  = 'application/json';

    const opts = { method, headers, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    // Auth
    register: (name, email, pw, dob, agreedToGuidelines) =>
      request('POST', '/auth/register', { name, email, password: pw, dob, agreed_to_guidelines: agreedToGuidelines }),
    login:    (email, pw) => request('POST', '/auth/login',  { email, password: pw }),
    logout:   ()          => request('POST', '/auth/logout'),
    me:       ()          => request('GET',  '/auth/me'),

    // Jobs
    getJobs:       (params = {}) => request('GET', '/jobs?' + new URLSearchParams(params).toString()),
    getCategories: ()            => request('GET', '/jobs/categories'),
    myJobsStudent: ()            => request('GET', '/jobs/mine/student'),
    rateJob:       (id, data)    => request('POST', `/jobs/${id}/rate`, data),

    // Applications
    apply: (job_id, message) => request('POST', '/applications', { job_id, message }),

    // Earnings
    paymentHistory: () => request('GET', '/payments/history'),
  };
})();
