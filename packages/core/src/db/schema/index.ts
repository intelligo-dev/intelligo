/**
 * Drizzle Database Schema
 *
 * Central export point for all database tables.
 * This file will be extended in future phases with workspace, billing, and AI schemas.
 */

// Auth tables (Better-Auth managed)
export * from "./auth";

// Organization/workspace tables (organization, member, invitation) are
// defined in ./auth alongside users/sessions and created by the
// migration chain like every other table; Better-Auth's organization
// plugin reads and writes them through the Drizzle adapter. Product
// code still goes through the Better-Auth API (auth.api.listOrganizations(),
// auth.api.createInvitation(), …) rather than querying them directly, so
// membership and role rules stay in one place.

// Billing tables (Phase 11)
export * from "./billing";

// Usage tracking tables (Phase 12)
export * from "./usage";

// Notification tables (Phase 14)
export * from "./notifications";

// Feature flags (Phase 15)
export * from "./feature-flags";

// AI tables (Phase 16)
export * from "./ai";

// Agents table (Phase 37)
export * from "./agents";

// User Identity Graph (AI-ARCHITECTURE Phase B)
// Four tables that back the cross-product memory system:
// user_facts, user_memories, user_profile_snapshots, user_memory_audit.
export * from "./identity";

// RAG documents table (AI-ARCHITECTURE Phase H)
// Single shared table that backs every collection in
// @intelligo-dev/agents/rag. Per-collection wrappers live in the
// product packages.
export * from "./rag";
