import { eq, sql } from "drizzle-orm";
import {
  DEFAULT_LIBRARY_PREFERENCES,
  parseLibraryPreferences,
} from "@/app/lib/library-preferences";
import { ensureLibraryPreferencesTable, getDb } from "@/db";
import { libraryPreferences } from "@/db/schema";

export const dynamic = "force-dynamic";

const PREFERENCES_ID = "default";

function fromRow(
  row: typeof libraryPreferences.$inferSelect,
) {
  return parseLibraryPreferences({
    displayMode: row.displayMode,
    formatFilter: row.formatFilter,
    sortMode: row.sortMode,
  });
}

async function ensurePreferencesRow() {
  await ensureLibraryPreferencesTable();
  const db = getDb();
  await db
    .insert(libraryPreferences)
    .values({
      id: PREFERENCES_ID,
      ...DEFAULT_LIBRARY_PREFERENCES,
    })
    .onConflictDoNothing();
  return db;
}

export async function GET() {
  try {
    const db = await ensurePreferencesRow();
    const [row] = await db
      .select()
      .from(libraryPreferences)
      .where(eq(libraryPreferences.id, PREFERENCES_ID))
      .limit(1);

    return Response.json({
      preferences: row
        ? fromRow(row) ?? DEFAULT_LIBRARY_PREFERENCES
        : DEFAULT_LIBRARY_PREFERENCES,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取显示设置时发生错误",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const preferences = parseLibraryPreferences(await request.json());
    if (!preferences) {
      return Response.json({ error: "显示设置格式无效" }, { status: 400 });
    }

    const db = await ensurePreferencesRow();
    await db
      .insert(libraryPreferences)
      .values({
        id: PREFERENCES_ID,
        ...preferences,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: libraryPreferences.id,
        set: {
          displayMode: sql`excluded.display_mode`,
          formatFilter: sql`excluded.format_filter`,
          sortMode: sql`excluded.sort_mode`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    return Response.json({ preferences });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存显示设置时发生错误",
      },
      { status: 500 },
    );
  }
}
