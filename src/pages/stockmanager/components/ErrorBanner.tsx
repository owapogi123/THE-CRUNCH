export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <span className="text-red-500 font-bold text-sm">!</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-700">
            Failed to load data
          </p>
          <p className="text-xs text-red-500 mt-0.5">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
