'use server';

export type KakaoPlace = {
  place_name: string;
  address_name: string;
  road_address_name: string;
  place_url: string;
};

export async function searchPlaces(
  query: string
): Promise<{ ok: true; places: KakaoPlace[] } | { ok: false; error: string }> {
  if (!query.trim()) return { ok: true, places: [] };

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return { ok: false, error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' };

  try {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=8`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store',
    });

    if (!res.ok) return { ok: false, error: '장소 검색에 실패했습니다.' };

    const json = await res.json();
    const places: KakaoPlace[] = (json.documents ?? []).map((d: {
      place_name: string;
      address_name: string;
      road_address_name: string;
      place_url: string;
    }) => ({
      place_name: d.place_name,
      address_name: d.address_name,
      road_address_name: d.road_address_name,
      place_url: d.place_url,
    }));

    return { ok: true, places };
  } catch {
    return { ok: false, error: '네트워크 오류가 발생했습니다.' };
  }
}
