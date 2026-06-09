const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinKeypad({ value, onChange, maxLength = 4 }) {
  function handleKey(key) {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < maxLength) {
      onChange(value + key);
    }
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex justify-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            data-testid="pin-dot"
            className={`w-4 h-4 rounded-full border-2 border-gray-600 transition-colors ${
              i < value.length ? 'bg-blue-400 border-blue-400' : ''
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto w-full">
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => handleKey(key)}
            disabled={!key}
            className={`h-16 rounded-xl text-xl font-medium transition-colors ${
              key
                ? 'bg-gray-800 border border-gray-700 text-gray-100 hover:bg-gray-700 active:bg-gray-600'
                : 'invisible'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
