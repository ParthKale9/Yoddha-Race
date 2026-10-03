// Edit these once the client confirms the penalty rules.
export const PENALTY_PRESETS: { label: string; seconds: number }[] = [
  { label: "Skipped reps", seconds: 10 },
  { label: "Incomplete range of motion", seconds: 5 },
  { label: "Wrong weight or equipment", seconds: 15 },
  { label: "Left station early", seconds: 20 },
  { label: "Other rule violation", seconds: 10 },
];
