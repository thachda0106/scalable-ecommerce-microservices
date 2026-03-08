---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Monorepo & Shared Core Setup

## Objective
Scaffold the core NestJS monorepo workspace and implement the shared foundational libraries containing OpenTelemetry tracing, centralized logging, and Prometheus metrics.

## Context
- .gsd/ARCHITECTURE.md
- .gsd/ROADMAP.md

## Tasks

<task type="auto">
  <name>Initialize Package Manager Workspace</name>
  <files>c:\source\package.json, c:\source\pnpm-workspace.yaml, c:\source\tsconfig.base.json</files>
  <action>
    - Initialize a modern monorepo at the root `c:\source` utilizing PNPM workspaces (create `pnpm-workspace.yaml` including `apps/*` and `packages/*`).
    - Create a root `package.json` with base devDependencies (typescript, @nestjs/cli, rimraf).
    - Create a `tsconfig.base.json` with strict type checking and modern Node ESM/CommonJS emit parameters.
  </action>
  <verify>Test-Path c:\source\pnpm-workspace.yaml</verify>
  <done>PNPM Workspace initialized and typescript base installed</done>
</task>

<task type="auto">
  <name>Build Shared Core Library</name>
  <files>c:\source\packages\core\package.json, c:\source\packages\core\src\index.ts, c:\source\packages\core\src\observability\tracing.ts, c:\source\packages\core\src\observability\logging.ts, c:\source\packages\core\src\observability\metrics.ts</files>
  <action>
    - Scaffold a `packages/core` TypeScript Node project.
    - Implement `tracing.ts` configuring the `@opentelemetry/sdk-node` exporting a setup function.
    - Implement `logging.ts` using NestJS Pino integration (`nestjs-pino`) with JSON formatted output for CloudWatch compatibility.
    - Implement `metrics.ts` exporting an `@willsoto/nestjs-prometheus` configured module for `/metrics` scraping.
    - Export these modules cleanly in `packages/core/src/index.ts`.
  </action>
  <verify>Test-Path c:\source\packages\core\src\observability\tracing.ts</verify>
  <done>Core observability libraries are implemented and exportable</done>
</task>

## Success Criteria
- [ ] PNPM monorepo structure is established.
- [ ] Shared `core` layer containing OTel, Pino, and Prometheus modules is authored.
