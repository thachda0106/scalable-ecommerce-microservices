---
phase: 9
plan: 2
wave: 1
depends_on: []
files_modified:
  - apps/api-gateway/src/config/services.config.ts
  - apps/api-gateway/src/common/http-client.ts
  - apps/api-gateway/src/proxy/auth.proxy.ts
  - apps/api-gateway/src/controllers/gateway.controller.ts
autonomous: true
must_haves:
  truths:
    - "API Gateway defines proxy routing rules for all microservices"
  artifacts:
    - "apps/api-gateway/src/common/http-client.ts exists"
    - "apps/api-gateway/src/controllers/gateway.controller.ts exists"
---

# Plan 9.2: Proxy Routing & Downstream Clients

<objective>
Implement proxy routing rules and a standardized HTTP client to communicate with downstream microservices.
Purpose: Forward requests seamlessly to appropriate backend services.
Output: Service configurations, base HTTP client, and proxy controllers.
</objective>

<context>
Load for context:
- .gsd/ROADMAP.md
- apps/api-gateway/src/app.module.ts
</context>

<tasks>

<task type="auto">
  <name>Implement Base HTTP Client & Config</name>
  <files>
    - apps/api-gateway/src/config/services.config.ts
    - apps/api-gateway/src/common/http-client.ts
  </files>
  <action>
    Create `services.config.ts` mapping service names to their expected internal URLs (e.g., Auth Service -> `http://auth-service:3001`).
    Create `common/http-client.ts` encapsulating Axios or `@nestjs/axios` `HttpService` configured to inherently pass along `x-request-id` headers to downstream requests.
  </action>
  <verify>npm run lint --prefix apps/api-gateway</verify>
  <done>HTTP client wrapping Axios/HttpService is created and configured with distributed headers</done>
</task>

<task type="auto">
  <name>Implement Proxy Routing Controller</name>
  <files>
    - apps/api-gateway/src/proxy/base.proxy.ts
    - apps/api-gateway/src/controllers/gateway.controller.ts
    - apps/api-gateway/src/app.module.ts
  </files>
  <action>
    Setup `gateway.controller.ts` with wildcard routes matching `/auth/*`, `/users/*`, `/products/*`, etc.
    Route these incoming requests to the respective proxy service using the standardized HTTP client.
    AVOID: Parsing business logic out of the payload. Simple transport-level passthrough.
  </action>
  <verify>npm run build --prefix apps/api-gateway</verify>
  <done>Gateway controller binds the main traffic paths to downstreams successfully</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Config mapped for all core microservices
- [ ] HTTP interceptor/client injects headers
- [ ] Wildcard controllers established
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>
