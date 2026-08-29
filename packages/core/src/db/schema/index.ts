/**
 * Drizzle Database Schema
 *
 * Central export point for all database tables.
 * This file will be extended in future phases with workspace, billing, and AI schemas.
 */

// Auth tables (Better-Auth managed)
export * from "./auth";

// Organization/Workspace tables are managed by Better-Auth organization plugin (Phase 10)
// Tables: organization, member, invitation (auto-created by plugin on first API use)
// These tables are NOT in our Drizzle schema — Better-Auth manages them directly.
// Access via Better-Auth API: auth.api.listOrganizations(), auth.api.createInvitation(), etc.
//
// Organization plugin indexes (TECH-02 verified pattern):
// Better-Auth's organization plugin creates these indexes automatically:
// - member.organizationId (workspace member lookup)
// - member.userId (user's memberships lookup)
// - invitation.organizationId (workspace invitations lookup)
// - invitation.email (invited email lookup)
// These indexes are created by Better-Auth when tables are auto-created on first use.
// No manual migration needed — plugin handles all schema management.

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
// @intelligo/agents/rag. Per-collection wrappers live in the
// product packages.
export * from "./rag";
