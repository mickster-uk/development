// WebAgent API performance tests
// Run with: k6 run tests/performance/api.k6.js
// Results saved to: ~/Documents/knowbase/apps/webagent/tests/performance/
// Expects WebAgent to be running on http://localhost:3456

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3456';

// Custom metrics
const healthLatency   = new Trend('health_latency',   true);
const sitesLatency    = new Trend('sites_latency',    true);
const searchLatency   = new Trend('search_latency',   true);
const errorRate       = new Rate('error_rate');
const requestCount    = new Counter('total_requests');

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-vus',
      vus: 5,
      duration: '15s',
      exec: 'healthCheck',
      tags: { scenario: 'health' }
    },
    sites_list: {
      executor: 'constant-vus',
      vus: 3,
      duration: '15s',
      exec: 'sitesList',
      tags: { scenario: 'sites' }
    },
    search_api: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '15s', target: 5 },
        { duration: '5s',  target: 0 }
      ],
      exec: 'searchApi',
      tags: { scenario: 'search' }
    }
  },
  thresholds: {
    'health_latency':    ['p(95)<200'],
    'sites_latency':     ['p(95)<300'],
    'search_latency':    ['p(95)<2000'],
    'error_rate':        ['rate<0.05'],
    'http_req_duration': ['p(99)<3000']
  }
};

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  requestCount.add(1);
  healthLatency.add(res.timings.duration);

  const ok = check(res, {
    'health status 200':       r => r.status === 200,
    'health returns status ok': r => {
      try { return JSON.parse(r.body).status !== undefined; } catch { return false; }
    }
  });
  errorRate.add(!ok);
  sleep(0.2);
}

export function sitesList() {
  const res = http.get(`${BASE_URL}/api/sites`, {
    headers: { 'Accept': 'application/json' }
  });
  requestCount.add(1);
  sitesLatency.add(res.timings.duration);

  const ok = check(res, {
    'sites status 200':      r => r.status === 200,
    'sites returns array':   r => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    }
  });
  errorRate.add(!ok);
  sleep(0.3);
}

export function searchApi() {
  const payload = JSON.stringify({ query: 'test search query', limit: 5 });
  const res = http.post(`${BASE_URL}/api/search`, payload, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  });
  requestCount.add(1);
  searchLatency.add(res.timings.duration);

  const ok = check(res, {
    'search status 200 or 400': r => r.status === 200 || r.status === 400,
    'search returns json':      r => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    }
  });
  errorRate.add(!ok);
  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'tests/performance/results/summary.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
