// public/js/api.js — Shared API helper
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body = null, isForm = false) {
    const token = localStorage.getItem('yc_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    const opts = { method, headers, credentials: 'include' };
    if (body) opts.body = isForm ? body : JSON.stringify(body);

    const res = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    get:    (path)         => request('GET',    path),
    post:   (path, body)   => request('POST',   path, body),
    patch:  (path, body)   => request('PATCH',  path, body),
    delete: (path)         => request('DELETE', path),

    // Auth
    login:    (email, password)        => request('POST', '/auth/login',    { email, password }),
    register: (name, email, pw, role)  => request('POST', '/auth/register', { name, email, password: pw, role }),
    logout:   ()                       => request('POST', '/auth/logout'),
    me:       ()                       => request('GET',  '/auth/me'),

    // Jobs
    getJobs:        (params = {}) => request('GET', '/jobs?' + new URLSearchParams(params).toString()),
    getJob:         (id)          => request('GET', `/jobs/${id}`),
    postJob:        (data)        => request('POST', '/jobs', data),
    editJob:        (id, data)    => request('PATCH', `/jobs/${id}`, data),
    cancelJob:      (id)          => request('DELETE', `/jobs/${id}`),
    myJobsHomeowner: ()           => request('GET', '/jobs/mine/homeowner'),
    myJobsStudent:   ()           => request('GET', '/jobs/mine/student'),

    // Applications
    apply:      (job_id, message) => request('POST', '/applications', { job_id, message }),
    getApplicants: (jobId)        => request('GET',  `/applications/job/${jobId}`),
    acceptApp:  (id)              => request('PATCH', `/applications/${id}/accept`),
    rejectApp:  (id)              => request('PATCH', `/applications/${id}/reject`),

    // Payments
    createPaymentIntent: (job_id) => request('POST', '/payments/create-intent', { job_id }),
    confirmPayment: (pi_id)       => request('POST', '/payments/confirm', { payment_intent_id: pi_id }),
    paymentHistory: ()            => request('GET',  '/payments/history'),
    stripeOnboard:  ()            => request('POST', '/payments/onboard-student'),
  };
})();
