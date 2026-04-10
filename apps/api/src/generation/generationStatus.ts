import { supabase } from "../lib/supabase";

export async function getGenerationsByTrack(
  track_id: string
): Promise<GenerationStatusResponse[]> {
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("track_id", track_id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((gen: Record<string, unknown>) => ({
    generation_id: gen.id as string,
    track_id: gen.track_id as string,
    mode: gen.mode as string,
    status: gen.status as string,
    prompt_style: gen.prompt_style as string | undefined,
    prompt_lyrics: gen.prompt_lyrics as string | undefined,
    replicate_id: gen.replicate_id as string | undefined,
    error_message: gen.error_message as string | undefined,
    created_at: gen.created_at as string,
    completed_at: gen.completed_at as string | undefined,
    audio_files: [],
  }));
}

export type GenerationStatusResponse = {
  generation_id: string;
  track_id: string;
  mode: string;
  status: string;
  prompt_style?: string;
  prompt_lyrics?: string;
  replicate_id?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  audio_files?: {
    id: string;
    file_type: string;
    storage_path: string;
    format: string;
  }[];
};

export async function getGenerationStatus(
  generation_id: string
): Promise<GenerationStatusResponse | null> {
  const { data: gen, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generation_id)
    .single();

  if (error || !gen) return null;

  let audio_files: GenerationStatusResponse["audio_files"] = [];
  if (gen.status === "complete") {
    const { data: files } = await supabase
      .from("audio_files")
      .select("id, file_type, storage_path, format")
      .eq("generation_id", generation_id);
    audio_files = files ?? [];
  }

  return {
    generation_id: gen.id,
    track_id: gen.track_id,
    mode: gen.mode,
    status: gen.status,
    prompt_style: gen.prompt_style,
    prompt_lyrics: gen.prompt_lyrics,
    replicate_id: gen.replicate_id,
    error_message: gen.error_message,
    created_at: gen.created_at,
    completed_at: gen.completed_at,
    audio_files,
  };
}
