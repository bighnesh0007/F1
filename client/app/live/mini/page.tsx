import { MiniTiming } from "@/components/centre/PopOut";

export const metadata = { title: "Timing" };

// Small timing window opened by "Pop out" in browsers without picture-in-picture.
export default function MiniPage() {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <MiniTiming />
    </div>
  );
}
