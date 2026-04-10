import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export type Track = {
  id: string;
  title: string;
  subgenre: string;
  bpm: number;
  key: string;
  generation_mode: string;
  created_by: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CTLRecord = {
  id: string;
  track_id: string;
  version: number;
  ctl_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export type Generation = {
  id: string;
  track_id: string;
  ctl_id: string;
  mode: string;
  status: string;
  prompt_style?: string;
  prompt_lyrics?: string;
  replicate_id?: string;
  error_message?: string;
  created_at: string;
};

export type Evaluation = {
  id: string;
  track_id: string;
  generation_id: string;
  authenticity_score?: number;
  subgenre_recognizability_score?: number;
  groove_clarity_score?: number;
  harmonic_density_score?: number;
  dj_mix_friendliness_score?: number;
  cultural_lineage_coherence?: number;
  composite_score?: number;
  passed_gate?: boolean;
  created_at: string;
};
