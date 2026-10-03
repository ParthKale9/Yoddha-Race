export type Gender = "male" | "female";
export type Metric = "reps" | "time";

export type Heat = { id: string; name: string; starts_at: string | null; started_at: string | null; capacity: number; taken: number; spots_left: number };
export type Station = { id: number; name: string; position: number; metric: Metric; target_reps: number | null; spec_male: string | null; spec_female: string | null };

export type LeaderRow = {
  athlete_id: string; bib_no: number; name: string; gender: Gender;
  stations_done: number; penalty_seconds: number; finished: boolean;
  total_seconds: number | null; rank_gender: number | null; rank_overall: number | null;
};

export type StationRow = {
  bib_no: number; name: string; gender: Gender;
  station_id: number; station_name: string; position: number; metric: Metric;
  reps: number | null; duration_seconds: number; penalty_seconds: number;
  rank_gender: number;
};

export type RunSplit = { bib_no: number; from_position: number; to_position: number; run_seconds: number };

export type Profile = { id: string; full_name: string | null; role: "admin" | "volunteer" };
export type Athlete = { id: string; bib_no: number; name: string; gender: Gender; age: number; phone: string; email: string; heat_id: string | null };
export type Log = { id: string; athlete_id: string; station_id: number; checked_in_at: string; checked_out_at: string | null; reps: number | null; voided: boolean };
export type Assignment = { id: string; athlete_id: string; volunteer_id: string; athletes: { bib_no: number; name: string; gender: Gender; heat_id: string | null } | null };
