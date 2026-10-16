# 0001: Node.js MVC foundation

Status: implemented foundation, 2026-10-16.

## Context

The existing React app uses mock APIs. The user requested Node.js, PostgreSQL, a separate backend directory and MVC organization, then instructed implementation.

## Decision

Use JavaScript ES modules, Express and node-postgres in a modular monolith. React supplies the view layer. Controllers handle HTTP, services own business transactions, and models hold data queries. Use revocable opaque cookie sessions and the three existing roles, with explicit sensitive-action grants and record ownership checks.

## Alternatives

A global MVC tree is shorter initially but mixes workflows as the app grows. Microservices introduce distributed consistency and operational overhead. JWT sessions add refresh/rotation and revocation complexity without an established cross-service requirement. Explicit SQL makes PostgreSQL locking and constraints visible; an ORM can be reconsidered later.

## Consequences

One API/database keeps initial operation and transactions manageable. Supervisor access is initially organization-wide. Full workflow migrations, frontend integration and production gates remain tracked in the delivery plan. The foundation does not represent completion of the entire backend.
