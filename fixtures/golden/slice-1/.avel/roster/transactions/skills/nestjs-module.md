---
name: NestJS Feature Module
recommended_for:
  - backend
slug: nestjs-module
source: counselos-house
type: knowledge
---

# NestJS Feature Module

A feature module is one directory and it owns every layer of one
feature. Nothing in it is imported by another feature except through
the module's exported service.

## Shape

```
modules/<feature>/
  <feature>.module.ts       declares, wires, exports
  <feature>.controller.ts   HTTP only
  <feature>.service.ts      business logic
  <feature>.repository.ts   database only
  <feature>.dto.ts          request and response shapes
  dto/                      split here once <feature>.dto.ts exceeds one screen
```

## Rules

The module declares its controller, provides its service and
repository, and exports only the service. A repository is never
exported. A module that exports its repository has published its
schema to every consumer.

The controller takes the request, validates it through the DTO, calls
one service method, and returns. No branching on business state, no
database access, no orchestration of two services.

The service holds the logic and owns the transaction boundary. If two
repositories must change together, the service is where that happens.

The repository is the only layer that names a table.

## Registering

Add the module to the `imports` array in the composition root and
change nothing else in that file. The composition root belongs to no
feature, and every feature must register in it.

## What breaks this

Injecting another module's repository. Reaching into a sibling
feature's directory. A controller that calls two services to make one
decision, which means the decision belongs in a service that does not
exist yet.
