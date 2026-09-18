import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Localized text, keyed by locale tag: `{ en: "…", de: "…" }`. Open, so
 * adding a language is not a schema change.
 */
export type LocalizedText = Record<string, string>;

/** A quick-start prompt shown for an agent. */
export type AgentSuggestion = {
  id: string;
  label: LocalizedText;
  prompt: LocalizedText;
};

/** Per-agent model routing. Only `primary` is read. */
export type AgentModelConfig = {
  primary: string;
  fallback?: string;
  routing?: Record<string, string>;
};

/** AI agent configuration: system prompt, tools and model per agent. */
export const agents = pgTable("agents", {
  id: text("id").primaryKey(), // Slug, e.g. "support-assistant"
  name: jsonb("name").notNull().$type<LocalizedText>(), // { en: "Support Assistant", … }
  description: jsonb("description").notNull().$type<LocalizedText>(), // { en: "…", … }
  systemPromptKey: text("system_prompt_key").notNull(), // Translation namespace key; not read at runtime (systemPrompt is).
  systemPrompt: jsonb("system_prompt").$type<LocalizedText | null>(), // Source of truth for agent instructions.
  modelConfig: jsonb("model_config").$type<AgentModelConfig | null>(), // Only `primary` is read.
  icon: text("icon").notNull(), // Icon identifier (e.g., "briefcase", "map-pin")
  defaultModel: text("default_model").notNull(), // AI model ID (e.g., "openai/gpt-4o") — fallback when modelConfig is null.
  maxSteps: integer("max_steps").notNull(), // ToolLoopAgent max iterations
  contextWindowSize: integer("context_window_size").notNull(), // Conversation windowing message count
  tools: jsonb("tools").notNull().default([]).$type<string[]>(), // Array of tool names
  basePath: text("base_path").notNull(), // URL base path (e.g., "/support")
  isActive: boolean("is_active").notNull().default(true), // Whether agent is available to users
  suggestions: jsonb("suggestions")
    .notNull()
    .default([])
    .$type<AgentSuggestion[]>(), // Quick-start suggestion prompts
  isSystem: boolean("is_system").notNull().default(true), // System agents can't be deleted by users
  featureKey: text("feature_key"), // Nullable: billing feature key (e.g., "support_assistant"). Used for feature gating lookups.
  color: text("color").notNull().default("bg-gray-500"), // Tailwind bg class for UI indicators (e.g., "bg-blue-500")
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;
