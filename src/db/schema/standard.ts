import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { id } from "./columns";
import { stage } from "./enums";

// Shared lists every school maps onto, so classes and subjects line up across
// schools (and the future learning platform can link past questions).

export const standardLevel = pgTable("standard_level", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  stage: stage("stage").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const standardSubject = pgTable("standard_subject", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
});
