/**
 * Agents Database Schema
 *
 * Table for AI agent configuration stored in database instead of TypeScript files.
 * Enables dynamic agent management without code deployment.
 *
 * Pattern: snake_case columns in PostgreSQL, camelCase TypeScript API (via Drizzle mapping)
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Bilingual text type for agent names and descriptions
 * Used for next-intl internationalization
 */
export type BilingualText = {
  en: string;
  mn: string;
};

/**
 * Suggestion type for agent quick-start prompts on the dashboard
 */
export type AgentSuggestion = {
  id: string;
  label: BilingualText;
  prompt: BilingualText;
};

/**
 * Forward-compatible per-agent model routing config. Today we only use
 * `primary`; later phases will layer task-aware selection (cheap vs
 * deep) and fallbacks here without another schema change.
 */
export type AgentModelConfig = {
  primary: string;
  fallback?: string;
  routing?: Record<string, string>;
};

/**
 * Agents table - AI agent configuration per product
 * Each agent represents a product with its own system prompt, tools, and model config
 */
export const agents = pgTable("agents", {
  id: text("id").primaryKey(), // Slug: "support-assistant", "study-planner"
  name: jsonb("name").notNull().$type<BilingualText>(), // { en: "Support Assistant", mn: "Туслах" }
  description: jsonb("description").notNull().$type<BilingualText>(), // { en: "...", mn: "..." }
  systemPromptKey: text("system_prompt_key").notNull(), // Legacy translation namespace key — kept for backfill, no longer read at runtime (see systemPrompt below).
  systemPrompt: jsonb("system_prompt").$type<BilingualText | null>(), // Phase C: bilingual prompt text. Source of truth for agent instructions.
  modelConfig: jsonb("model_config").$type<AgentModelConfig | null>(), // Phase C: forward-compatible routing config; today only `primary` is read.
  icon: text("icon").notNull(), // Icon identifier (e.g., "briefcase", "map-pin")
  defaultModel: text("default_model").notNull(), // AI model ID (e.g., "openai/gpt-4o") — fallback when modelConfig is null.
  maxSteps: integer("max_steps").notNull(), // ToolLoopAgent max iterations
  contextWindowSize: integer("context_window_size").notNull(), // Conversation windowing message count
  tools: jsonb("tools").notNull().default([]).$type<string[]>(), // Array of tool names
  basePath: text("base_path").notNull(), // URL base path (e.g., "/support", "/study")
  isActive: boolean("is_active").notNull().default(true), // Whether agent is available to users
  suggestions: jsonb("suggestions")
    .notNull()
    .default([])
    .$type<AgentSuggestion[]>(), // Quick-start suggestion prompts
  isSystem: boolean("is_system").notNull().default(true), // System agents can't be deleted by users
  featureKey: text("feature_key"), // Nullable: billing feature key (e.g., "career_advisor", "study"). Used for feature gating lookups.
  productType: text("product_type").notNull().default("chat"), // "chat" | "tools"
  color: text("color").notNull().default("bg-gray-500"), // Tailwind bg class for UI indicators (e.g., "bg-blue-500")
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Export inferred types for TypeScript usage
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;
