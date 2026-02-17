export default function SkeletonStats() {
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card">
          <div className="flex items-center gap-3">
            <div className="skeleton w-11 h-11 rounded-xl" />
            <div className="space-y-2">
              <div className="skeleton w-16 h-3" />
              <div className="skeleton w-12 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
