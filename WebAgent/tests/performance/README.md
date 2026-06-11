# WebAgent Performance Tests

k6 performance tests for the WebAgent REST API.

## Prerequisites

- [k6 installed](https://k6.io/docs/get-started/installation/) (`brew install k6`)
- WebAgent running: `npm start` (default port 3456)

## Run

```bash
# Default (localhost:3456)
k6 run tests/performance/api.k6.js

# Custom host
BASE_URL=http://myserver:3456 k6 run tests/performance/api.k6.js

# Save JSON results to knowbase
k6 run --out json=../../../Documents/knowbase/apps/webagent/tests/performance/results.json \
       tests/performance/api.k6.js
```

## Scenarios

| Scenario | VUs | Duration | Endpoint |
|----------|-----|----------|----------|
| health_check | 5 | 15s | `GET /health` |
| sites_list | 3 | 15s | `GET /api/sites` |
| search_api | 1→5 | 30s ramp | `POST /api/search` |

## Thresholds

| Metric | Threshold |
|--------|-----------|
| `health_latency` p95 | < 200ms |
| `sites_latency` p95 | < 300ms |
| `search_latency` p95 | < 2000ms |
| `error_rate` | < 5% |
| `http_req_duration` p99 | < 3000ms |
