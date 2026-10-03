export default function Bib({ no, size = "md" }: { no: number | string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "px-5 py-2 text-5xl" : "px-2 py-0.5 text-sm";
  return (
    <span className={`inline-block rounded-sm border-2 border-navy bg-white font-display font-extrabold tabular-nums text-navy ${cls}`}>
      {no}
    </span>
  );
}
