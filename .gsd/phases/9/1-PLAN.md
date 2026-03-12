---
phase: 9
plan: 1
wave: 1
depends_on: []
files_modified:
  - apps/api-gateway/src/middleware/request-id.middleware.ts
  - apps/api-gateway/src/app.module.ts
autonomous: true
must_haves:
  truths:
    - "API Gateway has a production-ready folder structure"
    - "Every request has an x-request-id header assigned"
  artifacts:
    - "apps/api-gateway/src/middleware/request-id.middleware.ts exists"
---

# Plan 9.1: Gateway Architecture & Request Tracing

<objective>
Refactor API Gateway structure into a production-ready architecture and add distributed request tracing (`x-request-id`).
Purpose: Ensure the gateway has a scalable foundation and can trace requests across microservices.
Output: Initialized folder structure and request-id middleware.
</objective>

<context>
Load for context:
- .gsd/ROADMAP.md
- apps/api-gateway/src/app.module.ts
</context>

<tasks>

<task type="auto">
  <name>Scaffold Production Structure</name>
  <files>
    - apps/api-gateway/src/config/
    - apps/api-gateway/src/middleware/
    - apps/api-gateway/src/guards/
    - apps/api-gateway/src/interceptors/
    - apps/api-gateway/src/proxy/
    - apps/api-gateway/src/aggregation/
    - apps/api-gateway/src/clients/
    - apps/api-gateway/src/controllers/
    - apps/api-gateway/src/common/
  </files>
  <action>
    Create the recommended folder structure in `apps/api-gateway/src`. Create empty `.gitkeep` files in each.
    AVOID: Adding domain business logic. API Gateway must remain thin.
  </action>
  <verify>ls apps/api-gateway/src/middleware</verify>
  <done>Folder structure exists</done>
</task>

<task type="auto">
  <name>Implement Distributed Request Tracing</name>
  <files>
    - apps/api-gateway/src/middleware/request-id.middleware.ts
    - apps/api-gateway/src/app.module.ts
  </files>
  <action>
    Create `request-id.middleware.ts` using `@nestjs/common` `NestMiddleware` to attach a unique `uuid` to `req.headers['x-request-id']` if it doesn't already exist.
    Register this middleware globally for all routes in `AppModule`.
    AVOID: Modifying response headers if only internal downstream propagation is required, though adding to response is fine.
  </action>
  <verify>npm run build --prefix apps/api-gateway</verify>
  <done>Middleware compiles and is registered in AppModule</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Folder structure established
- [ ] Request-ID middleware applied
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>
