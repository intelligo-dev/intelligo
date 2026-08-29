export type FeatureTile = {
  id: string;
  title: string;
  lead: string;
  span: string; // tailwind col-span on lg
  sim: "boundary" | "identity" | "commerce" | "persistence" | "operations" | "pages" | "i18n" | "cli";
  anchor: string;
};

export const FEATURES: FeatureTile[] = [
  { id: "boundary", title: "Execution boundary", lead: "Every AI run admitted, settled, recorded.", span: "lg:col-span-7", sim: "boundary", anchor: "#boundary" },
  { id: "identity", title: "Identity & tenancy", lead: "Workspaces, roles, invitations — the whole lifecycle.", span: "lg:col-span-5", sim: "identity", anchor: "#packages" },
  { id: "commerce", title: "Commerce", lead: "Plans as data, credits with reservations, Stripe and beyond.", span: "lg:col-span-4", sim: "commerce", anchor: "#packages" },
  { id: "persistence", title: "Persistence & privacy", lead: "Conversations, documents, export, per-fact deletion.", span: "lg:col-span-4", sim: "persistence", anchor: "#packages" },
  { id: "operations", title: "Operations", lead: "Jobs, audit, admin. No Redis.", span: "lg:col-span-4", sim: "operations", anchor: "#packages" },
  { id: "pages", title: "Pages, installed", lead: "25 page families, as your source.", span: "lg:col-span-4", sim: "pages", anchor: "#pages" },
  { id: "i18n", title: "i18n-native", lead: "Copy is translation, not code.", span: "lg:col-span-4", sim: "i18n", anchor: "#pages" },
  { id: "cli", title: "CLI", lead: "create · add · doctor · upgrade.", span: "lg:col-span-4", sim: "cli", anchor: "#upgrade" },
];
