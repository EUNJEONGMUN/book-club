'use client';

import { useRef, useState } from 'react';
import { MapPin, Search, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { searchPlaces, type KakaoPlace } from '@/lib/actions/location-search';

type Props = {
  onSelect: (place: KakaoPlace) => void;
};

export function LocationSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setOpen(true);
    const result = await searchPlaces(query);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      setResults([]);
    } else {
      setResults(result.places);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  function handleSelect(place: KakaoPlace) {
    onSelect(place);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="장소명으로 검색"
            className="h-10 pl-9 bg-stone-50 border-stone-200"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="h-10 px-4 rounded-md bg-stone-800 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-40 transition-colors shrink-0 flex items-center justify-center min-w-[56px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
        </button>
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-0.5 border-b border-stone-100 bg-stone-50/50">
            <span className="text-[11px] font-medium text-stone-500">
              {loading ? '검색 중...' : results.length > 0 ? `검색 결과 ${results.length}개` : '결과 없음'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-stone-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              검색 중...
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">검색 결과가 없습니다.</p>
          ) : (
            <ul className="max-h-44 overflow-y-auto divide-y divide-stone-100">
              {results.map((place, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => handleSelect(place)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-stone-50 text-left transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{place.place_name}</p>
                      <p className="text-xs text-stone-400 truncate">
                        {place.road_address_name || place.address_name}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
