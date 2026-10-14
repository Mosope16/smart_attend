// Backwards compatibility alias for Neon client
import { db, useNeonClient, executeSql } from './neon';

export { db, useNeonClient, executeSql };
export const supabase = db;
export const useSupabaseClient = useNeonClient;

