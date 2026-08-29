# Layering

controller → service → repository

A controller handles the HTTP request and nothing else.
A service holds business logic.
A repository talks to the database.

A controller never queries the database directly.
A module imports another module's service, never its repository.

Enforced by ESLint and a bootstrap guard. Violations fail the build.
