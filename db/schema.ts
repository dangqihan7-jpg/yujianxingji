import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const modelUsage=sqliteTable("model_usage",{
 usageKey:text("usage_key").primaryKey(),
 calls:integer("calls").notNull(),
 updatedAt:integer("updated_at").notNull()
});
export const travelDrafts=sqliteTable("travel_drafts",{userId:text("user_id").primaryKey(),payload:text("payload").notNull(),updatedAt:integer("updated_at").notNull()});
