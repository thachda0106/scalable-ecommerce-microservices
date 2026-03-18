# Opossum: Node.js Circuit Breaker Documentation

This document provides a comprehensive overview of the **Circuit Breaker** technique using the **Opossum** library within the context of our current Microservices system.

---

## 1. Circuit Breaker Pattern Theory

### Why Need a Circuit Breaker?
In a Microservices architecture, services call each other over the network. The network is never 100% reliable. If one service (e.g., `Order Service`) slows down or fails, the services calling it (e.g., `API Gateway`) will have their resources (threads, memory) suspended waiting for a response.
When there are too many pending requests, the `API Gateway` itself will exhaust its resources and crash. This is called a **Cascading Failure**.

### How It Works
The Circuit Breaker acts as an intelligent "electrical circuit breaker" located between the calling service and the called service. It has 3 main states:

1.  **Closed (Normal)**: 
    *   Requests are allowed to pass through normally.
    *   The Circuit Breaker counts the number of failures and the error rate.
    *   If the error rate exceeds a threshold, the breaker "trips" and switches to the **Open** state.

2.  **Open (Failed)**:
    *   All requests will be **rejected immediately** (Fail Fast) without calling the target service.
    *   The user receives a quick error response (usually 503 Service Unavailable).
    *   Gives the target service time to "breathe" and recover.
    *   After a waiting period (`resetTimeout`), the breaker switches to **Half-Open**.

3.  **Half-Open (Testing)**:
    *   Allows a small number of requests to pass through to test if the target service has recovered.
    *   If these requests succeed -> Switches back to **Closed**.
    *   If they still fail -> Switches back to **Open** and restarts the waiting cycle.

---

## 2. Introduction to Opossum

[Opossum](https://nodeshift.dev/opossum/) is a powerful Node.js library that implements the Circuit Breaker pattern for asynchronous functions (Promises).

**Key Features:**
- **Timeout**: Automatically fails if a request takes too long.
- **Error Threshold**: The error percentage threshold to open the breaker.
- **Fallback**: Defines an alternative response when the breaker is open (e.g., returning cached data).
- **Events**: Emits events (`open`, `close`, `fallback`, `fire`) for monitoring and logging.

---

## 3. Implementation in Current Project

Currently, the Circuit Breaker is integrated into the `API Gateway` to protect the system when communicating with downstream microservices.

### Code Location
File: `apps/api-gateway/src/common/http-client.ts`

### Detailed Configuration
In `BaseHttpClient`, Opossum is initialized as follows:

```typescript
// apps/api-gateway/src/common/http-client.ts

constructor(private readonly httpService: HttpService) {
  const breakerOptions = {
    timeout: 4000,                // Cancel request if no response after 4 seconds
    errorThresholdPercentage: 50, // Open breaker if >50% of requests fail
    resetTimeout: 10000,          // Retry after 10 seconds if breaker is Open
  };

  this.breaker = new CircuitBreaker(
    (config: AxiosRequestConfig) => this.executeRequest(config),
    breakerOptions,
  );
  
  // Define action when breaker is open
  this.breaker.fallback(() => Promise.reject(new Error('Breaker is open')));
}
```

### How It Works
When `GatewayController` proxies a request (e.g., calling `auth`, `products`, `orders`), via `BaseHttpClient.execute()`:

1.  **Step 1**: The request enters `this.breaker.fire(config)`.
2.  **Step 2**: Opossum checks the breaker state. 
    *   If the breaker is `Open`, it immediately throws a `Breaker is open` error.
    *   If the breaker is `Closed`, it executes `executeRequest` (calling Axios).
3.  **Step 3 (Error Handling)**:
    ```typescript
    if (error.message === 'Breaker is open') {
      throw new HttpException(
        'Service Temporarily Unavailable (Fast Fallback)',
        503, // Return 503 immediately to the Client
      );
    }
    ```

---

## 4. Pros and Cons of Current Implementation

### Pros
- **Global Protection**: Protects the Gateway from becoming a bottleneck due to suspended child services.
- **Fail Fast**: The client receives a response immediately instead of waiting for a long server timeout.

### Limitations & Considerations (Critique)
- **Shared Breaker (Dangerous)**: Currently, `BaseHttpClient` uses a **single `CircuitBreaker` instance** for all services.
    - *Problem*: If the `User Service` goes down and trips the Circuit Breaker open, requests to the `Product Service` (which is still healthy) will also be blocked.
    - *Solution*: A Map of Circuit Breakers (with the Service name as the Key) should be created so that each service has its own dedicated "breaker".

---

## 5. Advanced Expansion Guide

### Add Fallback Data
Instead of just returning a 503 error, you can return default data:
```typescript
this.breaker.fallback((config) => {
  if (config.url.includes('/products')) {
    return { data: [] }; // Return an empty list if product service is dead
  }
  throw new Error('Service unavailable');
});
```

### Monitoring with Prometheus
Opossum integrates very well with Prometheus to graph breaker statuses:
```typescript
const prometheus = require('opossum-prometheus');
const metrics = prometheus([this.breaker]);
// Export metrics to /metrics endpoint
```

### Tuning Parameters
- `rollingCountTimeout`: The time window to calculate the error rate (default 10s).
- `capacity`: The maximum number of concurrently processing requests.

---

> [!TIP]
> Always set the Circuit Breaker's `timeout` lower than the Load Balancer's or Global Interceptor's `timeout` so the Circuit Breaker has a chance to intervene first.
